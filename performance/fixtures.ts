import { makeExecutableSchema } from '@graphql-tools/schema';
import {
  type DocumentNode,
  type ExecutionResult,
  execute,
  type GraphQLSchema,
  parse,
} from 'graphql';
import { applyMiddleware } from 'graphql-middleware';
import * as shieldLib from 'graphql-shield';
import * as guardLib from '../src/index.js';

// Both libraries share the same rule API, so every permission tree below is
// built once per library from the same definition.
type Lib = Pick<
  typeof guardLib,
  'rule' | 'and' | 'or' | 'chain' | 'race' | 'not' | 'allow' | 'deny'
>;

type Viewer = { id: string; role: 'ADMIN' | 'USER' };
export type Context = { viewer: Viewer | null };

/* Data */

type UserRow = { id: string; name: string; email: string; role: string };
type PostRow = {
  id: string;
  title: string;
  body: string;
  published: boolean;
  authorId: string;
};
type CommentRow = { id: string; text: string; authorId: string };

const users: UserRow[] = Array.from({ length: 1_000 }, (_, i) => ({
  id: `u${i}`,
  name: `User ${i}`,
  email: `user${i}@example.com`,
  role: i % 50 === 0 ? 'ADMIN' : 'USER',
}));

const posts: PostRow[] = Array.from({ length: 10_000 }, (_, i) => ({
  id: `p${i}`,
  title: `Post ${i}`,
  body: 'Lorem ipsum dolor sit amet.',
  published: i % 4 !== 0,
  authorId: `u${i % users.length}`,
}));

const commentsFor = (post: PostRow): CommentRow[] =>
  Array.from({ length: 5 }, (_, i) => ({
    id: `${post.id}-c${i}`,
    text: 'Nice post!',
    authorId: `u${(Number(post.id.slice(1)) + i) % users.length}`,
  }));

const userById = new Map(users.map((u) => [u.id, u]));
const postsByAuthor = new Map<string, PostRow[]>();
for (const post of posts) {
  const list = postsByAuthor.get(post.authorId) ?? [];
  list.push(post);
  postsByAuthor.set(post.authorId, list);
}

/* Schema */

const typeDefs = /* GraphQL */ `
  type Query {
    health: String!
    me: User
    users(first: Int!): [User!]!
    posts(first: Int!): [Post]!
  }

  type User {
    id: ID!
    name: String!
    email: String
    role: String
    posts(first: Int!): [Post]!
  }

  type Post {
    id: ID!
    title: String!
    body: String!
    published: Boolean!
    author: User!
    comments: [Comment!]!
  }

  type Comment {
    id: ID!
    text: String!
    author: User!
  }
`;

// Resolvers are synchronous, like data that is already loaded (DataLoader
// cache, in-memory store), so the permission layer is the only async source.
export const schema: GraphQLSchema = makeExecutableSchema({
  typeDefs,
  resolvers: {
    Query: {
      health: () => 'ok',
      me: (_: unknown, __: unknown, ctx: Context) =>
        ctx.viewer ? userById.get(ctx.viewer.id) : null,
      users: (_: unknown, { first }: { first: number }) =>
        users.slice(0, first),
      posts: (_: unknown, { first }: { first: number }) =>
        posts.slice(0, first),
    },
    User: {
      posts: (user: UserRow, { first }: { first: number }) =>
        (postsByAuthor.get(user.id) ?? []).slice(0, first),
    },
    Post: {
      author: (post: PostRow) => userById.get(post.authorId),
      comments: (post: PostRow) => commentsFor(post),
    },
    Comment: {
      author: (comment: CommentRow) => userById.get(comment.authorId),
    },
  },
});

/* Permissions */

type RuleSet = 'none' | 'typeWide' | 'realistic';

type PermissionOptions = {
  // Rules answer after an await instead of synchronously.
  async?: boolean;
  // isSelf uses the `strict` cache, which hashes the parent with object-hash
  // on every call. Off, it uses `no_cache`.
  hashParent?: boolean;
};

const permissions = (
  lib: Lib,
  ruleSet: RuleSet,
  { async = false, hashParent = true }: PermissionOptions,
): guardLib.Rules => {
  // Wraps a rule body so it either answers synchronously or after an await,
  // like a rule that looks something up.
  const body =
    <A extends unknown[]>(f: (...args: A) => boolean) =>
    (...args: A) =>
      async ? Promise.resolve().then(() => f(...args)) : f(...args);

  const isAuthenticated = lib.rule('isAuthenticated', { cache: 'contextual' })(
    body((_p: unknown, _a: unknown, ctx: Context) => ctx.viewer !== null),
  );

  switch (ruleSet) {
    case 'none':
      return {};
    case 'typeWide':
      return { Post: isAuthenticated };
    case 'realistic': {
      const isAdmin = lib.rule('isAdmin', { cache: 'contextual' })(
        body(
          (_p: unknown, _a: unknown, ctx: Context) =>
            ctx.viewer?.role === 'ADMIN',
        ),
      );
      const isSelf = lib.rule('isSelf', {
        cache: hashParent ? 'strict' : 'no_cache',
      })(
        body(
          (user: UserRow, _a: unknown, ctx: Context) =>
            user.id === ctx.viewer?.id,
        ),
      );
      const canReadPost = lib.rule('canReadPost', { cache: 'no_cache' })(
        body(
          (post: PostRow, _a: unknown, ctx: Context) =>
            post.published ||
            post.authorId === ctx.viewer?.id ||
            ctx.viewer?.role === 'ADMIN',
        ),
      );
      const isBanned = lib.rule('isBanned', { cache: 'contextual' })(
        body((_p: unknown, _a: unknown, _ctx: Context) => false),
      );

      return {
        Query: {
          health: lib.allow,
          me: isAuthenticated,
          users: lib.chain(isAuthenticated, lib.not(isBanned)),
          posts: isAuthenticated,
        },
        User: {
          '*': isAuthenticated,
          email: lib.or(isAdmin, isSelf),
          role: lib.race(isAdmin, isSelf),
        },
        Post: lib.and(isAuthenticated, canReadPost),
        Comment: lib.allow,
      };
    }
  }
};

export type Variant = 'plain' | 'graphql-shield' | 'graphql-guard';
export const variants: Variant[] = ['plain', 'graphql-shield', 'graphql-guard'];

export const buildSchema = (
  variant: Variant,
  ruleSet: RuleSet,
  options: PermissionOptions = {},
): GraphQLSchema => {
  switch (variant) {
    case 'plain':
      return schema;
    case 'graphql-shield':
      return applyMiddleware(
        schema,
        shieldLib.shield(
          // graphql-shield's own types are older but structurally the same.
          permissions(shieldLib as unknown as Lib, ruleSet, options) as never,
        ),
      );
    case 'graphql-guard':
      return guardLib.guard(schema, permissions(guardLib, ruleSet, options));
  }
};

/* Execution */

export const queries = {
  health: parse('{ health }'),
  largeList: parse('{ posts(first: 5000) { id title body published } }'),
  nested: parse(`
    {
      me { id name email }
      users(first: 50) {
        id
        name
        email
        role
        posts(first: 10) {
          id
          title
          published
          author { id name }
          comments { id text author { id name email } }
        }
      }
    }
  `),
} satisfies Record<string, DocumentNode>;

export const viewers = {
  admin: { id: 'u0', role: 'ADMIN' },
  user: { id: 'u1', role: 'USER' },
} satisfies Record<string, Viewer>;

// A fresh context per request, as a server creates, so rule caches start empty.
export const run = (
  schema: GraphQLSchema,
  document: DocumentNode,
  viewer: Viewer | null = viewers.admin,
): Promise<ExecutionResult> | ExecutionResult =>
  execute({
    schema,
    document,
    contextValue: { viewer } satisfies Context,
  });

// Plain JSON, so results from different libraries can be compared:
// - graphql-guard adds `extensions.code` to its errors and graphql-shield
//   doesn't, so extensions are left out.
// - Errors are sorted by path, as their order depends on when each field
//   settles, and graphql-guard settles synchronous fields sooner.
export const toJSON = async (
  res: Promise<ExecutionResult> | ExecutionResult,
): Promise<unknown> => {
  const json = JSON.parse(
    JSON.stringify(await res, (key, value) =>
      key === 'extensions' ? undefined : value,
    ),
  );
  json.errors?.sort((a: { path: unknown }, b: { path: unknown }) =>
    JSON.stringify(a.path).localeCompare(JSON.stringify(b.path)),
  );
  return json;
};

/* Large schema, for setup time */

export const largeSchema = (types: number, fields: number): GraphQLSchema => {
  const fieldDefs = Array.from(
    { length: fields },
    (_, i) => `  f${i}: String`,
  ).join('\n');
  const typeDefs = Array.from(
    { length: types },
    (_, i) => `type T${i} {\n${fieldDefs}\n}`,
  ).join('\n');
  const queryFields = Array.from(
    { length: types },
    (_, i) => `  t${i}: T${i}`,
  ).join('\n');
  return makeExecutableSchema({
    typeDefs: `${typeDefs}\ntype Query {\n${queryFields}\n}`,
  });
};

export const largeSchemaPermissions = (lib: Lib, types: number) => {
  const isAuthenticated = lib.rule('isAuthenticated', { cache: 'contextual' })(
    (_p: unknown, _a: unknown, ctx: Context) => ctx.viewer !== null,
  );
  const isAdmin = lib.rule('isAdmin', { cache: 'contextual' })(
    (_p: unknown, _a: unknown, ctx: Context) => ctx.viewer?.role === 'ADMIN',
  );
  return Object.fromEntries(
    Array.from({ length: types }, (_, i) => [
      `T${i}`,
      i % 2 === 0
        ? isAuthenticated
        : { '*': isAuthenticated, f0: lib.and(isAuthenticated, isAdmin) },
    ]),
  );
};

export { applyMiddleware, guardLib, shieldLib };

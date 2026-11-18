# GraphQL Guard

> [!NOTE]
> Come from graphql-shield? Checkout the [Migration Guide](docs/MIGRATE_FROM_SHIELD.md)

<div align="center">

GraphQL server permissions as another layer of abstraction. GraphQL Guard 1.x is a fork of [graphql-shield](https://www.npmjs.com/package/graphql-shield) 7.x

GraphQL Guard helps you create a permission layer for your application. Using an intuitive rule API, every request runs through the guard engine, and smart caching keeps the extra load low. This keeps your application fast and makes sure no internal data is exposed.

![NPM](https://img.shields.io/npm/v/graphql-guard) ![GitHub CI](https://github.com/marklai1998/graphql-guard/actions/workflows/runTest.yml/badge.svg) [![npm type definitions](https://img.shields.io/npm/types/typescript.svg)](https://www.typescriptlang.org/)

[Installation](#-installation) | [Quick Start](#-quick-start) | [Usage](#-usage) | [API](#-api) | [Examples](#-examples) | [Contributing](#-contributing)

</div>

## 📦 Installation

### NPM

```bash
npm i graphql-guard
```

### Yarn

```
yarn add graphql-guard
```

### PNPM

```
pnpm i graphql-guard
```

## 🚀 Quick Start

Define your rules and a permission tree that matches your schema, then apply it with `guard`. It returns a new schema with every field guarded, which works with any GraphQL server.

```ts
import { guard, rule, and, or, not } from 'graphql-guard';

const isAuthenticated = rule({ cache: 'contextual' })(
  async (parent, args, ctx, info) => {
    return ctx.user !== null;
  },
);

const isAdmin = rule({ cache: 'contextual' })(
  async (parent, args, ctx, info) => {
    return ctx.user.role === 'admin';
  },
);

const isEditor = rule({ cache: 'contextual' })(
  async (parent, args, ctx, info) => {
    return ctx.user.role === 'editor';
  },
);

export const guardedSchema = guard(schema, {
  Query: {
    frontPage: not(isAuthenticated),
    fruits: and(isAuthenticated, or(isAdmin, isEditor)),
    customers: and(isAuthenticated, isAdmin),
  },
  Mutation: {
    addFruitToBasket: isAuthenticated,
  },
  Fruit: isAuthenticated,
  Customer: isAdmin,
});
```

then serve the guarded schema as usual, for example with [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server)

```ts
import { createYoga } from 'graphql-yoga';

const yoga = createYoga({ schema: guardedSchema });
```

or [Apollo Server](https://www.apollographql.com/docs/apollo-server)

```ts
import { ApolloServer } from '@apollo/server';

const server = new ApolloServer({ schema: guardedSchema });
```

## 📖 Usage

- [Permission tree](#permission-tree)
- [Writing rules](#writing-rules)
- [Caching](#caching)
- [Custom errors](#custom-errors)
- [Locking down your schema](#locking-down-your-schema)
- [Subscriptions](#subscriptions)
- [Troubleshooting](#troubleshooting)

### Permission tree

The rule tree passed to `guard` must match your schema definition. Rules apply to object types (including `Query`, `Mutation` and `Subscription`). A rule can apply to:

- **a whole type**: `Customer: isAdmin`
- **a single field**: `Query: { customers: isAdmin }`
- **every field of a type without its own rule**: use the `'*'` wildcard

Rules on interfaces and unions throw a `ValidationError`. Apply them to the object types that implement or belong to them instead. Rules on introspection types (`__Schema`, `__Type`, ...) also throw, because Guard never wraps them; disable introspection in your server to restrict it.

```ts
const guardedSchema = guard(
  schema,
  {
    Query: {
      '*': deny, // every Query field except query1 and query2 is denied
      query1: allow,
      query2: allow,
    },
    Mutation: {
      '*': deny,
    },
  },
  {
    fallbackRule: allow, // used for everything else
  },
);
```

### Writing rules

Each rule should check exactly one permission and be explainable in one sentence. For example, keep "is an admin" and "owns this item" as two rules and combine them with [logic rules](#logic-rules), rather than writing one rule that checks both.

```ts
const isAdmin = rule()(async (parent, args, ctx, info) => {
  return ctx.user.role === 'admin';
});

const isOwner = rule()(async (parent, args, ctx, info) => {
  return ctx.user.items.some((id) => id === parent.id);
});

const guardedSchema = guard(schema, {
  Query: {
    users: or(isAdmin, isEditor),
  },
  Mutation: {
    createBlogPost: or(isAdmin, and(isOwner, isEditor)),
  },
  User: {
    secret: isOwner,
  },
});
```

Every rule must have a unique name. Names are generated automatically (`anonymous-rule-1`, `anonymous-rule-2`, ...), but if you build rules with a factory function that takes external data, give each rule its own name:

```ts
const hasRole = (role) =>
  rule(`has-role-${role}`, { cache: 'contextual' })(
    async (parent, args, ctx) => ctx.user.role === role,
  );
```

#### TypeScript

`rule` takes optional type parameters for the context, arguments and parent, in that order. They type the rule function and a `cache` key function:

```ts
type Context = { user: { id: string; role: string } };
type Post = { authorId: string };

const canEditPost = rule<Context, { postId: string }, Post>({
  cache: (parent, args) => args.postId,
})(async (parent, args, ctx) => ctx.user.id === parent.authorId);
```

Without them, `parent`, `args` and `ctx` are `any`. `inputRule<Context>()` types `ctx` the same way. The types used by the API (`Options`, `GuardRule`, `RuleFunction`, `GuardContext`, `FallbackErrorMapperType`, ...) are exported from `graphql-guard`.

### Caching

Rules run once per field, so caching is what keeps GraphQL Guard fast. Caching is **off by default**; turn it on per rule:

| Cache        | Use when the rule relies on                  |
| ------------ | -------------------------------------------- |
| `no_cache`   | anything; never cached (default)             |
| `contextual` | `context` only (e.g. authentication)         |
| `strict`     | `parent` or `args` too (field-specific data) |

```ts
const isAdmin = rule({ cache: 'contextual' })(
  async (parent, args, ctx, info) => {
    return ctx.user.isAdmin;
  },
);

const canSeeUserSensitiveData = rule({ cache: 'strict' })(
  async (parent, args, ctx, info) => {
    return ctx.viewer.id === parent.id;
  },
);
```

If a cache key can't be computed, the rule runs without the cache for that call. For example, object-hash can't hash a `parent` that holds a `Promise` or a `WeakMap`, which is common with ORMs and data loaders.

> [!NOTE]
> For backward compatibility, `{ cache: false }` maps to `no_cache` and `{ cache: true }` maps to `strict`.

### Custom errors

By default, GraphQL Guard catches every error thrown during execution and replaces it with `Not Authorised!`, so internal details never reach the client.

Errors created by GraphQL Guard are `GraphQLError`s with a `code` extension: `FORBIDDEN` for a denial and `BAD_USER_INPUT` for a failed [`inputRule`](#inputrule). Servers that hide unexpected errors, like GraphQL Yoga's default error masking, still show them to the client.

To send a custom message, **return** an `Error` (or a string) from a rule instead of throwing it. A rule that returns an error counts as failing, so the resolver doesn't run.

```ts
const ruleWithCustomError = rule()(async (parent, args, ctx, info) => {
  return new GraphQLError('Custom error from rule.', {
    extensions: { code: 'FORBIDDEN' },
  });
});

const ruleWithCustomErrorMessage = rule()(async (parent, args, ctx, info) => {
  return 'Custom error message from rule.'; // becomes a FORBIDDEN GraphQLError
});
```

Resolvers can do the same by returning an `Error`.

> [!NOTE]
> A plain `Error` returned from a rule is passed through as is. GraphQL Yoga's default error masking hides plain errors, so return a string or a `GraphQLError` to show the message to the client.

To change the default error globally, set `fallbackError` to a string, an `Error`, or a function:

```ts
const guardedSchema = guard(schema, rules, {
  fallbackError: 'You shall not pass!',
});

const guardedSchema = guard(schema, rules, {
  fallbackError: async (thrownThing, parent, args, context, info) => {
    if (thrownThing instanceof Error) {
      console.error(thrownThing); // report unexpected errors
      return new GraphQLError('Internal server error');
    }
    return defaultFallbackError; // plain denial: keep the default error
  },
});
```

The default error is exported as [`defaultFallbackError`](#defaultfallbackerror), so you can reuse it or check for it.

> [!TIP]
> Set `debug: true` to see errors thrown in resolvers, or `allowExternalErrors: true` to pass them through to the client.

### Locking down your schema

Set `fallbackRule` to `deny` so any field without a rule is blocked. New fields stay private until you explicitly allow them.

```ts
const guardedSchema = guard(
  schema,
  {
    Query: {
      users: allow,
    },
    User: allow,
    Author: {
      id: allow,
      name: allow,
      // Author.secret has no rule, so it is denied
    },
  },
  { fallbackRule: deny },
);
```

### Subscriptions

Rules on `Subscription` fields run when the client subscribes. A denied subscription returns the error and never calls the field's `subscribe` function, so no listeners, queries or other setup run for it.

If the field also has a custom `resolve`, the rule runs again for every event, with the event as `parent`, so it can check the payload. A denied event resolves to `null` with the error, and the stream continues. When the client subscribes, `parent` is the root value (usually `undefined`), so a rule that reads the payload must handle that:

```ts
const canSeePost = rule()((post, args, ctx) =>
  post === undefined ? ctx.user !== null : post.authorId === ctx.user?.id,
);
```

### Troubleshooting

**A single field is `Not Authorised!` and the whole parent object returns `null`.**
The blocked field is non-nullable in your schema. GraphQL must honour the schema, so a `null` in a non-nullable field nulls the parent. Make the field nullable if it can be blocked.

**A rule runs only once even though the result has many items.**
This is caching. `contextual` rules are cached per request regardless of `parent` and `args`. Use `strict` (or `no_cache`) when the rule depends on them.

**How long does a cached result last?**
One run of an operation. The cache is keyed by the context object and the run, so results never carry over to another request, even if your server reuses one context object. Each subscription event gets a fresh cache, keyed by the event payload. An event whose payload is not an object (for example, a bare number) shares one cache with the other events of that subscription on graphql-js 17, so use `no_cache` for rules on such events whose answer can change while a client stays subscribed (for example, a ban check).

## 💻 API

- [guard](#guard)
- [rule](#rule)
- [inputRule](#inputrule)
- [allow / deny](#allow--deny)
- [defaultFallbackError](#defaultfallbackerror)
- [Logic rules](#logic-rules)

### `guard`

Returns a new schema with the rules from `ruleTree` applied to every field. The original schema is not changed. Throws a `ValidationError` when the rule tree or `fallbackRule` isn't valid or doesn't match the schema. `ValidationError` is exported, so you can check for it with `instanceof`.

```ts
import { guard } from 'graphql-guard';

const guardedSchema = guard(schema, ruleTree, options);
```

| Option              | Default                                              | Description                                                 |
| ------------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| allowExternalErrors | `false`                                              | Pass errors thrown in resolvers through to the client.      |
| debug               | `false`                                              | Toggle debug mode.                                          |
| fallbackRule        | `allow`                                              | Rule for every field without one.                           |
| fallbackError       | [`defaultFallbackError`](#defaultfallbackerror)      | Error returned on denial. A string, `Error`, or a function. |
| hashFunction        | [object-hash](https://github.com/puleos/object-hash) | Hashing function used by the `strict` cache.                |

> [!WARNING]
> By default, errors **thrown by resolvers** are caught and replaced with `fallbackError` (`Not Authorised!`), the same response a denial gets. The original error is not rethrown, so it never reaches your server's error logging and real bugs look like permission failures. Use `debug: true` to rethrow them, `allowExternalErrors: true` to pass them through to the client, or a `fallbackError` function to log them (it receives the thrown error as its first argument, and `null` for a denial). See [Custom errors](#custom-errors).

### `rule`

```ts
rule<Context = any, Args = any, Parent = any>(
  name?: string,
  options?: {
    cache?:
      | 'no_cache'
      | 'contextual'
      | 'strict'
      | ((parent: Parent, args: Args, ctx: Context, info) => string);
  },
)(
  (parent: Parent, args: Args, ctx: Context, info) =>
    boolean | string | Error | Promise<boolean | string | Error>,
)
```

Wraps a validation function into a reusable rule. Return `true` to allow, `false` to deny, or an `Error`/string to deny with a custom message.

`cache` also accepts a function that returns a cache key. The rule runs once per request for each distinct key, so you can cache on just the data the rule depends on instead of hashing all of `parent` and `args` like `strict` does:

```ts
const canEditPost = rule({ cache: (parent, args) => args.postId })(
  async (parent, args, ctx, info) => {
    return ctx.user.editablePostIds.includes(args.postId);
  },
);
```

### `inputRule`

Validates arguments with a [Zod](https://zod.dev) schema. Zod is an optional peer dependency, so install it (`npm i zod`) and import `inputRule` from `graphql-guard/zod`. Apps that do not use it never load Zod, not even for their type checks. The callback receives `z` and the context, and the schema is checked against the entire `args` object, so start the schema with an object.

```ts
import { inputRule } from 'graphql-guard/zod';

const isValidSignup = inputRule()((z, ctx) =>
  z.object({
    email: z.email('It has to be an email!'),
    age: z.number().min(18, 'Must be an adult!'),
  }),
);
```

When validation fails, the rule fails with the first issue's message (e.g. `It has to be an email!`). The full `ZodError`, with every issue, is available as the error's `cause`.

Results are cached per request by `args` only, so the same input is validated once even across the items of a list.

### `allow` / `deny`

Predefined rules that always pass or always fail.

### `defaultFallbackError`

The `GraphQLError('Not Authorised!')` (code `FORBIDDEN`) returned when a rule denies access and no `fallbackError` is set. Return it from a custom `fallbackError`, or check for it to tell a denial apart from other errors.

```ts
import type { GraphQLError } from 'graphql';
import { defaultFallbackError } from 'graphql-guard';

const isDenied = (error: GraphQLError) =>
  error.originalError === defaultFallbackError;
```

### Logic rules

Combine rules into more complex requirements.

- `and(...rules)` - passes only if all rules pass.
- `or(...rules)` - passes if at least one rule passes.
- `chain(...rules)` - runs rules one by one and stops at the first failure (lazy `and`).
- `race(...rules)` - runs rules one by one and stops at the first success (lazy `or`).
- `not(rule, error?)` - inverts a rule, with an optional custom error. If the wrapped rule throws (for example, its database is down), `not` denies instead of inverting, so `not(isBanned)` never lets everyone in while the ban check is broken. A rule that returns an error or a string is a deliberate "no", so `not` turns it into a "yes".

## 🧪 Examples

- [Basic](examples/basic) - a minimal server with a few rules.
- [Advanced](examples/advanced) - a small groceries shop with cached rules and an in-memory store.
- [Apollo Server Lambda](examples/with-apollo-server-lambda) - using GraphQL Guard with Apollo Server on AWS Lambda.
- [GraphQL Nexus](examples/with-graphql-nexus) - using GraphQL Guard with a Nexus schema and JWT authentication.

## 🤝 Contributing

### Development

#### Local Development

```bash
pnpm i
pnpm test
```

#### Build

```bash
pnpm build
```

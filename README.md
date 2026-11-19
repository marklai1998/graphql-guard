# GraphQL Guard

> [!NOTE]
> Come from graphql-shield? Checkout the [Migration Guide](docs/MIGRATE_FROM_SHIELD.md)

<div align="center">

GraphQL server permissions as another layer of abstraction. GraphQL Guard 1.x is a fork of [graphql-shield](https://www.npmjs.com/package/graphql-shield) 7.x

GraphQL Guard helps you create a permission layer for your application. Using an intuitive rule API, every request runs through the guard engine, and smart caching keeps the extra load low. This keeps your application fast and makes sure no internal data is exposed.

![NPM](https://img.shields.io/npm/v/graphql-guard) ![GitHub CI](https://github.com/marklai1998/graphql-guard/actions/workflows/runTest.yml/badge.svg) [![npm type definitions](https://img.shields.io/npm/types/typescript.svg)](https://www.typescriptlang.org/)

[Installation](#-installation) | [Quick Start](#-quick-start) | [Comparison](#️-comparison) | [Usage](#-usage) | [API](#-api) | [Examples](#-examples) | [Contributing](#-contributing)

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

## ⚖️ Comparison

How GraphQL Guard compares with other GraphQL authorization libraries. Details for other libraries are taken from their documentation; check it for the current state.

|                        | GraphQL Guard                                          | [graphql-shield](https://github.com/maticzav/graphql-shield) | [@envelop/generic-auth](https://the-guild.dev/graphql/envelop/plugins/use-generic-auth) | [@envelop/operation-field-permissions](https://the-guild.dev/graphql/envelop/plugins/use-operation-field-permissions) | [GraphQL AuthZ](https://github.com/AstrumU/graphql-authz)        |
| ---------------------- | ------------------------------------------------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Rules defined as       | Rule tree in code                                      | Rule tree in code                                            | Directives or field extensions (`@authenticated`, `@requiresScopes`, `@policy`)         | Allowed [schema coordinates](https://github.com/graphql/graphql-wg/blob/main/rfcs/SchemaCoordinates.md) per request   | Directives, extensions or a JSON auth schema                     |
| Checks run             | Per field, when it resolves                            | Per field, when it resolves                                  | Before execution (`protect-all`) or when a marked field resolves (`protect-granular`)   | Before execution                                                                                                      | Before execution, and after it for post-execution rules          |
| Rule can read          | `parent`, `args`, `context`, `info`                    | `parent`, `args`, `context`, `info`                          | User, execution args, directive args                                                    | `context` (to build the permission set)                                                                               | `context`, field args; result data in post-execution rules       |
| Logic rules            | `and`, `or`, `not`, `chain`, `race`                    | `and`, `or`, `not`, `chain`, `race`                          | Nested AND / OR lists of scopes or policies                                             | No                                                                                                                    | `and`, `or`, `not`                                               |
| Deny by default        | `fallbackRule: deny`                                   | `fallbackRule: deny`                                         | `protect-all` mode                                                                      | Yes, only listed coordinates are allowed                                                                              | No (rules are opt-in per type or field)                          |
| Denied field           | `null` with an error; the rest of the query still runs | `null` with an error; the rest of the query still runs       | Whole operation rejected by default; `rejectUnauthorized: false` skips only the field   | Whole operation rejected                                                                                              | Error from the rule                                              |
| Per-request rule cache | `contextual`, `strict` or a key function               | `contextual` or `strict`, stored on `ctx._shield`            | No                                                                                      | No                                                                                                                    | No                                                               |
| Typed rules            | `rule<Context, Args, Parent>()`                        | No                                                           | n/a                                                                                     | n/a                                                                                                                   | No                                                               |
| Works with             | Any server that takes a `GraphQLSchema`                | Any server, through `graphql-middleware`                     | Envelop-based servers (e.g. GraphQL Yoga)                                               | Envelop-based servers (e.g. GraphQL Yoga)                                                                             | Envelop, Apollo Server, express-graphql, GraphQL Helix, gateways |
| Also handles           | Authorization only                                     | Authorization, input validation (`inputRule`)                | Authentication (resolves the user into `context`)                                       | Authorization only                                                                                                    | Authorization only                                               |

**Choosing one**

- Pick **GraphQL Guard** when rules depend on the data being returned (for example, "owns this item"), when you want them in one place in code rather than spread over your SDL, or when your server is not built on Envelop. Coming from graphql-shield, see the [Migration Guide](docs/MIGRATE_FROM_SHIELD.md) for what changed.
- Pick **@envelop/generic-auth** to authenticate requests and mark fields with directives, for example `@authenticated` or `@requiresScopes`.
- Pick **@envelop/operation-field-permissions** for a coarse allowlist of which fields a user may select, checked before anything runs.
- Pick **GraphQL AuthZ** when you need rules at a gateway, or rules that check the result after execution.

These approaches can be combined. For example, use `@envelop/generic-auth` in `resolve-only` mode to put the user on `context`, and GraphQL Guard for the permission rules.

## 📖 Usage

- [Permission tree](#permission-tree)
- [Writing rules](#writing-rules)
- [Caching](#caching)
- [Custom errors](#custom-errors)
- [Locking down your schema](#locking-down-your-schema)
- [Apollo Federation](#apollo-federation)
- [Subscriptions](#subscriptions)
- [Testing rules](#testing-rules)
- [Troubleshooting](#troubleshooting)

### Permission tree

The rule tree passed to `guard` must match your schema definition. Rules apply to object types (including `Query`, `Mutation` and `Subscription`). A rule can apply to:

- **a whole type**: `Customer: isAdmin`
- **a single field**: `Query: { customers: isAdmin }`
- **every field of a type without its own rule**: use the `'*'` wildcard

Rules on interfaces and unions throw a `ValidationError`. Apply them to the object types that implement or belong to them instead. Rules on input types also throw; put the rule on the field that takes the input. Rules on introspection types (`__Schema`, `__Type`, ...) also throw, because Guard never wraps them; disable introspection in your server to restrict it.

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

Without them, `parent`, `args` and `ctx` are `any`. The types used by the API (`Options`, `GuardRule`, `RuleFunction`, `GuardContext`, `FallbackErrorMapperType`, ...) are exported from `graphql-guard`.

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

`strict` keys `parent` by identity and hashes `args` with object-hash. Two parent objects never share a result, even if they look equal, because data that a hash can't see (`#private` fields, getters, non-enumerable properties) could tell them apart. The same parent object is still cached across its fields. If you set a custom `hashFunction`, it receives `{ parent, args }` and must tell different parents apart itself.

If a cache key can't be computed, the rule runs without the cache for that call. For example, object-hash can't hash `args` that hold a file upload.

> [!NOTE]
> For backward compatibility, `{ cache: false }` maps to `no_cache` and `{ cache: true }` maps to `strict`.

### Custom errors

GraphQL Guard only handles errors from its own work. A rule that throws denies access with `fallbackError` (`Not Authorised!`), so internal details from rules never reach the client. Errors thrown by resolvers are left alone, on every field: they reach the client and your server's error handling (for example, GraphQL Yoga's error masking) as they are.

Errors created by GraphQL Guard are `GraphQLError`s with the `FORBIDDEN` code. Servers that hide unexpected errors, like GraphQL Yoga's default error masking, still show them to the client.

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

To deny quietly, set `fallbackError` to `null` (or return `null` from the function). Denied fields resolve to `null` with no error, which is useful with Apollo Federation. The field must be nullable: a non-null field still produces GraphQL's non-null error.

```ts
const guardedSchema = guard(schema, rules, {
  fallbackError: null,
});
```

> [!TIP]
> Set `debug: true` to see errors thrown in rules. To replace errors thrown by resolvers with `fallbackError` too, set `suppressResolverError: true`. The `fallbackError` function then receives the resolver's error as its first argument.

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

### Apollo Federation

Apply `guard` to the schema returned by `buildSubgraphSchema`. With `fallbackRule: deny`, also allow the fields the router uses to read your subgraph, or composition and entity lookups fail with `Not Authorised!`:

```ts
import { buildSubgraphSchema } from '@apollo/subgraph';

const guardedSchema = guard(
  buildSubgraphSchema({ typeDefs, resolvers }),
  {
    Query: {
      _service: allow, // the router fetches your SDL through it
      _entities: allow, // the router resolves entity references through it
      products: allow,
    },
    _Service: allow,
    Product: {
      id: allow,
      name: isLoggedIn,
    },
  },
  { fallbackRule: deny },
);
```

- `_entities` exists only when the subgraph defines at least one entity (a type with `@key`). Leave it out otherwise, or `guard` throws a `ValidationError`.
- `_Entity` is a union and `_Any` is a scalar, so they take no rules.
- Allowing `_entities` doesn't expose your entities: the fields of each returned entity are still checked by their own rules.

### Subscriptions

Rules on `Subscription` fields run when the client subscribes. A denied subscription returns the error and never calls the field's `subscribe` function, so no listeners, queries or other setup run for it.

If the field also has a custom `resolve`, the rule runs again for every event, with the event as `parent`, so it can check the payload. A denied event resolves to `null` with the error, and the stream continues. When the client subscribes, `parent` is the root value (usually `undefined`), so a rule that reads the payload must handle that:

```ts
const canSeePost = rule()((post, args, ctx) =>
  post === undefined ? ctx.user !== null : post.authorId === ctx.user?.id,
);
```

### Testing rules

Test a rule the way it runs in production: guard a small schema and execute a query against it, with the context each case needs. This covers the rule together with caching, logic rules and error handling.

```ts
import { graphql } from 'graphql';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { guard } from 'graphql-guard';
import { isAdmin } from './rules';

const schema = guard(
  makeExecutableSchema({
    typeDefs: 'type Query { secret: String }',
    resolvers: { Query: { secret: () => 'ok' } },
  }),
  { Query: { secret: isAdmin } },
);

const run = (user) =>
  graphql({ schema, source: '{ secret }', contextValue: { user } });

test('admins can read the secret', async () => {
  const result = await run({ role: 'admin' });
  expect(result.data?.secret).toBe('ok');
});

test('other users are denied', async () => {
  const result = await run({ role: 'viewer' });
  expect(result.data?.secret).toBeNull();
  expect(result.errors?.[0].message).toBe('Not Authorised!');
});
```

To test only the logic, define the function on its own, test it directly, and pass it to `rule()`:

```ts
export const isAdminFn = (parent, args, ctx) => ctx.user?.role === 'admin';
export const isAdmin = rule({ cache: 'contextual' })(isAdminFn);
```

### Troubleshooting

**A single field is `Not Authorised!` and the whole parent object returns `null`.**
The blocked field is non-nullable in your schema. GraphQL must honour the schema, so a `null` in a non-nullable field nulls the parent. Make the field nullable if it can be blocked.

**A public field (`allow`, or no rule with `fallbackRule: allow`) returns `Not Authorised!`.**
Its resolver threw and `suppressResolverError` is set, which replaces resolver errors with `fallbackError` on every field, including allowed ones. Remove it, or set `debug: true`, to see the original error.

**A rule runs only once even though the result has many items.**
This is caching. `contextual` rules are cached per request regardless of `parent` and `args`. Use `strict` (or `no_cache`) when the rule depends on them.

**How long does a cached result last?**
One run of an operation. The cache is keyed by the context object and the run, so results never carry over to another request, even if your server reuses one context object. Each subscription event gets a fresh cache, keyed by the event payload. An event whose payload is not an object (for example, a bare number) shares one cache with the other events of that subscription on graphql-js 17, so use `no_cache` for rules on such events whose answer can change while a client stays subscribed (for example, a ban check).

## 💻 API

- [guard](#guard)
- [rule](#rule)
- [allow / deny](#allow--deny)
- [defaultFallbackError](#defaultfallbackerror)
- [Logic rules](#logic-rules)

### `guard`

Returns a new schema with the rules from `ruleTree` applied to every field. The original schema is not changed. Throws a `ValidationError` when the rule tree or `fallbackRule` isn't valid or doesn't match the schema. `ValidationError` is exported, so you can check for it with `instanceof`.

```ts
import { guard } from 'graphql-guard';

const guardedSchema = guard(schema, ruleTree, options);
```

| Option                | Default                                                                          | Description                                                           |
| --------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| debug                 | `false`                                                                          | Toggle debug mode. Errors thrown by rules are rethrown.               |
| fallbackRule          | `allow`                                                                          | Rule for every field without one.                                     |
| fallbackError         | [`defaultFallbackError`](#defaultfallbackerror)                                  | Error returned on denial. A string, `Error`, `null`, or a function.   |
| hashFunction          | parent identity + [object-hash](https://github.com/puleos/object-hash) of `args` | Key function used by the `strict` cache. Receives `{ parent, args }`. |
| suppressResolverError | `false`                                                                          | Replace errors thrown by resolvers with `fallbackError`.              |

> [!NOTE]
> GraphQL Guard leaves errors thrown by resolvers alone, so they reach the client and your server's error logging as they are, on every field. Only errors from the guard's own work, like a rule that throws, are replaced with `fallbackError`. Set `suppressResolverError: true` to replace resolver errors too, the same response a denial gets. A `fallbackError` function then receives the resolver's error as its first argument (and `null` for a plain denial). See [Custom errors](#custom-errors).

### `rule`

```ts
rule<Context = any, Args = any, Parent = any>(
  name?: string,
  options?: {
    cache?:
      | 'no_cache'
      | 'contextual'
      | 'strict'
      | ((parent: Parent, args: Args, ctx: Context, info) => string | number);
  },
)(
  (parent: Parent, args: Args, ctx: Context, info) =>
    boolean | string | Error | Promise<boolean | string | Error>,
)
```

Wraps a validation function into a reusable rule. Return `true` to allow, `false` to deny, or an `Error`/string to deny with a custom message. An empty string has no message, so it denies like `false`, with `fallbackError`.

`cache` also accepts a function that returns a cache key, a string or a number. The rule runs once per request for each distinct key, so you can cache on just the data the rule depends on instead of all of `parent` and `args` like `strict` does. If the function returns anything else (for example, an object from plain JavaScript), the rule runs without the cache for that call:

```ts
const canEditPost = rule({ cache: (parent, args) => args.postId })(
  async (parent, args, ctx, info) => {
    return ctx.user.editablePostIds.includes(args.postId);
  },
);
```

GraphQL Guard is a rule engine, not an input validator. To validate arguments with Zod, Yup or another library, wrap it in a rule; see [`inputRule` Removed](docs/MIGRATE_FROM_SHIELD.md#inputrule-removed).

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
- `and`, `or`, `chain` and `race` throw a `ValidationError` when called with no rules, so `and(...rulesFromConfig)` with an empty list fails loudly instead of making the field public. Use `allow` or `deny` to allow or deny everything.
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

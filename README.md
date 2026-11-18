# GraphQL Guard

> [!NOTE]
> Come from graphql-shield? Checkout the [Migration Guide](docs/MIGRATE_FROM_SHIELD.md)

<div align="center">

GraphQL server permissions as another layer of abstraction. Fork of [graphql-shield](https://www.npmjs.com/package/graphql-shield)

GraphQL Guard helps you create a permission layer for your application. Using an intuitive rule API, every request runs through the guard engine, and smart caching keeps the extra load low. This keeps your application fast and makes sure no internal data is exposed.

![NPM](https://img.shields.io/npm/v/graphql-guard) ![GitHub CI](https://github.com/marklai1998/graphql-guard/actions/workflows/runTest.yml/badge.svg) [![npm type definitions](https://img.shields.io/npm/types/typescript.svg)](https://www.typescriptlang.org/)

[Installation](#-installation) | [Quick Start](#-quick-start) | [Usage](#-usage) | [API](#-api) | [Examples](#-examples) | [Contributing](#-contributing)

</div>

## 📦 Installation

GraphQL Guard runs on top of [GraphQL Middleware](https://www.npmjs.com/package/graphql-middleware), so install both.

### NPM

```bash
npm i graphql-guard graphql-middleware
```

### Yarn

```
yarn add graphql-guard graphql-middleware
```

### PNPM

```
pnpm i graphql-guard graphql-middleware
```

## 🚀 Quick Start

Define your rules (permissions.ts) and build a permission tree that matches your schema.

```ts
import { shield, rule, and, or, not } from 'graphql-guard';

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

export const permissions = shield({
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

then apply it to your schema

```ts
import { applyMiddleware } from 'graphql-middleware';
import { permissions } from './permissions';

const schemaWithPermissions = applyMiddleware(schema, permissions);

// use the new schema as before
```

## 📖 Usage

- [Permission tree](#permission-tree)
- [Writing rules](#writing-rules)
- [Caching](#caching)
- [Custom errors](#custom-errors)
- [Locking down your schema](#locking-down-your-schema)
- [Fragments](#fragments)
- [Troubleshooting](#troubleshooting)

### Permission tree

The rule tree passed to `shield` must match your schema definition. A rule can apply to:

- **a whole type**: `Customer: isAdmin`
- **a single field**: `Query: { customers: isAdmin }`
- **every field of a type without its own rule**: use the `'*'` wildcard

```ts
const permissions = shield(
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

const permissions = shield({
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

Every rule must have a unique name. Names are generated automatically, but if you build rules with a factory function that takes external data, give each rule its own name:

```ts
const hasRole = (role) =>
  rule(`has-role-${role}`, { cache: 'contextual' })(
    async (parent, args, ctx) => ctx.user.role === role,
  );
```

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

> [!NOTE]
> For backward compatibility, `{ cache: false }` maps to `no_cache` and `{ cache: true }` maps to `strict`.

### Custom errors

By default, GraphQL Guard catches every error thrown during execution and replaces it with `Not Authorised!`, so internal details never reach the client.

To send a custom message, **return** an `Error` (or a string) from a rule instead of throwing it. A rule that returns an error counts as failing, so the resolver doesn't run.

```ts
const ruleWithCustomError = rule()(async (parent, args, ctx, info) => {
  return new Error('Custom error from rule.');
});

const ruleWithCustomErrorMessage = rule()(async (parent, args, ctx, info) => {
  return 'Custom error message from rule.';
});
```

Resolvers can do the same by returning an `Error`.

To change the default error globally, set `fallbackError` to a string, an `Error`, or a function:

```ts
const permissions = shield(rules, {
  fallbackError: 'You shall not pass!',
});

const permissions = shield(rules, {
  fallbackError: async (thrownThing, parent, args, context, info) => {
    if (thrownThing instanceof Error) {
      console.error(thrownThing); // report unexpected errors
    }
    return new Error('Internal server error');
  },
});
```

> [!TIP]
> Set `debug: true` to see errors thrown in resolvers, or `allowExternalErrors: true` to pass them through to the client.

### Locking down your schema

Set `fallbackRule` to `deny` so any field without a rule is blocked. New fields stay private until you explicitly allow them.

```ts
const permissions = shield(
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

### Fragments

If your server forwards queries to another GraphQL server, a rule may need fields the client didn't request (for example `id` for an ownership check). Declare them with a fragment:

```ts
const isItemOwner = rule({
  cache: 'strict',
  fragment: 'fragment ItemID on Item { id }',
})(async ({ id }, args, ctx, info) => {
  return ctx.db.exists.Item({ id, owner: { id: ctx.user.id } });
});
```

Then pass the generated `fragmentReplacements` to your server's communication library:

```ts
const { schema, fragmentReplacements } = applyMiddleware(schema, permissions);
```

### Troubleshooting

**A single field is `Not Authorised!` and the whole parent object returns `null`.**
The blocked field is non-nullable in your schema. GraphQL must honour the schema, so a `null` in a non-nullable field nulls the parent. Make the field nullable if it can be blocked.

**A rule runs only once even though the result has many items.**
This is caching. `contextual` rules are cached per request regardless of `parent` and `args`. Use `strict` (or `no_cache`) when the rule depends on them.

## 💻 API

- [shield](#shield)
- [rule](#rule)
- [inputRule](#inputrule)
- [allow / deny](#allow--deny)
- [Logic rules](#logic-rules)

### `shield`

Generates a GraphQL Middleware layer from your rule tree.

```ts
import { shield } from 'graphql-guard';

const permissions = shield(ruleTree, options);
```

| Option              | Default                                              | Description                                                 |
| ------------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| allowExternalErrors | `false`                                              | Pass errors thrown in resolvers through to the client.      |
| debug               | `false`                                              | Toggle debug mode.                                          |
| fallbackRule        | `allow`                                              | Rule for every field without one.                           |
| fallbackError       | `Error('Not Authorised!')`                           | Error returned on denial. A string, `Error`, or a function. |
| hashFunction        | [object-hash](https://github.com/puleos/object-hash) | Hashing function used by the `strict` cache.                |

### `rule`

```ts
rule(name?: string, options?: { cache?: 'no_cache' | 'contextual' | 'strict', fragment?: string })(
  (parent, args, ctx, info) => boolean | string | Error | Promise<boolean | string | Error>,
)
```

Wraps a validation function into a reusable rule. Return `true` to allow, `false` to deny, or an `Error`/string to deny with a custom message.

### `inputRule`

Validates arguments with a [Zod](https://zod.dev) schema. The callback receives `z` and the context, and the schema is checked against the entire `args` object, so start the schema with an object.

```ts
import { inputRule } from 'graphql-guard';

const isValidSignup = inputRule()((z, ctx) =>
  z.object({
    email: z.email('It has to be an email!'),
    age: z.number().min(18, 'Must be an adult!'),
  }),
);
```

When validation fails, the rule fails with the first issue's message (e.g. `It has to be an email!`). The full `ZodError`, with every issue, is available as the error's `cause`.

### `allow` / `deny`

Predefined rules that always pass or always fail.

### Logic rules

Combine rules into more complex requirements.

- `and(...rules)` - passes only if all rules pass.
- `or(...rules)` - passes if at least one rule passes.
- `chain(...rules)` - runs rules one by one and stops at the first failure (lazy `and`).
- `race(...rules)` - runs rules one by one and stops at the first success (lazy `or`).
- `not(rule, error?)` - inverts a rule, with an optional custom error.

## 🧪 Examples

- [Basic](examples/basic) - a minimal server with a few rules.
- [Advanced](examples/advanced) - a fuller app powered by Prisma.
- [Apollo Server Lambda](examples/with-apollo-server-lambda) - using GraphQL Guard with `apollo-server-lambda`.
- [GraphQL Nexus](examples/with-graphql-nexus) - using GraphQL Guard with Nexus and Prisma.
- [GraphQL Middleware Forward Binding](examples/with-graphql-middleware-forward-binding) - forwarding to a remote schema.

> [!NOTE]
> The examples still install and import `graphql-shield`, from before the fork.

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

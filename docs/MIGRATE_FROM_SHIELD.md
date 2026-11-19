# Migrate from `graphql-shield`

GraphQL Guard 1.x is a fork of `graphql-shield@7.x` (based on `7.6.5`, the latest 7.x release). Rules, caching, logic rules and fallbacks work as before. GraphQL Guard no longer depends on `graphql-middleware`: `guard` takes your schema and returns a guarded one. Most projects only need to update the package name, replace `shield` and `applyMiddleware` with `guard`, and check the requirements below.

This guide has three parts:

- **[API Changes](#api-changes)**: code you need to change.
- **[Behavioral Changes](#behavioral-changes)**: the same code behaves differently, mostly where graphql-shield let a request through by mistake.
- **[Fixed graphql-shield Issues](#fixed-graphql-shield-issues)**: open or unreleased upstream issues that GraphQL Guard fixes.

Contents:

- [Requirements](#requirements)
- [API Changes](#api-changes)
  - [Update Import](#update-import)
  - [Replace `shield` and `applyMiddleware` with `guard`](#replace-shield-and-applymiddleware-with-guard)
  - [Rename Types](#rename-types)
  - [Replace Yup with Zod in `inputRule`](#replace-yup-with-zod-in-inputrule)
  - [Fragments Removed](#fragments-removed)
  - [Package Entry Points](#package-entry-points)
- [Behavioral Changes](#behavioral-changes)
  - [Errors Are `GraphQLError`s](#errors-are-graphqlerrors)
  - [Only graphql-guard Rules Are Accepted](#only-graphql-guard-rules-are-accepted)
  - [Rules on Interfaces, Unions and Introspection Types](#rules-on-interfaces-unions-and-introspection-types)
  - [Logic Rules Need at Least One Rule](#logic-rules-need-at-least-one-rule)
  - [`not` Denies When the Rule Throws](#not-denies-when-the-rule-throws)
  - [Subscriptions Are Checked on Subscribe](#subscriptions-are-checked-on-subscribe)
  - [Rule Cache](#rule-cache)
  - [Thrown Values With `allowExternalErrors`](#thrown-values-with-allowexternalerrors)
  - [Anonymous Rule Names](#anonymous-rule-names)
  - [Validation Error Messages](#validation-error-messages)
- [Fixed graphql-shield Issues](#fixed-graphql-shield-issues)

## Requirements

- Node 18 or above
- `graphql` 14.4 or above, 15, 16 or 17. Support for `graphql` 0.11 to 0.13 and 14.0 to 14.3 is removed. `graphql` 17 itself needs Node 22 or above
- `graphql-middleware` is no longer needed. Remove it unless you use it for other middleware

## API Changes

### Update Import

Replace the package and update every import. Apart from `shield`, which is renamed to `guard`, all exports keep their names: `rule`, `inputRule`, `allow`, `deny`, `and`, `or`, `not`, `chain` and `race`. `inputRule` is imported from `graphql-guard/zod` (see [Replace Yup with Zod in `inputRule`](#replace-yup-with-zod-in-inputrule)).

```bash
npm uninstall graphql-shield graphql-middleware
npm i graphql-guard
```

```diff
- import { shield, rule, and, or, not } from 'graphql-shield';
+ import { guard, rule, and, or, not } from 'graphql-guard';
```

### Replace `shield` and `applyMiddleware` with `guard`

`shield(rules, options)` returned a `graphql-middleware` middleware that you applied with `applyMiddleware`. `guard(schema, rules, options)` applies the rules itself and returns a new schema, which you pass to your server as usual. The rule tree and options are the same.

Before

```ts
import { applyMiddleware } from "graphql-middleware";
import { shield } from "graphql-shield";

const permissions = shield(
  { Query: { users: isAdmin } },
  { fallbackRule: deny },
);

const schemaWithPermissions = applyMiddleware(schema, permissions);
```

After

```ts
import { guard } from "graphql-guard";

const schemaWithPermissions = guard(
  schema,
  { Query: { users: isAdmin } },
  { fallbackRule: deny },
);
```

With GraphQL Yoga and `@envelop/graphql-middleware`, guard the schema instead of using the plugin:

```diff
- createYoga({ schema, plugins: [useGraphQLMiddleware([permissions])] });
+ createYoga({ schema: guard(schema, rules) });
```

### Rename Types

The `I` prefix is removed from type names.

- `IRule` => `Rule`
- `IRules` => `Rules`
- `IOptions` => `Options`
- `ShieldRule` => `GuardRule`
- `IRuleFunction` => `RuleFunction`
- `IFallbackErrorMapperType` => `FallbackErrorMapperType`

Before

```ts
import type { IRule, IRules } from "graphql-shield";

const isAdmin: IRule = rule()(async (parent, args, ctx) => ctx.user.isAdmin);
const permissions: IRules = { Query: { users: isAdmin } };
```

After

```ts
import type { Rule, Rules } from "graphql-guard";

const isAdmin: Rule = rule()(async (parent, args, ctx) => ctx.user.isAdmin);
const permissions: Rules = { Query: { users: isAdmin } };
```

`rule` now takes optional type parameters for the context, arguments and parent: `rule<Context, Args, Parent>()`. They are new, so existing code needs no change.

### Replace Yup with Zod in `inputRule`

`inputRule` validates with [Zod](https://zod.dev) instead of Yup. `yup` and `@types/yup` are no longer installed. Zod is an optional peer dependency, so install it (`npm i zod`).

- Import `inputRule` from `graphql-guard/zod` instead of the package root
- The callback receives `z` instead of `yup` and must return a Zod schema
- The optional second argument takes Zod's parse options instead of Yup's validate options. `abortEarly` has no equivalent
- On failure, the error message is the first issue's message, like Yup's default. The full `ZodError` is available as the error's `cause`
- The type parameter is now the context type, and the schema type is inferred. Replace `inputRule<T>()` with `inputRule()`, or `inputRule<Context>()` to type `ctx`

Before

```ts
import { inputRule } from "graphql-shield";

const isValidSignup = inputRule()(
  (yup) =>
    yup.object({
      email: yup.string().email("It has to be an email!").required(),
      age: yup.number().min(18, "Must be an adult!").required(),
    }),
  { abortEarly: false },
);
```

After

```ts
import { inputRule } from "graphql-guard/zod";

// Fields are required by default in Zod
const isValidSignup = inputRule()((z) =>
  z.object({
    email: z.email("It has to be an email!"),
    age: z.number().min(18, "Must be an adult!"),
  }),
);
```

### Fragments Removed

The `fragment` rule option and `fragmentReplacements` are removed. They existed for `prisma-binding` and `graphql-binding`, which are deprecated. Remove the `fragment` option from your rules.

```diff
- rule({ cache: 'strict', fragment: 'fragment ItemID on Item { id }' })(isOwner);
+ rule({ cache: 'strict' })(isOwner);
```

### Package Entry Points

The package is built with [tsdown](https://tsdown.dev) and ships `dist/index.mjs` (ESM) and `dist/index.cjs` (CommonJS) with their own type definitions. Both `import` and `require` work as before, and `graphql-guard/package.json` is still exported. `inputRule` has its own entry point, `graphql-guard/zod`, so the main entry point and its type definitions do not depend on Zod.

## Behavioral Changes

### Errors Are `GraphQLError`s

Errors created by GraphQL Guard are now `GraphQLError`s with a `code` extension instead of plain `Error`s:

- `Not Authorised!` (`defaultFallbackError`), a string `fallbackError`, a string returned from a rule and a string passed to `not(rule, error)` use `FORBIDDEN`
- A failed `inputRule` uses `BAD_USER_INPUT`

Servers that hide unexpected errors now show them. With `graphql-shield`, GraphQL Yoga's default error masking turned every denial into `Unexpected error.` If you turned masking off for that reason, you can turn it back on.

A plain `Error` returned from a rule or a custom `fallbackError` is still passed through as is. Return a string or a `GraphQLError` if it should survive error masking.

### Only graphql-guard Rules Are Accepted

Every value in the rule tree, and `fallbackRule`, must be a rule created with graphql-guard (`rule`, `inputRule`, `allow`, `deny` or a logic rule). Anything else throws a `ValidationError` that names the field, for example `It seems like Query.users is not a graphql-guard rule.` `ValidationError` is exported, so you can check for it with `instanceof`.

- Rules created with graphql-shield are not accepted. Recreate them with graphql-guard. Mixing the two never worked: graphql-shield rules with a contextual or strict cache always denied the request, because their cache lives on `ctx._shield`
- `graphql-shield` replaced the whole type with the fallback rule when one value wasn't a rule, which let every field of that type through by default. GraphQL Guard throws instead
- Rules are recognised by a brand instead of `instanceof`, so a rule created by another copy of graphql-guard (another package in a monorepo, or the ESM and CommonJS builds in one app) is accepted
- `fallbackRule` is validated like the rule tree, including duplicate rule names

### Rules on Interfaces, Unions and Introspection Types

`graphql-shield` silently ignored rules on interface and union types, so the fields stayed unprotected. GraphQL Guard throws a `ValidationError` instead. Apply the rules to the object types that implement or belong to them.

Before

```ts
// `Node.secret` was not protected
shield({ Node: { secret: isAdmin } });
```

After

```ts
guard(schema, { Item: { secret: isAdmin } });
```

Rules on introspection types (`__Schema`, `__Type`, ...) were also ignored and now throw. To restrict introspection, disable it in your server.

### Logic Rules Need at Least One Rule

`and()` and `chain()` with no rules passed in graphql-shield, so a field guarded by `and(...rulesFromConfig)` became public when the list was empty. `and`, `or`, `chain` and `race` now throw a `ValidationError` when called with no rules. Use `allow` or `deny` to allow or deny everything.

### `not` Denies When the Rule Throws

`not(rule)` denies when the wrapped rule throws. In graphql-shield, a thrown error counted as "no", so `not` turned it into "yes" and let the request through. A rule that returns an error or a string is still a deliberate "no", so `not` turns it into a "yes".

### Subscriptions Are Checked on Subscribe

A subscription field with a custom `resolve` is also checked when the client subscribes, not only on each event. Rules that read the event payload get the root value (usually `undefined`) as `parent` at that point.

### Rule Cache

- The per-request cache is no longer stored on the context (`ctx._shield`). It is kept per operation run, so a context object reused across requests no longer shares cached results. Code that read or reset `ctx._shield` should be removed
- Each subscription event has its own cache, so a cached result from one event is not reused for the next
- Cache keys include the rule name and key without ambiguity. In graphql-shield, a contextual rule named `a-b` and a rule `a` with key `b` shared one cache entry
- `inputRule` keys its cache on `args` only, not `parent`
- When a `strict` or key-function cache key can't be computed (for example, `object-hash` throws on a Promise, a `WeakMap` or a file upload), the rule runs without the cache instead of denying the request
- A missing context is passed to rules and resolvers as is. graphql-shield replaced it with a new `{}` for every field, so resolvers didn't get what the server passed and caching never applied

### Thrown Values With `allowExternalErrors`

With `allowExternalErrors`, a thrown value that isn't an `Error` (for example, a string) is wrapped in an `Error` with the message `Unexpected error value`, and the original value is kept as its `cause`. graphql-shield returned it from the resolver, so it became field data and reached the client.

### Anonymous Rule Names

Rules without a name get sequential names (`anonymous-rule-1`, `anonymous-rule-2`, ...) instead of random ones, so names are stable between runs.

### Validation Error Messages

Validation errors say `Guard cannot find them in your schema` instead of `Shield cannot find them in your schema`. Update any test or log matching that text.

## Fixed graphql-shield Issues

These [graphql-shield issues](https://github.com/maticzav/graphql-shield/issues) are fixed in GraphQL Guard.

| Issue                                                                                                                                      | Fix                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| [#1001](https://github.com/maticzav/graphql-shield/issues/1001) graphql-middleware is currently unmaintained                               | `graphql-middleware` is no longer used                                                                       |
| [#1476](https://github.com/maticzav/graphql-shield/issues/1476) Move from graphql-middleware to Resolvers Composition                      | `guard` wraps resolvers itself                                                                               |
| [#1560](https://github.com/maticzav/graphql-shield/issues/1560) Support for node v23 or higher                                             | No `util.isUndefined`, which Node 23 removed (fixed upstream but never released)                             |
| [#1561](https://github.com/maticzav/graphql-shield/issues/1561) isUndefined import error                                                   | Same as #1560                                                                                                |
| [#1473](https://github.com/maticzav/graphql-shield/issues/1473) The bundled package is missing types in `types.js` export                  | Built with tsdown; types are type-only exports                                                               |
| [#1487](https://github.com/maticzav/graphql-shield/issues/1487) 7.6.4 ESM build broken                                                     | Same as #1473                                                                                                |
| [#562](https://github.com/maticzav/graphql-shield/issues/562) Rule is not recognised when imported from a package                          | Rules are recognised by a brand instead of `instanceof`                                                      |
| [#970](https://github.com/maticzav/graphql-shield/issues/970) Mono repo (lerna) MiddlewareError                                            | Same as #562                                                                                                 |
| [#1176](https://github.com/maticzav/graphql-shield/issues/1176) Should INTERNAL_SERVER_ERROR be UNAUTHENTICATED/FORBIDDEN?                 | Denials are `GraphQLError`s with the `FORBIDDEN` code                                                        |
| [#688](https://github.com/maticzav/graphql-shield/issues/688) Unknown object type "promise" error when uploading files                     | `inputRule` keys on `args` only, and rules whose cache key can't be computed run uncached instead of denying |
| [#1221](https://github.com/maticzav/graphql-shield/issues/1221) Error: Unknown object type "promise"                                       | Same as #688                                                                                                 |
| [#487](https://github.com/maticzav/graphql-shield/issues/487) Shield rules with cache: "strict" don't work on types                        | Same as #688, for parents `object-hash` can't hash                                                           |
| [#1109](https://github.com/maticzav/graphql-shield/issues/1109) Context object not typed on rule arguments                                 | `rule<Context, Args, Parent>()`                                                                              |
| [#1315](https://github.com/maticzav/graphql-shield/issues/1315) The `context` argument of `inputRule` has insufficient type definition     | `inputRule<Context>()`                                                                                       |
| [#781](https://github.com/maticzav/graphql-shield/issues/781) @types/yup dev dependency                                                    | Yup is replaced with Zod, an optional peer dependency                                                        |
| [#1087](https://github.com/maticzav/graphql-shield/issues/1087) Build error with yup latest version                                        | Same as #781                                                                                                 |
| [#1510](https://github.com/maticzav/graphql-shield/issues/1510) Update yup@1.x to avoid @types/lodash and babel runtime in production deps | Same as #781                                                                                                 |

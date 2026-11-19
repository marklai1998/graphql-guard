# Migrate from `graphql-shield`

GraphQL Guard 1.x is a fork of `graphql-shield@7.x` (based on `7.6.5`, the latest 7.x release). Rules, caching, logic rules and fallbacks work as before. GraphQL Guard no longer depends on `graphql-middleware`: `guard` takes your schema and returns a guarded one. Most projects only need to update the package name, replace `shield` and `applyMiddleware` with `guard`, and check the requirements below.

This guide has four parts:

- **[API Changes](#api-changes)**: code you need to change.
- **[Behavioral Changes](#behavioral-changes)**: the same code behaves differently, mostly where graphql-shield let a request through by mistake.
- **[Fixed graphql-shield Issues](#fixed-graphql-shield-issues)**: open or unreleased upstream issues that GraphQL Guard fixes.
- **[Answered in the Docs](#answered-in-the-docs)**: common upstream questions that the README now answers.

Contents:

- [Requirements](#requirements)
- [API Changes](#api-changes)
  - [Update Import](#update-import)
  - [Replace `shield` and `applyMiddleware` with `guard`](#replace-shield-and-applymiddleware-with-guard)
  - [Rename Types](#rename-types)
  - [`fallbackError` Accepts `null`](#fallbackerror-accepts-null)
  - [`inputRule` Removed](#inputrule-removed)
  - [Resolver Errors Pass Through](#resolver-errors-pass-through)
  - [Fragments Removed](#fragments-removed)
  - [Package Entry Points](#package-entry-points)
- [Behavioral Changes](#behavioral-changes)
  - [Errors Are `GraphQLError`s](#errors-are-graphqlerrors)
  - [Rules Are Recognised by Their API](#rules-are-recognised-by-their-api)
  - [Rules on Interfaces, Unions and Introspection Types](#rules-on-interfaces-unions-and-introspection-types)
  - [Logic Rules Need at Least One Rule](#logic-rules-need-at-least-one-rule)
  - [`not` Denies When the Rule Throws](#not-denies-when-the-rule-throws)
  - [`fallbackError` Receives Errors Thrown by Rules](#fallbackerror-receives-errors-thrown-by-rules)
  - [`race` Returns the First Error](#race-returns-the-first-error)
  - [Subscriptions Are Checked on Subscribe](#subscriptions-are-checked-on-subscribe)
  - [Rule Cache](#rule-cache)
  - [Anonymous Rule Names](#anonymous-rule-names)
  - [Validation Error Messages](#validation-error-messages)
- [Fixed graphql-shield Issues](#fixed-graphql-shield-issues)
- [Answered in the Docs](#answered-in-the-docs)

## Requirements

- Node.js 20.19+ or 22.12+, the versions that can `require()` an ES module. Node.js 18 and earlier 20.x and 22.x releases are no longer supported
- `graphql` 14.4 or above, 15, 16 or 17. Support for `graphql` 0.11 to 0.13 and 14.0 to 14.3 is removed. `graphql` 17 itself needs Node 22 or above
- `graphql-middleware` is no longer needed. Remove it unless you use it for other middleware

## API Changes

### Update Import

Replace the package and update every import. Apart from `shield`, which is renamed to `guard`, all exports keep their names: `rule`, `allow`, `deny`, `and`, `or`, `not`, `chain` and `race`. `inputRule` is removed (see [`inputRule` Removed](#inputrule-removed)).

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
import { applyMiddleware } from 'graphql-middleware';
import { shield } from 'graphql-shield';

const permissions = shield(
  { Query: { users: isAdmin } },
  { fallbackRule: deny },
);

const schemaWithPermissions = applyMiddleware(schema, permissions);
```

After

```ts
import { guard } from 'graphql-guard';

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
import type { IRule, IRules } from 'graphql-shield';

const isAdmin: IRule = rule()(async (parent, args, ctx) => ctx.user.isAdmin);
const permissions: IRules = { Query: { users: isAdmin } };
```

After

```ts
import type { Rule, Rules } from 'graphql-guard';

const isAdmin: Rule = rule()(async (parent, args, ctx) => ctx.user.isAdmin);
const permissions: Rules = { Query: { users: isAdmin } };
```

`rule` now takes optional type parameters for the context, arguments and parent: `rule<Context, Args, Parent>()`. They are new, so existing code needs no change.

### `fallbackError` Accepts `null`

`fallbackError` can be `null`, and a `fallbackError` function can return `null`, so denied fields resolve to `null` without an error. In graphql-shield, `null` worked at runtime but failed type checking. If you cast it (`null as any`, `@ts-expect-error`), remove the cast.

```diff
- guard(schema, rules, { fallbackError: null as any });
+ guard(schema, rules, { fallbackError: null });
```

### `inputRule` Removed

`inputRule` is removed. GraphQL Guard is a rule engine for permissions, not an input validator, and it shouldn't tie your app to a validation library. `yup` and `@types/yup` are no longer installed, and no other validator replaces them.

An input rule is a normal rule that returns an error when validation fails, so you can write it yourself with `rule` and any library. This drop-in replacement keeps your existing Yup schemas working. Install `yup` and import `inputRule` from your own module instead of `graphql-shield`:

```ts
import { GraphQLError } from 'graphql';
import { rule } from 'graphql-guard';
import * as yup from 'yup';

export const inputRule =
  <Context = any>(name?: string) =>
  (
    schema: (y: typeof yup, ctx: Context) => yup.Schema,
    options?: yup.ValidateOptions,
  ) =>
    rule<Context>(name, { cache: 'strict' })(async (_parent, args, ctx) => {
      try {
        await schema(yup, ctx).validate(args, options);
        return true;
      } catch (error) {
        return new GraphQLError((error as Error).message, {
          extensions: { code: 'BAD_USER_INPUT' },
          originalError: error as Error,
        });
      }
    });
```

The same rule with [Zod](https://zod.dev):

```ts
import { GraphQLError } from 'graphql';
import { rule } from 'graphql-guard';
import * as z from 'zod';

export const zodRule = (schema: z.ZodType) =>
  rule({ cache: 'strict' })(async (_parent, args) => {
    const result = await schema.safeParseAsync(args);
    if (result.success) return true;
    return new GraphQLError(result.error.issues[0].message, {
      extensions: { code: 'BAD_USER_INPUT' },
      originalError: result.error,
    });
  });

const isValidSignup = zodRule(
  z.object({
    email: z.email('It has to be an email!'),
    age: z.number().min(18, 'Must be an adult!'),
  }),
);
```

- **Return** the error instead of throwing it. A thrown error is replaced with `fallbackError` (`Not Authorised!`)
- A returned `GraphQLError` keeps its message and `code`, so it survives error masking in servers like GraphQL Yoga
- `new GraphQLError(message, { extensions })` needs `graphql` 17 or a recent 16.x. Older versions ignore the options object, so pass `extensions` as the seventh positional argument there
- `strict` keys `parent` by identity and hashes `args`. graphql-shield hashed `parent` by value, so two parents that differed only in data the hash can't see (`#private` fields, getters, non-enumerable properties) shared a result, and one user could get another's answer. Equal-looking parent objects no longer share a cached result. To validate the same input once across the items of a list, key the cache on `args` only, for example `cache: (_parent, args) => objectHash(args)`

### Resolver Errors Pass Through

The guard only handles errors from its own work: rules and denials. Errors thrown by your resolvers are left alone and reach the client and your server's error handling as they are, on every field, including `allow` ones. graphql-shield replaced them with `fallbackError` (`Not Authorised!`) unless `allowExternalErrors` was set, so a bug in a public field looked like a permission failure and never reached your error logging.

`allowExternalErrors` is removed: its `true` behavior is now the default. To keep graphql-shield's default, set `suppressResolverError`:

```diff
  const guardedSchema = guard(schema, rules, {
-   allowExternalErrors: true,
  });

  // To keep replacing resolver errors with fallbackError:
  const guardedSchema = guard(schema, rules, {
+   suppressResolverError: true,
  });
```

A thrown value that isn't an `Error` (for example, a string) is handled by graphql-js, which turns it into an error. graphql-shield with `allowExternalErrors` returned it from the resolver, so it became field data and reached the client.

Servers that mask unexpected errors, like GraphQL Yoga, still hide resolver errors from the client. Errors created by GraphQL Guard are `GraphQLError`s, so they are not masked.

### Fragments Removed

The `fragment` rule option and `fragmentReplacements` are removed. They existed for `prisma-binding` and `graphql-binding`, which are deprecated. Remove the `fragment` option from your rules.

```diff
- rule({ cache: 'strict', fragment: 'fragment ItemID on Item { id }' })(isOwner);
+ rule({ cache: 'strict' })(isOwner);
```

### Package Entry Points

GraphQL Guard is ESM only. It is built with [tsdown](https://tsdown.dev) and ships `dist/index.mjs` with its type definitions. graphql-shield also shipped a CommonJS build.

- `import` and `require` both work. Every supported Node.js version (20.19+, 22.12+) can `require()` an ES module.
- In TypeScript, use `"moduleResolution": "nodenext"` or `"bundler"`. A CommonJS project with `"module": "nodenext"` needs TypeScript 5.8 or later to import the package; on older versions, set `"type": "module"` in your `package.json`.
- `graphql-guard/package.json` is still exported.

## Behavioral Changes

### Errors Are `GraphQLError`s

Errors created by GraphQL Guard are now `GraphQLError`s with the `FORBIDDEN` code instead of plain `Error`s. This covers `Not Authorised!` (`defaultFallbackError`), a string `fallbackError`, a string returned from a rule and a string passed to `not(rule, error)`.

Servers that hide unexpected errors now show them. With `graphql-shield`, GraphQL Yoga's default error masking turned every denial into `Unexpected error.` If you turned masking off for that reason, you can turn it back on.

A plain `Error` returned from a rule or a custom `fallbackError` is still passed through as is. Return a string or a `GraphQLError` if it should survive error masking.

### Rules Are Recognised by Their API

Every value in the rule tree, and `fallbackRule`, must be a rule. A rule is any object with the rule API: `name`, `equals()` and `resolve()`, or for a logic rule `getRules()`, `evaluate()` and `resolve()`. Anything else throws a `ValidationError` that names the field, for example `It seems like Query.users is not a rule.` `ValidationError` is exported, so you can check for it with `instanceof`.

- Rules are recognised by their API instead of `instanceof` or a brand, so a rule from another copy of graphql-guard (for example, another package in a monorepo) is accepted
- Rules created with graphql-shield are accepted too, so you can migrate one rule at a time. Their TypeScript types expect graphql-shield's own options, so they need a cast (`as unknown as GuardRule`). Recreate them with graphql-guard when you can:
  - graphql-shield rules with a `contextual`, `strict` or custom cache always deny, because their cache lives on `ctx._shield`
  - A graphql-shield rule that throws resolves to `false` itself, so `not()` around it allows the request instead of denying it
- Only this copy's `allow` leaves a field unwrapped. `allow` from another copy, or from graphql-shield, still allows the field, but the field is wrapped like any other rule
- `graphql-shield` replaced the whole type with the fallback rule when one value wasn't a rule, which let every field of that type through by default. GraphQL Guard throws instead
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

Rules on input types were also ignored, so a rule on an input field never ran, and now throw. Put the rule on the field that takes the input instead. To validate the input, see [`inputRule` Removed](#inputrule-removed).

Rules on introspection types (`__Schema`, `__Type`, ...) were also ignored and now throw. To restrict introspection, disable it in your server.

### Logic Rules Need at Least One Rule

`and()` and `chain()` with no rules passed in graphql-shield, so a field guarded by `and(...rulesFromConfig)` became public when the list was empty. `and`, `or`, `chain` and `race` now throw a `ValidationError` when called with no rules. Use `allow` or `deny` to allow or deny everything.

### `not` Denies When the Rule Throws

`not(rule)` denies when the wrapped rule throws. In graphql-shield, a thrown error counted as "no", so `not` turned it into "yes" and let the request through. A rule that returns an error or a string is still a deliberate "no", so `not` turns it into a "yes".

### `fallbackError` Receives Errors Thrown by Rules

When a rule throws, a `fallbackError` function now receives the thrown error as its first argument. graphql-shield caught the error, treated it as a denial and passed `null`, so the function couldn't tell a thrown error from a plain denial. This applies to rules on their own and inside `and`, `or`, `chain`, `race` and `not`. If several rules throw, the function receives the first error. A plain denial still passes `null`.

The request is still denied. If your `fallbackError` function treats any non-`null` first argument as an unexpected error, a rule that throws now goes down that path too.

### `race` Returns the First Error

When every rule in `race` fails, it returns the error from the first rule that returned one. graphql-shield collected results in reverse order, so it returned the error from the last one. `chain` and `race` also list their results in rule order when you call `evaluate` directly.

### Subscriptions Are Checked on Subscribe

A subscription field with a custom `resolve` is also checked when the client subscribes, not only on each event. Rules that read the event payload get the root value (usually `undefined`) as `parent` at that point.

### Rule Cache

- The per-request cache is no longer stored on the context (`ctx._shield`). It is kept per operation run, so a context object reused across requests no longer shares cached results. Code that read or reset `ctx._shield` should be removed
- Each subscription event has its own cache, so a cached result from one event is not reused for the next
- Cache keys include the rule name and key without ambiguity. In graphql-shield, a contextual rule named `a-b` and a rule `a` with key `b` shared one cache entry
- When a `strict` or key-function cache key can't be computed (for example, `object-hash` throws on a Promise, a `WeakMap` or a file upload), the rule runs without the cache instead of denying the request
- A missing context is passed to rules and resolvers as is. graphql-shield replaced it with a new `{}` for every field, so resolvers didn't get what the server passed and caching never applied

### Anonymous Rule Names

Rules without a name get sequential names (`anonymous-rule-1`, `anonymous-rule-2`, ...) instead of random ones, so names are stable between runs.

### Validation Error Messages

Validation errors say `Guard cannot find them in your schema` instead of `Shield cannot find them in your schema`. Update any test or log matching that text.

## Fixed graphql-shield Issues

These [graphql-shield issues](https://github.com/maticzav/graphql-shield/issues) are fixed in GraphQL Guard.

| Issue                                                                                                                                                 | Fix                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [#163](https://github.com/maticzav/graphql-shield/issues/163) Aliasing not working with graphql-shield permissions middleware and customFieldResolver | `guard` wraps each field's own resolver, so aliased fields resolve               |
| [#487](https://github.com/maticzav/graphql-shield/issues/487) Shield rules with cache: "strict" don't work on types                                   | Rules whose `strict` cache key can't be computed run uncached instead of denying |
| [#562](https://github.com/maticzav/graphql-shield/issues/562) Rule is not recognised when imported from a package                                     | Rules are recognised by their API instead of `instanceof`                        |
| [#688](https://github.com/maticzav/graphql-shield/issues/688) Unknown object type "promise" error when uploading files                                | Rules whose cache key can't be computed run uncached instead of denying          |
| [#739](https://github.com/maticzav/graphql-shield/issues/739) Error thrown inside an async rule are not sent to the fallbackError function            | `fallbackError` receives errors thrown by rules, including inside logic rules    |
| [#781](https://github.com/maticzav/graphql-shield/issues/781) @types/yup dev dependency                                                               | `inputRule` is removed, so Yup is no longer a dependency                         |
| [#812](https://github.com/maticzav/graphql-shield/issues/812) GraphQL Shield response 2times slower on response with large list                       | Fields whose rule is `allow` skip rule evaluation                                |
| [#828](https://github.com/maticzav/graphql-shield/issues/828) Wrong order in RuleChain and RuleRace evaluation                                        | `chain` and `race` keep results in rule order, so `race` returns the first error |
| [#970](https://github.com/maticzav/graphql-shield/issues/970) Mono repo (lerna) MiddlewareError                                                       | Same as #562                                                                     |
| [#988](https://github.com/maticzav/graphql-shield/issues/988) Add support for a 'silent' mode                                                         | `fallbackError` accepts `null`                                                   |
| [#1087](https://github.com/maticzav/graphql-shield/issues/1087) Build error with yup latest version                                                   | Same as #781                                                                     |
| [#1109](https://github.com/maticzav/graphql-shield/issues/1109) Context object not typed on rule arguments                                            | `rule<Context, Args, Parent>()`                                                  |
| [#1176](https://github.com/maticzav/graphql-shield/issues/1176) Should INTERNAL_SERVER_ERROR be UNAUTHENTICATED/FORBIDDEN?                            | Denials are `GraphQLError`s with the `FORBIDDEN` code                            |
| [#1221](https://github.com/maticzav/graphql-shield/issues/1221) Error: Unknown object type "promise"                                                  | Same as #688                                                                     |
| [#1365](https://github.com/maticzav/graphql-shield/issues/1365) Input field is not checked by Graphql Shield rules?                                   | Rules on input types throw a `ValidationError` instead of being ignored          |
| [#1473](https://github.com/maticzav/graphql-shield/issues/1473) The bundled package is missing types in `types.js` export                             | Built with tsdown; types are type-only exports                                   |
| [#1476](https://github.com/maticzav/graphql-shield/issues/1476) Move from graphql-middleware to Resolvers Composition                                 | `guard` wraps resolvers itself                                                   |
| [#1487](https://github.com/maticzav/graphql-shield/issues/1487) 7.6.4 ESM build broken                                                                | Same as #1473                                                                    |
| [#1510](https://github.com/maticzav/graphql-shield/issues/1510) Update yup@1.x to avoid @types/lodash and babel runtime in production deps            | Same as #781                                                                     |
| [#1511](https://github.com/maticzav/graphql-shield/issues/1511) fallbackError loses custom error types                                                | `fallbackError` receives the thrown error as is, so `instanceof` works           |
| [#1522](https://github.com/maticzav/graphql-shield/issues/1522) Performance -- every field wrapped is unnecessarily wrapped in a promise              | Synchronous rules resolve without creating promises                              |
| [#1528](https://github.com/maticzav/graphql-shield/issues/1528) Initializing shield adding significant overhead even with empty middleware            | Same as #812                                                                     |
| [#1560](https://github.com/maticzav/graphql-shield/issues/1560) Support for node v23 or higher                                                        | No `util.isUndefined`, which Node 23 removed (fixed upstream but never released) |
| [#1561](https://github.com/maticzav/graphql-shield/issues/1561) isUndefined import error                                                              | Same as #1560                                                                    |

## Answered in the Docs

These [graphql-shield issues](https://github.com/maticzav/graphql-shield/issues) are questions, not bugs. GraphQL Guard behaves the same way, and the README now answers them.

| Issue                                                                                                                       | Answer                                              |
| --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| [#235](https://github.com/maticzav/graphql-shield/issues/235) How should I unit test a rule?                                | [Testing rules](../README.md#testing-rules)         |
| [#641](https://github.com/maticzav/graphql-shield/issues/641) When using '\*': deny it's blocking apollo federation fields  | [Apollo Federation](../README.md#apollo-federation) |
| [#1111](https://github.com/maticzav/graphql-shield/issues/1111) Issues with \_\_resolveReference in Apollo Federated Schema | Same as #641                                        |
| [#1218](https://github.com/maticzav/graphql-shield/issues/1218) GraphQL Shield to Work with Apollo Federation               | Same as #641                                        |
| [#1387](https://github.com/maticzav/graphql-shield/issues/1387) Apollo Federation and Shield Question                       | Same as #641                                        |

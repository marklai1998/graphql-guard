# Migrate from `graphql-shield`

GraphQL Guard 1.x is a fork of `graphql-shield@7.x` (based on `7.6.5`, the latest 7.x release). Rules, caching, logic rules and fallbacks work as before. GraphQL Guard no longer depends on `graphql-middleware`: `guard` takes your schema and returns a guarded one. Most projects only need to update the package name, replace `shield` and `applyMiddleware` with `guard`, and check the requirements below.

- [Requirement](#requirement)
- [Update Import](#update-import)
- [Replace `shield` and `applyMiddleware` with `guard`](#replace-shield-and-applymiddleware-with-guard)
- [Rename Types](#rename-types)
- [Replace Yup with Zod in `inputRule`](#replace-yup-with-zod-in-inputrule)
- [Errors Are `GraphQLError`s](#errors-are-graphqlerrors)
- [Only graphql-guard Rules Are Accepted](#only-graphql-guard-rules-are-accepted)
- [Rules on Interfaces and Unions](#rules-on-interfaces-and-unions)
- [Fragments Removed](#fragments-removed)
- [Package Entry Points](#package-entry-points)

## Requirement

- Node 18 or above
- `graphql` 14.4 or above, 15, 16 or 17. Support for `graphql` 0.11 to 0.13 and 14.0 to 14.3 is removed. `graphql` 17 itself needs Node 22 or above
- `graphql-middleware` is no longer needed. Remove it unless you use it for other middleware

## Update Import

Replace the package and update every import. Apart from `shield`, which is renamed to `guard`, all exports keep their names: `rule`, `inputRule`, `allow`, `deny`, `and`, `or`, `not`, `chain` and `race`.

```bash
npm uninstall graphql-shield graphql-middleware
npm i graphql-guard
```

```diff
- import { shield, rule, and, or, not } from 'graphql-shield';
+ import { guard, rule, and, or, not } from 'graphql-guard';
```

## Replace `shield` and `applyMiddleware` with `guard`

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

Also:

- The per-request cache is no longer stored on the context (`ctx._shield`). It is kept per operation run, so a context object reused across requests no longer shares cached results. Code that read or reset `ctx._shield` should be removed.
- `not(rule)` denies when the wrapped rule throws. In graphql-shield, a thrown error counted as "no", so `not` turned it into "yes" and let the request through.
- A subscription field with a custom `resolve` is also checked when the client subscribes, not only on each event. Rules that read the event payload get the root value (usually `undefined`) as `parent` at that point.
- Validation errors say `Guard cannot find them in your schema` instead of `Shield cannot find them in your schema`. Update any test or log matching that text.

## Rename Types

The `I` prefix is removed from type names.

- `IRule` => `Rule`
- `IRules` => `Rules`

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

## Replace Yup with Zod in `inputRule`

`inputRule` validates with [Zod](https://zod.dev) instead of Yup. `yup` and `@types/yup` are no longer installed.

- The callback receives `z` instead of `yup` and must return a Zod schema
- The optional second argument takes Zod's parse options instead of Yup's validate options. `abortEarly` has no equivalent
- On failure, the error message is the first issue's message, like Yup's default. The full `ZodError` is available as the error's `cause`

Before

```ts
import { inputRule } from 'graphql-shield';

const isValidSignup = inputRule()(
  (yup) =>
    yup.object({
      email: yup.string().email('It has to be an email!').required(),
      age: yup.number().min(18, 'Must be an adult!').required(),
    }),
  { abortEarly: false },
);
```

After

```ts
import { inputRule } from 'graphql-guard';

// Fields are required by default in Zod
const isValidSignup = inputRule()((z) =>
  z.object({
    email: z.email('It has to be an email!'),
    age: z.number().min(18, 'Must be an adult!'),
  }),
);
```

## Errors Are `GraphQLError`s

Errors created by GraphQL Guard are now `GraphQLError`s with a `code` extension instead of plain `Error`s:

- `Not Authorised!` (`defaultFallbackError`), a string `fallbackError`, a string returned from a rule and a string passed to `not(rule, error)` use `FORBIDDEN`
- A failed `inputRule` uses `BAD_USER_INPUT`

Servers that hide unexpected errors now show them. With `graphql-shield`, GraphQL Yoga's default error masking turned every denial into `Unexpected error.` If you turned masking off for that reason, you can turn it back on.

A plain `Error` returned from a rule or a custom `fallbackError` is still passed through as is. Return a string or a `GraphQLError` if it should survive error masking.

## Only graphql-guard Rules Are Accepted

Every value in the rule tree must be a rule created with graphql-guard (`rule`, `inputRule`, `allow`, `deny` or a logic rule). Anything else throws a `ValidationError` that names the field, for example `It seems like Query.users is not a graphql-guard rule.`

- Rules created with graphql-shield are not accepted. Recreate them with graphql-guard. Mixing the two never worked: graphql-shield rules with a contextual or strict cache always denied the request, because their cache lives on `ctx._shield`
- `graphql-shield` replaced the whole type with the fallback rule when one value wasn't a rule, which let every field of that type through by default. GraphQL Guard throws instead

## Rules on Interfaces and Unions

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

## Fragments Removed

The `fragment` rule option and `fragmentReplacements` are removed. They existed for `prisma-binding` and `graphql-binding`, which are deprecated. Remove the `fragment` option from your rules.

```diff
- rule({ cache: 'strict', fragment: 'fragment ItemID on Item { id }' })(isOwner);
+ rule({ cache: 'strict' })(isOwner);
```

## Package Entry Points

The package is built with [tsdown](https://tsdown.dev) and ships `dist/index.mjs` (ESM) and `dist/index.cjs` (CommonJS) with their own type definitions. Both `import` and `require` work as before, and `graphql-guard/package.json` is still exported.

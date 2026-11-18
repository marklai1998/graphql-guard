# Migrate from `graphql-shield`

GraphQL Guard 1.x is a fork of `graphql-shield@7.x` (based on `7.6.5`, the latest 7.x release). Rules, caching, logic rules and fallbacks work as before. GraphQL Guard no longer depends on `graphql-middleware`: `guard` takes your schema and returns a guarded one. Most projects only need to update the package name, replace `shield` and `applyMiddleware` with `guard`, and check the requirements below.

- [Requirement](#requirement)
- [Update Import](#update-import)
- [Replace `shield` and `applyMiddleware` with `guard`](#replace-shield-and-applymiddleware-with-guard)
- [Rename Types](#rename-types)
- [Type Aliases Instead of Interfaces](#type-aliases-instead-of-interfaces)
- [Replace Yup with Zod in `inputRule`](#replace-yup-with-zod-in-inputrule)
- [Errors Are `GraphQLError`s](#errors-are-graphqlerrors)
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

- The per-request cache is stored on `ctx._guard` instead of `ctx._shield`. This only matters if your code reads or resets that cache directly.
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

## Type Aliases Instead of Interfaces

Exported types are now declared with `type` instead of `interface`. Using them, and extending them with `interface ... extends`, works as before. Only module augmentation is no longer possible, because a type alias can't be re-declared. Define your own type instead.

Before

```ts
import type { IRule } from 'graphql-shield';

// Module augmentation adds the field to IRule everywhere
declare module 'graphql-shield' {
  interface IRule {
    description?: string;
  }
}

const describe = (rule: IRule) => rule.description;
```

After

```ts
import type { Rule } from 'graphql-guard';

type DescribedRule = Rule & {
  description?: string;
};

const describe = (rule: DescribedRule) => rule.description;
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

The package is built with [tsdown](https://tsdown.dev) and ships `dist/index.mjs` (ESM) and `dist/index.cjs` (CommonJS) with their own type definitions. Both `import` and `require` work as before.

- `require('graphql-shield/package.json')` is no longer exported. Read the version from your lockfile or `npm ls graphql-guard` instead.
- The `default` export condition is removed. Tools that resolve packages with neither the `import` nor the `require` condition fall back to the `main`, `module` and `types` fields.

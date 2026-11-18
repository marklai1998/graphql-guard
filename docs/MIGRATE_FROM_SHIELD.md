# Migrate from `graphql-shield`

GraphQL Guard is a fork of `graphql-shield@7.6.5`. Rules, caching, logic rules, fallbacks and error handling all work as before. Apart from `inputRule`, which now validates with Zod instead of Yup, most projects only need to update the package name and the requirements below.

- [Requirement](#requirement)
- [Update Import](#update-import)
- [Rename Types](#rename-types)
- [Type Aliases Instead of Interfaces](#type-aliases-instead-of-interfaces)
- [Replace Yup with Zod in `inputRule`](#replace-yup-with-zod-in-inputrule)
- [Package Entry Points](#package-entry-points)

## Requirement

- Node 18 or above
- `graphql` 14, 15 or 16 (support for `graphql` 0.11, 0.12 and 0.13 is removed)
- `graphql-middleware` 2, 3, 4 or 6 (unchanged)

## Update Import

Replace the package and update every import. All exports keep their names: `shield`, `rule`, `inputRule`, `allow`, `deny`, `and`, `or`, `not`, `chain` and `race`.

```bash
npm uninstall graphql-shield
npm i graphql-guard
```

```diff
- import { shield, rule, and, or, not } from 'graphql-shield';
+ import { shield, rule, and, or, not } from 'graphql-guard';
```

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

## Package Entry Points

The package is built with [tsdown](https://tsdown.dev) and ships `dist/index.mjs` (ESM) and `dist/index.cjs` (CommonJS) with their own type definitions. Both `import` and `require` work as before.

- `require('graphql-shield/package.json')` is no longer exported. Read the version from your lockfile or `npm ls graphql-guard` instead.
- The `default` export condition is removed. Tools that resolve packages with neither the `import` nor the `require` condition fall back to the `main`, `module` and `types` fields.

# Migrate from `graphql-shield`

GraphQL Guard is a fork of `graphql-shield@7.6.5`. The runtime behaviour is the same: rules, caching, logic rules, fallbacks and error handling all work as before. Most projects only need to update the package name and the requirements below.

- [Requirement](#requirement)
- [Update Import](#update-import)
- [Rename Types](#rename-types)
- [Type Aliases Instead of Interfaces](#type-aliases-instead-of-interfaces)
- [Removed `@types/yup` Dependency](#removed-typesyup-dependency)
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

## Removed `@types/yup` Dependency

`graphql-shield` installed the outdated `@types/yup@0.29` as a runtime dependency. `yup@0.32` ships its own types, so GraphQL Guard no longer installs it. If your project relied on it being installed through `graphql-shield`, use the types from `yup` directly or add `@types/yup` to your own dependencies.

## Package Entry Points

The package is built with [tsdown](https://tsdown.dev) and ships `dist/index.mjs` (ESM) and `dist/index.cjs` (CommonJS) with their own type definitions. Both `import` and `require` work as before.

- `require('graphql-shield/package.json')` is no longer exported. Read the version from your lockfile or `npm ls graphql-guard` instead.
- The `default` export condition is removed. Tools that resolve packages with neither the `import` nor the `require` condition fall back to the `main`, `module` and `types` fields.

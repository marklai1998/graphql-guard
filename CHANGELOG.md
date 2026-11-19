# Changelog

## 1.0.0 (2026-11-19)


### ⚠ BREAKING CHANGES

* Node.js 18 and Node.js 20/22 releases before 20.19 and 22.12 are no longer supported, so require('graphql-guard') works on every supported version.
* the CommonJS build (dist/index.cjs) is removed. Use import, or require() on Node.js 20.19+ / 22.12+.
* pass resolver errors through and replace allowExternalErrors with suppressResolverError
* inputRule and the graphql-guard/zod entry point are removed, and zod is no longer a peer dependency.
* a fallbackError function receives the thrown error instead of null when a rule throws.
* and(), chain(), or() and race() throw a ValidationError when called with no rules. Use allow or deny instead.
* import inputRule from 'graphql-guard/zod' instead of 'graphql-guard'.
* inputRule's type parameter is now the context type. The schema type is inferred, so inputRule<T>() must become inputRule(). Rule trees with rules on introspection types or an invalid fallbackRule now throw a ValidationError.
* apply rules without graphql-middleware

### Features

* allow null fallbackError ([cfcc214](https://github.com/marklai1998/graphql-guard/commit/cfcc2147b32ac44692768c15827004b03cd038c3))
* allow null fallbackError ([11d1174](https://github.com/marklai1998/graphql-guard/commit/11d11741830a603ec9a698ab340e94223fd4a768))
* apply rules without graphql-middleware ([977a5e2](https://github.com/marklai1998/graphql-guard/commit/977a5e24f4d00d7d6f30cb1f71133c1c5b0ac3ee))
* export defaultFallbackError ([004f77b](https://github.com/marklai1998/graphql-guard/commit/004f77b0fe93acba35debf16d5ecc6285f4ffefb))
* export public types and ValidationError, type rule() and inputRule() ([12f8320](https://github.com/marklai1998/graphql-guard/commit/12f8320340ba83f82b1459181dc11e8bbd827bef))
* export public types and ValidationError, type rule() and inputRule() ([a75d10f](https://github.com/marklai1998/graphql-guard/commit/a75d10f28401e3ea24e73113f20bafd90154bd20))
* make zod an optional peer dependency ([52e4686](https://github.com/marklai1998/graphql-guard/commit/52e46862bca1e5ba6c683fa675b501d94b3b22c9))
* make zod an optional peer dependency ([99c4a29](https://github.com/marklai1998/graphql-guard/commit/99c4a29f4b37482b8e146efdad4e94ae92fe2cf3))
* move inputRule to the graphql-guard/zod entry point ([97fbbad](https://github.com/marklai1998/graphql-guard/commit/97fbbad19aecd64192c887f8c5e24b95f07f34c2))
* pass resolver errors through and replace allowExternalErrors with suppressResolverError ([d941bb1](https://github.com/marklai1998/graphql-guard/commit/d941bb1ae5cf363d4c2c000d329c539dd3854777))
* remove inputRule ([4555df3](https://github.com/marklai1998/graphql-guard/commit/4555df3313c03420c9043dabb968b0e31f953222))
* rename shield to guard ([55cc03c](https://github.com/marklai1998/graphql-guard/commit/55cc03c26128924f71ca374cfe6e5d1abde3f153))
* replace yup with zod in inputRule ([a7102e1](https://github.com/marklai1998/graphql-guard/commit/a7102e1d87056af3d44f06b1dafe672e6cd4d4ee))
* require Node.js 20.19+ or 22.12+ ([b91d546](https://github.com/marklai1998/graphql-guard/commit/b91d54605c96f8da4123510c1ce3425aa97f1e21))
* ship ESM only ([71b2680](https://github.com/marklai1998/graphql-guard/commit/71b268073d0bcd678bee1c2ddd6021c38ff1f9be))
* support graphql 17 ([6c2bd4d](https://github.com/marklai1998/graphql-guard/commit/6c2bd4d26a4864dc8a8fc2c6eff8457a836e7f95))
* support graphql 17 ([dd46b2e](https://github.com/marklai1998/graphql-guard/commit/dd46b2ea875679a35d12c66368ccd4d76c82d679))


### Bug Fixes

* add the missing .js extension in the test helper ([002f803](https://github.com/marklai1998/graphql-guard/commit/002f8030419d923bdf72ca0c5464f4af76fc5ced))
* close fail-open paths in not(), subscriptions and the rule cache ([64a8901](https://github.com/marklai1998/graphql-guard/commit/64a8901b237402af2bf383da8b3193e5e53f9f2c))
* close fail-open paths in not(), subscriptions and the rule cache ([cbb2b8e](https://github.com/marklai1998/graphql-guard/commit/cbb2b8e932edee57d76f104d697431019b21085f))
* export package.json, restore the default condition, require graphql 14.4+ ([3413055](https://github.com/marklai1998/graphql-guard/commit/3413055eb3253f783afcc5af1f46b79ac5d63410))
* export package.json, type-check tests, skip install when not publishing ([6276b9a](https://github.com/marklai1998/graphql-guard/commit/6276b9afec511fd772bc467ae7fdd02c1559d0b0))
* export package.json, type-check tests, skip install when not publishing ([68120e7](https://github.com/marklai1998/graphql-guard/commit/68120e770a277703adb90b7d70adac76b7687f42))
* give each subscription event its own rule cache ([e9e9025](https://github.com/marklai1998/graphql-guard/commit/e9e90253f5de0fa6641ec204de92dc87c5a06361))
* guard custom subscription resolvers per event, pin introspection behaviour ([f9748d6](https://github.com/marklai1998/graphql-guard/commit/f9748d67cb425098487054b49ea06a5006e53b39))
* harden not(), the strict cache and fallbackError against review findings ([d98a08b](https://github.com/marklai1998/graphql-guard/commit/d98a08b89ec65611d6992ce5cbd57dccd4f26d10))
* init project ([b78083a](https://github.com/marklai1998/graphql-guard/commit/b78083a6f5f79c86c59a36104233ce64d19c47b2))
* init project ([aa8bf03](https://github.com/marklai1998/graphql-guard/commit/aa8bf031d1e679dd375c5af62e89046665b85e04))
* keep chain and race results in rule order ([b3fc3c1](https://github.com/marklai1998/graphql-guard/commit/b3fc3c14ceb3516b2cbf0c32d1a74f4ad32b07d0))
* keep chain and race results in rule order ([bae52d0](https://github.com/marklai1998/graphql-guard/commit/bae52d092fdb5397a6026679ca9c6d3223b0c577))
* keep rule options when the name is undefined ([928aae5](https://github.com/marklai1998/graphql-guard/commit/928aae5029f8949f2ae32cdddbf04389c5b51ca4))
* pass a missing context through to rules and resolvers ([e04d27a](https://github.com/marklai1998/graphql-guard/commit/e04d27ac9c97fa77221bebf6baa7ad941a3d28e7))
* pass errors thrown by rules to fallbackError ([07a628e](https://github.com/marklai1998/graphql-guard/commit/07a628e9800af290f9122d60e7a06bc6a28d01f2))
* prevent rule cache key collisions and leaking non-Error throws ([f325f7c](https://github.com/marklai1998/graphql-guard/commit/f325f7c4c8e4e1bfedf1d1d75f9c11cc2a76501f))
* prevent rule cache key collisions between rules ([592382d](https://github.com/marklai1998/graphql-guard/commit/592382d4373cc2f1a8ddac9480f45ceaf9893cf5))
* recognise rules by brand and reject values that are not rules ([d038d12](https://github.com/marklai1998/graphql-guard/commit/d038d12c1f2ddf4eb942923be33952e52cc07394))
* reject logic rules with no rules ([d8c0a52](https://github.com/marklai1998/graphql-guard/commit/d8c0a526ef3d2183b1d4c9b9b007508961da3843))
* restore graphql 16 CI coverage and tighten public types before 1.0 ([49be977](https://github.com/marklai1998/graphql-guard/commit/49be9777bbef6f6c86ebb0ec56cb66a1755e6a18))
* run rules uncached when the cache key can't be computed ([b515620](https://github.com/marklai1998/graphql-guard/commit/b51562012e921e1eb07a6f4b521dd26c4873d565))
* stop unhashable parents denying input, bound subscription rule cache ([f0524e5](https://github.com/marklai1998/graphql-guard/commit/f0524e5d2d59136881c189c29c6a62fc220fdfeb))
* type constructors as public Rule / LogicRule and export PopulatedOptions ([d00ba89](https://github.com/marklai1998/graphql-guard/commit/d00ba89ddbca52df9aef4f984698e897d316fc16))
* type legacy GraphQLError constructor for graphql 17 typings ([56bf9c7](https://github.com/marklai1998/graphql-guard/commit/56bf9c799a1a3c89174d361834895e715e97a2eb))
* wrap non-Error throws when allowExternalErrors is set ([64a8393](https://github.com/marklai1998/graphql-guard/commit/64a839355c5dcea21434374b69647fccea9be001))


### Performance Improvements

* skip rule evaluation for allow fields and resolve synchronous rules without promises ([f56f881](https://github.com/marklai1998/graphql-guard/commit/f56f881bb5f580efba48deaf0d16c1ed3d629c00))
* skip rule evaluation for allow fields and resolve synchronous rules without promises ([c788692](https://github.com/marklai1998/graphql-guard/commit/c788692e2ba560a68038035bc0c6a60f26bcd6c4))

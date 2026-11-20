# Performance

Benchmarks comparing graphql-guard with graphql-shield on the same schema, data,
queries and permission rules. A third variant, **plain**, runs the schema with no
permission layer and is the floor both libraries are measured against.

```sh
pnpm bench                  # full run, about 2 minutes
BENCH_TIME=200 pnpm bench   # quick check
```

The benchmarks use Vitest's built-in `bench` API (`vitest bench`). The run ends
by printing a Markdown table in the same format as [Results](#results).

## Setup

|                |                                                 |
| -------------- | ----------------------------------------------- |
| Machine        | MacBook Air 13" (M3, 2024), model `Mac15,12`    |
| CPU            | Apple M3, 8 cores (4 performance, 4 efficiency) |
| Memory         | 24 GB                                           |
| OS             | macOS 27.2                                      |
| Power          | AC adapter, battery fully charged               |
| Node.js        | 22.23.1                                         |
| Vitest         | 5.1.0                                           |
| graphql        | 16.15.0                                         |
| graphql-shield | 7.6.5, with graphql-middleware 6.1.35           |
| graphql-guard  | This repository's source (`src/`)               |

The machine wasn't idle: other apps were open and the load average was 4–5
during the runs. Absolute times move by up to about ±30% between runs, so the
**guard vs shield** ratio is the number to compare. The range column shows the
ratio across four full runs.

## Results

Mean time per query, from one full run. Lower is better.

| Scenario                                                   |   plain | graphql-shield | graphql-guard | guard vs shield | Range over 4 runs |
| ---------------------------------------------------------- | ------: | -------------: | ------------: | --------------: | ----------------: |
| Tiny query, no rules                                       |  1.0 µs |         1.5 µs |        1.1 µs |           1.45× |          1.2–1.5× |
| Tiny query, rule tree                                      |  1.0 µs |         1.5 µs |        1.0 µs |           1.52× |          1.5–3.3× |
| 5,000-item list, no rules                                  | 6.40 ms |       29.17 ms |       7.42 ms |           3.93× |          3.8–4.5× |
| 5,000-item list, cached type-wide rule                     | 6.27 ms |       32.93 ms |      17.55 ms |           1.88× |          1.8–2.5× |
| Nested query, no rules                                     | 6.26 ms |       29.05 ms |       7.57 ms |           3.84× |          3.7–5.5× |
| Nested query, sync rule tree (admin)                       | 6.48 ms |       40.62 ms |      14.86 ms |           2.73× |          1.9–3.4× |
| Nested query, sync rule tree with a strict cache (admin)\* | 5.14 ms |       79.23 ms |      17.84 ms |           4.44× |      4.4× (1 run) |
| Nested query, async rule tree (admin)                      | 7.28 ms |       55.21 ms |      51.28 ms |           1.08× |          1.1–1.5× |
| Nested query, sync rule tree (user, some fields denied)    |       — |       69.41 ms |      43.49 ms |           1.60× |          1.4–1.8× |
| Nested query, unauthenticated (everything denied)          |       — |        20.0 µs |       28.9 µs |       **0.69×** |              0.7× |
| Apply rules to a 200-type × 20-field schema                |       — |       25.87 ms |      12.73 ms |           2.03× |          1.7–2.0× |

Plain is left out when rules deny fields, because its response is different.

\* Re-run separately after the strict cache stopped hashing empty arguments,
on a busier machine, so compare its ratio rather than its absolute times.

### What the numbers show

- **Without rules, graphql-guard adds 15–20% over plain, and graphql-shield
  adds about 4.5×.** graphql-shield wraps every field in an async resolver,
  even when the rule is `allow`. graphql-guard skips the rule on `allow` fields
  and keeps synchronous fields synchronous.
- **Synchronous rules are 2–3× faster with graphql-guard.** A rule that answers
  without awaiting doesn't create a promise, and neither do `and`, `or`,
  `chain`, `race` and `not` around it.
- **Async rules perform about the same in both libraries.** Once a rule
  returns a promise, each field waits on it either way.
- **The `strict` cache costs little in graphql-guard and a lot in
  graphql-shield.** graphql-shield hashes the parent and the arguments with
  object-hash on every call. graphql-guard keys the parent by identity and only
  hashes arguments when a field has some, so the nested query takes about as
  long with `strict` as with `no_cache`.
- **When every field is denied, graphql-guard is about 9 µs slower per
  request.** graphql-js captures a stack trace when it records a field error.
  graphql-guard returns denials synchronously, deeper in the call stack, and a
  deeper stack takes longer to capture. With stack traces turned off
  (`--stack-trace-limit=0`), the gap drops to about 0.5 µs (9.3 µs vs
  9.8 µs). The cost is per denied field, so it only outweighs graphql-guard's
  other gains when nearly every field in a request is denied.
- **Setup takes about half as long.** graphql-guard maps the schema once.
  graphql-shield builds a middleware tree and applies it through
  graphql-middleware.

## Scenarios

All scenarios run against the same schema (`fixtures.ts`), with these types:

- `Query`: `health`, `me`, `users(first)` and `posts(first)`
- `User`: `posts(first)`
- `Post`: `author` and `comments`
- `Comment`: `author`

Resolvers are synchronous, as if the data were already loaded (for example, from
a DataLoader cache), so the permission layer is the only source of async work.
Each query gets a new context object, as a server creates one per request, so
rule caches start empty every time.

Before measuring, each scenario checks that every variant returns the same
response. Two differences are ignored: graphql-guard adds `extensions.code` to
its errors, and errors may be listed in a different order.

| Scenario        | Query                                                                                             | Rules                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Tiny query      | `{ health }`                                                                                      | None, or the full rule tree (where `health` is `allow`)                                                |
| 5,000-item list | 5,000 posts × 4 scalar fields                                                                     | None, or `Post: isAuthenticated` with the `contextual` cache                                           |
| Nested query    | `me`, then 50 users → 10 posts each → author and 5 comments → comment author; about 19,000 fields | None, or the rule tree below                                                                           |
| Setup           | Applying rules to a schema with 200 types × 20 fields                                             | `isAuthenticated` on every type, plus `and(isAuthenticated, isAdmin)` on one field of every other type |

The rule tree for the nested query:

```ts
{
  Query: {
    health: allow,
    me: isAuthenticated,
    users: chain(isAuthenticated, not(isBanned)),
    posts: isAuthenticated,
  },
  User: {
    '*': isAuthenticated,
    email: or(isAdmin, isSelf),
    role: race(isAdmin, isSelf),
  },
  Post: and(isAuthenticated, canReadPost),
  Comment: allow,
}
```

- `isAuthenticated`, `isAdmin` and `isBanned` use the `contextual` cache.
- `canReadPost` uses `no_cache`. It allows published posts, the viewer's own
  posts and admins.
- `isSelf` uses `no_cache`. In the "with a strict cache" scenario, it uses
  `strict` instead.
- In the async scenario, every rule answers after an `await`.

The nested query runs for three viewers:

- **Admin:** every field is allowed.
- **User:** some fields are denied: other users' `email` and `role`, and
  unpublished posts by other authors.
- **Unauthenticated:** the top-level fields are denied, so the response is
  only errors.

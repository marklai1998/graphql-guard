import type { DocumentNode, GraphQLSchema } from 'graphql';
import { afterAll, describe, expect, test } from 'vitest';
import {
  applyMiddleware,
  buildSchema,
  type Context,
  guardLib,
  largeSchema,
  largeSchemaPermissions,
  queries,
  run,
  shieldLib,
  toJSON,
  type Variant,
  variants,
  viewers,
} from './fixtures.js';

// Long enough for stable numbers on queries that take tens of milliseconds.
// BENCH_TIME (in ms) shortens it for a quick check.
const time = Number(process.env.BENCH_TIME ?? 3_000);
const runOptions = { time, warmupTime: Math.min(500, time / 4) };
const timeout = 120_000;

type Row = { scenario: string; variant: Variant; mean: number };
const rows: Row[] = [];

const formatTime = (ms: number | undefined): string => {
  if (ms === undefined) return '—';
  return ms < 1 ? `${(ms * 1000).toFixed(1)} µs` : `${ms.toFixed(2)} ms`;
};

// Prints a Markdown table of the mean time per query, one row per scenario,
// for performance/README.md. The last column is how many times faster
// graphql-guard is than graphql-shield.
afterAll(() => {
  const scenarios = [...new Set(rows.map((r) => r.scenario))];
  const mean = (scenario: string, variant: Variant) =>
    rows.find((r) => r.scenario === scenario && r.variant === variant)?.mean;
  const lines = [
    '| Scenario | plain | graphql-shield | graphql-guard | guard vs shield |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...scenarios.map((scenario) => {
      const shield = mean(scenario, 'graphql-shield');
      const guard = mean(scenario, 'graphql-guard');
      const speedup =
        shield !== undefined && guard !== undefined
          ? `${(shield / guard).toFixed(2)}×`
          : '—';
      return `| ${scenario} | ${formatTime(mean(scenario, 'plain'))} | ${formatTime(shield)} | ${formatTime(guard)} | ${speedup} |`;
    }),
  ];
  console.log(`\n${lines.join('\n')}\n`);
});

const record = (
  scenario: string,
  variant: Variant,
  { latency }: { latency: { mean: number } },
) => {
  rows.push({ scenario, variant, mean: latency.mean });
};

type Scenario = {
  name: string;
  document: DocumentNode;
  schemas: Record<Variant, GraphQLSchema>;
  viewer?: Context['viewer'];
  // Plain is left out when the rules deny something, as its result differs.
  variants?: Variant[];
};

const scenario = ({
  name,
  document,
  schemas,
  viewer,
  variants: only = variants,
}: Scenario) =>
  test(name, { timeout }, async ({ bench }) => {
    // Every variant must return the same response, or the comparison is moot.
    const [first, ...rest] = only as [Variant, ...Variant[]];
    const expected = await toJSON(run(schemas[first], document, viewer));
    for (const variant of rest) {
      expect(await toJSON(run(schemas[variant], document, viewer))).toEqual(
        expected,
      );
    }

    const results = await bench.compare(
      ...only.map((variant) =>
        bench(variant, async () => {
          await run(schemas[variant], document, viewer);
        }),
      ),
      runOptions,
    );

    for (const variant of only) record(name, variant, results.get(variant));
  });

const schemasFor = (
  ruleSet: Parameters<typeof buildSchema>[1],
  options?: Parameters<typeof buildSchema>[2],
) =>
  Object.fromEntries(
    variants.map((v) => [v, buildSchema(v, ruleSet, options)]),
  ) as Record<Variant, GraphQLSchema>;

describe('execution', () => {
  const none = schemasFor('none');
  const typeWide = schemasFor('typeWide');
  const realistic = schemasFor('realistic');
  const realisticNoHash = schemasFor('realistic', { hashParent: false });
  const realisticAsync = schemasFor('realistic', {
    async: true,
    hashParent: false,
  });

  scenario({
    name: 'tiny query, no rules',
    document: queries.health,
    schemas: none,
  });

  scenario({
    name: 'tiny query, rule tree',
    document: queries.health,
    schemas: realistic,
  });

  scenario({
    name: '5,000-item list, no rules',
    document: queries.largeList,
    schemas: none,
  });

  scenario({
    name: '5,000-item list, cached type-wide rule',
    document: queries.largeList,
    schemas: typeWide,
  });

  scenario({
    name: 'nested query, no rules',
    document: queries.nested,
    schemas: none,
  });

  scenario({
    name: 'nested query, sync rule tree (admin)',
    document: queries.nested,
    schemas: realisticNoHash,
  });

  scenario({
    name: 'nested query, sync rule tree with a strict cache (admin)',
    document: queries.nested,
    schemas: realistic,
  });

  scenario({
    name: 'nested query, async rule tree (admin)',
    document: queries.nested,
    schemas: realisticAsync,
  });

  scenario({
    name: 'nested query, sync rule tree (user, some denied)',
    document: queries.nested,
    schemas: realisticNoHash,
    viewer: viewers.user,
    variants: ['graphql-shield', 'graphql-guard'],
  });

  scenario({
    name: 'nested query, unauthenticated (all denied)',
    document: queries.nested,
    schemas: realisticNoHash,
    viewer: null,
    variants: ['graphql-shield', 'graphql-guard'],
  });
});

describe('setup', () => {
  const types = 200;
  const fields = 20;
  const schema = largeSchema(types, fields);

  test(`apply rules to a ${types}-type × ${fields}-field schema`, {
    timeout,
  }, async ({ bench }) => {
    const name = `apply rules to a ${types}-type × ${fields}-field schema`;
    const results = await bench.compare(
      bench('graphql-shield', () => {
        applyMiddleware(
          schema,
          shieldLib.shield(
            largeSchemaPermissions(
              shieldLib as unknown as typeof guardLib,
              types,
            ) as never,
          ),
        );
      }),
      bench('graphql-guard', () => {
        guardLib.guard(schema, largeSchemaPermissions(guardLib, types));
      }),
      runOptions,
    );

    for (const variant of ['graphql-shield', 'graphql-guard'] as const) {
      record(name, variant, results.get(variant));
    }
  });
});

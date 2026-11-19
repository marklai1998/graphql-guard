import { makeExecutableSchema } from '@graphql-tools/schema';
import type { GraphQLResolveInfo } from 'graphql';
import {
  allow,
  and,
  type FallbackErrorMapperType,
  type GuardRule,
  guard,
  type Options,
  or,
  type RuleFunction,
  rule,
  ValidationError,
} from '../src/index.js';
import { inputRule } from '../src/zod.js';

const schema = makeExecutableSchema({
  typeDefs: /* GraphQL */ `
    type Query {
      a: String
    }
  `,
});

describe('ValidationError', () => {
  test('is exported and thrown by guard', () => {
    let thrown: unknown;
    try {
      guard(schema, { Missing: allow });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ValidationError);
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).name).toBe('ValidationError');
  });
});

describe('fallbackRule validation', () => {
  test('rejects a fallbackRule that is not a rule', () => {
    expect(() =>
      guard(schema, {}, { fallbackRule: (() => true) as unknown as GuardRule }),
    ).toThrow(ValidationError);
    expect(() =>
      guard(schema, {}, { fallbackRule: (() => true) as unknown as GuardRule }),
    ).toThrow('options.fallbackRule is not a graphql-guard rule');
  });

  test('rejects a fallbackRule that shares a name with a different rule', () => {
    const a = rule('same')(() => true);
    const b = rule('same')(() => false);
    expect(() => guard(schema, { Query: a }, { fallbackRule: b })).toThrow(
      'There seem to be multiple definitions of these rules: same',
    );
  });

  test('checks rules nested inside a logic fallbackRule', () => {
    const a = rule('same')(() => true);
    const b = rule('same')(() => false);
    expect(() =>
      guard(schema, { Query: a }, { fallbackRule: or(allow, b) }),
    ).toThrow('There seem to be multiple definitions of these rules: same');
  });

  test('accepts the same rule in the tree and as fallbackRule', () => {
    const a = rule('same')(() => true);
    expect(() =>
      guard(schema, { Query: a }, { fallbackRule: a }),
    ).not.toThrow();
  });
});

describe('rule tree root', () => {
  test('checks duplicate names inside a logic rule used as the whole tree', () => {
    const a = rule('same')(() => true);
    const b = rule('same')(() => false);
    expect(() => guard(schema, or(a, and(b)))).toThrow(
      'There seem to be multiple definitions of these rules: same',
    );
  });
});

describe('introspection types', () => {
  test('rejects rules on introspection types', () => {
    expect(() => guard(schema, { __Type: allow })).toThrow(ValidationError);
    expect(() =>
      guard(schema, { __Schema: { types: allow }, __Field: allow }),
    ).toThrow(
      'It seems like you have applied rules to __Schema, __Field types but Guard cannot apply rules to introspection types.',
    );
  });
});

describe('types', () => {
  test('rule() types parent, args and ctx from its type parameters', () => {
    type Ctx = { user: { id: string } };
    type Args = { id: string };
    type Parent = { ownerId: string };

    rule<Ctx, Args, Parent>({
      cache: (parent, args, ctx) => {
        expectTypeOf(parent).toEqualTypeOf<Parent>();
        expectTypeOf(args).toEqualTypeOf<Args>();
        expectTypeOf(ctx).toEqualTypeOf<Ctx>();
        return args.id;
      },
    })((parent, args, ctx, info) => {
      expectTypeOf(parent).toEqualTypeOf<Parent>();
      expectTypeOf(args).toEqualTypeOf<Args>();
      expectTypeOf(ctx).toEqualTypeOf<Ctx>();
      expectTypeOf(info).toEqualTypeOf<GraphQLResolveInfo>();
      return ctx.user.id === parent.ownerId;
    });

    // @ts-expect-error ctx.user is typed, so unknown properties fail
    rule<Ctx>()((_parent, _args, ctx) => ctx.nope);
  });

  test('inputRule() types ctx from its type parameter', () => {
    inputRule<{ locale: string }>()((z, ctx) => {
      expectTypeOf(ctx).toEqualTypeOf<{ locale: string }>();
      return z.object({});
    });
  });

  test('option and function types are exported', () => {
    const mapper: FallbackErrorMapperType = (err) =>
      err instanceof Error ? err : new Error('denied');
    const fn: RuleFunction<{ admin: boolean }> = (_p, _a, ctx) => ctx.admin;
    const options: Options = {
      fallbackRule: rule()(fn),
      fallbackError: mapper,
    };
    expectTypeOf(options).toMatchTypeOf<Options>();
  });

  test('fallbackError accepts null', () => {
    expectTypeOf<null>().toMatchTypeOf<Options['fallbackError']>();
    const mapper: FallbackErrorMapperType = () => null;
    expectTypeOf(mapper).toMatchTypeOf<Options['fallbackError']>();
  });
});

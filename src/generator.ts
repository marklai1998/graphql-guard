import {
  type GraphQLObjectType,
  type GraphQLResolveInfo,
  type GraphQLSchema,
  isIntrospectionType,
  isObjectType,
} from 'graphql';
import type {
  IMiddleware,
  IMiddlewareFunction,
  IMiddlewareGeneratorConstructor,
} from 'graphql-middleware';
import type { IMiddlewareWithOptions } from 'graphql-middleware/types';
import type {
  Options,
  RuleFieldMap,
  Rules,
  ShieldContext,
  ShieldRule,
} from './types.js';
import {
  isLogicRule,
  isRule,
  isRuleFieldMap,
  isRuleFunction,
  withDefault,
} from './utils.js';
import { ValidationError } from './validation.js';

function generateFieldMiddlewareFromRule(
  rule: ShieldRule,
  options: Options,
): IMiddlewareFunction<object, object, ShieldContext> {
  async function middleware(
    resolve: (
      parent: object,
      args: object,
      ctx: ShieldContext,
      info: GraphQLResolveInfo,
    ) => Promise<any>,
    parent: { [key: string]: any },
    args: { [key: string]: any },
    ctx: ShieldContext,
    info: GraphQLResolveInfo,
  ) {
    // Cache
    if (!ctx) {
      ctx = {} as ShieldContext;
    }

    if (!ctx._shield) {
      ctx._shield = {
        cache: {},
      };
    }

    // Execution
    try {
      const res = await rule.resolve(parent, args, ctx, info, options);

      if (res === true) {
        return await resolve(parent, args, ctx, info);
      } else if (res === false) {
        if (typeof options.fallbackError === 'function') {
          return await options.fallbackError(null, parent, args, ctx, info);
        }
        return options.fallbackError;
      } else {
        return res;
      }
    } catch (err) {
      if (options.debug) {
        throw err;
      } else if (options.allowExternalErrors) {
        return err;
      } else {
        if (typeof options.fallbackError === 'function') {
          return await options.fallbackError(err, parent, args, ctx, info);
        }
        return options.fallbackError;
      }
    }
  }

  if (isRule(rule) && rule.extractFragment()) {
    return {
      fragment: rule.extractFragment(),
      resolve: middleware,
    } as IMiddlewareWithOptions<object, object, ShieldContext>;
  }

  if (isLogicRule(rule)) {
    return {
      fragments: rule.extractFragments(),
      resolve: middleware,
    } as IMiddlewareWithOptions<object, object, ShieldContext>;
  }

  return middleware as IMiddlewareFunction<object, object, ShieldContext>;
}

function applyRuleToType(
  type: GraphQLObjectType,
  rules: ShieldRule | RuleFieldMap,
  options: Options,
): IMiddleware {
  if (isRuleFunction(rules)) {
    /* Apply defined rule function to every field */
    const fieldMap = type.getFields();

    const middleware = Object.keys(fieldMap).reduce((middleware, field) => {
      return {
        ...middleware,
        [field]: generateFieldMiddlewareFromRule(rules, options),
      };
    }, {});

    return middleware;
  } else if (isRuleFieldMap(rules)) {
    /* Apply rules assigned to each field to each field */
    const fieldMap = type.getFields();

    /* Extract default type wildcard if any and remove it for validation */
    const defaultTypeRule = rules['*'];
    const { '*': _, ...rulesWithoutWildcard } = rules;
    /* Validation */

    const fieldErrors = Object.keys(rulesWithoutWildcard)
      .filter((type) => !Object.hasOwn(fieldMap, type))
      .map((field) => `${type.name}.${field}`)
      .join(', ');

    if (fieldErrors.length > 0) {
      throw new ValidationError(
        `It seems like you have applied rules to ${fieldErrors} fields but Shield cannot find them in your schema.`,
      );
    }

    /* Generation */

    const middleware = Object.keys(fieldMap).reduce(
      (middleware, field) => ({
        ...middleware,
        [field]: generateFieldMiddlewareFromRule(
          withDefault(defaultTypeRule || options.fallbackRule)(rules[field]),
          options,
        ),
      }),
      {},
    );

    return middleware;
  } else {
    /* Apply fallbackRule to type with no defined rule */
    const fieldMap = type.getFields();

    const middleware = Object.keys(fieldMap).reduce(
      (middleware, field) => ({
        ...middleware,
        [field]: generateFieldMiddlewareFromRule(options.fallbackRule, options),
      }),
      {},
    );

    return middleware;
  }
}

function applyRuleToSchema(
  schema: GraphQLSchema,
  rule: ShieldRule,
  options: Options,
): IMiddleware {
  const typeMap = schema.getTypeMap();

  const middleware = Object.keys(typeMap)
    .filter((type) => !isIntrospectionType(typeMap[type]))
    .reduce((middleware, typeName) => {
      const type = typeMap[typeName];

      if (isObjectType(type)) {
        return {
          ...middleware,
          [typeName]: applyRuleToType(type, rule, options),
        };
      } else {
        return middleware;
      }
    }, {});

  return middleware;
}

function generateMiddlewareFromSchemaAndRuleTree(
  schema: GraphQLSchema,
  rules: Rules,
  options: Options,
): IMiddleware {
  if (isRuleFunction(rules)) {
    /* Applies rule to entire schema. */
    return applyRuleToSchema(schema, rules, options);
  } else {
    const typeMap = schema.getTypeMap();

    /* Validation */

    const typeErrors = Object.keys(rules)
      .filter((type) => !Object.hasOwn(typeMap, type))
      .join(', ');

    if (typeErrors.length > 0) {
      throw new ValidationError(
        `It seems like you have applied rules to ${typeErrors} types but Shield cannot find them in your schema.`,
      );
    }

    // Generation

    const middleware = Object.keys(typeMap)
      .filter((type) => !isIntrospectionType(typeMap[type]))
      .reduce<IMiddleware>((middleware, typeName) => {
        const type = typeMap[typeName];

        if (isObjectType(type)) {
          return {
            ...middleware,
            [typeName]: applyRuleToType(type, rules[typeName], options),
          };
        } else {
          return middleware;
        }
      }, {});

    return middleware;
  }
}

export function generateMiddlewareGeneratorFromRuleTree<
  TSource = any,
  TContext = any,
  TArgs = any,
>(
  ruleTree: Rules,
  options: Options,
): IMiddlewareGeneratorConstructor<TSource, TContext, TArgs> {
  return (schema: GraphQLSchema) =>
    generateMiddlewareFromSchemaAndRuleTree(schema, ruleTree, options);
}

import { MapperKind, mapSchema } from '@graphql-tools/utils';
import {
  defaultFieldResolver,
  type GraphQLFieldResolver,
  type GraphQLSchema,
  isIntrospectionType,
  isObjectType,
} from 'graphql';
import { ValidationError } from './errors.js';
import { RuleTrue } from './rules.js';
import type {
  GuardContext,
  GuardRule,
  PopulatedOptions,
  Rules,
} from './types.js';
import { isRuleFunction } from './utils.js';

type Resolver = GraphQLFieldResolver<any, any, any>;

/**
 * What a guarded field returns when its rule or its resolver throws: the
 * original error in debug mode, the error itself with allowExternalErrors,
 * and the fallback error otherwise.
 */
const handleError = (
  err: unknown,
  options: PopulatedOptions,
  ...[parent, args, ctx, info]: Parameters<Resolver>
) => {
  if (options.debug) {
    throw err;
  } else if (options.allowExternalErrors) {
    // Returning a non-Error would make it field data, so wrap it. The value
    // stays out of the message, as it may hold internal details.
    return err instanceof Error
      ? err
      : new Error('Unexpected error value', { cause: err });
  } else {
    if (typeof options.fallbackError === 'function') {
      return options.fallbackError(err, parent, args, ctx, info);
    }
    return options.fallbackError;
  }
};

const guardResolver =
  (resolve: Resolver, rule: GuardRule, options: PopulatedOptions): Resolver =>
  async (parent, args, ctx: GuardContext, info) => {
    if (!ctx) {
      ctx = {} as GuardContext;
    }

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
      return await handleError(err, options, parent, args, ctx, info);
    }
  };

/**
 * Wraps a field whose rule is `allow`. There is no rule to wait for, so a
 * synchronous resolver stays synchronous. An async wrapper would turn every
 * field into a promise, and graphql-js completes promises far more slowly than
 * plain values, which makes large lists of allowed fields several times slower.
 * Errors the resolver throws are still handled like guardResolver handles them.
 */
const allowResolver =
  (resolve: Resolver, options: PopulatedOptions): Resolver =>
  (parent, args, ctx: GuardContext, info) => {
    if (!ctx) {
      ctx = {} as GuardContext;
    }

    try {
      const res = resolve(parent, args, ctx, info);
      if (isPromiseLike(res)) {
        return Promise.resolve(res).catch((err) =>
          handleError(err, options, parent, args, ctx, info),
        );
      }
      return res;
    } catch (err) {
      return handleError(err, options, parent, args, ctx, info);
    }
  };

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
  typeof (value as PromiseLike<unknown> | null)?.then === 'function';

const wrapResolver = (
  resolve: Resolver,
  rule: GuardRule,
  options: PopulatedOptions,
): Resolver =>
  rule instanceof RuleTrue
    ? allowResolver(resolve, options)
    : guardResolver(resolve, rule, options);

const ruleForField = (
  rules: Rules,
  typeName: string,
  fieldName: string,
  fallbackRule: GuardRule,
): GuardRule => {
  if (isRuleFunction(rules)) return rules;

  if (!Object.hasOwn(rules, typeName)) return fallbackRule;

  const typeRules = rules[typeName];
  if (isRuleFunction(typeRules)) return typeRules;
  if (Object.hasOwn(typeRules, fieldName)) return typeRules[fieldName];
  if (Object.hasOwn(typeRules, '*')) return typeRules['*'];
  return fallbackRule;
};

const validateRulesAgainstSchema = (schema: GraphQLSchema, rules: Rules) => {
  if (isRuleFunction(rules)) return;

  const typeMap = schema.getTypeMap();

  const missingTypes = Object.keys(rules).filter(
    (typeName) => !Object.hasOwn(typeMap, typeName),
  );
  if (missingTypes.length > 0) {
    throw new ValidationError(
      `It seems like you have applied rules to ${missingTypes.join(', ')} types but Guard cannot find them in your schema.`,
    );
  }

  // Introspection types (__Schema, __Type, ...) are never wrapped, so a rule
  // on them would silently do nothing.
  const introspectionTypes = Object.keys(rules).filter((typeName) =>
    isIntrospectionType(typeMap[typeName]),
  );
  if (introspectionTypes.length > 0) {
    throw new ValidationError(
      `It seems like you have applied rules to ${introspectionTypes.join(', ')} types but Guard cannot apply rules to introspection types. To restrict introspection, disable it in your server instead.`,
    );
  }

  const nonObjectTypes = Object.keys(rules).filter(
    (typeName) => !isObjectType(typeMap[typeName]),
  );
  if (nonObjectTypes.length > 0) {
    throw new ValidationError(
      `It seems like you have applied rules to ${nonObjectTypes.join(', ')} types but Guard can only apply rules to object types. Apply them to the object types that implement or belong to them instead.`,
    );
  }

  for (const [typeName, type] of Object.entries(typeMap)) {
    if (!Object.hasOwn(rules, typeName)) continue;
    if (!isObjectType(type)) continue;
    const typeRules = rules[typeName];
    if (isRuleFunction(typeRules)) continue;

    const fields = type.getFields();
    const missingFields = Object.keys(typeRules)
      .filter((fieldName) => fieldName !== '*')
      .filter((fieldName) => !Object.hasOwn(fields, fieldName))
      .map((fieldName) => `${typeName}.${fieldName}`);

    if (missingFields.length > 0) {
      throw new ValidationError(
        `It seems like you have applied rules to ${missingFields.join(', ')} fields but Guard cannot find them in your schema.`,
      );
    }
  }
};

export const applyRulesToSchema = (
  schema: GraphQLSchema,
  rules: Rules,
  options: PopulatedOptions,
): GraphQLSchema => {
  validateRulesAgainstSchema(schema, rules);

  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig, fieldName, typeName) => {
      const rule = ruleForField(
        rules,
        typeName,
        fieldName,
        options.fallbackRule,
      );

      const hasCustomResolve =
        fieldConfig.resolve !== undefined &&
        fieldConfig.resolve !== defaultFieldResolver;

      // A subscription is checked when the client subscribes, so a denied
      // subscription never runs its subscribe function. If it also has a custom
      // resolve, the rule runs again for every event, with the event as parent.
      if (fieldConfig.subscribe) {
        return {
          ...fieldConfig,
          subscribe: wrapResolver(fieldConfig.subscribe, rule, options),
          ...(hasCustomResolve && {
            resolve: wrapResolver(
              fieldConfig.resolve as Resolver,
              rule,
              options,
            ),
          }),
        };
      }

      return {
        ...fieldConfig,
        resolve: wrapResolver(
          fieldConfig.resolve ?? defaultFieldResolver,
          rule,
          options,
        ),
      };
    },
  });
};

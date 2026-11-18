import { MapperKind, mapSchema } from '@graphql-tools/utils';
import {
  defaultFieldResolver,
  type GraphQLFieldResolver,
  type GraphQLSchema,
  isIntrospectionType,
  isObjectType,
} from 'graphql';
import type {
  GuardContext,
  GuardRule,
  PopulatedOptions,
  Rules,
} from './types.js';
import { isRuleFieldMap, isRuleFunction } from './utils.js';
import { ValidationError } from './validation.js';

type Resolver = GraphQLFieldResolver<any, any, any>;

const guardResolver =
  (resolve: Resolver, rule: GuardRule, options: PopulatedOptions): Resolver =>
  async (parent, args, ctx: GuardContext, info) => {
    if (!ctx) {
      ctx = {} as GuardContext;
    }

    if (!ctx._guard) {
      ctx._guard = {
        cache: {},
      };
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
  };

const ruleForField = (
  rules: Rules,
  typeName: string,
  fieldName: string,
  fallbackRule: GuardRule,
): GuardRule => {
  if (isRuleFunction(rules)) return rules;

  const typeRules = rules[typeName];
  if (isRuleFunction(typeRules)) return typeRules;
  if (isRuleFieldMap(typeRules)) {
    return typeRules[fieldName] ?? typeRules['*'] ?? fallbackRule;
  }
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

  const nonObjectTypes = Object.keys(rules).filter(
    (typeName) => !isObjectType(typeMap[typeName]),
  );
  if (nonObjectTypes.length > 0) {
    throw new ValidationError(
      `It seems like you have applied rules to ${nonObjectTypes.join(', ')} types but Guard can only apply rules to object types. Apply them to the object types that implement or belong to them instead.`,
    );
  }

  for (const [typeName, type] of Object.entries(typeMap)) {
    const typeRules = rules[typeName];
    if (!isObjectType(type) || isIntrospectionType(type)) continue;
    if (!isRuleFieldMap(typeRules)) continue;

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

      // A custom resolver is guarded first. On a subscription field this runs
      // the rule for every event, with the event as parent.
      if (fieldConfig.resolve && fieldConfig.resolve !== defaultFieldResolver) {
        return {
          ...fieldConfig,
          resolve: guardResolver(fieldConfig.resolve, rule, options),
        };
      }

      // A subscription without a custom resolver is checked once, when the
      // client subscribes.
      if (fieldConfig.subscribe) {
        return {
          ...fieldConfig,
          subscribe: guardResolver(fieldConfig.subscribe, rule, options),
        };
      }

      return {
        ...fieldConfig,
        resolve: guardResolver(defaultFieldResolver, rule, options),
      };
    },
  });
};

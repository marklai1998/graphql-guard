import { MapperKind, mapSchema } from '@graphql-tools/utils';
import {
  defaultFieldResolver,
  type GraphQLFieldResolver,
  type GraphQLSchema,
  isIntrospectionType,
  isObjectType,
} from 'graphql';
import { ValidationError } from './errors.js';
import {
  isPromiseLike,
  type ResolveOptions,
  RuleTrue,
  reportThrown,
  resolveRule,
} from './rules.js';
import type {
  GuardRule,
  PopulatedOptions,
  RuleResult,
  Rules,
} from './types.js';
import { isRuleFunction } from './utils.js';

type Resolver = GraphQLFieldResolver<any, any, any>;

type FieldArgs = Parameters<Resolver>;

// Called when a rule or resolver throws: rethrows in debug mode, passes the
// error through with allowExternalErrors, and otherwise returns fallbackError.
const handleError = (
  err: unknown,
  options: PopulatedOptions,
  [parent, args, ctx, info]: FieldArgs,
): unknown => {
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

// Runs `run` and handles anything it throws or rejects with. A synchronous
// result is returned as is, so no promise is created for it.
const withErrorHandling = (
  run: () => unknown,
  options: PopulatedOptions,
  fieldArgs: FieldArgs,
): unknown => {
  try {
    const res = run();
    return isPromiseLike(res)
      ? Promise.resolve(res).then(undefined, (err) =>
          handleError(err, options, fieldArgs),
        )
      : res;
  } catch (err) {
    return handleError(err, options, fieldArgs);
  }
};

// Used for fields whose rule is allow: there is no rule to run, but errors
// thrown by the resolver are still handled like on every other field.
const allowResolver =
  (resolve: Resolver, options: PopulatedOptions): Resolver =>
  (...fieldArgs) =>
    withErrorHandling(() => resolve(...fieldArgs), options, fieldArgs);

const guardResolver =
  (resolve: Resolver, rule: GuardRule, options: PopulatedOptions): Resolver =>
  (...fieldArgs) => {
    const [parent, args, ctx, info] = fieldArgs;
    // The first error a rule threw, if any, so a denial caused by a thrown
    // error passes it to fallbackError, even from inside and/chain/or.
    let thrown: { err: unknown } | undefined;
    const ruleOptions: ResolveOptions = {
      ...options,
      [reportThrown]: (err) => {
        thrown ??= { err };
      },
    };

    const afterRule = (res: RuleResult): unknown => {
      if (res === true) {
        return resolve(...fieldArgs);
      } else if (res === false) {
        if (typeof options.fallbackError === 'function') {
          return options.fallbackError(
            thrown ? thrown.err : null,
            parent,
            args,
            ctx,
            info,
          );
        }
        return options.fallbackError;
      } else {
        return res;
      }
    };

    // Stays synchronous unless the rule or the resolver returns a promise.
    return withErrorHandling(
      () => {
        const res = resolveRule(rule, parent, args, ctx, info, ruleOptions);
        return isPromiseLike(res)
          ? Promise.resolve(res).then(afterRule)
          : afterRule(res);
      },
      options,
      fieldArgs,
    );
  };

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

      // With allow and debug, the guard would neither deny nor handle errors,
      // so the field is left as it is.
      if (rule instanceof RuleTrue && options.debug) return fieldConfig;

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

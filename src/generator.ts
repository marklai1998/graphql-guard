import { MapperKind, mapSchema } from '@graphql-tools/utils';
import {
  defaultFieldResolver,
  type GraphQLFieldResolver,
  type GraphQLSchema,
  isIntrospectionType,
  isObjectType,
} from 'graphql';
import { reportThrown } from './constants/index.js';
import { ValidationError } from './errors.js';
import { resolveRule } from './rules.js';
import type {
  GuardRule,
  MaybePromise,
  PopulatedOptions,
  ResolveOptions,
  RuleResult,
  Rules,
} from './types/index.js';
import { isAllowRule, isPromiseLike, isRuleFunction } from './utils/index.js';

type Resolver = GraphQLFieldResolver<any, any, any>;

type FieldArgs = Parameters<Resolver>;

// Called when the guard's own work throws (or, with suppressResolverError, the
// resolver): rethrows in debug mode, and otherwise returns fallbackError.
const handleError = (
  err: unknown,
  options: PopulatedOptions,
  [parent, args, ctx, info]: FieldArgs,
): unknown => {
  if (options.debug) throw err;
  if (typeof options.fallbackError === 'function') {
    return options.fallbackError(err, parent, args, ctx, info);
  }
  return options.fallbackError;
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

// Errors thrown by resolvers are not the guard's business: they reach the
// client and the server's error handling untouched, unless
// suppressResolverError replaces them with fallbackError.
const suppressesResolverErrors = (options: PopulatedOptions): boolean =>
  options.suppressResolverError && !options.debug;

// Used for allow fields with suppressResolverError: there is no rule to run,
// only the resolver's errors to replace.
const allowResolver =
  (resolve: Resolver, options: PopulatedOptions): Resolver =>
  (...fieldArgs) =>
    withErrorHandling(() => resolve(...fieldArgs), options, fieldArgs);

// Returned by the rule step when the rule allows the field.
const proceed = Symbol('proceed');

const guardResolver = (
  resolve: Resolver,
  rule: GuardRule,
  options: PopulatedOptions,
): Resolver => {
  const runResolver = suppressesResolverErrors(options)
    ? allowResolver(resolve, options)
    : resolve;

  return (...fieldArgs) => {
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
        return proceed;
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

    // A rule that throws past its own handling (for example, in debug mode)
    // denies with the thrown error. afterRule runs outside this handling, so a
    // fallbackError function that throws is called once, and its error is not
    // fed back into it.
    const onRuleError = (err: unknown): RuleResult => {
      if (options.debug) throw err;
      thrown = { err };
      return false;
    };

    // Only the rule runs inside the guard's error handling. The resolver runs
    // after it, so its errors are left alone.
    const afterGuard = (res: unknown): unknown =>
      res === proceed ? runResolver(...fieldArgs) : res;

    // Stays synchronous unless the rule or the resolver returns a promise.
    let ruleRes: MaybePromise<RuleResult>;
    try {
      ruleRes = resolveRule(rule, parent, args, ctx, info, ruleOptions);
    } catch (err) {
      ruleRes = onRuleError(err);
    }
    const res = isPromiseLike(ruleRes)
      ? Promise.resolve(ruleRes).then(undefined, onRuleError).then(afterRule)
      : afterRule(ruleRes);
    return isPromiseLike(res)
      ? Promise.resolve(res).then(afterGuard)
      : afterGuard(res);
  };
};

const wrapResolver = (
  resolve: Resolver,
  rule: GuardRule,
  options: PopulatedOptions,
): Resolver =>
  isAllowRule(rule)
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

      // An allow field has nothing to deny, so unless its resolver errors are
      // replaced, the field is left as it is.
      if (isAllowRule(rule) && !suppressesResolverErrors(options)) {
        return fieldConfig;
      }

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

import { ValidationError } from './errors.js';
import type { GuardRule, LogicRule, Rule, Rules } from './types.js';
import { flattenObjectOf, isLogicRule, isRuleFunction } from './utils.js';

export { ValidationError };

const extractLogicRules = (rule: LogicRule): Rule[] => {
  return rule.getRules().reduce<Rule[]>((acc, guardRule) => {
    if (isLogicRule(guardRule)) {
      return [...acc, ...extractLogicRules(guardRule)];
    } else {
      return [...acc, guardRule];
    }
  }, []);
};

const extractRules = (ruleTree: Rules): Rule[] => {
  const resolvers = isRuleFunction(ruleTree)
    ? [ruleTree]
    : flattenObjectOf<GuardRule>(ruleTree, isRuleFunction);

  const rules = resolvers.reduce<Rule[]>((rules, rule) => {
    if (isLogicRule(rule)) {
      return [...rules, ...extractLogicRules(rule)];
    } else {
      return [...rules, rule];
    }
  }, []);

  return rules;
};

const isPlainObject = (x: unknown): x is Record<string, unknown> => {
  if (x === null || typeof x !== 'object') return false;
  const prototype = Object.getPrototypeOf(x);
  return prototype === Object.prototype || prototype === null;
};

const notARule = (path: string) =>
  new ValidationError(
    `It seems like ${path} is not a graphql-guard rule. Create rules with rule(), inputRule(), allow, deny or the logic rules from graphql-guard. Rules created with graphql-shield are not supported.`,
  );

// Anything in the rule tree that is not a rule would otherwise be skipped
// silently and replaced by the fallback rule.
const validateRuleTreeShape = (ruleTree: unknown): void => {
  if (isRuleFunction(ruleTree)) return;
  if (!isPlainObject(ruleTree)) throw notARule('the rule tree');

  for (const [typeName, typeRules] of Object.entries(ruleTree)) {
    if (isRuleFunction(typeRules)) continue;
    if (!isPlainObject(typeRules)) throw notARule(typeName);

    for (const [fieldName, fieldRule] of Object.entries(typeRules)) {
      if (!isRuleFunction(fieldRule))
        throw notARule(`${typeName}.${fieldName}`);
    }
  }
};

export const validateRuleTree = (
  ruleTree: Rules,
  fallbackRule?: GuardRule,
): void => {
  validateRuleTreeShape(ruleTree);
  if (fallbackRule !== undefined && !isRuleFunction(fallbackRule)) {
    throw notARule('options.fallbackRule');
  }

  const rules = [
    ...extractRules(ruleTree),
    ...(fallbackRule !== undefined ? extractRules(fallbackRule) : []),
  ];

  const valid = rules.reduce<{ map: Map<string, Rule>; duplicates: string[] }>(
    ({ map, duplicates }, rule) => {
      if (!map.has(rule.name)) {
        return { map: map.set(rule.name, rule), duplicates };
      } else if (
        !map.get(rule.name)!.equals(rule) &&
        !duplicates.includes(rule.name)
      ) {
        return {
          map: map.set(rule.name, rule),
          duplicates: [...duplicates, rule.name],
        };
      } else {
        return { map, duplicates };
      }
    },
    { map: new Map<string, Rule>(), duplicates: [] },
  );

  if (valid.duplicates.length > 0) {
    throw new ValidationError(
      `There seem to be multiple definitions of these rules: ${valid.duplicates.join(', ')}`,
    );
  }
};

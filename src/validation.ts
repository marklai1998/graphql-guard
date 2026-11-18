import type { LogicRule, Rule, Rules, ShieldRule } from './types.js';
import { flattenObjectOf, isLogicRule, isRuleFunction } from './utils.js';

export function validateRuleTree(
  ruleTree: Rules,
): { status: 'ok' } | { status: 'err'; message: string } {
  const rules = extractRules(ruleTree);

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

  if (valid.duplicates.length === 0) {
    return { status: 'ok' };
  } else {
    const duplicates = valid.duplicates.join(', ');
    return {
      status: 'err',
      message: `There seem to be multiple definitions of these rules: ${duplicates}`,
    };
  }

  /* Helper functions */
  function extractRules(ruleTree: Rules): Rule[] {
    const resolvers = flattenObjectOf<ShieldRule>(ruleTree, isRuleFunction);

    const rules = resolvers.reduce<Rule[]>((rules, rule) => {
      if (isLogicRule(rule)) {
        return [...rules, ...extractLogicRules(rule)];
      } else {
        return [...rules, rule];
      }
    }, []);

    return rules;
  }

  function extractLogicRules(rule: LogicRule): Rule[] {
    return rule.getRules().reduce<Rule[]>((acc, shieldRule) => {
      if (isLogicRule(shieldRule)) {
        return [...acc, ...extractLogicRules(shieldRule)];
      } else {
        return [...acc, shieldRule];
      }
    }, []);
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
  }
}

import { GraphQLError, versionInfo } from 'graphql';

// graphql 17 only accepts the options object. graphql 14 to 16 need the
// positional arguments: early 16.x and older ignore the options object.
const supportsOptionsObject = versionInfo.major >= 17;

// graphql 17's typings drop the positional signature, so describe it here to
// keep the legacy branch compiling against any installed graphql version.
type LegacyGraphQLErrorConstructor = new (
  message: string,
  nodes?: unknown,
  source?: unknown,
  positions?: unknown,
  path?: unknown,
  originalError?: unknown,
  extensions?: Record<string, unknown>,
) => GraphQLError;

const LegacyGraphQLError =
  GraphQLError as unknown as LegacyGraphQLErrorConstructor;

export const createGuardError = (
  message: string,
  code: string,
): GraphQLError =>
  supportsOptionsObject
    ? new GraphQLError(message, { extensions: { code } })
    : new LegacyGraphQLError(
        message,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { code },
      );

/**
 * Thrown by `guard` when the rule tree or its options are invalid, for example
 * a rule on a type that isn't in the schema or two rules sharing a name.
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

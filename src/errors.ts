import { GraphQLError, versionInfo } from 'graphql';

// graphql 17 only accepts the options object. graphql 14 to 16 need the
// positional arguments: early 16.x and older ignore the options object.
const supportsOptionsObject = versionInfo.major >= 17;

export const createGuardError = (
  message: string,
  code: string,
): GraphQLError =>
  supportsOptionsObject
    ? new GraphQLError(message, { extensions: { code } })
    : new GraphQLError(
        message,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { code },
      );

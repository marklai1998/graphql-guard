import { GraphQLError } from 'graphql';

// Positional arguments work across graphql 14, 15 and 16.
export const createGuardError = (message: string, code: string): GraphQLError =>
  new GraphQLError(
    message,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { code },
  );

import { createGuardError } from '../errors.js';

export const defaultFallbackError = createGuardError(
  'Not Authorised!',
  'FORBIDDEN',
);

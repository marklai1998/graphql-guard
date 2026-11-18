import { guard } from 'graphql-guard';
import { makeSchema } from 'nexus';
import { permissions } from '../lib/permissions/index.js';
import { Mutation } from './mutations.js';
import { Query } from './queries.js';
import { AuthPayload, LoginInput, SignupInput, User } from './types.js';

const baseSchema = makeSchema({
  types: [Query, Mutation, User, AuthPayload, LoginInput, SignupInput],
  outputs: false,
});

// Pass resolver errors such as a failed login through to the client.
export const schema = guard(baseSchema, permissions, {
  allowExternalErrors: true,
});

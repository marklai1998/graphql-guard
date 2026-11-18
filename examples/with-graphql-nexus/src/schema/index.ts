import path from 'node:path';
import { makePrismaSchema } from 'nexus-prisma';

import datamodelInfo from '../generated/nexus-prisma';
import { prisma } from '../generated/prisma-client';
import { inputTypes } from './input-types';
import { Mutation } from './mutations';
import { Query } from './queries';
import { types } from './types';

export const schema = makePrismaSchema({
  nonNullDefaults: {
    input: true,
    output: true,
  },
  outputs: {
    schema: path.join(__dirname, '../generated/schema.graphql'),
  },
  prisma: {
    client: prisma,
    datamodelInfo,
  },
  types: [Query, Mutation, ...types, ...inputTypes],
});

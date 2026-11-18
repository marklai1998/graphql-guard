import type { Rules } from 'graphql-guard';
import * as rules from './rules.js';

export const permissions: Rules = {
  Query: {
    viewer: rules.isCustomer,
  },
  Mutation: {
    addItemToBasket: rules.isCustomer,
    removeItemFromBasket: rules.isCustomer,
    addProduct: rules.isGrocer,
    removeProduct: rules.isGrocer,
  },
  Product: {
    price: rules.isAuthenticated,
  },
};

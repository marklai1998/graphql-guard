import { GraphQLError } from 'graphql';
import type { Context } from '../utils.js';

export const Mutation = {
  addItemToBasket: async (
    _parent: unknown,
    { productId, quantity }: { productId: string; quantity: number },
    ctx: Context,
  ) => {
    await ctx.db.addBasketItem({
      customerEmail: ctx.email as string,
      productId,
      quantity,
    });

    // Return an empty object to resolve the Viewer.
    return {};
  },
  removeItemFromBasket: async (
    _parent: unknown,
    { itemId }: { itemId: string },
    ctx: Context,
  ) => {
    const basket = await ctx.db.basket(ctx.email as string);
    if (!basket.some((entry) => entry.id === itemId)) {
      throw new GraphQLError(`No basket item with id "${itemId}"`);
    }
    await ctx.db.removeBasketItem(itemId);

    // Return an empty object to resolve the Viewer.
    return {};
  },
  addProduct: (
    _parent: unknown,
    args: { name: string; description: string; price: number },
    ctx: Context,
  ) => ctx.db.addProduct(args),
  removeProduct: (_parent: unknown, { id }: { id: string }, ctx: Context) =>
    ctx.db.removeProduct(id),
};

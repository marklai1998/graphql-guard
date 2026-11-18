import type { BasketItem as BasketItemModel } from '../db.js';
import type { Context } from '../utils.js';

export const BasketItem = {
  product: (parent: BasketItemModel, _args: unknown, ctx: Context) =>
    ctx.db.product(parent.productId),
};

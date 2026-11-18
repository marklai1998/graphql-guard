import { GraphQLError } from 'graphql';

// An in-memory store standing in for a real database.

export type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
};

export type BasketItem = {
  id: string;
  customerEmail: string;
  productId: string;
  quantity: number;
};

let nextId = 1;
const id = () => String(nextId++);

const product = (name: string, description: string, price: number) => ({
  id: id(),
  name,
  description,
  price,
});

const products: Product[] = [
  product('Orange', 'Sweet orange fruit.', 1),
  product('Apple', 'Sometimes sour, sometimes on the back of a computer.', 500),
  product(
    'Strawberries',
    'THE Best fruit ever. Use with caution when combined with chocolate.',
    2,
  ),
  product('Banana', 'Strangely shaped fruit with yellow taste.', 6),
  product('Mango', 'Juicy tropical fruit for exquisite taste.', 2),
  product(
    'Blueberries',
    "Don't get fooled, you ain't gonna become a Smurf!",
    7,
  ),
];

const item = (
  customerEmail: string,
  productIndex: number,
  quantity: number,
) => ({
  id: id(),
  customerEmail,
  productId: products[productIndex].id,
  quantity,
});

const basketItems: BasketItem[] = [
  item('johnny@example.com', 0, 5),
  item('johnny@example.com', 1, 2),
  item('johnny@example.com', 2, 10),
  item('mathew@example.com', 3, 9),
  item('mathew@example.com', 4, 2),
  item('mathew@example.com', 5, 13),
];

const customers = ['johnny@example.com', 'mathew@example.com'];
const grocers = ['maya@example.com'];

const remove = <T extends { id: string }>(list: T[], itemId: string) => {
  const index = list.findIndex((entry) => entry.id === itemId);
  if (index === -1) {
    throw new GraphQLError(`No entry with id "${itemId}"`);
  }
  return list.splice(index, 1)[0];
};

export const db = {
  isCustomer: async (email: string) => customers.includes(email),
  isGrocer: async (email: string) => grocers.includes(email),

  products: async () => products,
  product: async (productId: string) =>
    products.find((entry) => entry.id === productId),
  addProduct: async (data: Omit<Product, 'id'>) => {
    const created = { id: id(), ...data };
    products.push(created);
    return created;
  },
  removeProduct: async (productId: string) => remove(products, productId),

  basket: async (email: string) =>
    basketItems.filter((entry) => entry.customerEmail === email),
  addBasketItem: async (data: Omit<BasketItem, 'id'>) => {
    if (!products.some((entry) => entry.id === data.productId)) {
      throw new GraphQLError(`No product with id "${data.productId}"`);
    }
    const created = { id: id(), ...data };
    basketItems.push(created);
    return created;
  },
  removeBasketItem: async (itemId: string) => remove(basketItems, itemId),
};

export type Db = typeof db;

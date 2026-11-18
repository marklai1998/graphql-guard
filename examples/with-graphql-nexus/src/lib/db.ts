import { randomUUID } from 'node:crypto';

// An in-memory store standing in for a real database.

export type User = {
  id: string;
  email: string;
  password: string;
  name: string;
};

const users: User[] = [];

export const db = {
  users: async () => users,
  userById: async (id: string) => users.find((user) => user.id === id),
  userByEmail: async (email: string) =>
    users.find((user) => user.email === email),
  createUser: async (data: Omit<User, 'id'>) => {
    const user = { id: randomUUID(), ...data };
    users.push(user);
    return user;
  },
};

export type Db = typeof db;

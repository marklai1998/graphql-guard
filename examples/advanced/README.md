# GraphQL Guard Advanced Example

> This application is made solely for the purpose of GraphQL Guard demonstration.

- A simple groceries shop served with [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server).
- Data lives in an in-memory store (`src/db.ts`) and resets when the server restarts.
- Don't spend too much money!

## Running the server

GraphQL Guard isn't published yet, so build it first from the repository root, then install and start the example with pnpm:

```bash
# in the repository root
pnpm i && pnpm build

# in examples/advanced
pnpm i
pnpm dev
```

Open [http://localhost:4000/graphql](http://localhost:4000/graphql).

## Sample Queries

Test the functionality of this application. You can authenticate users by adding `Authorization: Bearer <email>` as your http header. (NOTE: This is not how authentication should be done!)

### Customer

#### Predefined Emails

- use johnny@example.com,
- or mathew@example.com

```gql
query Johnny {
  viewer {
    email
    basket {
      id
      quantity
      product {
        name
      }
    }
  }
}

query Catalog {
  products {
    id
    name
    price
  }
}

mutation AddToBasket($ID: ID!) {
  addItemToBasket(productId: $ID, quantity: 2) {
    basket {
      quantity
      product {
        name
      }
    }
  }
}

mutation RemoveItemFromBasket($ID: ID!) {
  removeItemFromBasket(itemId: $ID) {
    basket {
      quantity
      product {
        name
      }
    }
  }
}
```

### Grocer

#### Available Emails

- use maya@example.com

```gql
query Supply {
  products {
    id
    name
  }
}

mutation AddProduct($name: String!, $description: String!, $price: Int!) {
  addProduct(name: $name, description: $description, price: $price) {
    id
    name
  }
}

mutation DeleteProduct($id: ID!) {
  removeProduct(id: $id) {
    id
    name
  }
}
```

## License

MIT @ Mark Lai

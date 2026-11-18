# Basic Example

A minimal [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server) server with a few rules.

## Running the server

GraphQL Guard isn't published yet, so build it first from the repository root, then install and start the example with pnpm:

```bash
# in the repository root
pnpm i && pnpm build

# in examples/basic
pnpm i
pnpm start
```

Open [http://localhost:4000/graphql](http://localhost:4000/graphql). Set the `Authorization` header to `mathew` (admin), `george` (editor) or `johnny` (customer). This is not how authentication should be done!

```graphql
query FrontPage {
  frontPage {
    name
    count
  }
}

query Fruits {
  fruits {
    name
    count
  }
}

query Customers {
  customers {
    id
    basket {
      name
    }
  }
}
```

## License

MIT @ Mark Lai

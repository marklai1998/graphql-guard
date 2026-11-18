# with-graphql-nexus

This is an example of how to use `graphql-guard` with [GraphQL Nexus](https://nexusjs.org/), served by [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server).

## Content

The schema is built with Nexus and then wrapped with `guard`. Users are kept in an in-memory store (`src/lib/db.ts`) and reset when the server restarts.

`signup` and `login` return a JSON Web Token. Send it as an `Authorization: Bearer <token>` header. The context reads the user id from the token, and the `isAuthenticated` rule checks it.

`login` and `signup` are the only operations available without authentication. Every other query and mutation is covered by a `'*'` wildcard rule.

### Steps to get 'up & running'

1. GraphQL Guard isn't published yet, so build it first: run `pnpm i && pnpm build` in the repository root.

2. `pnpm i` in this folder.

3. Create a `.env` with an `APP_SECRET` field, or copy `.env.example`.

4. `pnpm start`, or `pnpm start:dev` to restart on change.

5. Navigate to [`http://localhost:4001/graphql`](http://localhost:4001/graphql).

6. Have fun!

### Queries and Mutations

```graphql
mutation SIGNUP {
  signup(
    data: {
      email: "test@email.com"
      password: "bananas"
      name: "Monkey Business"
    }
  ) {
    token
  }
}

mutation LOGIN {
  login(data: { email: "test@email.com", password: "bananas" }) {
    token
  }
}

# Requires the Authorization header
query ME {
  me {
    id
    email
    name
  }
}

# Requires the Authorization header
query USERS {
  users {
    id
    email
    name
  }
}
```

## License

MIT @ [Christian A. Jacobsen](https://www.github.com/ChristianJacobsen/)

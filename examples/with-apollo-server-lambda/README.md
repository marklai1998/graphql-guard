# About

A simple example that shows how to use `graphql-guard` with Apollo Server on AWS Lambda, using [`@as-integrations/aws-lambda`](https://github.com/apollo-server-integrations/apollo-server-integration-aws-lambda).

- [Apollo Server](https://www.apollographql.com/docs/apollo-server/)
- [`@as-integrations/aws-lambda`](https://github.com/apollo-server-integrations/apollo-server-integration-aws-lambda)
- [Serverless Framework](https://www.serverless.com/framework/docs)

# Run

GraphQL Guard isn't published yet, so build it first from the repository root:

```bash
# in the repository root
pnpm i && pnpm build

# in examples/with-apollo-server-lambda
pnpm i
pnpm start
```

`pnpm start` calls the handler locally with the query below, first without and then with an `Authorization` header:

```graphql
{
  hello
}
```

Without the header the rule fails and the response contains a `Not Authorised!` error. With `Authorization: johnny` it returns `Hello johnny!`.

# Deploy

`pnpm run deploy` deploys the function with the [Serverless Framework](https://www.serverless.com/framework/docs) v4. You need the `serverless` CLI installed, and AWS credentials and a Serverless account set up.

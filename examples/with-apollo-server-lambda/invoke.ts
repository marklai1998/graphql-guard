// Calls the Lambda handler locally with API Gateway (HTTP API) events,
// once without and once with an Authorization header.
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { graphql } from './handler.js';

const request = (headers: Record<string, string>) =>
  ({
    version: '2.0',
    routeKey: 'POST /graphql',
    rawPath: '/graphql',
    rawQueryString: '',
    headers: { 'content-type': 'application/json', ...headers },
    requestContext: { http: { method: 'POST' } },
    body: JSON.stringify({ query: '{ hello }' }),
    isBase64Encoded: false,
  }) as unknown as APIGatewayProxyEventV2;

const main = async () => {
  const cases: Record<string, string>[] = [{}, { authorization: 'johnny' }];
  for (const headers of cases) {
    const response = await graphql(request(headers), {} as Context, () => {});
    console.log(JSON.stringify(headers), '->', response?.body);
  }
};

main();

import { GraphQLClient } from 'graphql-request'

export function makeGqlClient(accessToken: string) {
  return new GraphQLClient(
    `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/graphql`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  )
}

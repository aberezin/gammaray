import { GraphQLClient, ClientError } from 'graphql-request'
import { syncHealth } from '@/store/sync-health.store'
import { getAccessToken, invalidateToken, type TokenGetter } from './token'

const ENDPOINT = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/graphql`

// A GraphQL client that (1) attaches a *fresh* access token per request (so it
// survives token expiry without a reload) and (2) funnels every failure into the
// sync-health store, so any server/network error puts the app into the suspect
// state. Business outcomes (a CONFLICT/REJECTED row in a 200 response) are NOT
// errors and never trip this.
export function makeGqlClient(getToken: TokenGetter = getAccessToken): GraphQLClient {
  return new GraphQLClient(ENDPOINT, {
    requestMiddleware: async (req) => {
      const token = await getToken()
      return {
        ...req,
        headers: {
          ...req.headers,
          // Keep an explicit JSON content-type. graphql-request normally adds
          // this, but the default is dropped once we supply a requestMiddleware.
          // Apollo's CSRF prevention then rejects the request (400): a request
          // without a "non-simple" content-type could have been a no-preflight
          // cross-site POST, so Apollo requires application/json (or an
          // apollo-require-preflight header) to prove it isn't.
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }
    },
    responseMiddleware: (response) => {
      if (!(response instanceof Error)) return
      if (response instanceof ClientError) {
        const status = response.response?.status
        if (status === 401) {
          invalidateToken()
          syncHealth.markSuspect('auth', 'Your session has expired. Please sign in again.')
        } else {
          const msg = response.response?.errors?.[0]?.message ?? response.message
          syncHealth.markSuspect('server', msg)
        }
      } else {
        // fetch threw — request never completed.
        syncHealth.markSuspect('network', response.message)
      }
    },
  })
}

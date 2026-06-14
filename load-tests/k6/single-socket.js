// Load test #1 — a single WebSocket subscription connection.
//
// Validates the end-to-end realtime path on ONE socket:
//   register -> open socket -> authenticate via connectionParams ->
//   subscribe to noteUpdated -> pushNote over HTTP -> receive the event.
//
// Intentionally minimal (1 VU, 1 iteration) — the baseline the N-client and
// throughput tests build on. See load-tests/README.md.
//
// Run:  k6 run load-tests/k6/single-socket.js
//       API_URL=http://localhost:3001 WS_URL=ws://localhost:3001 k6 run ...

import { check } from 'k6'
import { register, runSubscriptionClient } from './lib/gqlws.js'

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    checks: ['rate==1.0'], // every check must pass
    gqlws_session_errors: ['count==0'], // no protocol/auth errors
    gqlws_events_received: ['count>=1'], // the subscription delivered the event
    ws_connecting: ['p(95)<1000'], // socket upgrade is reasonably fast
  },
}

// Register a fresh user once before the test.
export function setup() {
  const { token, status } = register(`single-${Date.now()}`)
  check(null, {
    'registered user': () => status === 200 || status === 201,
    'received accessToken': () => !!token,
  })
  return { token }
}

export default function (data) {
  const r = runSubscriptionClient({ token: data.token, clientId: 'k6-single-socket' })

  check(r, {
    'ws upgrade (101)': (x) => x.wsStatus === 101,
    'connection acknowledged': (x) => x.acked,
    'subscription event received': (x) => x.gotEvent,
  })
}

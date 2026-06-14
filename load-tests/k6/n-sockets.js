// Load test #2 — N independent clients, each on its own WebSocket.
//
// Simulates N separate users (own account, own JWT, own note, own socket)
// connecting concurrently. Each client runs the full realtime lifecycle:
//   register -> open socket -> authenticate -> subscribe -> push -> receive.
//
// Because there is one note per user and the broker publishes on a per-user
// topic, each socket must receive ONLY its own event — so this also exercises
// fan-out isolation, not just raw connection capacity.
//
// Run:  k6 run load-tests/k6/n-sockets.js                 # default 50 clients
//       CLIENTS=200 k6 run load-tests/k6/n-sockets.js     # scale up
//       CLIENTS=500 MAX_DURATION=5m k6 run load-tests/k6/n-sockets.js

import { check } from 'k6'
import { register, runSubscriptionClient } from './lib/gqlws.js'

const CLIENTS = parseInt(__ENV.CLIENTS || '50', 10)

export const options = {
  scenarios: {
    independent_clients: {
      executor: 'per-vu-iterations',
      vus: CLIENTS, // one VU == one independent client
      iterations: 1, // each client connects once
      maxDuration: __ENV.MAX_DURATION || '2m',
    },
  },
  thresholds: {
    checks: ['rate==1.0'], // every check across every client passes
    gqlws_session_errors: ['count==0'], // no protocol/auth errors
    gqlws_events_received: [`count>=${CLIENTS}`], // every client got its event
    ws_connecting: ['p(95)<2000'], // upgrades stay fast under concurrency
    gqlws_event_time: ['p(95)<2000'], // push->event latency holds up
  },
}

// Pre-register one user per client so the per-iteration timing reflects the
// socket path, not a registration spike. Tokens are handed out by VU number.
export function setup() {
  const stamp = Date.now()
  const tokens = []
  for (let i = 0; i < CLIENTS; i++) {
    tokens.push(register(`nclients-${stamp}-${i}`).token)
  }
  check(null, { 'all clients registered': () => tokens.every(Boolean) })
  return { tokens }
}

export default function (data) {
  const token = data.tokens[__VU - 1]
  const clientId = `k6-client-${__VU}`

  const r = runSubscriptionClient({ token, clientId })

  check(r, {
    'ws upgrade (101)': (x) => x.wsStatus === 101,
    'connection acknowledged': (x) => x.acked,
    'subscription event received': (x) => x.gotEvent,
  })
}

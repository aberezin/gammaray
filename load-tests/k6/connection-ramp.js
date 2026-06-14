// Load test #3 — connection ramp.
//
// Ramps the number of CONCURRENT open subscriptions up to MAX and holds it,
// to find where the server's realtime capacity degrades. Unlike n-sockets.js
// (connect → push → disconnect), each client here opens a subscription and
// holds it OPEN and idle, so at the plateau ~MAX sockets are alive at once.
//
// The in-process SyncBroker (apps/api/src/sync/sync.broker.ts) registers one
// PubSub asyncIterator per subscription, so this is the test that exercises its
// per-connection overhead. Watch the live `vus` line — it tracks the number of
// concurrent open connections.
//
// Run:  k6 run load-tests/k6/connection-ramp.js                  # ramp to 200
//       MAX=1000 RAMP_UP=1m HOLD=2m k6 run load-tests/k6/connection-ramp.js
//
// Env:
//   MAX            peak concurrent connections        (default 200)
//   RAMP_UP        time to climb 0 -> MAX             (default 20s)
//   HOLD           time to hold at MAX               (default 20s)
//   RAMP_DOWN      time to drain MAX -> 0            (default 10s)
//   CONN_HOLD_MS   how long each socket stays open   (default 10000)
//   USERS          size of the registered user pool  (default min(MAX, 200))
//
// This test targets CONNECTION capacity, so to keep setup cheap it registers a
// bounded pool of users and lets connections share tokens (each socket still
// opens its own broker subscription). Use n-sockets.js when you need strictly
// one user per client.
//
// Reading the results & design rationale: load-tests/README.md.

import { check } from 'k6'
import { register, holdSubscriptionOpen } from './lib/gqlws.js'

const MAX = parseInt(__ENV.MAX || '200', 10)
const RAMP_UP = __ENV.RAMP_UP || '20s'
const HOLD = __ENV.HOLD || '20s'
const RAMP_DOWN = __ENV.RAMP_DOWN || '10s'
const CONN_HOLD_MS = parseInt(__ENV.CONN_HOLD_MS || '10000', 10)
const USERS = parseInt(__ENV.USERS || String(Math.min(MAX, 200)), 10)

export const options = {
  scenarios: {
    ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: RAMP_UP, target: MAX }, // climb to MAX concurrent sockets
        { duration: HOLD, target: MAX }, // hold the plateau
        { duration: RAMP_DOWN, target: 0 }, // drain
      ],
      gracefulRampDown: '5s',
    },
  },
  setupTimeout: __ENV.SETUP_TIMEOUT || '120s',
  thresholds: {
    checks: ['rate==1.0'], // every upgrade + ack succeeded
    gqlws_session_errors: ['count==0'], // no protocol/auth errors
    gqlws_ack_time: ['p(95)<3000'], // ack stays responsive as N climbs
    ws_connecting: ['p(95)<3000'], // upgrades stay responsive as N climbs
  },
}

// Pre-register a pool of users (one per peak connection). VUs reuse their token
// across reconnects via __VU, so ramping doesn't generate unbounded users.
export function setup() {
  const stamp = Date.now()
  const tokens = []
  for (let i = 0; i < USERS; i++) {
    tokens.push(register(`ramp-${stamp}-${i}`).token)
  }
  check(null, { 'all users registered': () => tokens.every(Boolean) })
  return { tokens }
}

export default function (data) {
  const token = data.tokens[(__VU - 1) % data.tokens.length]

  const r = holdSubscriptionOpen({
    token,
    clientId: `k6-ramp-${__VU}`,
    holdMs: CONN_HOLD_MS,
  })

  check(r, {
    'ws upgrade (101)': (x) => x.wsStatus === 101,
    'connection acknowledged': (x) => x.acked,
  })
}

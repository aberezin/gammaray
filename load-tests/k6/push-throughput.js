// Load test #4 — push throughput and fan-out latency.
//
// Measures how fast notes can be pushed and how quickly the resulting events
// reach subscribers, as the push rate climbs. Each client holds a subscription
// open and drives a push→event round-trip loop on its OWN note, so writes never
// conflict (one logical writer per note). Aggregate push rate is increased by
// ramping the number of concurrent push clients.
//
// Why ramp clients instead of one client's rate? The API uses optimistic
// concurrency keyed on a per-note version, so a single note tolerates only one
// in-flight write at a time (~1 push / round-trip). Real push throughput
// therefore scales with the number of DISTINCT notes being written — i.e. with
// concurrent clients. (Hammering ONE note with many writers is the separate
// "conflict storm" test on the roadmap.)
//
// Key signals:
//   gqlws_event_time         push -> event end-to-end latency (the headline)
//   gqlws_events_received    delivered events (rate == achieved throughput)
//   gqlws_push_conflicts     must stay 0 here (proves the rate is "clean")
//   http_reqs                pushNote calls issued
//
// Run:  k6 run load-tests/k6/push-throughput.js                 # ramp to 100
//       PEAK=300 RAMP_UP=1m HOLD=1m k6 run load-tests/k6/push-throughput.js
//
// Env:
//   PEAK              peak concurrent push clients       (default 100)
//   RAMP_UP/HOLD/RAMP_DOWN  stage durations              (30s / 30s / 10s)
//   CLIENT_DURATION_MS  how long each client loops       (default 20000)
//   USERS             registered user pool               (default PEAK)

import { check } from 'k6'
import { register, runPushLoopClient } from './lib/gqlws.js'

const PEAK = parseInt(__ENV.PEAK || '100', 10)
const RAMP_UP = __ENV.RAMP_UP || '30s'
const HOLD = __ENV.HOLD || '30s'
const RAMP_DOWN = __ENV.RAMP_DOWN || '10s'
const CLIENT_DURATION_MS = parseInt(__ENV.CLIENT_DURATION_MS || '20000', 10)
const USERS = parseInt(__ENV.USERS || String(PEAK), 10)

export const options = {
  scenarios: {
    pushers: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: RAMP_UP, target: PEAK }, // climb the push rate
        { duration: HOLD, target: PEAK }, // hold peak rate
        { duration: RAMP_DOWN, target: 0 }, // drain
      ],
      gracefulRampDown: '5s',
    },
  },
  setupTimeout: __ENV.SETUP_TIMEOUT || '120s',
  thresholds: {
    checks: ['rate==1.0'], // every client connected and delivered events
    gqlws_session_errors: ['count==0'], // no protocol/auth errors
    gqlws_push_conflicts: ['count==0'], // single-writer-per-note: zero conflicts
    gqlws_event_time: ['p(95)<3000'], // fan-out latency holds up under load
  },
}

// One user per peak client so every client writes a distinct note (no conflicts).
// VUs map to users by __VU, stable across a VU's iterations.
export function setup() {
  const stamp = Date.now()
  const tokens = []
  for (let i = 0; i < USERS; i++) {
    tokens.push(register(`tp-${stamp}-${i}`).token)
  }
  check(null, { 'all users registered': () => tokens.every(Boolean) })
  return { tokens }
}

export default function (data) {
  const token = data.tokens[(__VU - 1) % data.tokens.length]

  const r = runPushLoopClient({
    token,
    clientId: `k6-tp-${__VU}`,
    durationMs: CLIENT_DURATION_MS,
  })

  check(r, {
    'ws upgrade (101)': (x) => x.wsStatus === 101,
    'connection acknowledged': (x) => x.acked,
    'delivered at least one event': (x) => x.events > 0,
  })
}

// Load test #5 — conflict storm.
//
// The deliberate inverse of push-throughput: instead of one writer per note,
// MANY clients hammer the SAME note concurrently. They all authenticate as one
// shared user (one note per user), so their writes race and the server's
// optimistic-concurrency check rejects all but one per version. Each client then
// resolves the conflict and keeps going. Measures conflict rate and resolution
// latency under contention; correctness must hold (no protocol errors, every
// resolve succeeds).
//
// HTTP-only: the contention is entirely in pushNote/resolveConflict, so no
// subscription is opened. Writer count is ramped to show how conflict rate and
// resolve latency move with contention.
//
// Run:  k6 run load-tests/k6/conflict-storm.js                 # ramp to 50 writers
//       PEAK=100 HOLD=1m k6 run load-tests/k6/conflict-storm.js
//       RESOLVE=false k6 run load-tests/k6/conflict-storm.js   # conflict-only, no resolve
//
// Env:
//   PEAK              peak concurrent writers on the note   (default 50)
//   RAMP_UP/HOLD/RAMP_DOWN  stage durations                 (20s / 30s / 10s)
//   CLIENT_DURATION_MS  how long each writer loops          (default 15000)
//   RESOLVE           resolve each conflict (else just retry)  (default true)
//
// Reading the results & design rationale: load-tests/README.md.

import { check } from 'k6'
import { register, getNote, runConflictStormClient } from './lib/gqlws.js'

const PEAK = parseInt(__ENV.PEAK || '50', 10)
const RAMP_UP = __ENV.RAMP_UP || '20s'
const HOLD = __ENV.HOLD || '30s'
const RAMP_DOWN = __ENV.RAMP_DOWN || '10s'
const CLIENT_DURATION_MS = parseInt(__ENV.CLIENT_DURATION_MS || '15000', 10)
const RESOLVE = (__ENV.RESOLVE || 'true') !== 'false'

export const options = {
  scenarios: {
    storm: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: RAMP_UP, target: PEAK }, // climb contention on one note
        { duration: HOLD, target: PEAK }, // hold the storm
        { duration: RAMP_DOWN, target: 0 }, // drain
      ],
      gracefulRampDown: '5s',
    },
  },
  setupTimeout: __ENV.SETUP_TIMEOUT || '120s',
  thresholds: {
    checks: ['rate==1.0'], // every writer pushed and (if conflicted) resolved
    gqlws_session_errors: ['count==0'], // contention must not cause errors
    conflict_resolve_time: ['p(95)<5000'], // resolution stays bounded under load
    // push_conflict_rate is reported, not gated — a high rate is the point.
  },
}

// One shared user => one shared note that every writer fights over.
export function setup() {
  const { token } = register(`storm-${Date.now()}`)
  const note = getNote(token) // also creates the note
  check(null, {
    'shared user registered': () => !!token,
    'shared note exists': () => !!note.id,
  })
  return { token, noteId: note.id }
}

export default function (data) {
  const r = runConflictStormClient({
    token: data.token,
    noteId: data.noteId,
    clientId: `k6-storm-${__VU}`,
    durationMs: CLIENT_DURATION_MS,
    resolve: RESOLVE,
  })

  check(r, {
    'issued pushes': (x) => x.pushes > 0,
    'resolved when it conflicted': (x) => !RESOLVE || x.conflicts === 0 || x.resolves > 0,
  })
}

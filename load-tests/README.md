# Load tests

Load and soak tests for the NoteSync API — specifically the realtime path
(REST auth → GraphQL mutations → graphql-ws WebSocket subscriptions).

These are **separate** from the Playwright functional tests in
`apps/example/tests`. Functional tests assert correctness; these measure
behaviour under concurrency (connection capacity, event-delivery latency,
conflict rates).

## Framework: k6 (recommended)

[k6](https://k6.io) is the recommended tool. Tests are plain JavaScript but run
in a high-performance Go runtime, so a single machine can drive thousands of
concurrent WebSocket connections. It has first-class metrics, thresholds (pass/
fail gates for CI), and native HTTP + WebSocket support.

### Why k6 over the alternatives

| | k6 (recommended) | Artillery | autocannon |
|---|---|---|---|
| Language | JS (runs in Go) | Node.js (YAML + JS) | Node.js |
| Load generation | Excellent | Good | HTTP only |
| WebSocket | Yes | Yes | No |
| Metrics / thresholds | First-class | Plugin-based | Basic |
| Reuse app's `graphql-ws` client | No (frames hand-rolled) | Yes | n/a |
| Install | Single binary | `pnpm add -D artillery` | npm |

**Artillery** is the strongest alternative: being Node-native, it can import the
real `graphql-ws` client for perfect protocol fidelity and lives in the pnpm
workspace as a devDependency. If you'd prefer that, say so and the same scenarios
can be ported — the test matrix below is framework-agnostic.

## Prerequisites

```bash
# macOS
brew install k6

# or see https://grafana.com/docs/k6/latest/set-up/install-k6/
```

The API must be running with PostgreSQL up:

```bash
docker compose up -d
pnpm --filter @gammaray/api dev   # listens on :3001
```

## Running

```bash
# Test #1 — a single WebSocket subscription connection (baseline)
k6 run load-tests/k6/single-socket.js

# Test #2 — N independent clients (default 50), scale with CLIENTS
k6 run load-tests/k6/n-sockets.js
CLIENTS=200 k6 run load-tests/k6/n-sockets.js
CLIENTS=500 MAX_DURATION=5m k6 run load-tests/k6/n-sockets.js

# Test #3 — connection ramp: hold N concurrent open subscriptions
k6 run load-tests/k6/connection-ramp.js                       # ramp to 200
MAX=500 RAMP_UP=30s HOLD=20s k6 run load-tests/k6/connection-ramp.js

# Test #4 — push throughput: ramp push rate, measure fan-out latency
k6 run load-tests/k6/push-throughput.js                       # ramp to 100 clients
PEAK=300 RAMP_UP=30s HOLD=30s k6 run load-tests/k6/push-throughput.js

# Test #5 — conflict storm: many writers fight over ONE note
k6 run load-tests/k6/conflict-storm.js                        # ramp to 50 writers
RESOLVE=false k6 run load-tests/k6/conflict-storm.js          # conflict-only, no resolve

# Point at a non-default host
API_URL=http://localhost:3001 WS_URL=ws://localhost:3001 \
  k6 run load-tests/k6/single-socket.js
```

A run passes when every `threshold` holds (shown with ✓/✗ in the summary).

## Test inventory

| File | What it exercises |
|------|-------------------|
| `k6/single-socket.js` | One graphql-ws connection: auth → subscribe → push → receive event. Verifies the realtime pipe and records ack/event latency. |
| `k6/n-sockets.js` | N independent clients (own user/JWT/note/socket) connecting concurrently, each running the full lifecycle. Tests connection capacity and per-user fan-out isolation (each socket must receive only its own event). Scale with `CLIENTS`. |
| `k6/connection-ramp.js` | Ramps to `MAX` **concurrent open** subscriptions and holds the plateau (idle sockets), to find where realtime capacity degrades. This is the test that stresses the in-process `SyncBroker`'s per-connection overhead. Watch the live `vus` line for concurrency. |
| `k6/push-throughput.js` | Each client holds a subscription and drives a push→event round-trip loop on its **own** note (conflict-free); ramps the number of clients to ramp aggregate push rate. Measures sustained throughput and end-to-end fan-out latency, and confirms zero conflicts. Scale with `PEAK`. |
| `k6/conflict-storm.js` | The inverse of push-throughput: many writers (one shared user) hammer the **same** note so writes collide. Measures conflict rate and resolution latency under contention; correctness must hold (no errors, every resolve succeeds). HTTP-only. Scale with `PEAK`; `RESOLVE=false` for conflict-only. |
| `k6/lib/gqlws.js` | Shared helpers: REST auth, `pushNote`, `getNote`/`getNoteVersion`, `resolveConflict`, the graphql-ws subscription client lifecycle, the idle connection-hold (ramp test), the push→event loop (throughput test), and the conflict-storm loop. Defines the custom metrics. |

### Reference results

Headline findings on a single dev machine (M3 Max, all components on one box):

- **Connections:** 500 concurrent held subscriptions with sub-millisecond ack —
  no ceiling found in range.
- **Throughput:** saturates ~100 concurrent writers / **~1,750 push/s**, then
  throughput falls and latency rises while correctness holds (zero conflicts).
  Bottleneck is the per-push locked DB transaction + revision insert.
- **Contention:** 50 writers on one note → **~98% conflict rate**, resolve p95
  ~142 ms, zero errors. Optimistic concurrency serializes cleanly under a storm;
  it rejects (never corrupts) and resolution latency grows with contention.

Full numbers, with the commit/machine/runtime each was measured on, live in
[`RESULTS.md`](./RESULTS.md). Treat them as **relative** observations for
spotting regressions, not as SLAs — a real deployment (separate API hosts,
managed Postgres, Redis broker) will differ.

## How to read a run

k6 prints a summary at the end; a run **passes** only if every `threshold` holds
(✓), and exits non-zero if any fails (✗) — that is the CI gate.

What a healthy run looks like:

- `checks` rate is `100.00%` — every connect/ack/event assertion held.
- `gqlws_session_errors` is `0` — no auth/protocol failures.
- `gqlws_push_conflicts` is `0` in the throughput test — pushes were clean.
- Latency Trends (`gqlws_event_time`, `gqlws_ack_time`, `ws_connecting`) are
  within their thresholds; watch the **p95**, not the average.

The custom metrics (all defined in `lib/gqlws.js`):

| Metric | Meaning |
|--------|---------|
| `gqlws_ack_time` | `connection_init` → `connection_ack` (auth + handshake) |
| `gqlws_event_time` | `pushNote` issued → its event arrives on the socket (end-to-end fan-out) |
| `gqlws_events_received` | events delivered; the per-second rate == achieved throughput |
| `gqlws_session_errors` | auth/protocol errors — **must be 0** |
| `gqlws_connections_opened` / `_closed` | connection lifecycle counts |
| `gqlws_push_conflicts` | `pushNote` calls that returned a conflict (0 in the throughput test; high in the conflict storm) |
| `push_conflict_rate` | fraction of pushes that conflicted (conflict-storm headline) |
| `conflict_resolve_time` | `resolveConflict` latency under contention |

When a threshold fails, read it as a signal, not just a red mark:

- `ws_connecting` / `gqlws_ack_time` p95 climbing → connection-accept capacity
  (the in-process `SyncBroker`, event-loop saturation).
- `gqlws_event_time` p95 climbing → fan-out/delivery latency under write load.
- `gqlws_session_errors > 0` → real failures; check the API log, don't just
  raise the threshold.
- `gqlws_push_conflicts > 0` in the throughput test → the single-writer-per-note
  invariant broke (e.g. two clients sharing a user); a bug, not load.

## Design decisions & gotchas

Why the tests are shaped the way they are — the things a future change is likely
to get wrong without context.

| Decision | Why | Alternative rejected |
|----------|-----|----------------------|
| k6 as the framework | Best load generation + first-class thresholds/metrics; single binary for CI | Artillery (Node-native, could reuse the real `graphql-ws` client) — kept as documented fallback |
| One shared `lib/gqlws.js`, thin test files | Each test varies only its executor/scenario; the graphql-ws handshake is identical and easy to get wrong | Duplicating the handshake per file (drifts, double-maintenance) |
| `push-throughput` ramps **clients**, not one client's rate | The API uses per-note optimistic concurrency, so a note tolerates ~1 in-flight write; real throughput scales with distinct notes (clients) | Driving one client faster — would just produce conflicts, conflating with the conflict-storm test |
| Throughput client pushes its **own** note, seeded via `getNoteVersion` | Keeps writes conflict-free so the test measures throughput, not contention; seeding `expectedVersion` avoids a spurious first-push conflict | Pushing a shared note (conflicts dominate) or starting at version 0 (first push always conflicts) |
| End-to-end latency via a timestamp embedded in pushed content | The same client times its own round-trip; no cross-VU coordination needed (k6 VUs can't share state) | Separate pusher/subscriber VUs (correlating push→event across VUs is hard and racy) |
| `connection-ramp` reuses a bounded user pool (`USERS`) | The test targets connection count; one bcrypt-hashed registration per socket blows past k6's setup timeout at scale, and the broker registers a subscription per *connection* regardless of user | One user per connection (use `n-sockets.js` when strict per-user isolation matters) |
| Loop driven by **direct calls**, not `socket.setTimeout(fn, 0)` | k6's ws `setTimeout(fn, 0)` did not fire — the push loop silently ran once per iteration; positive delays (e.g. close timers) do work | `setTimeout(0)` rescheduling (looked correct, silently broke the loop) |
| Idle sockets in `connection-ramp` close themselves before ramp-down | A clean self-close records checks and isn't miscounted as an error; forced teardown at test end is noise | Holding sockets open for the whole test (teardown errors + no recorded checks) |
| Only protocol-level failures count as `gqlws_session_errors` | Transport `error` events fire during normal teardown; counting them would make `count==0` flaky. Real connection failures still surface via the `ws upgrade (101)` check | Counting every socket `error` event (false positives at shutdown) |
| `conflict-storm` shares ONE user/note across all writers, HTTP-only | One note per user is the contention point; all writers must hit the same note to collide. The storm lives in `pushNote`/`resolveConflict`, so no subscription is needed | Per-client notes (that's push-throughput — no contention) |
| `conflict-storm` does not gate on `push_conflict_rate` | A high conflict rate is the expected outcome, not a failure; the gates are zero errors and bounded resolve latency | Thresholding the conflict rate (would fail on the very thing being measured) |

## Roadmap (next tests to add)

1. ~~**Connection ramp**~~ — done (`connection-ramp.js`). No ceiling at 500 on a
   dev box; rerun with `MAX=1000+` (and on prod-like hardware) to find the real
   `SyncBroker` limit (see `apps/api/src/sync/sync.broker.ts`).
2. ~~**Push throughput**~~ — done (`push-throughput.js`). Saturates ~1,750
   push/s / ~100 concurrent writers on a dev box; bottleneck is the per-push DB
   transaction. Conflict-free by design (one writer per note).
3. ~~**Conflict storm**~~ — done (`conflict-storm.js`). 50 writers on one note →
   ~98% conflict rate, resolve p95 ~142 ms, zero errors; optimistic concurrency
   serializes cleanly and never corrupts.
4. **Soak** — steady moderate load for 30–60 min; watch for leaks / drift.

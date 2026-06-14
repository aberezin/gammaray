# Load tests

Load and soak tests for the NoteSync API — specifically the realtime path
(REST auth → GraphQL mutations → graphql-ws WebSocket subscriptions).

These are **separate** from the Playwright functional tests in
`apps/app-one/tests`. Functional tests assert correctness; these measure
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
| `k6/lib/gqlws.js` | Shared helpers: REST auth, `pushNote`, the graphql-ws subscription client lifecycle, and the idle connection-hold used by the ramp test. Defines the custom metrics. |

### Reference results (local, single dev machine)

`n-sockets.js` (connect → push → disconnect):

| Clients | Checks | Events | Errors | push→event p95 | ws upgrade p95 |
|--------:|:------:|:------:|:------:|---------------:|---------------:|
| 1       | 7/7    | 1      | 0      | ~17 ms         | <1 ms          |
| 50      | 251/251| 50     | 0      | ~38 ms         | ~31 ms         |
| 200     | 1001/1001| 200  | 0      | ~63 ms         | ~83 ms         |

`connection-ramp.js` (concurrent held subscriptions):

| Peak concurrent | Checks | Errors | ack p95 | ws upgrade p95 |
|----------------:|:------:|:------:|--------:|---------------:|
| 200             | 1399/1399 | 0   | ~1 ms   | ~1.8 ms        |
| 500             | 3997/3997 | 0   | ~1 ms   | ~0.9 ms        |

No ceiling reached at 500 concurrent on a single dev machine — latencies stay
sub-millisecond. Push higher (`MAX=1000+`) to find the real limit.

### Custom metrics emitted

- `gqlws_ack_time` — time from `connection_init` to `connection_ack`
- `gqlws_event_time` — time from `pushNote` to the event arriving on the socket
- `gqlws_events_received` — count of subscription events delivered
- `gqlws_session_errors` — protocol/auth errors (threshold: must be 0)

## Roadmap (next tests to add)

1. ~~**Connection ramp**~~ — done (`connection-ramp.js`). No ceiling at 500 on a
   dev box; rerun with `MAX=1000+` (and on prod-like hardware) to find the real
   `SyncBroker` limit (see `apps/api/src/sync/sync.broker.ts`).
2. **Push throughput** — fixed pool of subscribers, increasing `pushNote` rate;
   measure end-to-end fan-out latency (`gqlws_event_time` under load).
3. **Conflict storm** — many clients pushing against the same note with stale
   `expectedVersion`; measure conflict rate and resolution latency.
4. **Soak** — steady moderate load for 30–60 min; watch for leaks / drift.

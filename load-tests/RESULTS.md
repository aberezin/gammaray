# Load test results log

A dated record of load-test runs so the numbers in `README.md` have provenance
and don't silently rot. **These are relative capacity observations, not SLAs.**
Every run here was on a single developer machine with the API, k6, and Postgres
all sharing that one box — so absolute numbers are pessimistic vs. a real
deployment (separate API hosts, managed Postgres, Redis-backed broker). Use them
to compare runs and spot regressions, not as production targets.

When you add a run, copy the template at the bottom and fill it in. Record the
commit you tested so a future reader can reproduce or explain a shift.

---

## 2026-06-14 — baseline for all four tests

**Environment**

| | |
|---|---|
| Commit | `8573b2d` (branch `load-tests`) |
| Machine | Apple M3 Max, 16 cores, 48 GB RAM, macOS 15.7.7 |
| Topology | API + k6 + Postgres all on one machine (worst case) |
| Runtimes | k6 v1.7.1, Node v24.15.0, PostgreSQL 16.14 |
| API | `pnpm --filter @gammaray/api dev`, in-process `SyncBroker` (no Redis) |

**single-socket.js** — `k6 run load-tests/k6/single-socket.js`

| Checks | Events | Errors | ack p95 | push→event | ws upgrade |
|:------:|:------:|:------:|--------:|-----------:|-----------:|
| 7/7    | 1      | 0      | ~1 ms   | ~17 ms     | <1 ms      |

**n-sockets.js** — connect → push → disconnect, scaled by `CLIENTS`

| Clients | Checks    | Events | Errors | push→event p95 | ws upgrade p95 |
|--------:|:---------:|:------:|:------:|---------------:|---------------:|
| 50      | 251/251   | 50     | 0      | ~38 ms         | ~31 ms         |
| 200     | 1001/1001 | 200    | 0      | ~63 ms         | ~83 ms         |

**connection-ramp.js** — concurrent held subscriptions, scaled by `MAX`

| Peak concurrent | Checks    | Errors | ack p95 | ws upgrade p95 |
|----------------:|:---------:|:------:|--------:|---------------:|
| 200             | 1399/1399 | 0      | ~1 ms   | ~1.8 ms        |
| 500             | 3997/3997 | 0      | ~1 ms   | ~0.9 ms        |

No ceiling reached at 500 concurrent; latencies stayed sub-millisecond.

**push-throughput.js** — sustained push→event round-trips, scaled by `PEAK`

| Clients | Throughput  | push→event p95 | conflicts | errors |
|--------:|------------:|---------------:|:---------:|:------:|
| 10      | ~1,890 ev/s | ~4 ms          | 0         | 0      |
| 100     | ~1,750 ev/s | ~44 ms         | 0         | 0      |
| 300     | ~1,127 ev/s | ~146 ms        | 0         | 0      |

Throughput saturates around ~100 concurrent writers (~1,750 push/s); past that,
throughput falls and latency rises while correctness holds (zero conflicts).
Bottleneck is the per-push locked DB transaction plus revision insert.

---

## Run template (copy me)

```
## YYYY-MM-DD — <what changed / why this run>

Commit: `<short-sha>` (branch `<branch>`)
Machine: <chip, cores, RAM, OS>
Topology: <where API / Postgres / k6 ran>
Runtimes: k6 <ver>, Node <ver>, PostgreSQL <ver>
API: <broker backend, any non-default config>

<test file> — <command / scale>
<key metrics: checks, errors, latency p95, throughput, conflicts>

Notes: <anything surprising; what the numbers imply>
```

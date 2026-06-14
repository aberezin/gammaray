# GammaRay

##Overview
Gammaray is an POC application to develop a reliable tech stack that can be coded by agents.
The engineering team is made up of Alan Berezin and various agents.



### Agent Instructions

    TODO need commit rules

## SDLC

### Test-first bug fixing

When fixing a bug, write a failing test *before* changing any production code:

1. **Reproduce.** Write a unit, integration, or functional/e2e test that
   captures the bug and **fails** for the right reason. Run it and confirm the
   failure matches the reported behavior.
2. **Fix.** Change the production code to make that test pass — and no more.
3. **Verify.** Re-run the new test (now green) and the full suite to confirm no
   regressions.

Pick the lowest level of test that reliably reproduces the bug: a unit test if
the logic is isolated, an integration test if it spans modules, a functional/e2e
test (Playwright) if it only manifests through the running app.

When a single change touches multiple distinct defects, prefer **one failing
test per defect** so each can be fixed and verified independently.

### Open: merge strategy

**Undecided:** whether pull requests should be squash-merged or merged with a
merge commit. PR #1 was merged as a merge commit, but no policy has been agreed.
Decide this and document it here (and enforce it in the repo's branch settings)
so branch history stays consistent.

### Load tests and the results log

The realtime path has k6 load tests in [`load-tests/`](./load-tests/). After a
body of work that could affect performance (sync, broker, DB, or query
changes), re-run the relevant load tests and compare against
[`load-tests/RESULTS.md`](./load-tests/RESULTS.md). If the results differ
**substantially** — a meaningful shift in throughput, latency percentiles,
connection capacity, or any new errors/conflicts — add a dated entry to
`RESULTS.md` (using its template, with commit, machine, and metrics) and update
the headline summary in `load-tests/README.md`. Keeping the log current is what
lets the next person or agent tell an intentional change from a regression.

### See Also
platform-architecture.md


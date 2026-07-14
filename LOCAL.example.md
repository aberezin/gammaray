# LOCAL.md (example / template)

Machine-specific notes for whoever (human or agent) is running this repo on a
given machine. **Copy this file to `LOCAL.md`** (which is git-ignored) and fill in
your machine's nuances. The point is to record environment quirks that aren't
obvious from the code so agents don't rediscover them painfully each session
(PATH issues, package manager, where global tools live, local service setup).

`LOCAL.md` is read by agents — `CLAUDE.md` points at it. Keep it short and
factual; record decisions, not history.

---

## Package manager / system tools

- Homebrew or MacPorts (or apt, etc.)? Where do system binaries live
  (`/opt/homebrew/bin`, `/opt/local/bin`, `/usr/local/bin`)?
- Anything installed a non-standard way?

## Node / package toolchain

- How is Node managed (nvm, fnm, Volta, pnpm-managed, system)? Which version?
- Where do **globally** installed CLIs land (e.g. `npm config get prefix`/bin),
  and is that directory on the PATH that Claude Code launches subprocesses with?

## PATH notes

- Anything Claude's tools / language servers need that is NOT on the default
  PATH, and how it's made available (e.g. exported in `~/.bashrc` / `~/.zshrc`).
- Record the agreed approach so it isn't re-litigated.

## Local services

- Docker / Postgres / etc.: how they're started and any non-default ports,
  credentials, or `docker compose` quirks.

## Anything else

- Editor/IDE specifics, credentials location, OS-version gotchas, etc.

## See also

- [DEV_SETUP.md](./DEV_SETUP.md) — the canonical setup guide (this file only records overrides from that baseline).
- [CLAUDE.md](./CLAUDE.md) `## Local machine` — the agent-facing note that points at `LOCAL.md`.
- [docs/README.md](./docs/README.md) — full documentation index.

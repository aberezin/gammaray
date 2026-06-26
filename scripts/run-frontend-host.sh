#!/usr/bin/env bash
# Run the example frontend (apps/app-one) on the HOST, talking to the
# containerized API. This is the fast Fast-Refresh iteration path (see
# DEV_SETUP.md) and an alternative to the Dockerized frontend.
#
# It exists because running the frontend on the host correctly requires a few
# non-obvious env vars + limits that are easy to forget — each one has bitten us
# and produced a confusing failure. Bake them in here so any human or agent can
# just run this.
#
# Prereqs: API + Postgres running in Docker:
#   docker compose up -d postgres api
#   # (stop the Dockerized frontend if it's up, so it doesn't hold port 3000:
#   #  docker compose stop frontend)
#
# Usage:
#   scripts/run-frontend-host.sh           # dev mode (Fast Refresh) — default
#   scripts/run-frontend-host.sh prod      # production build + start (stable, no watcher)
set -euo pipefail

cd "$(dirname "$0")/.."

MODE="${1:-dev}"

# --- Env vars (each one caused a real, confusing failure) -------------------

# Auth.js v5 refuses to serve a session unless the host is trusted; without this
# every request fails with "UntrustedHost" -> the client shows a NextAuth
# "server configuration" error and sync reports "Unauthorized". docker-compose
# sets this for the container; on the host it must be set explicitly.
export AUTH_TRUST_HOST=true

# On the host, both the browser-side calls (RxDB sync, GraphQL, register form)
# and the server-side NextAuth calls reach the API at localhost:3001 (the API
# container's published port), so one URL covers both call sites. (Inside the
# frontend *container* the server-side URL differs — see CLAUDE.md — but that
# does not apply here.)
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:3001}"
export NEXT_PUBLIC_WS_URL="${NEXT_PUBLIC_WS_URL:-ws://localhost:3001}"
export NEXTAUTH_URL="${NEXTAUTH_URL:-http://localhost:3000}"

# AUTH_SECRET is required by NextAuth. Inherit it if exported, else read the
# local dev default from apps/app-one/.env.local (git-ignored).
if [ -z "${AUTH_SECRET:-}" ] && [ -f apps/app-one/.env.local ]; then
  AUTH_SECRET="$(grep -E '^AUTH_SECRET=' apps/app-one/.env.local | head -1 | cut -d= -f2-)"
  export AUTH_SECRET
fi
if [ -z "${AUTH_SECRET:-}" ]; then
  echo "[run-frontend-host] ERROR: AUTH_SECRET is not set and apps/app-one/.env.local has none." >&2
  echo "  Set it: echo 'AUTH_SECRET=change-me-nextauth-in-production' > apps/app-one/.env.local" >&2
  exit 1
fi

# Raise the open-file limit (only ever upward). The Next/Turbopack dev watcher
# over this monorepo can exhaust the default macOS limit and spew
# "EMFILE: too many open files, watch" -> broken chunks / a blank app. This is
# especially likely right after a reboot, when macOS resets limits to defaults.
WANT_NOFILE=65536
cur="$(ulimit -n)"
[ "$cur" = "unlimited" ] && cur=1048576
if [ "$cur" -lt "$WANT_NOFILE" ]; then
  ulimit -n "$WANT_NOFILE" 2>/dev/null || true
fi

# Free a stale host listener on :3000 if present. (Colima's port forwarder shows
# up as an `ssh` listener — that's fine and is NOT killed here; we only target
# node/next processes squatting on the port.)
stale_pids="$(lsof -nP -iTCP:3000 -sTCP:LISTEN -t 2>/dev/null \
  | while read -r pid; do comm="$(ps -p "$pid" -o comm= 2>/dev/null || true)"; case "$comm" in *node*|*next*) echo "$pid";; esac; done || true)"
if [ -n "${stale_pids}" ]; then
  echo "[run-frontend-host] freeing stale node/next listener(s) on :3000: ${stale_pids}"
  echo "${stale_pids}" | xargs -r kill -9 2>/dev/null || true
  sleep 1
fi

echo "[run-frontend-host] mode=${MODE}  API=${NEXT_PUBLIC_API_URL}  AUTH_TRUST_HOST=${AUTH_TRUST_HOST}  ulimit -n=$(ulimit -n)"

if [ "${MODE}" = "prod" ]; then
  pnpm --filter @gammaray/app-one build
  exec pnpm --filter @gammaray/app-one start
elif [ "${MODE}" = "dev" ]; then
  exec pnpm --filter @gammaray/app-one dev
else
  echo "[run-frontend-host] ERROR: unknown mode '${MODE}' (expected 'dev' or 'prod')" >&2
  exit 1
fi

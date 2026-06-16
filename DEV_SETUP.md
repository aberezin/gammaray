# Development Setup & Testing Guide

This guide explains how to run the NoteSync app and test it in Chrome.

## Quick Start

### Option 1: Full stack in Docker (Recommended)

```bash
docker compose up -d
```

**Result:**
- Frontend: http://localhost:3000 (containerized, accessible to Chrome)
- API: http://localhost:3001 (containerized)
- Postgres: localhost:5432 (containerized)
- Full integration works end-to-end, including auth

Open http://localhost:3000 in Chrome and sign up — everything (auth, RxDB sync,
conflicts, offline mode) works with all three services in containers. Colima
forwards both published ports (3000 and 3001) to the host; there is no
networking limitation here.

If `localhost:3000` ever appears to hang, it is almost always a **stale host
process squatting on the port** (e.g. a previous `pnpm dev` you didn't stop),
not Colima — see Troubleshooting below.

### Option 2: Frontend on the host + Backend in Docker (fast UI iteration)

Useful when you want Next.js Fast Refresh without rebuilding the container.

```bash
# Terminal 1: backend only
docker compose up -d postgres api

# Terminal 2: frontend on the host
pnpm install            # one-time
pnpm --filter @gammaray/app-one dev
```

Here the frontend runs on the host, so both its browser-side and server-side
calls reach the API at `localhost:3001` (the published API port). You do **not**
set `API_INTERNAL_URL` in this mode.

## Parallel instances (isolated stacks for concurrent work/testing)

You can run several complete stacks side by side, each with its own containers,
its own Postgres volume (so they never share data), and a non-conflicting set of
host ports. Use the helper:

```bash
scripts/instance.sh 1 up -d     # frontend :3000  api :3001  postgres :5432
scripts/instance.sh 2 up -d     # frontend :3010  api :3011  postgres :5442
scripts/instance.sh 3 up -d     # frontend :3020  api :3021  postgres :5452

open http://localhost:3000      # instance 1 in Chrome
open http://localhost:3010      # instance 2 in Chrome

scripts/instance.sh 2 down -v   # stop instance 2 and drop its DB volume
```

Ports for instance N are `base + (N-1)*10` (frontend 3000, api 3001, db 5432).
Each instance is a separate compose project (`gammaray-N`), so containers,
networks, and volumes are isolated — verified: a user registered against
instance 1's API does not exist in instance 2.

Under the hood the helper just sets `PORT` / `API_PORT` / `DB_PORT` and a `-p`
project name, so the equivalent raw command is:

```bash
PORT=3010 API_PORT=3011 DB_PORT=5442 docker compose -p gammaray-2 up -d
```

The frontend's browser-side `NEXT_PUBLIC_API_URL` and the API's CORS origin are
derived from these ports, so each instance's browser talks to **its own** API.

## How the frontend reaches the API (important)

The frontend talks to the API from **two different places**, and they need
different URLs when the frontend is containerized:

| Caller | Runs in | Uses | Value |
|--------|---------|------|-------|
| RxDB sync, GraphQL, register form | the **browser** (on your Mac) | `NEXT_PUBLIC_API_URL` | `http://localhost:3001` |
| NextAuth `authorize`/refresh (`src/auth.ts`) | the **Next.js server** (the frontend container) | `API_INTERNAL_URL` | `http://api:3001` |

Inside the frontend container, `localhost:3001` is the *frontend itself*, not the
API — so server-side auth must use the compose service name `api:3001`. This is
wired up in `docker-compose.yml` (frontend `environment`). Getting this wrong
manifests as **"Invalid email or password" on every login** even with correct
credentials, because the server-side credential check can't reach the API.

## Testing Workflow

### 1. Start the stack
```bash
docker compose up -d
```

### 2. Test in Chrome
- Open http://localhost:3000
- Sign up or log in
- Full NoteSync functionality works (auth, sync, conflicts, offline mode)

### 3. Run the e2e suite
```bash
pnpm --filter @gammaray/app-one test:e2e
```

### 4. Check the API directly (optional)
```bash
curl -s http://localhost:3001/graphql -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __typename }"}'
```

## Database Management

### Reset the database
```bash
docker compose down -v  # Remove containers and volumes
docker compose up -d    # Start fresh
```

### Access Postgres directly
```bash
docker exec -it gammaray-postgres-1 psql -U gammaray -d gammaray
```

## Stopping the App

```bash
# Stop all containers
docker compose down

# Or just stop containers (keep volumes for next run)
docker compose stop
```

## Troubleshooting

**"Connection refused" at localhost:3001**
- Ensure `docker compose up -d` is running
- Check `docker ps` to verify API container is running
- Review logs: `docker logs gammaray-api-1`

**"Invalid email or password" on every login (full-Docker mode)**
- The server-side auth check can't reach the API. Confirm the frontend container
  has `API_INTERNAL_URL=http://api:3001`:
  `docker exec gammaray-frontend-1 sh -c 'echo $API_INTERNAL_URL'`
- Verify from inside the container: `docker exec gammaray-frontend-1 wget -qO- http://api:3001/graphql --post-data='{"query":"{__typename}"}' --header='Content-Type: application/json'`

**Browser can't reach API (sync/GraphQL errors in console)**
- Verify `NEXT_PUBLIC_API_URL=http://localhost:3001` (browser-side)
- Ensure the API is published and up: `curl http://localhost:3001/graphql`

**`localhost:3000` hangs from Chrome/curl**
- Almost always a **stale host process** holding port 3000, not Colima. Check:
  `lsof -nP -i :3000` — if you see a `node`/`next-server` process (not `ssh`,
  which is Colima's forwarder), kill it: `lsof -ti :3000 | xargs kill`
- Then `docker compose up -d` (or restart your local `pnpm dev`). Colima forwards
  both 3000 and 3001 to the host normally once the port is free.

**Data integrity errors ("missing reference...")**
- Database may have stale data
- Reset: `docker compose down -v && docker compose up -d`

## Architecture Notes

- **RxDB** (IndexedDB in browser) syncs with the API via GraphQL mutations
- **Offline-first**: Changes are applied locally first, then synced to the server
- **Conflict resolution**: If two clients edit simultaneously, conflicts are detected and the user can merge
- **WebSocket subscriptions**: Real-time updates when other clients modify notes

See `CLAUDE.md` for more architecture details.

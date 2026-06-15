# Development Setup & Testing Guide

This guide explains how to run the NoteSync app locally and test it in Chrome.

## Quick Start

### Option 1: Frontend local + Backend containerized (Recommended for Chrome testing)

```bash
# Terminal 1: Start backend services (API + Postgres in Docker)
docker compose up -d

# Wait ~10 seconds for API to be ready, then in Terminal 2:
pnpm install  # One-time setup
pnpm --filter @gammaray/app-one dev
```

**Result:**
- Frontend: http://localhost:3000 (running locally, accessible to Chrome)
- API: http://localhost:3001 (containerized, accessible from frontend)
- Postgres: localhost:5432 (containerized)
- Frontend is pre-configured to reach API at `localhost:3001`
- Full integration works end-to-end

### Option 2: Full stack in Docker (No Chrome access to frontend)

```bash
docker compose up
```

**Result:**
- All services run in containers
- Frontend can reach API for integration testing
- But localhost:3000 hangs when accessed from Chrome (Colima networking limitation)
- Use `docker logs gammaray-frontend-1` to debug frontend issues

## Important: Frontend Container Occupies Port 3000

When you run `docker compose up`, it starts the frontend container which **binds to port 3000** on the Colima VM. Even though Chrome can't reach it (port forwarding hangs), the port is consumed.

**If you want to run the frontend locally:**

```bash
# Stop the containerized frontend
docker stop gammaray-frontend-1

# Now run the frontend locally
pnpm --filter @gammaray/app-one dev
```

This frees up port 3000 on the VM so the local process can bind to it through Colima's port forwarding.

## Why Port 3000 Hangs But Port 3001 Works

**Colima port forwarding behavior:**
- **Port 3001 (API):** ✅ Works from host (IPv6 binding)
- **Port 3000 (Frontend):** ❌ Hangs from host (IPv4 binding)

The frontend container listens on `0.0.0.0:3000` (IPv4), which doesn't forward properly through Colima to the host. The API container listens on `::3001` (IPv6), which works differently through the port forwarding layer.

**Key insight:** The frontend IS consuming the port and CAN bind to it—you can verify this by checking that `docker logs` show Next.js running. The hang is a Colima networking limitation, not a binding issue.

## Testing Workflow

### 1. Start the backend
```bash
docker compose up -d
```

### 2. Run frontend locally
```bash
pnpm --filter @gammaray/app-one dev
```

### 3. Test in Chrome
- Open http://localhost:3000
- Sign up or log in
- The frontend will automatically connect to the API at http://localhost:3001
- Full NoteSync functionality works (sync, conflicts, offline mode, etc.)

### 4. Check API directly (optional)
```bash
# GraphQL query
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

**Frontend can't reach API**
- Verify `.env` has `NEXT_PUBLIC_API_URL=http://localhost:3001`
- Check browser console for CORS or network errors
- Ensure API is running: `curl http://localhost:3001/graphql`

**Port 3000 already in use**
- Stop the frontend container: `docker stop gammaray-frontend-1`
- Or find what's using it: `lsof -i :3000`

**Data integrity errors ("missing reference...")**
- Database may have stale data
- Reset: `docker compose down -v && docker compose up -d`

## Architecture Notes

- **RxDB** (IndexedDB in browser) syncs with the API via GraphQL mutations
- **Offline-first**: Changes are applied locally first, then synced to the server
- **Conflict resolution**: If two clients edit simultaneously, conflicts are detected and the user can merge
- **WebSocket subscriptions**: Real-time updates when other clients modify notes

See `CLAUDE.md` for more architecture details.

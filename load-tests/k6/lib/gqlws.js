// Shared helpers for the k6 load tests: REST auth, the GraphQL pushNote
// mutation, and a full graphql-ws subscription client lifecycle on one socket.
//
// Custom metrics are created here (once at init) and referenced by name in each
// test's `thresholds`.

import ws from 'k6/ws'
import http from 'k6/http'
import { check } from 'k6'
import { Counter, Trend, Rate } from 'k6/metrics'

export const API_URL = __ENV.API_URL || 'http://localhost:3001'
export const WS_URL = __ENV.WS_URL || 'ws://localhost:3001'
export const GRAPHQL_WS_PROTOCOL = 'graphql-transport-ws'

export const metrics = {
  ackTime: new Trend('gqlws_ack_time', true), // init -> connection_ack
  eventTime: new Trend('gqlws_event_time', true), // push -> event received
  eventsReceived: new Counter('gqlws_events_received'),
  sessionErrors: new Counter('gqlws_session_errors'),
  connectionsOpened: new Counter('gqlws_connections_opened'), // reached connection_ack
  connectionsClosed: new Counter('gqlws_connections_closed'), // socket closed
  pushConflicts: new Counter('gqlws_push_conflicts'), // pushNote returned conflict
  conflictRate: new Rate('push_conflict_rate'), // fraction of pushes that conflicted
  resolveTime: new Trend('conflict_resolve_time', true), // resolveConflict latency
}

// Register a fresh user. `label` makes the email unique across clients/runs.
export function register(label) {
  const email = `loadtest-${label}@example.com`
  const password = 'password123'
  const res = http.post(
    `${API_URL}/auth/register`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' } },
  )
  return { token: res.json('accessToken'), status: res.status, email }
}

export function pushNote(token, content, expectedVersion, clientId) {
  const query = `
    mutation PushNote($content: String!, $expectedVersion: Int!, $clientId: String!) {
      pushNote(content: $content, expectedVersion: $expectedVersion, clientId: $clientId) {
        conflict
        serverVersion
        note { id version }
      }
    }`
  return http.post(
    `${API_URL}/graphql`,
    JSON.stringify({
      query,
      variables: { content, expectedVersion, clientId },
    }),
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } },
  )
}

// Current server version of the user's note (0 if not yet created). Used to seed
// a pusher's expectedVersion so its first push doesn't spuriously conflict.
export function getNoteVersion(token) {
  const res = http.post(
    `${API_URL}/graphql`,
    JSON.stringify({ query: `query { note { version } }` }),
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } },
  )
  try {
    const v = res.json('data.note.version')
    return typeof v === 'number' ? v : 0
  } catch (_e) {
    return 0
  }
}

// The user's note id and current version (creates the note if needed). The
// conflict-storm test needs the id to call resolveConflict.
export function getNote(token) {
  const res = http.post(
    `${API_URL}/graphql`,
    JSON.stringify({ query: `query { note { id version } }` }),
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } },
  )
  try {
    const n = res.json('data.note')
    return { id: n.id, version: typeof n.version === 'number' ? n.version : 0 }
  } catch (_e) {
    return { id: null, version: 0 }
  }
}

// Resolve a detected conflict. resolveConflict is unconditional server-side
// (row lock, version bump), so it serializes writers rather than rejecting them.
export function resolveConflict(token, noteId, resolvedContent, clientId) {
  const query = `
    mutation ResolveConflict($noteId: String!, $resolvedContent: String!, $clientId: String!) {
      resolveConflict(noteId: $noteId, resolvedContent: $resolvedContent, clientId: $clientId) {
        id
        version
      }
    }`
  return http.post(
    `${API_URL}/graphql`,
    JSON.stringify({ query, variables: { noteId, resolvedContent, clientId } }),
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } },
  )
}

// Run one full subscription client on a single socket:
//   connection_init (auth) -> connection_ack -> subscribe -> push -> receive.
// Returns { wsStatus, acked, gotEvent }. Records ack/event latency and errors.
export function runSubscriptionClient({ token, clientId, expectedVersion = 0, socketTimeoutMs = 15000 }) {
  const subscription = `subscription { noteUpdated { id content version updatedAt } }`
  const result = { wsStatus: 0, acked: false, gotEvent: false }
  let initSentAt = 0
  let pushSentAt = 0

  const res = ws.connect(
    `${WS_URL}/graphql`,
    { headers: { 'Sec-WebSocket-Protocol': GRAPHQL_WS_PROTOCOL } },
    function (socket) {
      socket.on('open', () => {
        initSentAt = Date.now()
        socket.send(
          JSON.stringify({
            type: 'connection_init',
            payload: { Authorization: `Bearer ${token}` },
          }),
        )
      })

      socket.on('message', (raw) => {
        let msg
        try {
          msg = JSON.parse(raw)
        } catch (_e) {
          metrics.sessionErrors.add(1)
          return
        }

        switch (msg.type) {
          case 'connection_ack': {
            result.acked = true
            metrics.ackTime.add(Date.now() - initSentAt)
            socket.send(
              JSON.stringify({ id: '1', type: 'subscribe', payload: { query: subscription } }),
            )
            // Give the server a moment to register the subscription, then push a
            // note so the broker emits an event back to this socket.
            socket.setTimeout(() => {
              pushSentAt = Date.now()
              const pushRes = pushNote(token, `hello from ${clientId} @ ${pushSentAt}`, expectedVersion, clientId)
              check(pushRes, {
                'pushNote accepted': (r) => r.status === 200,
                'pushNote no conflict': (r) => r.json('data.pushNote.conflict') === false,
              })
            }, 500)
            break
          }
          case 'next': {
            if (msg.id === '1' && msg.payload && msg.payload.data) {
              result.gotEvent = true
              metrics.eventsReceived.add(1)
              if (pushSentAt) metrics.eventTime.add(Date.now() - pushSentAt)
              socket.send(JSON.stringify({ id: '1', type: 'complete' }))
              socket.close()
            }
            break
          }
          case 'ping': {
            socket.send(JSON.stringify({ type: 'pong' }))
            break
          }
          case 'error':
          case 'connection_error': {
            metrics.sessionErrors.add(1)
            socket.close()
            break
          }
          default:
            break
        }
      })

      socket.on('error', (e) => {
        if (e && e.error && !String(e.error()).includes('close')) {
          metrics.sessionErrors.add(1)
        }
      })

      // Safety net so a stuck socket never hangs the run.
      socket.setTimeout(() => socket.close(), socketTimeoutMs)
    },
  )

  result.wsStatus = res && res.status
  return result
}

// Open a subscription and hold it OPEN and idle for `holdMs`, replying to pings,
// then close cleanly. Used by the connection-ramp test to measure how many
// concurrent subscriptions the server sustains. Returns { wsStatus, acked }.
// Genuine protocol/auth failures are recorded as session errors; transport-level
// socket errors (e.g. teardown at end of test) are intentionally not, so failed
// upgrades surface via wsStatus/checks rather than as false error counts.
export function holdSubscriptionOpen({ token, clientId, holdMs = 10000 }) {
  const subscription = `subscription { noteUpdated { id content version updatedAt } }`
  const result = { wsStatus: 0, acked: false }
  let initSentAt = 0

  const res = ws.connect(
    `${WS_URL}/graphql`,
    { headers: { 'Sec-WebSocket-Protocol': GRAPHQL_WS_PROTOCOL } },
    function (socket) {
      socket.on('open', () => {
        initSentAt = Date.now()
        socket.send(
          JSON.stringify({
            type: 'connection_init',
            payload: { Authorization: `Bearer ${token}` },
          }),
        )
      })

      socket.on('message', (raw) => {
        let msg
        try {
          msg = JSON.parse(raw)
        } catch (_e) {
          metrics.sessionErrors.add(1)
          return
        }

        switch (msg.type) {
          case 'connection_ack':
            result.acked = true
            metrics.ackTime.add(Date.now() - initSentAt)
            metrics.connectionsOpened.add(1)
            socket.send(
              JSON.stringify({ id: '1', type: 'subscribe', payload: { query: subscription } }),
            )
            break
          case 'ping':
            socket.send(JSON.stringify({ type: 'pong' }))
            break
          case 'error':
          case 'connection_error':
            metrics.sessionErrors.add(1)
            socket.close()
            break
          default:
            break
        }
      })

      socket.on('close', () => {
        metrics.connectionsClosed.add(1)
      })

      // Stay connected and idle, then close cleanly so checks are recorded and
      // teardown doesn't masquerade as an error.
      socket.setTimeout(() => {
        socket.send(JSON.stringify({ id: '1', type: 'complete' }))
        socket.close()
      }, holdMs)
    },
  )

  result.wsStatus = res && res.status
  return result
}

// Drive a sustained push→event round-trip loop on one socket for `durationMs`.
// The client subscribes, then repeatedly pushes to its OWN note and waits for
// the resulting subscription event before pushing again (one in-flight write per
// note). Because each note has a single logical writer, this stays conflict-free
// — aggregate push throughput is scaled by running many of these clients
// concurrently (see push-throughput.js). End-to-end latency is measured from the
// moment a push is issued to the moment its event arrives on the socket.
//
// Returns { wsStatus, acked, pushes, events }.
export function runPushLoopClient({ token, clientId, durationMs = 20000 }) {
  const subscription = `subscription { noteUpdated { id content version updatedAt } }`
  const result = { wsStatus: 0, acked: false, pushes: 0, events: 0 }
  // Seed expectedVersion from the server so the first push doesn't conflict.
  let version = getNoteVersion(token)
  let initSentAt = 0
  let sentAt = 0
  let awaitingEvent = false
  const startWall = Date.now()

  const res = ws.connect(
    `${WS_URL}/graphql`,
    { headers: { 'Sec-WebSocket-Protocol': GRAPHQL_WS_PROTOCOL } },
    function (socket) {
      function pushOnce() {
        if (Date.now() - startWall >= durationMs) {
          socket.send(JSON.stringify({ id: '1', type: 'complete' }))
          socket.close()
          return
        }
        sentAt = Date.now()
        const r = pushNote(token, `tp ${clientId} @${sentAt}`, version, clientId)
        result.pushes++
        let pn
        try {
          pn = r.json('data.pushNote')
        } catch (_e) {
          metrics.sessionErrors.add(1)
          socket.setTimeout(pushOnce, 50)
          return
        }
        if (!pn) {
          metrics.sessionErrors.add(1)
          socket.setTimeout(pushOnce, 50)
          return
        }
        if (pn.conflict) {
          // Shouldn't happen (single writer) — resync and retry without waiting.
          metrics.pushConflicts.add(1)
          version = typeof pn.serverVersion === 'number' ? pn.serverVersion : version + 1
          pushOnce()
          return
        }
        version = pn.note.version
        awaitingEvent = true // the matching event will drive the next push
      }

      socket.on('open', () => {
        initSentAt = Date.now()
        socket.send(
          JSON.stringify({
            type: 'connection_init',
            payload: { Authorization: `Bearer ${token}` },
          }),
        )
      })

      socket.on('message', (raw) => {
        let msg
        try {
          msg = JSON.parse(raw)
        } catch (_e) {
          metrics.sessionErrors.add(1)
          return
        }

        switch (msg.type) {
          case 'connection_ack':
            result.acked = true
            metrics.ackTime.add(Date.now() - initSentAt)
            metrics.connectionsOpened.add(1)
            socket.send(
              JSON.stringify({ id: '1', type: 'subscribe', payload: { query: subscription } }),
            )
            pushOnce() // start the loop
            break
          case 'next':
            if (awaitingEvent && msg.id === '1') {
              awaitingEvent = false
              metrics.eventTime.add(Date.now() - sentAt)
              metrics.eventsReceived.add(1)
              result.events++
              pushOnce() // immediately issue the next push
            }
            break
          case 'ping':
            socket.send(JSON.stringify({ type: 'pong' }))
            break
          case 'error':
          case 'connection_error':
            metrics.sessionErrors.add(1)
            socket.close()
            break
          default:
            break
        }
      })

      socket.on('close', () => {
        metrics.connectionsClosed.add(1)
      })

      // Safety net so a lost event can't hang the client past its window.
      socket.setTimeout(() => socket.close(), durationMs + 5000)
    },
  )

  result.wsStatus = res && res.status
  return result
}

// Hammer ONE shared note for `durationMs` to deliberately produce write
// conflicts (the inverse of runPushLoopClient). The client pushes with its
// locally-tracked version; when another writer got there first the server
// returns a conflict, which the client (optionally) resolves via resolveConflict
// before continuing. HTTP-only — the contention lives in pushNote/resolveConflict,
// so no subscription is opened. Records conflict rate and resolution latency.
//
// Returns { pushes, successes, conflicts, resolves }.
export function runConflictStormClient({ token, noteId, clientId, durationMs = 15000, resolve = true }) {
  const result = { pushes: 0, successes: 0, conflicts: 0, resolves: 0 }
  let version = getNoteVersion(token)
  const startWall = Date.now()

  while (Date.now() - startWall < durationMs) {
    const content = `storm ${clientId} @${Date.now()}`
    const r = pushNote(token, content, version, clientId)
    result.pushes++

    let pn
    try {
      pn = r.json('data.pushNote')
    } catch (_e) {
      metrics.sessionErrors.add(1)
      continue
    }
    if (!pn) {
      metrics.sessionErrors.add(1)
      continue
    }

    if (pn.conflict) {
      result.conflicts++
      metrics.pushConflicts.add(1)
      metrics.conflictRate.add(true)
      version = typeof pn.serverVersion === 'number' ? pn.serverVersion : version

      if (resolve) {
        const t0 = Date.now()
        const rr = resolveConflict(token, noteId, content, clientId)
        let rn
        try {
          rn = rr.json('data.resolveConflict')
        } catch (_e) {
          metrics.sessionErrors.add(1)
          continue
        }
        if (rn && typeof rn.version === 'number') {
          metrics.resolveTime.add(Date.now() - t0)
          result.resolves++
          version = rn.version
        } else {
          metrics.sessionErrors.add(1)
        }
      }
    } else if (pn.note) {
      result.successes++
      metrics.conflictRate.add(false)
      version = pn.note.version
    }
  }

  return result
}

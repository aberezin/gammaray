// Shared helpers for the k6 load tests: REST auth, the GraphQL pushNote
// mutation, and a full graphql-ws subscription client lifecycle on one socket.
//
// Custom metrics are created here (once at init) and referenced by name in each
// test's `thresholds`.

import ws from 'k6/ws'
import http from 'k6/http'
import { check } from 'k6'
import { Counter, Trend } from 'k6/metrics'

export const API_URL = __ENV.API_URL || 'http://localhost:3001'
export const WS_URL = __ENV.WS_URL || 'ws://localhost:3001'
export const GRAPHQL_WS_PROTOCOL = 'graphql-transport-ws'

export const metrics = {
  ackTime: new Trend('gqlws_ack_time', true), // init -> connection_ack
  eventTime: new Trend('gqlws_event_time', true), // push -> event received
  eventsReceived: new Counter('gqlws_events_received'),
  sessionErrors: new Counter('gqlws_session_errors'),
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

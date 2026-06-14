// Load test #1 — a single WebSocket subscription connection.
//
// Validates the end-to-end realtime path under k6:
//   1. Register a user over REST and obtain a JWT.
//   2. Open ONE graphql-ws WebSocket and authenticate via connectionParams.
//   3. Subscribe to `noteUpdated`.
//   4. Trigger a `pushNote` mutation over HTTP to generate an event.
//   5. Confirm the subscription delivers that event back over the socket.
//
// This is intentionally minimal (1 VU, 1 iteration). It is the baseline the
// ramping/throughput tests will build on — see load-tests/README.md.
//
// Run:  k6 run load-tests/k6/single-socket.js
//       API_URL=http://localhost:3001 WS_URL=ws://localhost:3001 k6 run ...

import ws from 'k6/ws'
import http from 'k6/http'
import { check } from 'k6'
import { Counter, Trend } from 'k6/metrics'

const API_URL = __ENV.API_URL || 'http://localhost:3001'
const WS_URL = __ENV.WS_URL || 'ws://localhost:3001'
const GRAPHQL_WS_PROTOCOL = 'graphql-transport-ws'

// Custom metrics so the realtime path is visible in the summary.
const ackTime = new Trend('gqlws_ack_time', true) // init -> connection_ack
const eventTime = new Trend('gqlws_event_time', true) // push -> event received
const eventsReceived = new Counter('gqlws_events_received')
const sessionErrors = new Counter('gqlws_session_errors')

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    checks: ['rate==1.0'], // every check must pass
    gqlws_session_errors: ['count==0'], // no protocol/auth errors
    gqlws_events_received: ['count>=1'], // the subscription delivered the event
    ws_connecting: ['p(95)<1000'], // socket upgrade is reasonably fast
  },
}

// Register a fresh user and return its access token. Runs once before the test.
export function setup() {
  const email = `loadtest-${Date.now()}@example.com`
  const password = 'password123'
  const res = http.post(
    `${API_URL}/auth/register`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' } },
  )
  check(res, {
    'registered user': (r) => r.status === 200 || r.status === 201,
    'received accessToken': (r) => !!r.json('accessToken'),
  })
  return { token: res.json('accessToken') }
}

function pushNote(token, content, expectedVersion) {
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
      variables: { content, expectedVersion, clientId: 'k6-single-socket' },
    }),
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } },
  )
}

export default function (data) {
  const token = data.token
  const subscription = `subscription { noteUpdated { id content version updatedAt } }`

  let initSentAt = 0
  let pushSentAt = 0
  let acked = false
  let gotEvent = false

  const res = ws.connect(
    `${WS_URL}/graphql`,
    { headers: { 'Sec-WebSocket-Protocol': GRAPHQL_WS_PROTOCOL } },
    function (socket) {
      socket.on('open', () => {
        // graphql-ws handshake: carry the JWT in connectionParams, exactly like
        // the app's client does.
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
          sessionErrors.add(1)
          return
        }

        switch (msg.type) {
          case 'connection_ack': {
            acked = true
            ackTime.add(Date.now() - initSentAt)
            // Start the subscription.
            socket.send(
              JSON.stringify({
                id: '1',
                type: 'subscribe',
                payload: { query: subscription },
              }),
            )
            // Give the server a moment to register the subscription, then push
            // a note over HTTP so the broker emits an event to this socket.
            socket.setTimeout(() => {
              pushSentAt = Date.now()
              const pushRes = pushNote(token, `hello from k6 @ ${pushSentAt}`, 0)
              check(pushRes, {
                'pushNote accepted': (r) => r.status === 200,
                'pushNote no conflict': (r) =>
                  r.json('data.pushNote.conflict') === false,
              })
            }, 500)
            break
          }
          case 'next': {
            if (msg.id === '1' && msg.payload && msg.payload.data) {
              gotEvent = true
              eventsReceived.add(1)
              if (pushSentAt) eventTime.add(Date.now() - pushSentAt)
              // Got what we came for — tear down cleanly.
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
            sessionErrors.add(1)
            socket.close()
            break
          }
          default:
            break
        }
      })

      socket.on('error', (e) => {
        // k6 reports a close as an error in some versions; ignore normal closes.
        if (e && e.error && !String(e.error()).includes('close')) {
          sessionErrors.add(1)
        }
      })

      // Safety net: never let a stuck socket hang the test.
      socket.setTimeout(() => socket.close(), 10000)
    },
  )

  check(res, { 'ws upgrade (101)': (r) => r && r.status === 101 })
  check(null, {
    'connection acknowledged': () => acked,
    'subscription event received': () => gotEvent,
  })
}

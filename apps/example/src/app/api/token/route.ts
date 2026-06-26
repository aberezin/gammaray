import { auth } from '@/auth'
import { NextResponse } from 'next/server'

// Returns the current access token. Calling auth() runs the Auth.js jwt
// callback, which transparently refreshes the token when it is near expiry — so
// a long-lived client polling this endpoint always gets a fresh token without a
// page reload. `error` is set when refresh has failed (session is auth-fatal).
export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  if (session.error) {
    return NextResponse.json({ error: session.error }, { status: 401 })
  }
  return NextResponse.json({ accessToken: session.accessToken })
}

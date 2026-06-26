import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'

// Server-side base URL for the API. This module is the NextAuth config and runs
// only on the server (in the Next.js process), so it must reach the API the way
// the *server* sees it. Inside Docker that is the compose service name
// (http://api:3001) — `localhost` in the frontend container is the frontend
// itself, not the API. Browser-side code (graphql-client, login page) uses
// NEXT_PUBLIC_API_URL instead, which is localhost:3001 from the host's view.
// Local dev (frontend on the host) leaves API_INTERNAL_URL unset and falls back
// to localhost, which is correct there.
const API_URL =
  process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

// Decode a JWT's `exp` (seconds) into epoch millis; 0 if unreadable.
function expiryMs(token: string): number {
  try {
    const [, payload] = token.split('.')
    const { exp } = JSON.parse(Buffer.from(payload, 'base64').toString()) as { exp?: number }
    return exp ? exp * 1000 : 0
  } catch {
    return 0
  }
}

// Exchange the refresh token for a fresh pair. Throws on failure so the jwt
// callback can stamp the session with an error the client treats as auth-fatal.
async function refresh(refreshToken: string) {
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
  if (!res.ok) throw new Error('refresh failed')
  return (await res.json()) as { accessToken: string; refreshToken: string }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const res = await fetch(`${API_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(credentials),
        })
        if (!res.ok) return null
        const { accessToken, refreshToken } = (await res.json()) as {
          accessToken: string
          refreshToken: string
        }

        // Decode payload (no verification — NestJS already validated)
        const [, payload] = accessToken.split('.')
        const { sub, email } = JSON.parse(Buffer.from(payload, 'base64').toString()) as {
          sub: string
          email: string
        }
        return { id: sub, email, accessToken, refreshToken }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Initial sign-in.
      if (user) {
        const u = user as { accessToken: string; refreshToken: string; id: string }
        token.accessToken = u.accessToken
        token.refreshToken = u.refreshToken
        token.accessTokenExpires = expiryMs(u.accessToken)
        token.userId = u.id
        delete token.error
        return token
      }

      // Still valid (≥60s headroom) — reuse.
      const expires = (token.accessTokenExpires as number) ?? 0
      if (Date.now() < expires - 60_000) return token

      // Expired/expiring — rotate via the refresh token.
      try {
        const next = await refresh(token.refreshToken as string)
        token.accessToken = next.accessToken
        token.refreshToken = next.refreshToken
        token.accessTokenExpires = expiryMs(next.accessToken)
        delete token.error
      } catch {
        token.error = 'RefreshError'
      }
      return token
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string
      session.userId = token.userId as string
      session.error = token.error as string | undefined
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
})

declare module 'next-auth' {
  interface Session {
    accessToken: string
    userId: string
    error?: string
  }
}

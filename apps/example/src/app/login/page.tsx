'use client'

import React, { useState, FormEvent } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const router = useRouter()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      if (mode === 'register') {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
        let res: Response
        try {
          res = await fetch(`${apiUrl}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          })
        } catch {
          // fetch rejects on network/CORS/DNS failure — otherwise silent
          setError(`Could not reach the API at ${apiUrl}. Check your connection.`)
          return
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({} as { message?: string }))
          setError(body.message ?? `Registration failed (HTTP ${res.status})`)
          return
        }
      }

      const result = await signIn('credentials', { email, password, redirect: false })
      if (result?.error) {
        setError(mode === 'register' ? 'Registered, but sign-in failed. Try logging in.' : 'Invalid email or password')
      } else {
        router.push('/')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <form onSubmit={handleSubmit} style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24, textAlign: 'center' }}>Rolodex</h1>
        <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid #d1d5db' }}>
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              style={{
                flex: 1,
                padding: '8px 0',
                border: 'none',
                cursor: 'pointer',
                background: mode === m ? '#3b82f6' : '#fff',
                color: mode === m ? '#fff' : '#374151',
                fontWeight: 500,
                textTransform: 'capitalize',
              }}
            >
              {m}
            </button>
          ))}
        </div>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="Password (min 8 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          style={inputStyle}
        />
        {error && <p style={{ color: '#ef4444', margin: 0, fontSize: 13 }}>{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: 10,
            background: submitting ? '#93c5fd' : '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: submitting ? 'wait' : 'pointer',
            fontWeight: 600,
          }}
        >
          {submitting
            ? mode === 'login' ? 'Signing in…' : 'Creating account…'
            : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: 14,
  outline: 'none',
}

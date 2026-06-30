'use client'

import { signOut } from 'next-auth/react'

// App chrome: sign out, available on every authenticated page. Previously this
// lived on the (now retired) note page; it belongs in the shared layout so it's
// present on the descriptor-driven pages too.
export function SignOutButton() {
  return (
    <button
      onClick={() => signOut()}
      style={{
        fontSize: 13, padding: '6px 12px', background: '#6b7280', color: '#fff',
        border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500,
      }}
    >
      Sign out
    </button>
  )
}

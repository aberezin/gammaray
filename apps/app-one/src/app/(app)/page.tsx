import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { NotePageClient } from '@/components/NotePageClient'

export default async function NotePage() {
  const session = await auth()
  // The (app) layout also guards, but layouts and pages render in parallel in the
  // App Router, so this page can evaluate before the layout's redirect takes effect.
  // Guard here too to avoid dereferencing a null session.
  if (!session) redirect('/login')
  return <NotePageClient accessToken={session.accessToken} />
}

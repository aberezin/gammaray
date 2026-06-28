import { auth } from '@/auth'
import { redirect } from 'next/navigation'

// Crate has no single landing record (unlike notesync's note) — the albums
// catalog is home.
export default async function HomePage() {
  const session = await auth()
  if (!session) redirect('/login')
  redirect('/albums')
}

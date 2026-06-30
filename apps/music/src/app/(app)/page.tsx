import { auth } from '@/auth'
import { redirect } from 'next/navigation'

// Crate opens on the albums catalog (like Rolodex opens on contacts).
export default async function HomePage() {
  const session = await auth()
  if (!session) redirect('/login')
  redirect('/albums')
}

import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { PlaylistsPageClient } from '@/components/PlaylistsPageClient'

export default async function PlaylistsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return <PlaylistsPageClient accessToken={session.accessToken} />
}

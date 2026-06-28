import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { ArtistsPageClient } from '@/components/ArtistsPageClient'

export default async function ArtistsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return <ArtistsPageClient accessToken={session.accessToken} />
}

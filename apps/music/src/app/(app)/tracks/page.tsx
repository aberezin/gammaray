import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { TracksPageClient } from '@/components/TracksPageClient'

export default async function TracksPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return <TracksPageClient accessToken={session.accessToken} />
}

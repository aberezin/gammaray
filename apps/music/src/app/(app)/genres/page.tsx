import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { GenresPageClient } from '@/components/GenresPageClient'

export default async function GenresPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return <GenresPageClient accessToken={session.accessToken} />
}

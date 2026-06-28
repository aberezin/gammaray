import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { AlbumsPageClient } from '@/components/AlbumsPageClient'

export default async function AlbumsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return <AlbumsPageClient accessToken={session.accessToken} />
}

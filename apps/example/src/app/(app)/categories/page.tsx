import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { CategoriesPageClient } from '@/components/CategoriesPageClient'

export default async function CategoriesPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return <CategoriesPageClient accessToken={session.accessToken} />
}

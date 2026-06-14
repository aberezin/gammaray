import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { ContactsPageClient } from '@/components/ContactsPageClient'

export default async function ContactsPage() {
  const session = await auth()
  if (!session) redirect('/login')
  return <ContactsPageClient accessToken={session.accessToken} />
}

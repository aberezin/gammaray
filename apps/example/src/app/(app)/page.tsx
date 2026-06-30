import { auth } from '@/auth'
import { redirect } from 'next/navigation'

// The example app's home. The original single-note feature was retired (it
// predated the generic type-A engine); the app now opens on the contact list,
// the first descriptor-driven page.
export default async function HomePage() {
  const session = await auth()
  if (!session) redirect('/login')
  redirect('/contacts')
}

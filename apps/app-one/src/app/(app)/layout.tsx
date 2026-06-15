import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { SyncHealthBanner } from '@/components/SyncHealthBanner'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')
  return (
    <>
      <SyncHealthBanner />
      {children}
    </>
  )
}

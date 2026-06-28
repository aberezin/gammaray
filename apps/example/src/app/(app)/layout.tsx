import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { SyncHealthBanner } from '@/lib/app-client'
import { DataEpochGuard } from '@/lib/app-client'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')
  return (
    <>
      <DataEpochGuard />
      <SyncHealthBanner />
      {children}
    </>
  )
}

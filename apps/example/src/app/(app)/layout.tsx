import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { SyncHealthBanner } from '@/lib/app-client'
import { DataEpochGuard } from '@/lib/app-client'
import { SignOutButton } from '@/components/SignOutButton'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')
  return (
    <>
      <DataEpochGuard />
      <SyncHealthBanner />
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 16px 0' }}>
        <SignOutButton />
      </div>
      {children}
    </>
  )
}

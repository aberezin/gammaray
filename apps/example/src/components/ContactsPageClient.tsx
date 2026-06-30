'use client'

import Link from 'next/link'
import { contactDescriptor } from '@gammaray/rolodex-schema'
import { RecordPage } from '@/lib/app-client'

// The contacts page is now just a descriptor + a title + nav links — all the
// data wiring lives in the generic RecordPage / useRecordPage. The contact
// descriptor's company Reference and tags MultiReference drive the pickers,
// quick-add controls, and m2m join handling automatically.
export function ContactsPageClient({ accessToken }: { accessToken: string }) {
  return (
    <RecordPage
      descriptor={contactDescriptor}
      accessToken={accessToken}
      title="Contacts"
      navLinks={
        <Link href="/categories" style={{ fontSize: 13, color: '#3b82f6' }}>Categories →</Link>
      }
    />
  )
}

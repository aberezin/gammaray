'use client'

import Link from 'next/link'
import { categoryDescriptor } from '@gammaray/notesync-schema'
import { RecordPage } from '@/components/RecordPage'

// A self-referential tree (a category's Parent is another category) — handled by
// the same generic RecordPage as contacts. The parentId Reference points back at
// `category`, so the Parent picker offers the categories themselves; no
// table-specific code is needed.
export function CategoriesPageClient({ accessToken }: { accessToken: string }) {
  return (
    <RecordPage
      descriptor={categoryDescriptor}
      accessToken={accessToken}
      title="Categories"
      maxWidth={900}
      navLinks={<Link href="/contacts" style={{ fontSize: 13, color: '#3b82f6' }}>Contacts →</Link>}
    />
  )
}

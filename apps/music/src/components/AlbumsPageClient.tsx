'use client'

import { albumDescriptor } from '@gammaray/music-schema'
import { RecordPage } from '@/lib/app-client'
import { MusicNav } from '@/components/MusicNav'

export function AlbumsPageClient({ accessToken }: { accessToken: string }) {
  return (
    <RecordPage
      descriptor={albumDescriptor}
      accessToken={accessToken}
      title="Albums"
      navLinks={<MusicNav current="/albums" />}
    />
  )
}

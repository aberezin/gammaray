'use client'

import { artistDescriptor } from '@gammaray/music-schema'
import { RecordPage } from '@/lib/app-client'
import { MusicNav } from '@/components/MusicNav'

export function ArtistsPageClient({ accessToken }: { accessToken: string }) {
  return (
    <RecordPage
      descriptor={artistDescriptor}
      accessToken={accessToken}
      title="Artists"
      navLinks={<MusicNav current="/artists" />}
    />
  )
}

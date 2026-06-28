'use client'

import { trackDescriptor } from '@gammaray/music-schema'
import { RecordPage } from '@/lib/app-client'
import { MusicNav } from '@/components/MusicNav'

export function TracksPageClient({ accessToken }: { accessToken: string }) {
  return (
    <RecordPage
      descriptor={trackDescriptor}
      accessToken={accessToken}
      title="Tracks"
      navLinks={<MusicNav current="/tracks" />}
    />
  )
}

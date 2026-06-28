'use client'

import { genreDescriptor } from '@gammaray/music-schema'
import { RecordPage } from '@/lib/app-client'
import { MusicNav } from '@/components/MusicNav'

// Self-referential tree (a genre's Parent is another genre) — handled by the
// same generic RecordPage as everything else.
export function GenresPageClient({ accessToken }: { accessToken: string }) {
  return (
    <RecordPage
      descriptor={genreDescriptor}
      accessToken={accessToken}
      title="Genres"
      navLinks={<MusicNav current="/genres" />}
    />
  )
}

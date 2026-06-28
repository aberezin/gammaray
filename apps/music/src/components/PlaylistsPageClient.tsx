'use client'

import { playlistDescriptor } from '@gammaray/music-schema'
import { RecordPage } from '@/lib/app-client'
import { MusicNav } from '@/components/MusicNav'

// The large many-to-many (playlist ↔ track) — the page that stresses the
// at-scale reference controls (the flat checkbox set breaks past a few dozen
// tracks; see docs/example-app-spec §8).
export function PlaylistsPageClient({ accessToken }: { accessToken: string }) {
  return (
    <RecordPage
      descriptor={playlistDescriptor}
      accessToken={accessToken}
      title="Playlists"
      navLinks={<MusicNav current="/playlists" />}
    />
  )
}

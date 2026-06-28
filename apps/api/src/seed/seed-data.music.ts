import { createHash } from 'crypto'
import type { SeedRow } from './seed-data'

// The music ("Crate") seed fixture. Generated deterministically so it's
// idempotent (create-if-absent by stable id) like the notesync seed. Sized to
// feel like a real catalog AND to make the at-scale relationship controls strain
// — one ~80-track playlist over a 150-track catalog (docs/example-app-spec §6/§8).

// Deterministic UUID-shaped id from a stable key (md5 → 8-4-4-4-12 hex).
function mid(key: string): string {
  const h = createHash('md5').update('crate:' + key).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

const LABELS = ['Verve', 'Blue Note', 'Sub Pop', 'Warp', 'Motown']

// A small genre tree (root → children), exercising the self-reference.
const GENRE_TREE: Record<string, string[]> = {
  Rock: ['Classic Rock', 'Indie Rock'],
  Electronic: ['House', 'Techno'],
  Jazz: ['Bebop'],
  'Hip-Hop': ['Boom Bap'],
  Classical: [],
}

const ARTISTS = [
  'Miles Davis', 'John Coltrane', 'Aretha Franklin', 'Stevie Wonder', 'Nina Simone',
  'Radiohead', 'Aphex Twin', 'Boards of Canada', 'Kendrick Lamar', 'J Dilla',
  'The Beatles', 'Pink Floyd', 'Fleetwood Mac', 'Björk', 'Daft Punk',
  'Bonobo', 'Floating Points', 'Sufjan Stevens', 'Bon Iver', 'FKA twigs',
  'Thundercat', 'Flying Lotus', 'Caribou', 'Four Tet', 'Burial',
]

// Word pools for procedural album titles (gives "Midnight Hours", etc.).
const ADJ = ['Midnight', 'Electric', 'Silent', 'Golden', 'Velvet', 'Distant', 'Hollow', 'Crimson', 'Lunar', 'Paper', 'Glass', 'Northern', 'Wild', 'Quiet', 'Endless']
const NOUN = ['Hours', 'Dreams', 'Rivers', 'Echoes', 'Gardens', 'Machines', 'Letters', 'Skylines', 'Currents', 'Shadows', 'Horizons', 'Tides', 'Signals', 'Fields', 'Lights']

const NUM_ALBUMS = 15
const TRACKS_PER_ALBUM = 10

function build(): SeedRow[] {
  const rows: SeedRow[] = []

  for (const name of LABELS) rows.push({ table: 'label', data: { id: mid('label:' + name), name } })

  const genreNames: string[] = []
  for (const [root, children] of Object.entries(GENRE_TREE)) {
    rows.push({ table: 'genre', data: { id: mid('genre:' + root), name: root, parentId: null } })
    genreNames.push(root)
    for (const child of children) {
      rows.push({ table: 'genre', data: { id: mid('genre:' + child), name: child, parentId: mid('genre:' + root) } })
      genreNames.push(child)
    }
  }

  for (const name of ARTISTS) rows.push({ table: 'artist', data: { id: mid('artist:' + name), name, bio: '' } })

  const trackIds: string[] = []
  for (let a = 0; a < NUM_ALBUMS; a++) {
    const albumId = mid('album:' + a)
    const title = `${ADJ[a % ADJ.length]} ${NOUN[(a * 7) % NOUN.length]}`
    rows.push({ table: 'album', data: { id: albumId, title, year: 1968 + ((a * 3) % 55), labelId: mid('label:' + LABELS[a % LABELS.length]) } })

    // 1–2 genres per album.
    const g1 = genreNames[a % genreNames.length]
    rows.push({ table: 'album_genre', data: { id: mid(`ag:${a}:${g1}`), albumId, genreId: mid('genre:' + g1) } })
    if (a % 2 === 0) {
      const g2 = genreNames[(a + 3) % genreNames.length]
      if (g2 !== g1) rows.push({ table: 'album_genre', data: { id: mid(`ag:${a}:${g2}`), albumId, genreId: mid('genre:' + g2) } })
    }

    for (let t = 0; t < TRACKS_PER_ALBUM; t++) {
      const trackId = mid(`track:${a}:${t}`)
      trackIds.push(trackId)
      rows.push({
        table: 'track',
        data: { id: trackId, title: `${NOUN[(a + t) % NOUN.length]} (Pt. ${t + 1})`, trackNo: t + 1, durationSec: 150 + ((a * 7 + t * 13) % 180), explicit: (a + t) % 7 === 0, albumId },
      })
      // 1–2 artists per track.
      const ar1 = ARTISTS[a % ARTISTS.length]
      rows.push({ table: 'track_artist', data: { id: mid(`ta:${a}:${t}:1`), trackId, artistId: mid('artist:' + ar1) } })
      if (t % 3 === 0) {
        const ar2 = ARTISTS[(a + 5) % ARTISTS.length]
        rows.push({ table: 'track_artist', data: { id: mid(`ta:${a}:${t}:2`), trackId, artistId: mid('artist:' + ar2) } })
      }
    }
  }

  // Three playlists — one deliberately large (the at-scale stress case).
  const playlists: Array<{ key: string; name: string; description: string; from: number; to: number }> = [
    { key: 'essentials', name: 'Crate Essentials', description: 'A big playlist — the at-scale track picker stress case', from: 0, to: 80 },
    { key: 'chill', name: 'Chill', description: 'Late-night listening', from: 80, to: 92 },
    { key: 'focus', name: 'Focus', description: 'Deep work', from: 92, to: 104 },
  ]
  for (const p of playlists) {
    const playlistId = mid('playlist:' + p.key)
    rows.push({ table: 'playlist', data: { id: playlistId, name: p.name, description: p.description } })
    trackIds.slice(p.from, p.to).forEach((trackId, i) =>
      rows.push({ table: 'playlist_track', data: { id: mid(`pt:${p.key}:${i}`), playlistId, trackId } }),
    )
  }

  return rows
}

export const musicSeed: SeedRow[] = build()

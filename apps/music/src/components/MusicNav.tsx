import Link from 'next/link'

// Cross-links between the music pages, rendered in each RecordPage header.
const PAGES: Array<{ href: string; label: string }> = [
  { href: '/albums', label: 'Albums' },
  { href: '/tracks', label: 'Tracks' },
  { href: '/artists', label: 'Artists' },
  { href: '/genres', label: 'Genres' },
  { href: '/playlists', label: 'Playlists' },
]

export function MusicNav({ current }: { current: string }) {
  return (
    <>
      {PAGES.filter((p) => p.href !== current).map((p) => (
        <Link key={p.href} href={p.href} style={{ fontSize: 13, color: '#3b82f6' }}>
          {p.label}
        </Link>
      ))}
    </>
  )
}

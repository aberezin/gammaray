import { auth } from '@/auth'
import { NotePageClient } from '@/components/NotePageClient'

export default async function NotePage() {
  const session = await auth()
  return <NotePageClient accessToken={session!.accessToken} />
}

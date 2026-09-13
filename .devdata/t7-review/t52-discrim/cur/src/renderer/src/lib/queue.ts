interface QueueTrack {
  id: string
  artist: string
  album: string
}

/**
 * Playing a SINGLE track should not leave the player stuck repeating it:
 * build a sensible queue around it — same album → same artist → the library.
 * Multi-track requests (album/playlist/search results) are returned as-is so
 * the user's chosen context is never altered.
 */
export function withQueueContext<T extends QueueTrack>(requested: T[], all: T[], cap = 50): T[] {
  if (requested.length !== 1 || all.length <= 1) return requested
  const first = requested[0]
  const out: T[] = [first]
  const seen = new Set<string>([first.id])
  const min = 8 // keep playing beyond the requested song

  const push = (list: T[]): void => {
    for (const t of list) {
      if (out.length >= cap) return
      if (seen.has(t.id)) continue
      seen.add(t.id)
      out.push(t)
    }
  }

  push(all.filter((t) => t.artist === first.artist && t.album === first.album))
  if (out.length < min) push(all.filter((t) => t.artist === first.artist))
  if (out.length < min) push(all)
  return out
}

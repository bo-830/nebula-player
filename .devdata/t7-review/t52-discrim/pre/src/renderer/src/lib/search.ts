import type { Track } from '../types'

export interface SearchQuery {
  text?: string
  artist?: string
  album?: string
  genre?: string
  limit?: number
}

function norm(s: string): string {
  return s.toLowerCase().trim()
}

function inField(field: string, q: string): boolean {
  return field.toLowerCase().includes(q)
}

/**
 * Fuzzy search over title / artist / album / genre with a small relevance
 * score. Korean/Chinese full-width normalization is intentionally kept
 * minimal (substring match) — fast for in-memory lists of ≤20k tracks.
 */
export function searchTracks(tracks: Track[], q: SearchQuery): Track[] {
  const text = norm(q.text ?? '')
  const artist = norm(q.artist ?? '')
  const album = norm(q.album ?? '')
  const genre = norm(q.genre ?? '')

  // no criteria → nothing to search (never dump the whole library to the model)
  if (!text && !artist && !album && !genre) return []

  const scored: Array<{ t: Track; score: number }> = []
  for (const t of tracks) {
    let score = 0
    if (text) {
      const title = norm(t.title)
      const a = norm(t.artist)
      const al = norm(t.album)
      if (title === text) score += 120
      else if (title.startsWith(text)) score += 90
      else if (title.includes(text)) score += 60
      if (a.includes(text)) score += 30
      if (al.includes(text)) score += 20
      if (t.genre && norm(t.genre).includes(text)) score += 10
      if (score === 0) continue
    }
    if (artist && !inField(t.artist, artist)) continue
    if (album && !inField(t.album, album)) continue
    if (genre && !(t.genre && inField(t.genre, genre))) continue
    scored.push({ t, score })
  }
  scored.sort((a, b) => b.score - a.score || a.t.title.localeCompare(b.t.title))
  return scored.map((s) => s.t)
}

export function groupArtists(
  tracks: Track[]
): Array<{ name: string; count: number; covers: string[] }> {
  const map = new Map<string, { name: string; count: number; covers: string[] }>()
  for (const t of tracks) {
    const key = t.artist.toLowerCase()
    const cur = map.get(key)
    if (cur) {
      cur.count++
      if (t.coverPath && cur.covers.length < 4 && !cur.covers.includes(t.coverPath)) {
        cur.covers.push(t.coverPath)
      }
    } else {
      map.set(key, {
        name: t.artist,
        count: 1,
        covers: t.coverPath ? [t.coverPath] : []
      })
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh'))
}

export function groupAlbums(
  tracks: Track[]
): Array<{ key: string; artist: string; album: string; count: number; cover: string | null }> {
  const map = new Map<
    string,
    { key: string; artist: string; album: string; count: number; cover: string | null }
  >()
  for (const t of tracks) {
    const key = `${t.artist.toLowerCase()}\u0000${t.album.toLowerCase()}`
    const cur = map.get(key)
    if (cur) {
      cur.count++
      if (!cur.cover && t.coverPath) cur.cover = t.coverPath
    } else {
      map.set(key, {
        key,
        artist: t.artist,
        album: t.album,
        count: 1,
        cover: t.coverPath
      })
    }
  }
  return Array.from(map.values()).sort((a, b) => a.album.localeCompare(b.album, 'zh'))
}

export function groupFolders(
  tracks: Track[]
): Array<{ folderId: string; folderName: string; count: number }> {
  const map = new Map<string, { folderId: string; folderName: string; count: number }>()
  for (const t of tracks) {
    const cur = map.get(t.folderId)
    if (cur) cur.count++
    else map.set(t.folderId, { folderId: t.folderId, folderName: t.folderName, count: 1 })
  }
  return Array.from(map.values()).sort((a, b) => a.folderName.localeCompare(b.folderName, 'zh'))
}

export type SortKey = 'default' | 'title' | 'artist' | 'album' | 'duration' | 'addedAt'

/** apply a list sort; "default" keeps the incoming order (search ranking etc.) */
export function sortTracks(tracks: Track[], key: SortKey): Track[] {
  if (key === 'default') return tracks
  const copy = [...tracks]
  switch (key) {
    case 'title':
      copy.sort((a, b) => a.title.localeCompare(b.title, 'zh'))
      break
    case 'artist':
      copy.sort((a, b) => a.artist.localeCompare(b.artist, 'zh'))
      break
    case 'album':
      copy.sort((a, b) => a.album.localeCompare(b.album, 'zh'))
      break
    case 'duration':
      copy.sort((a, b) => a.duration - b.duration)
      break
    case 'addedAt':
      copy.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
      break
  }
  return copy
}

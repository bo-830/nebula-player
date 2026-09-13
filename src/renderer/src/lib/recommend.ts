import type { Track } from '../types'
import type { PlayStat } from './playStats'

export interface TasteProfile {
  /** most played artists (desc) */
  topArtists: Array<{ name: string; plays: number; trackCount: number }>
  /** most played genres (desc) */
  topGenres: Array<{ name: string; plays: number }>
  /** every track id that has been played at least once */
  playedIds: Set<string>
  /** recently played ids, newest first */
  recentIds: string[]
  totalPlays: number
}

export interface Recommendation {
  track: Track
  score: number
  reason: string
}

function genresOf(track: Track): string[] {
  return track.genre
    .split('/')
    .map((g) => g.trim())
    .filter((g) => g && g !== '未知')
}

/** Aggregate play history into a taste profile used for recommendations + AI context. */
export function buildTasteProfile(tracks: Track[], stats: Record<string, PlayStat>): TasteProfile {
  const artistPlays = new Map<string, number>()
  const artistTracks = new Map<string, number>()
  const genrePlays = new Map<string, number>()
  const playedIds = new Set<string>()
  let totalPlays = 0

  for (const t of tracks) {
    const st = stats[t.id]
    if (!st || st.count <= 0) continue
    playedIds.add(t.id)
    totalPlays += st.count
    artistPlays.set(t.artist, (artistPlays.get(t.artist) ?? 0) + st.count)
    artistTracks.set(t.artist, (artistTracks.get(t.artist) ?? 0) + 1)
    for (const g of genresOf(t)) {
      genrePlays.set(g, (genrePlays.get(g) ?? 0) + st.count)
    }
  }

  const topArtists = [...artistPlays.entries()]
    .map(([name, plays]) => ({ name, plays, trackCount: artistTracks.get(name) ?? 0 }))
    .sort((a, b) => b.plays - a.plays)

  const topGenres = [...genrePlays.entries()]
    .map(([name, plays]) => ({ name, plays }))
    .sort((a, b) => b.plays - a.plays)

  const recentIds = Object.entries(stats)
    .filter(([, s]) => s.count > 0)
    .sort((a, b) => b[1].last - a[1].last)
    .map(([id]) => id)

  return { topArtists, topGenres, playedIds, recentIds, totalPlays }
}

/**
 * Score library tracks against the taste profile.
 * Priority: favourite artists → favourite genres → unplayed tracks.
 * Deterministic (no randomness) so it can be unit tested.
 */
export function recommendTracks(
  tracks: Track[],
  stats: Record<string, PlayStat>,
  limit = 30
): Recommendation[] {
  const profile = buildTasteProfile(tracks, stats)
  const maxArtistPlays = profile.topArtists[0]?.plays ?? 0
  const maxGenrePlays = profile.topGenres[0]?.plays ?? 0
  const artistRank = new Map(profile.topArtists.map((a, i) => [a.name, i]))
  const genreRank = new Map(profile.topGenres.map((g, i) => [g.name, i]))
  const recentSet = new Set(profile.recentIds.slice(0, 5))

  const scored: Recommendation[] = []
  for (const t of tracks) {
    if (t.missing) continue
    const st = stats[t.id]
    const plays = st?.count ?? 0

    let score = 0
    let reason = ''

    // artist affinity (strongest signal)
    const aPlays = profile.topArtists.find((a) => a.name === t.artist)?.plays ?? 0
    if (aPlays > 0 && maxArtistPlays > 0) {
      const artistScore = (aPlays / maxArtistPlays) * 3
      score += artistScore
      if (artistScore > 2.2 && (artistRank.get(t.artist) ?? 99) < 3)
        reason = `常听歌手 · ${t.artist}`
    }

    // genre affinity
    for (const g of genresOf(t)) {
      const gPlays = profile.topGenres.find((x) => x.name === g)?.plays ?? 0
      if (gPlays > 0 && maxGenrePlays > 0) {
        const genreScore = (gPlays / maxGenrePlays) * 2
        score += genreScore
        if (!reason && genreScore > 1.5 && (genreRank.get(g) ?? 99) < 3) reason = `${g} 口味`
      }
    }

    // novelty: prefer tracks you haven't worn out
    if (plays === 0) {
      score += 2.6
      if (!reason) reason = profile.totalPlays > 0 ? '新歌尝鲜' : '新入库'
    } else if (plays <= 1) {
      score += 0.8
      if (!reason) reason = '再听一次'
    }

    // don't keep pushing what was just played
    if (recentSet.has(t.id)) score -= 1.8

    if (score <= 0) continue
    scored.push({ track: t, score, reason: reason || '为你挑选' })
  }

  scored.sort((a, b) => b.score - a.score || a.track.title.localeCompare(b.track.title, 'zh'))

  // R4(d): a "no play history yet → newest imports" fallback used to live here
  // (`if (scored.length === 0) return [...tracks].sort(by addedAt)`), but it was
  // unreachable: an unplayed track always takes the +2.6 novelty bonus, so it is
  // filtered out only when it already has affinity, which requires a played
  // track — i.e. `scored` can never be empty while `tracks` is non-empty. It was
  // deleted rather than kept as dead code; `recommendTracks` already ranks
  // unplayed tracks first and labels them '新入库' (covered by recommend.test.ts).
  return scored.slice(0, limit)
}

/** Compact taste summary for the AI system prompt. */
export function tasteSummary(profile: TasteProfile): string {
  if (profile.totalPlays === 0) return '用户尚未产生播放记录（可推荐新入库歌曲，或先了解其偏好）。'
  const artists = profile.topArtists
    .slice(0, 5)
    .map((a) => `${a.name}(${a.plays}次)`)
    .join('、')
  const genres = profile.topGenres
    .slice(0, 5)
    .map((g) => `${g.name}(${g.plays}次)`)
    .join('、')
  return `累计播放 ${profile.totalPlays} 次；常听歌手：${artists || '暂无'}；偏好曲风：${genres || '未标注'}。`
}

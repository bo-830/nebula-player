import { describe, expect, it } from 'vitest'
import { buildTasteProfile, recommendTracks, tasteSummary } from '../recommend'
import type { Track } from '../../types'

function makeTrack(overrides: Partial<Track>): Track {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    path: overrides.path ?? '/music/x.mp3',
    ext: 'mp3',
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    duration: 180,
    coverPath: null,
    genre: '',
    year: null,
    trackNo: null,
    folderId: '/music',
    folderName: 'music',
    size: 1000,
    mtime: 1,
    ...overrides
  }
}

const library: Track[] = [
  makeTrack({ id: 'rock1', title: 'Rock One', artist: 'RC', genre: '摇滚', album: 'R' }),
  makeTrack({ id: 'rock2', title: 'Rock Two', artist: 'RC', genre: '摇滚', album: 'R' }),
  makeTrack({ id: 'rock3', title: 'Rock Three', artist: 'Other', genre: '摇滚', album: 'O' }),
  makeTrack({ id: 'pop1', title: 'Pop One', artist: 'PC', genre: '流行', album: 'P' }),
  makeTrack({ id: 'jazz1', title: 'Jazz One', artist: 'JC', genre: '爵士', album: 'J' })
]

describe('buildTasteProfile', () => {
  it('aggregates artist and genre plays', () => {
    const stats = {
      rock1: { count: 5, last: 100 },
      rock2: { count: 3, last: 200 },
      pop1: { count: 1, last: 50 }
    }
    const p = buildTasteProfile(library, stats)
    expect(p.totalPlays).toBe(9)
    expect(p.topArtists[0]).toMatchObject({ name: 'RC', plays: 8 })
    expect(p.topGenres[0]).toMatchObject({ name: '摇滚', plays: 8 })
    expect(p.playedIds.has('pop1')).toBe(true)
    expect(p.recentIds[0]).toBe('rock2') // newest last-played first
  })

  it('handles an empty history', () => {
    const p = buildTasteProfile(library, {})
    expect(p.totalPlays).toBe(0)
    expect(p.topArtists).toEqual([])
    expect(tasteSummary(p)).toContain('尚未产生播放记录')
  })
})

describe('recommendTracks', () => {
  const stats = { rock1: { count: 5, last: 1000 }, rock2: { count: 4, last: 900 } }

  it('prefers favourite genres/artists and explains why', () => {
    const recs = recommendTracks(library, stats, 5)
    const ids = recs.map((r) => r.track.id)
    // rock3 (rock, not yet played) should outrank the played rock tracks
    expect(ids[0]).toBe('rock3')
    expect(recs[0].reason).toBe('摇滚 口味')
    // jazz/pop have no affinity and are unplayed → still included, but lower
    expect(ids).toContain('jazz1')
  })

  it('penalises the most recently played track (R4d: asserts the observable effect)', () => {
    // R4(d): the old assertion (`rock2Index > rock1Index`) compared two tracks
    // whose scores are EQUAL, so it passed via the title tie-break and stayed
    // green even with the recency penalty deleted. Two findings from probing the
    // real scorer:
    //   * `recentIds` is the *top 5 by last-played*, so in any small two-track
    //     comparison BOTH tracks are usually "recent" and take the penalty
    //     symmetrically — no ordering can expose it;
    //   * therefore the property worth asserting is the SCORE, measured against a
    //     scenario where recency is the only difference.
    // Measured against the production constants (the played track is the only
    // stat entry, so both tracks inherit the same affinity: artist 3.0 and genre
    // 2.0, because aPlays/maxArtistPlays and gPlays/maxGenrePlays are both 1):
    //   played track   : 3.0 + 2.0 + 0.8 (played once) − 1.8 (recency) = 4.0
    //   untouched track: 3.0 + 2.0 + 2.6 (novelty)                     = 7.6
    // The exact values make the assertion sensitive to the recency term: a
    // weakened penalty (−0.1) would give the played track 5.7 and fail.
    const tracks: Track[] = [
      makeTrack({ id: 'tA', title: 'A', artist: 'SameArtist', genre: 'SameGenre', album: 'A' }),
      makeTrack({ id: 'tB', title: 'B', artist: 'SameArtist', genre: 'SameGenre', album: 'B' })
    ]
    const scoreOf = (id: string, stats: Record<string, { count: number; last: number }>): number =>
      recommendTracks(tracks, stats, 5).find((r) => r.track.id === id)?.score ?? NaN

    // tA is the only track with stats ⇒ it alone is in `recentIds` ⇒ penalised
    expect(scoreOf('tA', { tA: { count: 1, last: 900 } })).toBeCloseTo(4.0, 10)
    // the untouched track gets novelty instead of the affinities+penalty
    expect(scoreOf('tB', { tA: { count: 1, last: 900 } })).toBeCloseTo(7.6, 10)

    // mirror the stats: the penalty follows the RECENCY, not the track, so the
    // two scores swap exactly (a weakened −1.8 would move them off these values)
    expect(scoreOf('tB', { tB: { count: 1, last: 900 } })).toBeCloseTo(4.0, 10)
    expect(scoreOf('tA', { tB: { count: 1, last: 900 } })).toBeCloseTo(7.6, 10)
  })

  it('ranks unplayed tracks first and labels them 新入库 (R4d: was mislabelled as a fallback)', () => {
    // R4(d): this used to be titled "falls back to newest imports without any
    // history", but that fallback branch (`scored.length === 0` →
    // sort-by-addedAt) is UNREACHABLE and has been removed from recommend.ts:
    // with no history every unplayed track takes the +2.6 novelty bonus, so a
    // track can only be filtered out when it already has affinity (artist or
    // genre score), which implies at least one played track. What is actually
    // observable — and asserted here — is that unplayed tracks win, carry the
    // '新入库' label and surface the highest addedAt first.
    const freshness = library.map((t, i) => ({ ...t, addedAt: 1000 + i }))
    const recs = recommendTracks(freshness, {}, 3)
    expect(recs).toHaveLength(3)
    expect(recs.every((r) => r.reason === '新入库')).toBe(true)
    expect(recs[0].track.id).toBe('jazz1') // highest addedAt
  })

  it('skips missing files', () => {
    const withMissing = library.map((t) => (t.id === 'rock3' ? { ...t, missing: true } : t))
    const recs = recommendTracks(withMissing, stats, 5)
    expect(recs.find((r) => r.track.id === 'rock3')).toBeUndefined()
  })
})

import { describe, expect, it } from 'vitest'
import {
  acceptLyricsResponse,
  claimLyricsRequest,
  clearLyricsHolders,
  trackLyricsPush,
  type LyricIdHolder
} from './reverted-miniLyricsDedup'

/**
 * A2 regression guard — mini window lyrics dedupe, driving the PRODUCTION rule.
 *
 * `MiniPlayer.tsx` listens to the 4x/s `mini:state` feed and reloads lyrics per
 * track. It used to dedupe against a value captured in the render closure
 * (`if (p.track.id === trackId) return`, where `trackId` was `null` on the first
 * subscription), so every push re-issued `lyricsGet` — about 4 IPC calls per
 * second for the track already loaded — and a slow response for the previous
 * track could paint one frame of its lyrics over the new one.
 *
 * The rule now lives in `../miniLyricsDedup` (pure TS, no React/DOM), which the
 * component calls; this suite imports THAT module, so breaking the rule fails
 * here. Verified by mutation: reverting `claimLyricsRequest` to "always claim"
 * (the pre-fix behaviour) makes the first two cases below fail; restoring it
 * brings them back to green.
 */
describe('miniLyricsDedup (A2 rule)', () => {
  /** feed harness: only bookkeeping, every decision comes from the module */
  function newWindow(): {
    fetches: string[]
    painted: string[]
    push: (id: string | null) => boolean
    apply: (id: string) => boolean
  } {
    const claimed: LyricIdHolder = { current: null }
    const wanted: LyricIdHolder = { current: null }
    const fetches: string[] = []
    const painted: string[] = []
    return {
      fetches,
      painted,
      push(id) {
        if (id === null) {
          clearLyricsHolders(claimed, wanted)
          painted.length = 0
          return false
        }
        trackLyricsPush(wanted, id)
        if (!claimLyricsRequest(claimed, id)) return false
        fetches.push(id)
        return true
      },
      apply(id) {
        if (!acceptLyricsResponse(wanted, id)) return false
        painted.length = 0
        painted.push(id)
        return true
      }
    }
  }

  it('issues one lyricsGet for a sustained stream of the same track', () => {
    const w = newWindow()
    for (let i = 0; i < 12; i++) w.push('track-a') // 12 pushes ≈ 3s at 4/s
    expect(w.fetches).toEqual(['track-a']) // pre-fix behaviour: 12 fetches
    expect(w.apply('track-a')).toBe(true)
    expect(w.painted).toEqual(['track-a'])
  })

  it('issues one fetch per distinct track when the track changes', () => {
    const w = newWindow()
    for (const id of ['track-a', 'track-a', 'track-b', 'track-b', 'track-b', 'track-c']) w.push(id)
    expect(w.fetches).toEqual(['track-a', 'track-b', 'track-c'])
  })

  it('never paints a late response that belongs to the previous track', () => {
    const w = newWindow()
    w.push('track-a')
    w.push('track-a')
    w.push('track-b') // user switched; track-a's request may still be in flight
    expect(w.apply('track-a')).toBe(false) // stale → dropped, no one-frame flash
    expect(w.painted).toEqual([])
    expect(w.apply('track-b')).toBe(true)
    expect(w.painted).toEqual(['track-b'])
  })

  it('still paints the current track response after repeated pushes for it', () => {
    const w = newWindow()
    w.push('track-b')
    w.push('track-b') // more pushes arrive while the request is in flight
    w.push('track-b')
    expect(w.apply('track-b')).toBe(true) // wanted.current === id → accepted
    expect(w.painted).toEqual(['track-b'])
  })

  it('re-fetches a track that comes back after playback stops', () => {
    const w = newWindow()
    w.push('track-a')
    w.apply('track-a')
    expect(w.push(null)).toBe(false) // stop → lyrics cleared, holders reset
    expect(w.painted).toEqual([])
    expect(w.push('track-a')).toBe(true) // same id again → must refetch
    expect(w.fetches).toEqual(['track-a', 'track-a'])
  })

  it('claimLyricsRequest is a no-op for a repeated id but true for a new one', () => {
    const claimed: LyricIdHolder = { current: null }
    expect(claimLyricsRequest(claimed, 'a')).toBe(true)
    expect(claimLyricsRequest(claimed, 'a')).toBe(false)
    expect(claimLyricsRequest(claimed, 'a')).toBe(false)
    expect(claimLyricsRequest(claimed, 'b')).toBe(true)
    expect(claimed.current).toBe('b')
  })

  it('acceptLyricsResponse only accepts the newest id', () => {
    const wanted: LyricIdHolder = { current: null }
    trackLyricsPush(wanted, 'a')
    expect(acceptLyricsResponse(wanted, 'a')).toBe(true)
    trackLyricsPush(wanted, 'b')
    expect(acceptLyricsResponse(wanted, 'a')).toBe(false) // a is stale now
    expect(acceptLyricsResponse(wanted, 'b')).toBe(true)
  })

  it('clearLyricsHolders resets every holder', () => {
    const claimed: LyricIdHolder = { current: 'a' }
    const wanted: LyricIdHolder = { current: 'a' }
    clearLyricsHolders(claimed, wanted)
    expect(claimed.current).toBeNull()
    expect(wanted.current).toBeNull()
    // and a cleared holder accepts the same id again (new playback session)
    expect(claimLyricsRequest(claimed, 'a')).toBe(true)
  })
})

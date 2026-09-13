import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { audioEngine } from '../../src/renderer/src/lib/audioEngine'
import { usePlayerStore } from '../../src/renderer/src/stores/playerStore'
import { useLibraryStore } from '../../src/renderer/src/stores/libraryStore'
import { useUiStore } from '../../src/renderer/src/stores/uiStore'
import type { Track } from '../../src/renderer/src/types'

/**
 * t7 REVIEW PROBE — does NOT modify implementation code.
 *
 * Baseline (installed 1.0.3, .devdata/t7-review/installed-_out_renderer_assets_index-D_1iosaX.js
 * line 14105-14118) computed the next index as:
 *     nextIndex = (s.index + 1) % s.queue.length      // list mode WRAPS AROUND
 * The current playerStore computes:
 *     Math.min(s.index + 1, sleepStop ? lastIndex : s.queue.length - 1)
 * With queue.length >= 1, `lastIndex === queue.length - 1`, so both ternary
 * branches are the same value and the clamp applies unconditionally.
 *
 * These probes assert the BASELINE (wrap-around) behaviour, so a failure here
 * is the regression evidence.
 */

const track = (id: string): Track =>
  ({
    id,
    path: `C:/music/${id}.mp3`,
    title: id,
    artist: 'probe',
    album: 'probe',
    duration: 100
  }) as unknown as Track

function stubEngine(): void {
  vi.spyOn(audioEngine, 'pause').mockImplementation((): void => {})
  vi.spyOn(audioEngine, 'play').mockImplementation(async (): Promise<void> => {})
  vi.spyOn(audioEngine, 'load').mockImplementation(async (): Promise<void> => {})
  vi.spyOn(audioEngine, 'stop').mockImplementation((): void => {})
  vi.spyOn(audioEngine, 'setVolume').mockImplementation((): void => {})
}

/** let loadCurrentInternal's early-return / catch path settle */
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  stubEngine()
  const glob = globalThis as unknown as { localStorage: Storage; window?: unknown }
  const data = new Map<string, string>()
  glob.localStorage = {
    get length(): number {
      return data.size
    },
    clear: (): void => data.clear(),
    getItem: (k: string): string | null => data.get(k) ?? null,
    key: (i: number): string | null => [...data.keys()][i] ?? null,
    removeItem: (k: string): void => void data.delete(k),
    setItem: (k: string, v: string): void => void data.set(k, v)
  } as Storage
  // a fake window.api so the store never hits a DOM/window ReferenceError
  glob.window = {
    api: {
      decodeEnsure: async (p: string): Promise<string> => `media://probe/${p}`,
      playerPushState: (): void => {}
    }
  }
  useLibraryStore.setState({
    map: { a: track('a'), b: track('b'), c: track('c') }
  } as never)
  useUiStore.setState({ toasts: [] })
  usePlayerStore.setState({ sleep: null, sleepRemaining: null, mode: 'list' })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('t7 probe: list-mode auto-advance at the end of the queue (no sleep timer)', () => {
  it('natural end of the LAST track wraps to index 0 (baseline 1.0.3)', async () => {
    usePlayerStore.setState({ queue: ['a', 'b', 'c'], index: 2, mode: 'list', sleep: null })
    usePlayerStore.getState().handleEnded()
    await settle()
    const observed = usePlayerStore.getState().index
    console.log(
      `[probe] natural end of last track (list mode, no timer): index=${observed} ` +
        `(baseline 1.0.3 = 0 wrap-around, buggy clamp = 2 replay last track)`
    )
    expect(observed).toBe(0)
  })

  it('manual next on the LAST track wraps to index 0 (baseline 1.0.3)', async () => {
    usePlayerStore.setState({ queue: ['a', 'b', 'c'], index: 2, mode: 'list', sleep: null })
    usePlayerStore.getState().next()
    await settle()
    const observed = usePlayerStore.getState().index
    console.log(`[probe] manual next on last track (list mode, no timer): index=${observed}`)
    expect(observed).toBe(0)
  })

  it('manual next on the LAST track in one-mode wraps to index 0 (baseline 1.0.3)', async () => {
    usePlayerStore.setState({ queue: ['a', 'b', 'c'], index: 2, mode: 'one', sleep: null })
    usePlayerStore.getState().next()
    await settle()
    const observed = usePlayerStore.getState().index
    console.log(`[probe] manual next on last track (one mode, no timer): index=${observed}`)
    expect(observed).toBe(0)
  })
})

describe('t7 probe: sleep-timer arms that must be preserved', () => {
  it('queue-mode timer still stops at the end of the queue (intended)', async () => {
    usePlayerStore.setState({ queue: ['a', 'b', 'c'], index: 2, mode: 'list' })
    usePlayerStore.getState().setSleepQueueEnd()
    usePlayerStore.getState().handleEnded()
    await settle()
    expect(usePlayerStore.getState().sleep).toBeNull()
    expect(audioEngine.pause).toHaveBeenCalled()
  })

  it('queue-mode timer mid-queue still advances 0 -> 1', async () => {
    usePlayerStore.setState({ queue: ['a', 'b', 'c'], index: 0, mode: 'list' })
    usePlayerStore.getState().setSleepQueueEnd()
    usePlayerStore.getState().handleEnded()
    await settle()
    expect(usePlayerStore.getState().index).toBe(1)
    expect(usePlayerStore.getState().sleep?.mode).toBe('queue')
  })

  it('mismatch probe: prev()/clicking a track does NOT drop a track-mode timer', async () => {
    usePlayerStore.setState({ queue: ['a', 'b', 'c'], index: 1, mode: 'list' })
    usePlayerStore.getState().setSleepTrackEnd()
    usePlayerStore.getState().prev()
    await settle()
    const afterPrev = usePlayerStore.getState().sleep?.mode ?? null
    console.log(`[probe] sleep after prev() with track-mode timer armed = ${String(afterPrev)}`)

    usePlayerStore.getState().setSleepTrackEnd()
    await usePlayerStore
      .getState()
      .playTracks([track('b')], 0)
    const afterClick = usePlayerStore.getState().sleep?.mode ?? null
    console.log(
      `[probe] sleep after clicking a track with track-mode timer armed = ${String(afterClick)} ` +
        `(claimed design: manual track change drops ended-driven timers)`
    )
  })
})

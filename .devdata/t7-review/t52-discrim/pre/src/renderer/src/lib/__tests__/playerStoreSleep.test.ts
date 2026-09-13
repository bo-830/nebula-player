import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { audioEngine } from '../audioEngine'
import { usePlayerStore } from '../../stores/playerStore'
import { useLibraryStore } from '../../stores/libraryStore'
import { useUiStore } from '../../stores/uiStore'
import type { Track } from '../../types'

/**
 * Integration-level checks for the sleep timer wiring in playerStore: the
 * countdown actually pauses playback, and the ended-driven modes suppress the
 * repeat / wrap-around instead of advancing.
 *
 * Two engine calls are stubbed in every test on purpose: the node test
 * environment has no DOM, so reaching the real implementations would throw
 * `ReferenceError: Audio is not defined` (audioEngine creates an <audio>
 * element lazily). Stubbing both keeps the tests deterministic and isolates
 * the store logic under test.
 */

const tickers: Array<ReturnType<typeof setInterval>> = []
/** snapshots of everything the store tried to write to localStorage */
const written: string[] = []
/** live player snapshot (kept short so the assertions stay readable) */
const st = (): ReturnType<typeof usePlayerStore.getState> => usePlayerStore.getState()
/** no-op replacement for audioEngine.pause — returns the spy for assertions */
const pauseSpy = (): MockInstance<() => void> =>
  vi.spyOn(audioEngine, 'pause').mockImplementation((): void => {})
/** no-op replacement for audioEngine.setVolume (never touches the DOM) */
const volumeSpy = (): MockInstance<(v: number, muted?: boolean) => void> =>
  vi.spyOn(audioEngine, 'setVolume').mockImplementation((): void => {})

/** a Storage-shaped stub: the test only needs to record setItem payloads */
function localStorageStub(sink: string[]): Storage {
  const data = new Map<string, string>()
  const store = {
    get length(): number {
      return data.size
    },
    clear: (): void => {
      data.clear()
    },
    getItem: (key: string): string | null => data.get(key) ?? null,
    key: (index: number): string | null => [...data.keys()][index] ?? null,
    removeItem: (key: string): void => {
      data.delete(key)
    },
    setItem: (key: string, value: string): void => {
      data.set(key, value)
      sink.push(value)
    }
  }
  return Object.assign(store, { [Symbol.toStringTag]: 'Storage' }) as unknown as Storage
}

/** minimal Track factory — only the fields loadCurrentInternal touches */
function track(id: string): Track {
  return {
    id,
    path: `C:/music/${id}.mp3`,
    ext: 'mp3',
    title: id,
    artist: 'test',
    album: 'test',
    duration: 120,
    coverPath: null,
    genre: '',
    year: null,
    trackNo: null,
    folderId: 'f1',
    folderName: 'music',
    size: 1000,
    mtime: 0
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  tickers.length = 0
  written.length = 0
  const realSetInterval = globalThis.setInterval
  vi.spyOn(globalThis, 'setInterval').mockImplementation((cb: () => void, ms?: number) => {
    const id = realSetInterval(cb, ms)
    tickers.push(id)
    return id
  })
  // the engine must never reach the DOM in any test of this file (see header)
  pauseSpy()
  volumeSpy()
  // F8: seed the library map so loadCurrentInternal() really writes `index`
  // (it returns early — before set({ index }) — when the id is not in the map,
  // which silently turned the old index assertions into no-ops)
  useLibraryStore.setState({
    map: { a: track('a'), b: track('b'), c: track('c') },
    tracks: [track('a'), track('b'), track('c')]
  })
  // a fresh app start restores nothing; every write is captured for assertions
  const glob = globalThis as unknown as { localStorage: Storage }
  glob.localStorage = localStorageStub(written)
  usePlayerStore.setState({
    sleep: null,
    sleepRemaining: null,
    queue: [],
    index: -1,
    mode: 'list',
    current: null
  })
  useUiStore.setState({ toasts: [] })
})

afterEach(() => {
  for (const id of tickers) clearInterval(id)
  vi.restoreAllMocks()
  vi.useRealTimers()
  usePlayerStore.setState({ sleep: null, sleepRemaining: null })
})

describe('playerStore sleep timer', () => {
  it('arms a countdown, ticks the badge and pauses when it runs out', () => {
    const pause = vi.mocked(audioEngine.pause)

    st().setSleepMinutes(15)
    expect(st().sleep?.mode).toBe('minute')
    expect(st().sleep?.minutes).toBe(15)
    expect(st().sleepRemaining).toBe(15 * 60)

    vi.advanceTimersByTime(1000)
    expect(st().sleepRemaining).toBe(15 * 60 - 1)

    vi.advanceTimersByTime(15 * 60_000)
    expect(pause).toHaveBeenCalledTimes(1)
    expect(st().sleep).toBeNull()
    expect(st().sleepRemaining).toBeNull()
    expect(
      useUiStore.getState().toasts.some((t) => t.text.includes('睡眠定时器已触发，已暂停播放'))
    ).toBe(true)
  })

  it('cancel clears the timer and stops the clock', () => {
    const pause = vi.mocked(audioEngine.pause)

    st().setSleepMinutes(30)
    st().clearSleep()
    expect(st().sleep).toBeNull()
    expect(st().sleepRemaining).toBeNull()
    expect(useUiStore.getState().toasts.some((t) => t.text.includes('已取消睡眠定时器'))).toBe(true)

    vi.advanceTimersByTime(31 * 60_000)
    expect(pause).not.toHaveBeenCalled() // nothing left to fire
  })

  it('arms both ended-driven modes without a deadline', () => {
    st().setSleepTrackEnd()
    expect(st().sleep).toMatchObject({ mode: 'track', deadline: null })
    st().setSleepQueueEnd()
    expect(st().sleep).toMatchObject({ mode: 'queue', deadline: null })
    expect(st().sleepRemaining).toBeNull()
  })

  it('a manual skip drops an ended-driven timer but keeps a countdown', () => {
    usePlayerStore.setState({ queue: ['a', 'b', 'c'], index: 0 })

    st().setSleepTrackEnd()
    st().next()
    expect(st().sleep).toBeNull()

    st().setSleepMinutes(60)
    st().next()
    expect(st().sleep?.mode).toBe('minute')
  })

  it('pauses on the natural end of the current track (no repeat, no advance)', () => {
    const pause = vi.mocked(audioEngine.pause)
    usePlayerStore.setState({ queue: ['a', 'b', 'c'], index: 1, mode: 'one' })

    st().setSleepTrackEnd()
    st().handleEnded()

    expect(pause).toHaveBeenCalledTimes(1)
    expect(st().sleep).toBeNull()
    expect(st().index).toBe(1) // 'one' mode would have replayed the same track
    expect(useUiStore.getState().toasts.some((t) => t.text.includes('当前歌曲已播完'))).toBe(true)
  })

  it('keeps playing through the queue and only stops once the queue ends', () => {
    const pause = vi.mocked(audioEngine.pause)
    usePlayerStore.setState({ queue: ['a', 'b', 'c'], index: 0, mode: 'list' })

    st().setSleepQueueEnd()
    st().handleEnded()
    expect(pause).not.toHaveBeenCalled() // timer armed, queue not over yet

    usePlayerStore.setState({ index: 2 }) // last track ends
    st().handleEnded()
    expect(pause).toHaveBeenCalledTimes(1)
    expect(st().sleep).toBeNull()
    expect(st().index).toBe(2) // no wrap-around to index 0
    expect(useUiStore.getState().toasts.some((t) => t.text.includes('当前队列已播完'))).toBe(true)
  })

  it('stops a single-track queue instead of looping forever', () => {
    const pause = vi.mocked(audioEngine.pause)
    usePlayerStore.setState({ queue: ['a'], index: 0, mode: 'list' })

    st().setSleepQueueEnd()
    st().handleEnded()

    expect(pause).toHaveBeenCalledTimes(1)
    expect(st().sleep).toBeNull()
    expect(st().index).toBe(0)
  })

  it('never persists the timer — a restart starts with sleep off', () => {
    // volume is persisted; the sleep timer must never ride along with it
    st().setSleepMinutes(30)
    st().setVolume(0.5) // triggers the debounced persist
    vi.advanceTimersByTime(500)

    expect(written.length).toBeGreaterThan(0)
    for (const raw of written) {
      // F8: assert the *absence* of the timer fields instead of locking the
      // whole key set — a new persisted key must not make this test lie.
      expect(raw).not.toContain('sleep')
      expect(raw).not.toContain('deadline')
      const parsed = JSON.parse(raw) as Record<string, unknown>
      expect(parsed.volume).toBe(0.5)
      expect(parsed.sleep).toBeUndefined()
      expect(parsed.sleepRemaining).toBeUndefined()
    }
  })

  // ---- F1 regression guard: 列表循环回绕 must survive the sleep-timer work ----
  it('wraps back to index 0 when the last track ends with no timer armed', () => {
    const pause = vi.mocked(audioEngine.pause)
    usePlayerStore.setState({ queue: ['a', 'b', 'c'], index: 2, mode: 'list' })

    st().handleEnded()

    expect(pause).not.toHaveBeenCalled() // no timer → normal playback continues
    expect(st().index).toBe(0) // 1.0.3 wrap-around semantics
  })

  it('wraps back to index 0 on a manual next from the last track', () => {
    usePlayerStore.setState({ queue: ['a', 'b', 'c'], index: 2, mode: 'list' })

    st().next()

    expect(st().index).toBe(0)
  })

  it("still wraps in 'one' mode when the user explicitly skips", () => {
    usePlayerStore.setState({ queue: ['a', 'b', 'c'], index: 2, mode: 'one' })

    st().next()

    expect(st().index).toBe(0)
  })

  // ---- F7(b): a 'queue' timer must fire in 'one' mode even when the queue has
  // more than one track. In 'one' mode the same track repeats forever, so the
  // ended index never reaches the last position — without the `playMode === 'one'`
  // branch in sleepTimer.decideEnded the timer would never fire at all.
  // The assertions below deliberately observe what only applySleepStop('queue')
  // can do (pause + clear + 队列已播完 toast): when the branch falls through,
  // handleEnded takes the `loadCurrentInternal(get, set, s.index, true)` repeat
  // path instead, so no pause is issued, the timer stays armed and no toast is
  // raised. Removing that one line therefore fails this test.
  it("a multi-track queue timer fires on the first natural end in 'one' mode", () => {
    const pause = vi.mocked(audioEngine.pause)
    // middle track: neither position leaks a "reached the end" pass
    usePlayerStore.setState({ queue: ['a', 'b', 'c'], index: 1, mode: 'one' })

    st().setSleepQueueEnd()
    expect(st().sleep?.mode).toBe('queue') // the timer is armed, playback untouched

    st().handleEnded()

    expect(pause).toHaveBeenCalledTimes(1) // applySleepStop paused playback
    expect(st().sleep).toBeNull() // ... and cleared the armed timer
    expect(st().index).toBe(1) // the first track end stops playback (no advance)
    expect(useUiStore.getState().toasts.some((t) => t.text.includes('当前队列已播完'))).toBe(true)
    expect(useUiStore.getState().toasts.some((t) => t.text.includes('当前歌曲已播完'))).toBe(false)
  })

  it("does not fire a 'queue' timer on a mid-queue natural end in list mode", () => {
    const pause = vi.mocked(audioEngine.pause)
    // the contrast case for the test above: same position, mode 'list' → the
    // timer must survive the first track and only fire at the queue's end
    usePlayerStore.setState({ queue: ['a', 'b', 'c'], index: 0, mode: 'list' })

    st().setSleepQueueEnd()
    st().handleEnded()

    expect(pause).not.toHaveBeenCalled()
    expect(st().sleep?.mode).toBe('queue')
    expect(st().index).toBe(1) // playback advanced — the timer did not interfere
  })

  // non-regression guard: a one-track queue in 'one' mode must not loop forever
  it("still stops immediately when a one-track queue repeats in 'one' mode", () => {
    const pause = vi.mocked(audioEngine.pause)
    usePlayerStore.setState({ queue: ['a'], index: 0, mode: 'one' })

    st().setSleepQueueEnd()
    st().handleEnded()

    expect(pause).toHaveBeenCalledTimes(1)
    expect(st().sleep).toBeNull()
    expect(st().index).toBe(0)
  })

  it('a manual skip only drops the track timer, keeping an armed queue timer', () => {
    usePlayerStore.setState({ queue: ['a', 'b', 'c'], index: 0, mode: 'list' })

    st().setSleepQueueEnd()
    st().next()
    expect(st().sleep?.mode).toBe('queue') // survives the skip

    st().setSleepTrackEnd()
    st().next()
    expect(st().sleep).toBeNull() // the track timer is dropped
  })
})

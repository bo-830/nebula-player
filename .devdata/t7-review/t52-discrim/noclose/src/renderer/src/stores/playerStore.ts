import { create } from 'zustand'
import type { PlayMode, Track } from '../types'
import { audioEngine } from '../lib/audioEngine'
import { mediaUrlFor } from '../lib/mediaUrl'
import { bumpPlayStat } from '../lib/playStats'
import { withQueueContext } from '../lib/queue'
import {
  armMinutes,
  armQueueEnd,
  armTrackEnd,
  shouldStopOnEnded,
  sleepRemainingSeconds,
  sleepTickOnTime,
  type SleepTimer
} from '../lib/sleepTimer'
import { useLibraryStore } from './libraryStore'
import { useUiStore } from './uiStore'

const SAVE_KEY = 'nebula.player.state'

interface PersistedState {
  trackId?: string
  position?: number
  volume?: number
  mode?: PlayMode
}

function loadPersisted(): PersistedState {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    return raw ? (JSON.parse(raw) as PersistedState) : {}
  } catch {
    return {}
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
function persistPlayer(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const { current, currentTime, volume, mode } = usePlayerStore.getState()
    const data: PersistedState = { volume, mode }
    if (current) {
      data.trackId = current.id
      data.position = currentTime
    }
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data))
    } catch {
      // storage full/privated — ignore
    }
  }, 300)
}

interface PlayerState {
  queue: string[]
  index: number
  current: Track | null
  isPlaying: boolean
  isLoading: boolean
  error: string | null
  mode: PlayMode
  volume: number
  muted: boolean
  currentTime: number
  duration: number
  /** true after the audio path fell back to direct element playback */
  audioDirect: boolean

  /** active sleep timer (null = off); never persisted — a restart clears it */
  sleep: SleepTimer | null
  /** whole seconds left on a countdown sleep timer (UI state, ticked once a second) */
  sleepRemaining: number | null

  playTracks: (tracks: Track[], startIndex: number) => Promise<void>
  toggle: () => void
  next: (manual?: boolean) => void
  prev: () => void
  stop: () => void
  seek: (sec: number) => void
  setVolume: (v: number) => void
  toggleMute: () => void
  setMode: (m: PlayMode) => void
  setSleepMinutes: (minutes: number) => void
  setSleepTrackEnd: () => void
  setSleepQueueEnd: () => void
  clearSleep: (silent?: boolean) => void
  initEngine: () => void
  resumeIfSaved: () => Promise<void>
  handleEnded: () => void
}

let loadSeq = 0
let lastStatePush = 0

function pushStateThrottled(force = false): void {
  const now = Date.now()
  if (!force && now - lastStatePush < 700) return
  lastStatePush = now
  const s = usePlayerStore.getState()
  window.api.playerPushState({
    trackId: s.current?.id ?? null,
    isPlaying: s.isPlaying,
    volume: s.muted ? 0 : s.volume,
    mode: s.mode,
    currentTime: s.currentTime,
    duration: s.duration,
    title: s.current?.title ?? '',
    artist: s.current?.artist ?? ''
  })
  persistPlayer()
}

let engineInitialized = false

// ---------- sleep timer clock ----------
// In-memory only (never persisted): the timer is armed by the user and lives
// exactly as long as the app window does.

let sleepTicker: ReturnType<typeof setInterval> | null = null

function stopSleepTicker(): void {
  if (sleepTicker) {
    clearInterval(sleepTicker)
    sleepTicker = null
  }
}

/** Pause playback (without resuming anything) and report the trigger. */
function applySleepStop(from: 'minute' | 'track' | 'queue'): void {
  usePlayerStore.setState({ sleep: null, sleepRemaining: null })
  stopSleepTicker()
  audioEngine.pause()
  const label =
    from === 'minute' ? '定时时间到' : from === 'track' ? '当前歌曲已播完' : '当前队列已播完'
  useUiStore.getState().toast(`睡眠定时器已触发，已暂停播放（${label}）`, 'info')
}

function startSleepTicker(): void {
  stopSleepTicker()
  sleepTicker = setInterval(() => {
    const s = usePlayerStore.getState()
    if (!s.sleep) {
      stopSleepTicker()
      return
    }
    const next = sleepTickOnTime(s.sleep, Date.now())
    if (!next) {
      applySleepStop('minute')
      return
    }
    const remaining = sleepRemainingSeconds(next, Date.now())
    if (remaining !== s.sleepRemaining) usePlayerStore.setState({ sleepRemaining: remaining })
  }, 1000)
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  queue: [],
  index: -1,
  current: null,
  isPlaying: false,
  isLoading: false,
  error: null,
  mode: 'list',
  volume: 0.8,
  muted: false,
  currentTime: 0,
  duration: 0,
  audioDirect: false,
  sleep: null,
  sleepRemaining: null,

  initEngine: () => {
    if (engineInitialized) return // idempotent: strict-mode double effects would duplicate listeners
    engineInitialized = true
    audioEngine.init()
    audioEngine.on('timeupdate', () => {
      const s = get()
      set({ currentTime: audioEngine.currentTime, duration: audioEngine.duration || s.duration })
      pushStateThrottled() // keeps tray / taskbar / mini-lyric in sync
      if (Math.floor(audioEngine.currentTime) % 10 === 0 && audioEngine.currentTime > 0) {
        persistPlayer()
      }
    })
    audioEngine.on('play', () => {
      set({ isPlaying: true })
      pushStateThrottled(true)
    })
    audioEngine.on('pause', () => {
      set({ isPlaying: false })
      pushStateThrottled(true)
    })
    audioEngine.on('ended', () => get().handleEnded())
    audioEngine.on('fallback', () => {
      set({ audioDirect: true })
      useUiStore.getState().toast('已切换为兼容音频输出，频谱以波形显示', 'info')
    })
    audioEngine.on('error', () => {
      const s = get()
      if (!s.current) return
      set({ isLoading: false, error: '播放失败，文件可能已损坏或不存在' })
      useUiStore.getState().toast(`播放失败: ${s.current.title}`, 'error')
      if (get().mode === 'one') {
        set({ error: null })
        void loadCurrentInternal(get, set, get().index, true)
      } else if (get().queue.length > 1) {
        setTimeout(() => {
          get().next()
        }, 600)
      }
    })
  },

  playTracks: async (tracks, startIndex) => {
    if (tracks.length === 0) return
    // a single requested track gets queue context so auto-advance keeps playing
    const startTrack = tracks[Math.min(Math.max(0, startIndex), tracks.length - 1)]
    const list = withQueueContext(tracks, useLibraryStore.getState().tracks)
    const ids = list.map((t) => t.id)
    const idx = Math.max(
      0,
      list.findIndex((t) => t.id === startTrack.id)
    )
    set({ queue: ids, index: idx, error: null })
    await loadCurrentInternal(get, set, idx, true)
  },

  toggle: () => {
    const s = get()
    if (!s.current) {
      // nothing loaded — resume first visible tracks via UI instead
      return
    }
    if (s.isLoading) return
    if (s.isPlaying) {
      audioEngine.pause()
    } else {
      void audioEngine.play()
    }
  },

  next: (manual = true) => {
    const s = get()
    if (s.queue.length === 0) return
    // F7: a manual skip is the user's own intent, but it only invalidates the
    // *track*-scoped timer (that one is about "this song"). A 'queue' timer
    // stays armed so "finish the queue" still means something after a skip.
    if (manual && s.sleep?.mode === 'track') get().clearSleep(true)
    const sleepStop = get().sleep?.mode === 'queue'
    if (s.mode === 'shuffle' && s.queue.length > 1) {
      // shuffle has no deterministic queue end: the timer is judged only by
      // decideEnded (endedIndex >= last) and never by a "reached the end" skip.
      let nextIndex: number
      do {
        nextIndex = Math.floor(Math.random() * s.queue.length)
      } while (nextIndex === s.index)
      void loadCurrentInternal(get, set, nextIndex, true)
      return
    }
    if (!manual && s.mode === 'one') return
    // list mode wraps around — a single-track queue simply loops
    // (matches 列表循环 semantics and never leaves the player silent).
    // An armed 'queue' timer does NOT cap this index: the natural end of the
    // last track is caught by handleEnded → 队列已播完 (see decideEnded).
    const nextIndex = sleepStop
      ? Math.min(s.index + 1, s.queue.length - 1)
      : (s.index + 1) % s.queue.length
    void loadCurrentInternal(get, set, nextIndex, true)
  },

  prev: () => {
    const s = get()
    if (s.queue.length === 0) return
    if (audioEngine.currentTime > 5) {
      get().seek(0)
      return
    }
    let prevIndex: number
    if (s.mode === 'shuffle' && s.queue.length > 1) {
      do {
        prevIndex = Math.floor(Math.random() * s.queue.length)
      } while (prevIndex === s.index)
    } else {
      prevIndex = (s.index - 1 + s.queue.length) % s.queue.length
    }
    void loadCurrentInternal(get, set, prevIndex, true)
  },

  stop: () => {
    audioEngine.stop()
    set({ isPlaying: false, isLoading: false, currentTime: 0, error: null })
    get().clearSleep(true) // playback itself was stopped — nothing left to time
    pushStateThrottled(true)
  },

  seek: (sec) => {
    audioEngine.seek(sec)
    set({ currentTime: sec })
    pushStateThrottled(true)
    persistPlayer()
  },

  setVolume: (v) => {
    const vol = Math.min(1, Math.max(0, v))
    audioEngine.setVolume(vol, get().muted)
    set({ volume: vol })
    persistPlayer()
  },

  toggleMute: () => {
    const muted = !get().muted
    audioEngine.setVolume(get().volume, muted)
    set({ muted })
    pushStateThrottled(true)
  },

  setMode: (m) => {
    set({ mode: m })
    persistPlayer()
    useUiStore
      .getState()
      .toast(
        `播放模式: ${m === 'list' ? '列表循环' : m === 'one' ? '单曲循环' : '随机播放'}`,
        'info'
      )
  },

  // ---------- sleep timer ----------

  setSleepMinutes: (minutes) => {
    const timer = armMinutes(minutes, Date.now(), get().mode)
    set({ sleep: timer, sleepRemaining: sleepRemainingSeconds(timer, Date.now()) })
    startSleepTicker()
    useUiStore.getState().toast(`睡眠定时器：${timer.minutes} 分钟后暂停播放`, 'success')
  },

  setSleepTrackEnd: () => {
    set({ sleep: armTrackEnd(get().mode), sleepRemaining: null })
    stopSleepTicker()
    useUiStore.getState().toast('睡眠定时器：播完当前歌曲后暂停播放', 'success')
  },

  setSleepQueueEnd: () => {
    set({ sleep: armQueueEnd(get().mode), sleepRemaining: null })
    stopSleepTicker()
    useUiStore.getState().toast('睡眠定时器：播完当前队列后暂停播放', 'success')
  },

  clearSleep: (silent = false) => {
    const had = get().sleep !== null
    set({ sleep: null, sleepRemaining: null })
    stopSleepTicker()
    if (had && !silent) useUiStore.getState().toast('已取消睡眠定时器', 'info')
  },

  resumeIfSaved: async () => {
    const saved = loadPersisted()
    if (saved.volume !== undefined) {
      audioEngine.setVolume(saved.volume, false)
      set({ volume: saved.volume })
    }
    if (saved.mode) set({ mode: saved.mode })
    if (!saved.trackId) return
    const track = useLibraryStore.getState().map[saved.trackId]
    if (!track || track.missing) return
    // restore with queue context (album / artist / library) instead of a lone track
    const list = withQueueContext([track], useLibraryStore.getState().tracks)
    set({
      queue: list.map((t) => t.id),
      index: 0,
      current: track,
      duration: track.duration,
      currentTime: saved.position ?? 0
    })
    try {
      const url = await window.api.decodeEnsure(track.path)
      await audioEngine.load(url)
      if (saved.position) audioEngine.seek(saved.position)
      pushStateThrottled(true)
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  handleEnded: () => {
    const s = get()
    // the sleep timer is evaluated first: it may suppress both the 'one' mode
    // repeat and the list-mode wrap-around.
    // F13: `shouldStopOnEnded` is the single authority here (decideEnded owns the
    // rule); the toast label is derived from the timer mode, with 'queue' as the
    // fallback because F7 makes a queue timer fire in 'one' mode too.
    const stop = shouldStopOnEnded({
      sleep: s.sleep,
      playMode: s.mode,
      endedIndex: s.index,
      queueLength: s.queue.length,
      manual: false
    })
    if (stop) {
      applySleepStop(s.sleep?.mode === 'track' ? 'track' : 'queue')
      return
    }
    if (s.mode === 'one') {
      void loadCurrentInternal(get, set, s.index, true)
    } else {
      s.next(false)
    }
  }
}))

async function loadCurrentInternal(
  get: () => PlayerState,
  set: (partial: Partial<PlayerState>) => void,
  index: number,
  autoplay: boolean
): Promise<void> {
  const seq = ++loadSeq
  const { queue } = get()
  if (index < 0 || index >= queue.length) return
  const track = useLibraryStore.getState().map[queue[index]]
  if (!track) {
    set({ isLoading: false })
    return
  }
  set({
    index,
    current: track,
    isLoading: true,
    error: null,
    currentTime: 0,
    duration: track.duration
  })

  try {
    const url = await window.api.decodeEnsure(track.path)
    if (seq !== loadSeq) return // superseded by a newer load
    await audioEngine.load(url)
    if (seq !== loadSeq) return
    set({ duration: audioEngine.duration || track.duration, isLoading: false })
    if (autoplay) {
      bumpPlayStat(track.id) // feed 最近播放/常听
      await audioEngine.play()
    }
    pushStateThrottled(true)
    try {
      if (navigator.mediaSession) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: track.title,
          artist: track.artist,
          album: track.album,
          artwork: track.coverPath ? [{ src: mediaUrlFor(track.coverPath), sizes: '512x512' }] : []
        })
      }
    } catch {
      // mediaSession is best-effort
    }
  } catch (err) {
    if (seq !== loadSeq) return
    const msg = err instanceof Error ? err.message : String(err)
    set({ isLoading: false, error: msg })
    useUiStore.getState().toast(`无法播放 "${track.title}"：${msg}`, 'error')
    if (autoplay && queue.length > 1) {
      setTimeout(() => {
        if (usePlayerStore.getState().index === index) {
          get().next()
        }
      }, 700)
    }
  }
}

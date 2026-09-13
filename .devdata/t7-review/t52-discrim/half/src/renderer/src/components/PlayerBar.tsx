import { useEffect, useRef, useState } from 'react'
import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Repeat,
  Repeat1,
  Shuffle,
  Volume2,
  VolumeX,
  Volume1,
  Captions,
  Moon,
  ListEnd,
  Music
} from 'lucide-react'
import { usePlayerStore } from '../stores/playerStore'
import { audioEngine } from '../lib/audioEngine'
import { formatTime } from '../lib/format'
import {
  formatSleepRemaining,
  sleepModeLabel,
  SLEEP_MINUTES,
  type SleepMode
} from '../lib/sleepTimer'
import { Cover } from './Cover'
import type { PlayMode } from '../types'

export function PlayerBar(): React.JSX.Element {
  const current = usePlayerStore((s) => s.current)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const isLoading = usePlayerStore((s) => s.isLoading)
  const mode = usePlayerStore((s) => s.mode)

  // cycle: list → one → shuffle → list
  const cycleMode = (): void => {
    const m = usePlayerStore.getState().mode
    const next: PlayMode = m === 'list' ? 'one' : m === 'one' ? 'shuffle' : 'list'
    usePlayerStore.getState().setMode(next)
  }

  const ModeIcon = mode === 'one' ? Repeat1 : mode === 'shuffle' ? Shuffle : Repeat

  return (
    <div className="pb">
      <div
        className="pb-cover"
        title={current ? `正在播放：${current.title} — ${current.artist}` : '未在播放'}
      >
        {current ? <Cover src={current.coverPath} alt={current.title} /> : null}
      </div>
      <div className="pb-meta">
        <div className="pb-title">{current?.title ?? '未在播放'}</div>
        <div className="pb-artist">{current?.artist ?? 'NEBULA PLAYER'}</div>
      </div>

      <div className="pb-center">
        <div className="pb-buttons">
          <button
            className="pb-btn"
            title="上一曲"
            onClick={() => usePlayerStore.getState().prev()}
          >
            <SkipBack size={17} />
          </button>
          <button
            className="pb-btn primary"
            title={isPlaying ? '暂停' : '播放'}
            onClick={() => usePlayerStore.getState().toggle()}
            disabled={!current}
          >
            {isLoading ? (
              <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            ) : isPlaying ? (
              <Pause size={18} fill="currentColor" />
            ) : (
              <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />
            )}
          </button>
          <button
            className="pb-btn"
            title="下一曲"
            onClick={() => usePlayerStore.getState().next()}
          >
            <SkipForward size={17} />
          </button>
          <button
            className={`pb-btn ${mode !== 'list' ? 'mode-active' : ''}`}
            title={mode === 'list' ? '列表循环' : mode === 'one' ? '单曲循环' : '随机播放'}
            onClick={cycleMode}
          >
            <ModeIcon size={15} />
          </button>
        </div>
        <ProgressBar />
      </div>

      <div className="pb-right">
        <SleepTimer />
        <button
          className="pb-btn"
          title="悬浮歌词 / 迷你窗口"
          onClick={() => void window.api.miniToggle()}
        >
          <Captions size={16} />
        </button>
        <VolumeControl />
      </div>
    </div>
  )
}

// ---------- sleep timer ----------

function SleepTimer(): React.JSX.Element {
  const sleep = usePlayerStore((s) => s.sleep)
  const storeRemaining = usePlayerStore((s) => s.sleepRemaining)
  const minutes = sleep?.mode === 'minute' ? sleep.minutes : null
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // The store's sleep timer is the single source of truth for the pause side
  // effect; this component only owns the dropdown. While the menu is open its
  // countdown hint is recomputed once a second so it stays live.
  const [menuLeft, setMenuLeft] = useState<number | null>(null)
  useEffect(() => {
    if (!open) return
    const id = setInterval(() => {
      const s = usePlayerStore.getState().sleep
      setMenuLeft(
        s && s.deadline !== null ? Math.max(0, Math.ceil((s.deadline - Date.now()) / 1000)) : null
      )
    }, 1000)
    return () => clearInterval(id)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const countdown = storeRemaining !== null ? formatSleepRemaining(storeRemaining) : null
  const menuCountdown = menuLeft !== null ? formatSleepRemaining(menuLeft) : countdown
  const title = sleep
    ? `睡眠定时器：${sleepModeLabel(sleep)}${sleep.mode === 'minute' && countdown ? `（剩余 ${countdown}）` : ''}`
    : '睡眠定时器：未启用'

  const pick = (mode: SleepMode, mins?: number): void => {
    const p = usePlayerStore.getState()
    if (mode === 'minute') p.setSleepMinutes(mins ?? SLEEP_MINUTES[1])
    else if (mode === 'track') p.setSleepTrackEnd()
    else p.setSleepQueueEnd()
    setOpen(false)
  }

  return (
    <div className="sleep-wrap" ref={ref}>
      <button
        className={`pb-btn sleep-btn ${sleep ? 'mode-active' : ''} ${open ? 'menu-open' : ''}`}
        title={title}
        aria-label="睡眠定时器"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Moon size={16} fill={sleep ? 'currentColor' : 'none'} />
        {countdown && <span className="sleep-badge">{countdown}</span>}
      </button>

      {open && (
        <div className="sleep-menu" role="menu">
          <div className="sleep-menu-title">睡眠定时器</div>
          {SLEEP_MINUTES.map((m) => (
            <button
              key={m}
              role="menuitem"
              className={`sleep-item ${minutes === m ? 'active' : ''}`}
              onClick={() => pick('minute', m)}
            >
              <Music size={14} />
              <span>{m} 分钟后暂停</span>
              {minutes === m && menuCountdown && (
                <span className="sleep-item-hint">{menuCountdown}</span>
              )}
            </button>
          ))}
          <button
            role="menuitem"
            className={`sleep-item ${sleep?.mode === 'track' ? 'active' : ''}`}
            onClick={() => pick('track')}
          >
            <Music size={14} />
            <span>播完当前歌曲后暂停</span>
          </button>
          <button
            role="menuitem"
            className={`sleep-item ${sleep?.mode === 'queue' ? 'active' : ''}`}
            onClick={() => pick('queue')}
          >
            <ListEnd size={14} />
            <span>播完当前队列后暂停</span>
          </button>

          {sleep && (
            <button
              className="sleep-item sleep-cancel"
              role="menuitem"
              onClick={() => {
                usePlayerStore.getState().clearSleep()
                setOpen(false)
              }}
            >
              取消定时
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ProgressBar(): React.JSX.Element {
  const duration = usePlayerStore((s) => s.duration)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const isLoading = usePlayerStore((s) => s.isLoading)
  const [dragRatio, setDragRatio] = useState<number | null>(null)

  // smooth local time while playing
  const ref = useRef<HTMLDivElement>(null)
  const [live, setLive] = useState(0)
  useEffect(() => {
    if (!isPlaying) return
    let raf = 0
    const tick = (): void => {
      setLive(audioEngine.currentTime)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying])

  const ratioFromEvent = (e: React.PointerEvent): number => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return 0
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
  }

  const shownTime =
    dragRatio !== null
      ? dragRatio * duration
      : isPlaying
        ? live
        : usePlayerStore.getState().currentTime
  const time = Number.isFinite(shownTime) ? shownTime : 0
  const ratio = duration > 0 ? Math.min(1, time / duration) : 0

  return (
    <div className="progress-wrap">
      <span className="progress-time">{formatTime(time)}</span>
      <div
        ref={ref}
        className={`pbar ${isLoading ? 'loading' : ''}`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setDragRatio(ratioFromEvent(e))
        }}
        onPointerMove={(e) => {
          if (dragRatio !== null) setDragRatio(ratioFromEvent(e))
        }}
        onPointerUp={(e) => {
          if (dragRatio !== null) {
            usePlayerStore.getState().seek(ratioFromEvent(e) * duration)
          }
          setDragRatio(null)
        }}
      >
        <div className="pbar-track">
          <div className="pbar-fill" style={{ width: `${ratio * 100}%` }} />
        </div>
      </div>
      <span className="progress-time">{formatTime(duration)}</span>
    </div>
  )
}

function VolumeControl(): React.JSX.Element {
  const volume = usePlayerStore((s) => s.volume)
  const muted = usePlayerStore((s) => s.muted)
  const [dragRatio, setDragRatio] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const ratioFromEvent = (e: React.PointerEvent): number => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return 0
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
  }

  const handleUp = (e: React.PointerEvent): void => {
    if (dragRatio !== null) usePlayerStore.getState().setVolume(ratioFromEvent(e))
    setDragRatio(null)
  }

  const Icon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

  return (
    <>
      <button
        className="pb-btn"
        title={muted ? '取消静音' : '静音'}
        onClick={() => usePlayerStore.getState().toggleMute()}
      >
        <Icon size={16} />
      </button>
      <div
        ref={ref}
        className="vol-bar"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setDragRatio(ratioFromEvent(e))
        }}
        onPointerMove={(e) => {
          if (dragRatio !== null) setDragRatio(ratioFromEvent(e))
        }}
        onPointerUp={handleUp}
      >
        <div className="vol-track">
          <div
            className="vol-fill"
            style={{ width: `${(dragRatio ?? (muted ? 0 : volume)) * 100}%` }}
          />
        </div>
      </div>
    </>
  )
}

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { usePlayerStore } from '../stores/playerStore'
import { MicVocal, Minus, Plus, RotateCcw } from 'lucide-react'
import {
  OFFSET_STEP,
  adjustOffset,
  clearOffset,
  formatOffset,
  getOffsetSnapshot,
  hasOffset,
  subscribeOffsets
} from '../lib/lyricsOffset'

interface LyricLine {
  t: number
  text: string
}

/**
 * result of one lyricsGet for a track — cached so the panel can derive
 * "still loading" instead of calling setState inside an effect.
 */
interface LyricsLoad {
  trackId: string
  lines: LyricLine[]
  source: 'lrc' | 'embedded' | 'none'
}

/**
 * Synced lyrics panel: highlights the current line (by playback time),
 * auto-scrolls to keep it centered, click a line to seek. Unsynced lyrics
 * (t=-1) are shown statically without highlight/seek.
 *
 * A per-track offset calibration (±0.5s) shifts the highlight and the seek
 * target together; at 0 the behaviour is exactly as before.
 */
export function LyricsPanel(): React.JSX.Element {
  const current = usePlayerStore((s) => s.current)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const currentId = current?.id ?? null
  const [load, setLoad] = useState<LyricsLoad | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // `trackId` is part of the value so a track change always re-scrolls once,
  // which removes the need for a separate "reset" effect.
  const activeRef = useRef<{ trackId: string | null; index: number }>({ trackId: null, index: -1 })
  // per-track calibration read straight from the localStorage store — no
  // synchronisation effect needed, so this never cascades a render
  const offset = useSyncExternalStore(subscribeOffsets, getOffsetSnapshot(currentId))

  useEffect(() => {
    if (!current) return
    let alive = true
    const trackId = current.id
    window.api
      .lyricsGet({ path: current.path, mtime: current.mtime, size: current.size })
      .then((r) => {
        // only state updates happen in the async callback — never in the effect body
        if (alive) setLoad({ trackId, lines: r.lines, source: r.source })
      })
      .catch(() => {
        if (alive) setLoad({ trackId, lines: [], source: 'none' })
      })
    return () => {
      alive = false
    }
  }, [current])

  // current track's lyrics (stale result of a previous track is ignored)
  const lines = useMemo(
    () => (current && load?.trackId === current.id ? load.lines : []),
    [current, load]
  )
  const source = current && load?.trackId === current.id ? load.source : 'none'
  const loaded = Boolean(current && load?.trackId === current.id)

  // index of the current synced line (offset shifts the line boundary)
  const active = useMemo(() => {
    const t = currentTime + 0.12 + offset
    let idx = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].t >= 0 && lines[i].t <= t) idx = i
      else if (lines[i].t >= 0 && lines[i].t > t) break
    }
    return idx
  }, [lines, currentTime, offset])

  // auto-scroll so the active line stays centered
  useEffect(() => {
    const container = containerRef.current
    if (!container || active < 0) return
    const last = activeRef.current
    if (last.trackId === currentId && last.index === active) return
    activeRef.current = { trackId: currentId, index: active }
    const el = container.querySelector(`[data-i="${active}"]`) as HTMLElement | null
    if (!el) return
    const top = el.offsetTop - container.clientHeight / 2 + el.offsetHeight / 2
    container.scrollTo({ top, behavior: 'smooth' })
  }, [active, currentId])

  if (!current) {
    return (
      <div className="lyrics-wrap">
        <div className="lyrics-empty">播放歌曲后，这里会显示同步歌词</div>
      </div>
    )
  }

  if (!loaded) {
    return (
      <div className="lyrics-wrap">
        <div className="lyrics-empty">正在读取歌词…</div>
      </div>
    )
  }

  if (lines.length === 0 || source === 'none') {
    return (
      <div className="lyrics-wrap">
        <div className="lyrics-empty">
          <MicVocal size={22} style={{ marginBottom: 10, color: 'var(--text-faint)' }} />
          <div>未找到歌词</div>
          <div style={{ fontSize: 11, marginTop: 6, color: 'var(--text-faint)' }}>
            将同名 <code>.lrc</code> 文件放到音频旁，或使用内嵌歌词
          </div>
        </div>
      </div>
    )
  }

  const tuned = hasOffset(offset)
  // the panel itself has to stay a flex item of `.detail`, otherwise the inner
  // `.lyrics-wrap` (flex:1 + min-height:0) would collapse and stop scrolling
  const panelStyle: React.CSSProperties = {
    flex: '1 1 auto',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column'
  }
  const tunerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '2px 0 6px',
    fontSize: 11,
    color: 'var(--text-faint)'
  }
  const tunerBtn: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
    padding: '2px 6px',
    fontSize: 11
  }

  return (
    <div style={panelStyle}>
      <div
        style={tunerStyle}
        title="歌词整体偏移校准：正数=歌词提前生效，负数=歌词延后生效（每步 0.5s，按曲目记忆）"
      >
        <button
          className="btn"
          style={tunerBtn}
          title={`歌词延后 0.5s（偏移 −0.5s）`}
          onClick={() => adjustOffset(current.id, -OFFSET_STEP)}
        >
          <Minus size={11} />
          {OFFSET_STEP}s
        </button>
        <span
          className={tuned ? 'chip-badge' : undefined}
          style={{ minWidth: 46, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
        >
          {formatOffset(offset)}
        </span>
        <button
          className="btn"
          style={tunerBtn}
          title={`歌词提前 0.5s（偏移 +0.5s）`}
          onClick={() => adjustOffset(current.id, OFFSET_STEP)}
        >
          <Plus size={11} />
          {OFFSET_STEP}s
        </button>
        <button
          className="btn"
          style={{ ...tunerBtn, opacity: tuned ? 1 : 0.5 }}
          title="重置本曲歌词偏移"
          disabled={!tuned}
          onClick={() => clearOffset(current.id)}
        >
          <RotateCcw size={11} />
          重置
        </button>
      </div>
      <div className="lyrics-wrap" ref={containerRef}>
        {lines.map((l, i) => (
          <button
            key={i}
            data-i={i}
            className={`lyric-line ${i === active ? 'active' : ''}`}
            onClick={() => {
              if (l.t >= 0) usePlayerStore.getState().seek(Math.max(0, l.t - offset))
            }}
          >
            {l.text}
          </button>
        ))}
        <div style={{ height: '45%' }} />
      </div>
    </div>
  )
}

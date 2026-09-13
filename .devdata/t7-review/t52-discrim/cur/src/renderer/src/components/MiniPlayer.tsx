import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Maximize2, Minimize2, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react'
import type { PlayerState, Track } from '../types'
import { Cover } from './Cover'
import { MiniChat } from './MiniChat'
import { MiniSearch } from './MiniSearch'
import { getOffsetSnapshot, subscribeOffsets } from '../lib/lyricsOffset'
import {
  acceptLyricsResponse,
  claimLyricsRequest,
  clearLyricsHolders,
  trackLyricsPush
} from '../lib/miniLyricsDedup'

/**
 * Floating always-on-top mini window (display-only): cover + title + synced
 * lyric line + transport buttons. State arrives from the main window via
 * 'mini:state' events; buttons send commands back.
 *
 * The lyric line uses the same per-track offset calibration as the detail
 * panel, so both views stay in sync.
 *
 * Collapsed the bar shows 2 lyric lines (current + next) and the transport; the
 * header's expand button grows the window (the main process owns the geometry)
 * into a mini player with a library search pane on top and the proxied AI chat
 * pane at the bottom. The search pane hides the lyrics while it has a query, so
 * results never squeeze the lyric area out of the 540px budget.
 */
export function MiniPlayer(): React.JSX.Element {
  const [track, setTrack] = useState<Track | null>(null)
  const [state, setState] = useState<PlayerState | null>(null)
  const [lines, setLines] = useState<Array<{ t: number; text: string }>>([])
  const [display, setDisplay] = useState(0)
  /** mirrors the main process' window geometry state (source of truth) */
  const [expanded, setExpanded] = useState(false)
  const [searching, setSearching] = useState(false)
  const timeRef = useRef({ t: 0, ts: 0 })
  // A2 fix: dedupe lyrics fetches with refs, never with a captured render value.
  // `claimed` = the track the latest lyricsGet was started for, `wanted` = the
  // newest track the window has seen. The rule itself lives in
  // `lib/miniLyricsDedup.ts` (pure TS) so the regression suite
  // `lib/__tests__/miniLyricsDedup.test.ts` drives the PRODUCTION functions —
  // breaking them fails that suite. The pre-fix guard compared against a
  // render-closure value that was null on the first subscription (the push
  // arrives 4x/s), so it re-issued lyricsGet on every push; fetching without the
  // `wanted` check could also let a slower response for the previous track
  // overwrite the new one (one frame of stale lyrics).
  const claimed = useRef<string | null>(null)
  const wanted = useRef<string | null>(null)
  const trackId = track?.id ?? null
  // same per-track calibration as the detail panel, read from the store
  const offset = useSyncExternalStore(subscribeOffsets, getOffsetSnapshot(trackId))

  useEffect(() => {
    const off = window.api.onMiniState((p) => {
      setState(p.state)
      timeRef.current = { t: p.state.currentTime, ts: Date.now() }
      setTrack(p.track)
      // lyrics are (re)loaded next to the state update, never inside a setState
      // updater, so the updater stays pure and React may invoke it repeatedly
      if (!p.track) {
        clearLyricsHolders(claimed, wanted)
        setLines([])
        return
      }
      const id = p.track.id
      trackLyricsPush(wanted, id)
      if (!claimLyricsRequest(claimed, id)) return
      const incoming = p.track
      void window.api
        .lyricsGet({ path: incoming.path, mtime: incoming.mtime, size: incoming.size })
        .then((r) => {
          // strict newest-wins: once a newer track arrived, the response for the
          // older one is stale and must not paint (no one-frame flash of the
          // previous track's lines)
          if (acceptLyricsResponse(wanted, id)) setLines(r.lines)
        })
        .catch(() => {
          if (acceptLyricsResponse(wanted, id)) setLines([])
        })
    })
    return off
  }, [])

  // smooth time interpolation for lyric sync (updates 4x/s)
  useEffect(() => {
    const timer = setInterval(() => {
      const s = state
      if (!s) return
      const now = Date.now()
      const dt = (now - timeRef.current.ts) / 1000
      setDisplay(s.isPlaying ? s.currentTime + dt : s.currentTime)
    }, 250)
    return () => clearInterval(timer)
  }, [state])

  /**
   * The main process is the single authority for the window geometry: it forces
   * the bar back to collapsed whenever it is hidden, and answers `mini:expand`
   * with the size it actually applied (clamped to the display work area). So the
   * local `expanded` mirrors that answer / those pushes instead of guessing.
   */
  useEffect(() => {
    return window.api.onMiniExpanded((v) => setExpanded(!!v))
  }, [])

  const toggleExpanded = (): void => {
    const next = !expanded
    setExpanded(next) // optimistic: the button must feel instant
    void window.api
      .miniSetExpanded(next)
      .then((size) => {
        // the applied size is authoritative (it may have been clamped)
        if (size && size.height <= 200) setExpanded(false)
      })
      .catch(() => setExpanded(false))
  }

  // active line index
  let active = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].t >= 0 && lines[i].t <= display + 0.12 + offset) active = i
    else if (lines[i].t >= 0 && lines[i].t > display + 0.12 + offset) break
  }

  return (
    <div
      className={`mini-root ${expanded ? 'expanded' : ''}`}
      data-expanded={expanded ? 'true' : 'false'}
    >
      <div className="mini-head drag">
        <div className="mini-cover">
          <Cover src={track?.coverPath ?? null} alt={track?.title ?? ''} />
        </div>
        <div className="mini-meta">
          <div className="mini-title">{track?.title ?? '未在播放'}</div>
          <div className="mini-artist">{track?.artist ?? 'NEBULA PLAYER'}</div>
        </div>
        <button
          className="mini-close no-drag"
          title={expanded ? '收起' : '展开搜索与 AI 聊天'}
          aria-label={expanded ? '收起' : '展开'}
          aria-expanded={expanded}
          onClick={toggleExpanded}
        >
          {expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
        <button className="mini-close no-drag" title="隐藏" onClick={() => window.api.miniClose()}>
          <X size={14} />
        </button>
      </div>

      {expanded && (
        <div className="mini-search-zone">
          <MiniSearch onQueryChange={setSearching} />
        </div>
      )}

      {!searching && (
        <div className="mini-lyric">
          {lines.length === 0 ? (
            <div className="mini-lyric-line none">
              {track ? '暂无歌词 — 把同名 .lrc 放到音频旁' : '播放歌曲后显示同步歌词'}
            </div>
          ) : active >= 0 ? (
            <>
              {expanded && active > 0 && (
                <div className="mini-lyric-line prev">{lines[active - 1].text}</div>
              )}
              <div className="mini-lyric-line active">{lines[active].text}</div>
              {active < lines.length - 1 && (
                <div className="mini-lyric-line next">{lines[active + 1].text}</div>
              )}
            </>
          ) : (
            <div className="mini-lyric-line prev">{lines[0]?.text ?? ''}</div>
          )}
        </div>
      )}

      <div className="mini-controls no-drag">
        <button className="mini-btn" title="上一曲" onClick={() => window.api.miniCommand('prev')}>
          <SkipBack size={15} />
        </button>
        <button
          className="mini-btn play"
          title={state?.isPlaying ? '暂停' : '播放'}
          onClick={() => window.api.miniCommand('toggle')}
        >
          {state?.isPlaying ? (
            <Pause size={17} fill="currentColor" />
          ) : (
            <Play size={17} fill="currentColor" />
          )}
        </button>
        <button className="mini-btn" title="下一曲" onClick={() => window.api.miniCommand('next')}>
          <SkipForward size={15} />
        </button>
      </div>

      {expanded && <MiniChat />}
    </div>
  )
}

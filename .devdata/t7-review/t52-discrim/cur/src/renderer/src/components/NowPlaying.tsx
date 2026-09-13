import { useEffect, useRef, useState } from 'react'
import { usePlayerStore } from '../stores/playerStore'
import { audioEngine } from '../lib/audioEngine'
import { formatTime } from '../lib/format'
import { waveformFor } from '../lib/waveform'
import { Cover } from './Cover'
import { LyricsPanel } from './LyricsPanel'

/**
 * Spectrum visualization, two modes:
 *  - graph: live AnalyserNode bars (real-time, Web Audio available)
 *  - direct: precomputed waveform envelope + glowing playhead (fallback mode)
 * Frame-skipped to ~30fps, DPR-aware, pauses when the window is hidden.
 */
export function Spectrum(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const current = usePlayerStore((s) => s.current)
  const currentId = current?.id ?? null
  const [waveState, setWaveState] = useState<{ id: string; env: number[] } | null>(null)

  // An envelope belongs to exactly one track, so it is derived here: on a track
  // change `wave` is null immediately (old envelope never leaks onto a new
  // track) without a setState inside the effect body.
  const wave = waveState && currentId && waveState.id === currentId ? waveState.env : null

  // load waveform when the track changes (cache reuse across mounts)
  useEffect(() => {
    let alive = true
    if (!currentId) return
    const track = usePlayerStore.getState().current
    if (!track) return
    waveformFor(track)
      .then((env) => {
        if (alive) setWaveState({ id: currentId, env })
      })
      .catch(() => {
        if (alive) setWaveState(null)
      })
    return () => {
      alive = false
    }
  }, [currentId])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const resize = (): void => {
      const rect = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const BARS = 48
    const data = new Uint8Array(1024)
    let raf = 0
    let last = 0
    let idRef: string | null = null
    let envRef: number[] | null = null

    const syncEnv = (): void => {
      const cur = usePlayerStore.getState().current
      idRef = cur?.id ?? null
      envRef = cur ? wave : null
    }

    const drawWaveform = (w: number, h: number, t: number, nowMs: number): void => {
      const cur = usePlayerStore.getState().current
      const env = envRef && cur ? envRef : null
      if (!env || !cur) {
        // idle hint dots
        ctx.fillStyle = 'rgba(125,175,255,0.25)'
        for (let i = 0; i < 6; i++) {
          ctx.beginPath()
          ctx.arc(w / 2 + (i - 2.5) * 10, h / 2, 1.6, 0, Math.PI * 2)
          ctx.fill()
        }
        return
      }
      const dur = Math.max(1, cur.duration || env.length / 20)
      const n = env.length
      const tClamped = Math.min(dur, t)
      // ---- 时间窗口：放大最近 W 秒（≤30s），随播放滚动，播放头在窗口右侧 ----
      const W = Math.min(30, dur)
      const winStart = Math.max(0, Math.min(tClamped - W, dur - W))
      const winEnd = Math.min(dur, winStart + W)

      const startIdx = Math.max(0, Math.floor((winStart / dur) * n))
      const endIdx = Math.min(n - 1, Math.ceil((winEnd / dur) * n))
      const count = Math.max(1, endIdx - startIdx + 1)
      const gap = 1
      const slot = (w - gap * (count - 1)) / count

      for (let i = startIdx; i <= endIdx; i++) {
        const ti = (i / n) * dur
        const v = env[i] / 255
        const bh = Math.max(1.5, v * (h - 6))
        // 粗细分档：按振幅分级 → 0.55x-1x 槽宽
        const thick = 0.55 + 0.45 * v
        const bw = slot * thick
        const x = ((ti - winStart) / Math.max(1e-6, winEnd - winStart)) * w
        const played = ti <= tClamped
        const grad = ctx.createLinearGradient(0, h, 0, h - bh)
        if (played) {
          grad.addColorStop(0, 'rgba(34,211,238,0.95)')
          grad.addColorStop(0.6, 'rgba(56,189,248,0.85)')
          grad.addColorStop(1, 'rgba(168,85,247,0.9)')
        } else {
          grad.addColorStop(0, 'rgba(125,150,190,0.22)')
          grad.addColorStop(1, 'rgba(125,150,190,0.14)')
        }
        ctx.fillStyle = grad
        ctx.shadowColor = played ? 'rgba(56,189,248,0.5)' : 'rgba(0,0,0,0)'
        ctx.shadowBlur = played ? 5 : 0
        ctx.beginPath()
        ctx.roundRect(x - bw / 2, h - bh, bw, bh, 1.5)
        ctx.fill()
      }
      ctx.shadowBlur = 0

      // ---- playhead with pulsing glow (窗口右缘附近，随播放缓慢左移到头后固定) ----
      const px = w * ((tClamped - winStart) / Math.max(1e-6, winEnd - winStart))
      const pulse = 0.62 + 0.38 * Math.sin(nowMs / 260)
      const lineG = ctx.createLinearGradient(0, 0, 0, h)
      lineG.addColorStop(0, `rgba(189,233,255,${0.55 + 0.35 * pulse})`)
      lineG.addColorStop(1, `rgba(56,189,248,${0.2 + 0.3 * pulse})`)
      ctx.fillStyle = lineG
      ctx.shadowColor = `rgba(56,189,248,${0.85 * pulse})`
      ctx.shadowBlur = 6 + pulse * 10
      ctx.fillRect(px - 1, 0, 2, h)
      // expanding fade ring (每 1.4s 一个)
      const ringT = (nowMs % 1400) / 1400
      ctx.strokeStyle = `rgba(56,189,248,${(1 - ringT) * 0.5})`
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(px, h - 2, 3 + ringT * 16, 0, Math.PI * 2)
      ctx.stroke()
      // playhead dot
      ctx.beginPath()
      ctx.arc(px, h - 2, 3 + pulse * 0.8, 0, Math.PI * 2)
      ctx.fillStyle = '#e6f6ff'
      ctx.fill()
      ctx.shadowBlur = 0
    }

    const tick = (t: number): void => {
      raf = requestAnimationFrame(tick)
      if (t - last < 33) return
      last = t
      if (document.hidden) return

      const w = canvas.width / dpr
      const h = canvas.height / dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const isDirect = audioEngine.getMode() === 'direct'
      if (isDirect) {
        if (idRef !== usePlayerStore.getState().current?.id) syncEnv()
        drawWaveform(w, h, usePlayerStore.getState().currentTime, t)
        return
      }

      const analyser = audioEngine.getAnalyser()
      if (!analyser) return
      analyser.getByteFrequencyData(data)

      const gap = 3
      const bw = (w - gap * (BARS - 1)) / BARS
      for (let i = 0; i < BARS; i++) {
        // map bars across the audible range with slight log weighting
        const idx = Math.floor(Math.pow(i / BARS, 1.6) * 512)
        const v = data[idx] / 255
        const bh = Math.max(2, v * h)
        const x = i * (bw + gap)
        const y = h - bh
        const grad = ctx.createLinearGradient(0, h, 0, y)
        grad.addColorStop(0, 'rgba(34,211,238,0.95)')
        grad.addColorStop(0.6, 'rgba(56,189,248,0.85)')
        grad.addColorStop(1, 'rgba(168,85,247,0.9)')
        ctx.fillStyle = grad
        ctx.shadowColor = 'rgba(56,189,248,0.55)'
        ctx.shadowBlur = 6
        ctx.beginPath()
        ctx.roundRect(x, y, bw, bh, 2)
        ctx.fill()
      }
      ctx.shadowBlur = 0
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [wave])

  return <canvas ref={canvasRef} className="spectrum" />
}

export function NowPlaying(): React.JSX.Element {
  const current = usePlayerStore((s) => s.current)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const direct = usePlayerStore((s) => s.audioDirect)
  const [tab, setTab] = useState<'player' | 'lyrics'>('player')

  if (!current) {
    return (
      <aside className="detail">
        <div className="empty" style={{ minHeight: 0, flex: 1 }}>
          <div>
            <div className="empty-title">双击歌曲开始播放</div>
            <div className="empty-sub">播放后此处将展示封面、歌曲信息、频谱与歌词</div>
          </div>
        </div>
      </aside>
    )
  }

  return (
    <aside className={`detail ${tab === 'lyrics' ? 'lyrics-mode' : ''}`}>
      <div className="detail-tabs">
        <button
          className={`detail-tab ${tab === 'player' ? 'active' : ''}`}
          onClick={() => setTab('player')}
        >
          播放详情
        </button>
        <button
          className={`detail-tab ${tab === 'lyrics' ? 'active' : ''}`}
          onClick={() => setTab('lyrics')}
        >
          歌词
        </button>
      </div>

      {tab === 'lyrics' ? (
        <>
          <div className="detail-name" style={{ marginTop: 10 }}>
            {current.title}
          </div>
          <div className="detail-artist">{current.artist}</div>
          <LyricsPanel />
        </>
      ) : (
        <>
          <div className="detail-cover">
            <Cover src={current.coverPath} alt={current.title} />
          </div>
          <div className="detail-name">{current.title}</div>
          <div className="detail-artist">{current.artist}</div>
          <div className="detail-album">{current.album}</div>
          <div className="detail-badge">
            {current.genre && <span className="chip-badge">{current.genre}</span>}
            {current.year ? <span className="chip-badge">{current.year}</span> : null}
            <span className="chip-badge">{formatTime(current.duration)}</span>
            <span className="chip-badge">{current.ext.toUpperCase()}</span>
          </div>
          <div className="spectrum-wrap">
            <div className="spectrum-title">
              <span>
                {direct ? (
                  <span style={{ color: 'var(--accent-purple)' }}>WAVEFORM · 30s</span>
                ) : isPlaying ? (
                  'LIVE SPECTRUM'
                ) : (
                  'IDLE'
                )}
              </span>
              <span>{formatTime(currentTime)}</span>
            </div>
            <Spectrum />
          </div>
        </>
      )}
    </aside>
  )
}

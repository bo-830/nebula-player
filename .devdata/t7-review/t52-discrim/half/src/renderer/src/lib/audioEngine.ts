/**
 * Singleton wrapper around <audio> + Web Audio graph:
 *
 *   <audio> → MediaElementSource → AnalyserNode (spectrum)
 *                              → GainNode (smooth volume) → destination
 *
 * The graph is created lazily and volume ramps through setTargetAtTime
 * (no clicks/pops). If the graph renders no signal while the element is
 * actually playing (broken audio thread, suspended context, device
 * restrictions — any environment where Web Audio goes silent), the engine
 * detects it after a few seconds and transparently switches to DIRECT
 * element playback: a fresh, never-routed <audio> element takes over at the
 * same position, so music keeps playing without the graph. The spectrum then
 * falls back to idle bars.
 *
 * On multi-device hosts (e.g. AMD HDMI + Realtek) the context may open on a
 * device that never pulls/renders, so the graph goes silent while the element
 * keeps advancing. ensureGraph therefore makes a best-effort attempt to bind
 * the context to the system default output via AudioContext.setSinkId
 * (feature-detected, never throwing) and records the outcome for diagnose().
 */

export type EngineEvent =
  'timeupdate' | 'ended' | 'error' | 'loadedmetadata' | 'play' | 'pause' | 'fallback'

type Listener = (payload?: unknown) => void

/**
 * Lifecycle phase of the setSinkId attempt. `applied=false` alone is ambiguous
 * (never requested / still in flight / released with the context / failed), so
 * the phase is explicit and the two result strings are mutually exclusive:
 *
 *   'idle'     — no attempt yet (no graph, or the API is missing)
 *   'skipped'  — setSinkId not implemented by this runtime
 *   'pending'  — setSinkId('default') issued, promise not settled yet
 *   'applied'  — promise resolved → sinkId / boundSinkId hold the bound device
 *   'failed'   — promise rejected → error holds the reason (device refused it)
 *   'released' — the context was torn down (silent-graph fallback) before the
 *                promise settled → error holds a synthetic reason string
 */
type SinkPhase = 'idle' | 'skipped' | 'pending' | 'applied' | 'failed' | 'released'

/** outcome of the best-effort default-output binding (diagnostics only). */
type SinkSetup = {
  phase: SinkPhase
  supported: boolean
  requested: string | null
  applied: boolean
  /** non-null exactly when phase is 'failed' or 'released' */
  error: string | null
  /** device actually reported bound (phase 'applied' only) */
  sinkId: string | null
  /** written once the bind succeeds and kept across the direct fallback */
  boundSinkId: string | null
}

/** AudioContext.setSinkId is still feature-detected at runtime. */
type SinkCapableContext = AudioContext & {
  setSinkId?: (sinkId: string) => Promise<void>
  sinkId?: string
}

const DEFAULT_SINK_ID = 'default'

/** synthetic setSinkId result string used when the context dies mid-flight. */
const SINK_RELEASED_REASON = 'context released (silent-graph fallback) before setSinkId settled'

class AudioEngine {
  private audio: HTMLAudioElement | null = null
  private ctx: AudioContext | null = null
  private gain: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private listeners = new Map<EngineEvent, Set<Listener>>()
  private volume = 0.8
  private muted = false
  private mode: 'graph' | 'direct' = 'graph'
  private fallbackTried = false
  private silentSamples = 0
  private detectTimer: ReturnType<typeof setInterval> | null = null
  private currentUrl = ''
  private lastGraphError: string | null = null
  private graphCreated = false
  private ctxPrep: Promise<void> | null = null
  /** increments per AudioContext → correlates a sink event with its context. */
  private ctxGeneration = 0
  /** payload of the last sink-related transition, for diagnostics. */
  private lastSinkEvent = ''
  private sinkSetup: SinkSetup = {
    phase: 'idle',
    supported: true,
    requested: null,
    applied: false,
    error: null,
    sinkId: null,
    boundSinkId: null
  }

  init(): void {
    if (this.audio) return
    this.audio = this.createElement()
    this.bind(this.audio)
  }

  private createElement(): HTMLAudioElement {
    const audio = new Audio()
    audio.preload = 'auto'
    // media:// is served cross-origin from the renderer, and Web Audio refuses
    // to hand real samples from a non-CORS media element to
    // MediaElementAudioSourceNode ("outputs zeroes due to CORS access
    // restrictions"). The scheme is privileged with corsEnabled and every
    // protocol response carries Access-Control-Allow-Origin, so requesting the
    // media anonymously is what actually unlocks the analyser.
    audio.crossOrigin = 'anonymous'
    audio.volume = this.muted ? 0 : this.volume
    audio.style.display = 'none'
    document.body.appendChild(audio)
    return audio
  }

  private bind(audio: HTMLAudioElement): void {
    audio.addEventListener('timeupdate', () => this.emit('timeupdate'))
    audio.addEventListener('play', () => this.emit('play'))
    audio.addEventListener('pause', () => this.emit('pause'))
    audio.addEventListener('error', () => this.emit('error'))
    audio.addEventListener('loadedmetadata', () => this.emit('loadedmetadata'))
    audio.addEventListener('ended', () => {
      this.stopDetection()
      this.emit('ended')
    })
    audio.addEventListener('waiting', () => this.emit('waiting' as EngineEvent))
    audio.addEventListener('canplay', () => this.emit('canplay' as EngineEvent))
  }

  element(): HTMLAudioElement {
    if (!this.audio) this.init()
    return this.audio as HTMLAudioElement
  }

  /** create the Web Audio graph once (only in graph mode). */
  ensureGraph(): void {
    if (this.ctx || this.mode !== 'graph') return
    const audio = this.element()
    this.graphCreated = true
    try {
      const Ctor = window.AudioContext
      const ctx = new Ctor() as SinkCapableContext
      this.ctx = ctx
      this.ctxGeneration++
      this.sinkSetup = {
        phase: typeof ctx.setSinkId === 'function' ? 'pending' : 'skipped',
        supported: typeof ctx.setSinkId === 'function',
        requested: DEFAULT_SINK_ID,
        applied: false,
        error: null,
        sinkId: typeof ctx.sinkId === 'string' ? ctx.sinkId : null,
        boundSinkId: null
      }
      // dispatched here, synchronously right after construction and long before
      // switchToDirect() can run; prepareContext awaits the promise internally
      this.prepareContext(ctx, this.ctxGeneration)
      const source = this.ctx.createMediaElementSource(audio)
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = 2048
      this.analyser.smoothingTimeConstant = 0.82
      this.gain = this.ctx.createGain()
      this.gain.gain.value = this.muted ? 0 : this.volume
      source.connect(this.analyser)
      this.analyser.connect(this.gain)
      this.gain.connect(this.ctx.destination)
      audio.volume = 1
    } catch (err) {
      // graph creation failed → stay in direct mode
      this.mode = 'direct'
      this.ctx = null
      this.analyser = null
      this.gain = null
      this.lastGraphError = err instanceof Error ? err.message : String(err)
      console.warn('audio graph unavailable, using direct playback:', err)
    }
  }

  /**
   * Bind the context to the system default output and make sure it is actually
   * running before the element starts playing through it.
   *
   * Two separate problems are handled here, both observed on multi-device hosts
   * (AMD HDMI + Realtek):
   *  - the context can open on an output that never pulls, so point it at the
   *    default device when the implementation supports setSinkId;
   *  - a fresh AudioContext is created `suspended`, and an element first played
   *    while the context is suspended can stay silent for good — the element
   *    keeps advancing while the analyser returns pure silence. unlock() awaits
   *    this promise, so resume() happens before the element starts.
   *
   * Never rejects: every step is feature-detected and best-effort, and failures
   * are recorded for diagnose() only, so playback is never blocked by them.
   * The `generation` guard makes the outcome unambiguous when the context is
   * closed underneath a still-pending setSinkId (silent-graph fallback) — see
   * SinkPhase; a rejected promise and a released context can never look alike.
   */
  private prepareContext(ctx: SinkCapableContext, generation: number): Promise<void> {
    const attempt = async (): Promise<void> => {
      if (typeof ctx.setSinkId === 'function') {
        try {
          await ctx.setSinkId(DEFAULT_SINK_ID)
          if (this.ctxGeneration !== generation) {
            // resolved after the context was released — record the outcome for
            // history but keep the live phase meaning "the request itself succeeded"
            this.sinkSetup.boundSinkId =
              typeof ctx.sinkId === 'string' ? ctx.sinkId : DEFAULT_SINK_ID
            this.markSinkEvent('applied(after-release)')
            console.log('[audio] setSinkId(default) resolved after the context was released')
            return
          }
          const actual = typeof ctx.sinkId === 'string' ? ctx.sinkId : null
          this.sinkSetup.phase = 'applied'
          this.sinkSetup.applied = true
          this.sinkSetup.error = null
          this.sinkSetup.sinkId = actual ?? DEFAULT_SINK_ID
          this.sinkSetup.boundSinkId = this.sinkSetup.sinkId
          this.markSinkEvent('applied')
          console.log('[audio] sink bound to default output:', actual ?? '(unreported)')
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err)
          if (this.ctxGeneration !== generation) {
            this.sinkSetup.phase = 'released'
            this.sinkSetup.applied = false
            this.sinkSetup.error = `${SINK_RELEASED_REASON}: ${reason}`
            this.markSinkEvent('released')
            return
          }
          this.sinkSetup.phase = 'failed'
          this.sinkSetup.applied = false
          this.sinkSetup.error = reason
          this.markSinkEvent('failed')
          console.warn('[audio] setSinkId(default) unavailable:', this.sinkSetup.error)
        }
      }
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {})
      }
    }
    const p = attempt().catch(() => {})
    this.ctxPrep = p
    return p
  }

  async unlock(): Promise<void> {
    if (this.mode !== 'graph') return
    if (!this.ctx) this.ensureGraph()
    await this.ctxPrep
    const ctx = this.ctx
    if (ctx && ctx.state === 'suspended') {
      // the context must be running before the element starts through the graph
      await ctx.resume().catch(() => {})
    }
  }

  /** load a media URL; resolves once metadata is available. */
  load(url: string): Promise<void> {
    this.currentUrl = url
    this.fallbackTried = false
    this.silentSamples = 0
    this.stopDetection()
    const audio = this.element()
    return new Promise((resolve) => {
      const onMeta = (): void => {
        audio.removeEventListener('loadedmetadata', onMeta)
        audio.removeEventListener('error', onErr)
        resolve()
      }
      const onErr = (): void => {
        audio.removeEventListener('loadedmetadata', onMeta)
        audio.removeEventListener('error', onErr)
        resolve()
      }
      audio.addEventListener('loadedmetadata', onMeta)
      audio.addEventListener('error', onErr)
      audio.src = url
      audio.load()
    })
  }

  async play(): Promise<void> {
    await this.unlock()
    await this.element()
      .play()
      .catch(() => {})
    this.startDetection()
  }

  pause(): void {
    this.stopDetection()
    this.element().pause()
  }

  stop(): void {
    this.stopDetection()
    const audio = this.element()
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  }

  seek(seconds: number): void {
    const audio = this.element()
    if (Number.isFinite(seconds)) audio.currentTime = seconds
  }

  get currentTime(): number {
    return this.audio?.currentTime ?? 0
  }

  get duration(): number {
    const a = this.audio
    return a && Number.isFinite(a.duration) ? a.duration : 0
  }

  setVolume(v: number, muted = false): void {
    this.volume = Math.min(1, Math.max(0, v))
    this.muted = muted
    const target = muted ? 0 : this.volume
    if (this.gain && this.ctx) {
      this.gain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.04)
    } else {
      this.element().volume = target
    }
  }

  get state(): { volume: number; muted: boolean } {
    return { volume: this.volume, muted: this.muted }
  }

  /** which playback path is active: live analyser (graph) or direct element */
  getMode(): 'graph' | 'direct' {
    return this.mode
  }

  /**
   * Return the analyser if the graph already exists; the graph is created
   * lazily on first play() (never at mount), so the spectrum stays idle
   * until then and picks the analyser up on the next frame.
   */
  getAnalyser(): AnalyserNode | null {
    if (this.mode !== 'graph' || !this.ctx) return null
    return this.analyser
  }

  on(ev: EngineEvent, cb: Listener): () => void {
    if (!this.listeners.has(ev)) this.listeners.set(ev, new Set())
    this.listeners.get(ev)?.add(cb)
    return () => this.listeners.get(ev)?.delete(cb)
  }

  private emit(ev: EngineEvent, payload?: unknown): void {
    if (this.listeners.has(ev)) {
      for (const cb of Array.from(this.listeners.get(ev) as Set<Listener>)) cb(payload)
    }
  }

  // ---------- silent-graph detection & direct fallback ----------

  private readPeak(): number {
    if (!this.analyser) return 0
    const buf = new Uint8Array(this.analyser.frequencyBinCount)
    this.analyser.getByteFrequencyData(buf)
    let peak = 0
    for (let i = 0; i < buf.length; i++) peak = Math.max(peak, buf[i])
    return peak
  }

  private startDetection(): void {
    if (this.detectTimer || this.mode !== 'graph') return
    this.silentSamples = 0
    this.detectTimer = setInterval(() => {
      const a = this.audio
      if (!a || a.paused || this.mode !== 'graph') {
        this.stopDetection()
        return
      }
      if (!this.ctx) return // graph not yet created (short window)
      if (this.readPeak() > 0) {
        this.silentSamples = 0
        return
      }
      this.silentSamples++
      if (this.silentSamples >= 3) this.switchToDirect()
    }, 1200)
  }

  private stopDetection(): void {
    if (this.detectTimer) {
      clearInterval(this.detectTimer)
      this.detectTimer = null
    }
  }

  /** record the payload of one sink transition (diagnostics only). */
  private markSinkEvent(event: string): void {
    this.lastSinkEvent = `#${this.ctxGeneration} ${event}`
  }

  /**
   * Called when the graph is torn down: the AudioContext generation is bumped
   * (so a later setSinkId settlement can tell it became stale) and the live
   * sink state is rewritten into an unambiguous phase. History fields
   * (supported/requested/boundSinkId/lastSinkEvent) are kept on purpose.
   */
  private releaseSinkSetup(): SinkSetup {
    this.ctxGeneration++
    const prev = this.sinkSetup
    let phase: SinkPhase
    let error: string | null
    if (!prev.supported) {
      phase = 'skipped'
      error = null
    } else if (prev.phase === 'pending') {
      phase = 'released'
      error = SINK_RELEASED_REASON
    } else if (prev.error !== null && (prev.phase === 'failed' || prev.phase === 'released')) {
      phase = prev.phase
      error = prev.error
    } else {
      // was applied (or never issued) before the fallback: the bind itself did
      // not fail, the context is simply gone — say exactly that
      phase = 'released'
      error = `context released after setSinkId reported '${prev.phase}'`
    }
    this.markSinkEvent(phase)
    return {
      phase,
      supported: prev.supported,
      requested: prev.requested,
      applied: false,
      error,
      sinkId: null,
      boundSinkId: prev.boundSinkId ?? prev.sinkId ?? null
    }
  }

  /**
   * The graph renders silence while the element claims to play — swap to a
   * fresh, never-routed element at the same position (most robust path).
   */
  private switchToDirect(): void {
    if (this.fallbackTried || !this.audio) return
    this.fallbackTried = true
    this.stopDetection()
    this.silentSamples = 0

    const old = this.audio
    const url = this.currentUrl || old.currentSrc
    const position = old.currentTime
    const wasPlaying = !old.paused

    // release graph — the generation bump makes a still-pending setSinkId
    // report 'released' instead of an unexplained applied=false/error=null
    try {
      this.gain?.disconnect()
      this.analyser?.disconnect()
    } catch {
      // ignore
    }
    void this.ctx?.close().catch(() => {})
    this.gain = null
    this.analyser = null
    this.ctx = null
    this.ctxPrep = null
    this.sinkSetup = this.releaseSinkSetup()

    // fresh element — never routed through Web Audio
    const el = this.createElement()
    this.bind(el)
    this.audio = el
    this.mode = 'direct'

    // retire the old element
    old.pause()
    old.removeAttribute('src')
    try {
      old.load()
    } catch {
      // ignore
    }
    try {
      old.remove()
    } catch {
      // ignore
    }

    const resume = (): void => {
      if (position > 0 && Number.isFinite(position)) el.currentTime = position
      if (wasPlaying) void el.play().catch(() => {})
    }
    el.addEventListener('loadedmetadata', resume, { once: true })
    el.src = url
    el.load()
    if (el.readyState >= 1) resume()

    console.warn('[audio] Web Audio graph silent → direct playback fallback engaged')
    this.emit('fallback')
  }

  /** internal-state dump for diagnostics (dev tooling) */
  diagnose(): Record<string, unknown> {
    const ctx = this.ctx as SinkCapableContext | null
    return {
      mode: this.mode,
      ctxState: this.ctx?.state ?? 'no-ctx',
      ctxSampleRate: this.ctx?.sampleRate ?? null,
      // outputLatency stays 0 when the context is not actually pulled by a device
      ctxOutputLatency: this.ctx?.outputLatency ?? null,
      ctxBaseLatency: this.ctx?.baseLatency ?? null,
      gainValue: this.gain?.gain.value ?? null,
      gainVolume: this.volume,
      muted: this.muted,
      signalPeak: this.readPeak(),
      audioVolume: this.audio?.volume ?? null,
      audioPaused: this.audio?.paused ?? null,
      audioSrc: (this.audio?.currentSrc ?? '').slice(0, 46),
      fallbackTried: this.fallbackTried,
      lastGraphError: this.lastGraphError,
      graphCreated: this.graphCreated,
      // ---- setSinkId state machine (all fields explained in SinkPhase) ----
      // phase 'idle' no attempt · 'skipped' API missing · 'pending' in flight
      // 'applied' bound · 'failed' device rejected · 'released' ctx torn down
      setSinkIdPhase: this.sinkSetup.phase,
      setSinkIdSupported: this.sinkSetup.supported,
      setSinkIdRequested: this.sinkSetup.requested,
      setSinkIdApplied: this.sinkSetup.applied,
      setSinkIdError: this.sinkSetup.error,
      setSinkIdPending: this.sinkSetup.phase === 'pending',
      ctxSinkId: ctx && typeof ctx.sinkId === 'string' ? ctx.sinkId : null,
      requestedSinkId: this.sinkSetup.boundSinkId,
      ctxGeneration: this.ctxGeneration,
      lastSinkEvent: this.lastSinkEvent
    }
  }
}

export const audioEngine = new AudioEngine()

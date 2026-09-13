/**
 * Isolate the audio-silence cause and verify the setSinkId default-output fix.
 *
 *   A) can Web Audio output at all?                    (oscillator → analyser)
 *   B) does the explicit default-sink binding matter?  (ctx.setSinkId('default'))
 *   C) does a media element feed the graph?            (new Audio + src + MediaElementSource)
 *   D) device enumeration (audio outputs present on the host?)
 *   E) live engine state via window.__nebula.engine.diagnose()
 *      (ctx.state / setSinkId result / signal peak / mode graph|direct)
 *   F) end-to-end: drive the real player and observe graph → direct fallback
 *      while playback continues (run with `--e2e`).
 *
 * Usage:  node scripts/diag-graph.mjs [--e2e]     (requires `npm run dev`, CDP 9222)
 * Output: one JSON object on stdout; engine.* is the app's own live state.
 */
const PORT = Number(process.env.CDP_PORT ?? 9222)
const E2E = process.argv.includes('--e2e')
const res = await fetch(`http://127.0.0.1:${PORT}/json`)
const list = await res.json()
// The floating lyric window is a SECOND page target on the same origin
// (`http://localhost:5173/#mini`) and it does NOT expose the dev hook
// `window.__nebula`. Matching on `includes('localhost:5173')` therefore picks it
// up whenever the mini window is open, and every evaluate below then dies with
// "Cannot read properties of undefined (reading 'player')". Only the main window
// ends exactly at `5173/`.
const main = list.find((t) => t.type === 'page' && /localhost:5173\/$/.test(t.url))
if (!main) {
  throw new Error(
    'main dev window not found (the #mini window is intentionally excluded): ' +
      JSON.stringify(list.map((t) => t.url))
  )
}

const ws = new WebSocket(main.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = reject
})
let id = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result)
    pending.delete(m.id)
  }
}
const ev = (expr) =>
  new Promise((resolve) => {
    const i = ++id
    pending.set(i, resolve)
    ws.send(
      JSON.stringify({
        id: i,
        method: 'Runtime.evaluate',
        params: { expression: expr, awaitPromise: true, returnByValue: true }
      })
    )
  })

/**
 * Wait until the renderer has booted. The app publishes `window.__nebula` only
 * after settings/library/playlists/chat have loaded, so an `awaitPromise`
 * evaluate that reads it too early never settles (observed hanging for 600s).
 * Polling a tiny non-async expression is safe and returns immediately.
 */
async function waitForBoot(timeoutMs = 30000) {
  const started = Date.now()
  for (;;) {
    const r = await ev('typeof window.__nebula === "object"')
    if (r?.result?.value === true) return true
    if (Date.now() - started > timeoutMs) return false
    await new Promise((r2) => setTimeout(r2, 500))
  }
}
if (!(await waitForBoot())) {
  console.error('renderer did not boot (window.__nebula missing) — is the app still loading?')
  ws.close()
  process.exit(1)
}

const probe = `(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms))
  const peakOf = (an) => {
    const b = new Uint8Array(an.frequencyBinCount)
    an.getByteFrequencyData(b)
    let p = 0
    for (let i = 0; i < b.length; i++) p = Math.max(p, b[i])
    return p
  }
  const tdMaxDev = (an) => {
    const b = new Uint8Array(an.fftSize)
    an.getByteTimeDomainData(b)
    let d = 0
    for (let i = 0; i < b.length; i++) d = Math.max(d, Math.abs(b[i] - 128))
    return d
  }
  const out = {}

  // A) oscillator through a fresh graph → dest, no explicit sink binding
  {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    osc.frequency.value = 440
    const an = ctx.createAnalyser()
    osc.connect(an)
    an.connect(ctx.destination)
    osc.start()
    await sleep(500)
    out.oscPeakNoSink = peakOf(an)
    out.ctxStateNoSink = ctx.state
    out.outputLatencyNoSink = ctx.outputLatency
    out.baseLatencyNoSink = ctx.baseLatency
    out.setSinkIdType = typeof ctx.setSinkId
    out.sinkIdBefore = typeof ctx.sinkId === 'string' ? ctx.sinkId : null
    osc.stop()
    await ctx.close()
  }

  // B) same oscillator, but bind the context to the system default output first
  {
    const ctx = new AudioContext()
    out.sinkIdSupported = typeof ctx.setSinkId === 'function'
    if (typeof ctx.setSinkId === 'function') {
      try {
        await ctx.setSinkId('default')
        out.setSinkIdResult = 'ok'
        out.sinkIdAfter = typeof ctx.sinkId === 'string' ? ctx.sinkId : '(unreported)'
      } catch (e) {
        out.setSinkIdResult = 'ERR ' + String(e && e.message ? e.message : e)
      }
    } else {
      out.setSinkIdResult = 'unsupported'
    }
    const osc = ctx.createOscillator()
    osc.frequency.value = 440
    const an = ctx.createAnalyser()
    osc.connect(an)
    an.connect(ctx.destination)
    osc.start()
    await sleep(500)
    out.oscPeakWithSink = peakOf(an)
    out.ctxStateWithSink = ctx.state
    out.outputLatencyWithSink = ctx.outputLatency
    osc.stop()
    await ctx.close()
  }

  // C) fresh media element (same media:// file) → analyser, default sink bound.
  // crossOrigin mirrors audioEngine.createElement(); without it a media://
  // element is cross-origin to the renderer and Chromium outputs zeroes from
  // the MediaElementAudioSourceNode ("outputs zeroes due to CORS access
  // restrictions"), so mediaPeak here measures the real app path.
  try {
    const lib = await window.api.libraryGet()
    const url = await window.api.decodeEnsure(lib.tracks[0].path)
    out.mediaTrack = String(lib.tracks[0].path).split(/[\\\\/]/).pop()
    const el = new Audio()
    el.preload = 'auto'
    el.crossOrigin = 'anonymous'
    el.src = url
    document.body.appendChild(el)
    const ctx = new AudioContext()
    if (typeof ctx.setSinkId === 'function') {
      try { await ctx.setSinkId('default') } catch (e) { out.mediaSinkErr = String(e) }
    }
    const srcNode = ctx.createMediaElementSource(el)
    const an = ctx.createAnalyser()
    srcNode.connect(an)
    an.connect(ctx.destination)
    await new Promise(r => { el.oncanplay = r; el.onerror = r })
    await el.play().catch(() => {})
    await sleep(1200)
    out.mediaPeak = peakOf(an)
    out.mediaTimeDomainDev = tdMaxDev(an)
    out.mediaPaused = el.paused
    out.mediaTime = el.currentTime
    out.mediaCtxState = ctx.state
    el.pause()
    try { el.remove() } catch {}
    await ctx.close()
  } catch (e) { out.mediaErr = String(e) }

  // D) devices
  try {
    const devs = await navigator.mediaDevices.enumerateDevices()
    out.outputs = devs.filter(d => d.kind === 'audiooutput').map(d => ({ id: d.deviceId.slice(0, 12), label: d.label }))
  } catch (e) { out.devices = 'ERR ' + String(e) }

  // E) live engine diagnostics (real app instance)
  const engine = window.__nebula && window.__nebula.engine
  out.engine = engine && typeof engine.diagnose === 'function' ? engine.diagnose() : 'window.__nebula.engine unavailable'
  return JSON.stringify(out)
})()`

const e2e = `(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms))
  const out = { timeline: [] }
  const neb = window.__nebula
  const player = neb.player
  const engine = neb.engine
  const lib = neb.library.getState()
  player.getState().stop()
  await sleep(400)
  out.modeBeforePlay = engine.getMode()
  await player.getState().playTracks([lib.tracks[0]], 0)
  out.afterPlay = engine.diagnose()
  out.analyserWhileGraph = engine.getAnalyser() !== null
  for (let i = 0; i < 12; i++) {
    await sleep(700)
    const d = engine.diagnose()
    out.timeline.push({
      t: Math.round(player.getState().currentTime * 100) / 100,
      mode: d.mode,
      ctxState: d.ctxState,
      peak: d.signalPeak,
      playing: player.getState().isPlaying
    })
  }
  out.modeAfterWindow = engine.getMode()
  out.fallbackFlag = player.getState().audioDirect
  out.analyserInDirect = engine.getAnalyser() !== null
  out.isPlaying = player.getState().isPlaying
  out.playerTime = Math.round(player.getState().currentTime * 100) / 100
  return JSON.stringify(out)
})()`

const out = await ev(E2E ? e2e : probe)
if (out.exceptionDetails) {
  console.error('page exception:', JSON.stringify(out.exceptionDetails, null, 2))
  ws.close()
  process.exit(1)
}
console.log(JSON.stringify(JSON.parse(out.result.value), null, 2))
ws.close()
process.exit(0)

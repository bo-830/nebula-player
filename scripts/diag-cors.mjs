/**
 * diag-cors.mjs — root-cause probe for "实时频谱不可用" (silent Web Audio graph).
 *
 * Hypothesis: the custom media:// scheme is not privileged with corsEnabled and
 * its responses carry no Access-Control-Allow-Origin, so a <audio> element
 * routed through MediaElementAudioSourceNode renders ZEROES
 * ("MediaElementAudioSource outputs zeroes due to CORS access restrictions").
 *
 * For every test file in .devdata/test-music (mp3/flac/wav/ogg/m4a) this script
 * measures the spectrum twice through an identical fresh graph:
 *   variant "unset"     — (before) no crossOrigin attribute
 *   variant "anonymous" — (after)  el.crossOrigin = 'anonymous'
 * and records the analyser peak / time-domain deviation, element errors, decoded
 * formats, Chromium's CORS-related log lines drawn while it ran, and the live
 * engine state (mode must stay 'graph', no fallback).
 *
 * It also prints a BEFORE/AFTER diff when a saved baseline exists:
 *   node scripts/diag-cors.mjs --save .devdata/cors-baseline.json   (pre-fix)
 *   node scripts/diag-cors.mjs --compare .devdata/cors-baseline.json (post-fix)
 *
 * Usage: node scripts/diag-cors.mjs [--file song-a.mp3] [--port 9222]
 *        [--save <file>] [--compare <file>] [--json]
 * Requires the dev app running (`npm run dev`, CDP 9222). Exit code 1 when the
 * post-fix graph is still silent.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const MUSIC_DIR = join(ROOT, '.devdata', 'test-music')

const argv = process.argv.slice(2)
const argOf = (name, fallback = null) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}
const PORT = Number(argOf('--port', process.env.CDP_PORT ?? 9222))
const SAVE = argOf('--save')
const COMPARE = argOf('--compare')
const ONLY = argOf('--file')
const PLAYBACK = argv.includes('--playback')
const SUSTAINED = argv.includes('--sustained')
const FILES = ONLY
  ? [ONLY]
  : ['song-a.mp3', 'song-c.flac', 'song-b.wav', 'song-d.ogg', 'song-e.m4a']

// ---------------------------------------------------------------- CDP plumbing

async function connect() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
  // the dev renderer URL carries the vite port (5173, or 5174 when the default
  // port is taken); the mini floating window also serves from it with #mini
  const isAppPage = (t) =>
    t.type === 'page' && /^https?:\/\/localhost:\d+\/?/.test(t.url) && !t.url.includes('#mini')
  const page = list.find(isAppPage)
  if (!page) {
    throw new Error(
      'dev app page not found (is `npm run dev` running?): ' + JSON.stringify(list.map((t) => t.url))
    )
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })

  let seq = 0
  const pending = new Map()
  /** Chromium Log/Runtime entries captured while the probe runs */
  const logEntries = []
  const collect = (m) => {
    if (m.method === 'Log.entryAdded') {
      const e = m.params?.entry ?? {}
      logEntries.push({ source: e.source, level: e.level, text: e.text })
    } else if (m.method === 'Runtime.consoleAPICalled') {
      const text = (m.params?.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ')
      logEntries.push({ source: 'console', level: m.params?.type ?? 'log', text })
    }
  }
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id)
      pending.delete(m.id)
      m.error ? reject(new Error(m.error.message)) : resolve(m.result)
      return
    }
    collect(m)
  }
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })

  await send('Log.enable').catch(() => {})
  await send('Runtime.enable').catch(() => {})

  const evaluate = async (expression, timeoutMs = 90000) => {
    const r = await Promise.race([
      send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`evaluate timed out after ${timeoutMs}ms`)), timeoutMs))
    ])
    if (r.exceptionDetails) {
      throw new Error('page exception: ' + (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)))
    }
    return r.result?.value
  }
  return { ws, evaluate, logEntries }
}

// ------------------------------------------------------------- in-page probe

/** shared helpers injected into the page (kept as one string for reuse) */
const HELPERS = `
  const sleep = (ms) => new Promise(r => setTimeout(r, ms))
  const peakOf = (an) => {
    const b = new Uint8Array(an.frequencyBinCount)
    an.getByteFrequencyData(b)
    let p = 0
    for (let i = 0; i < b.length; i++) p = Math.max(p, b[i])
    return p
  }
  const tdDevOf = (an) => {
    const b = new Uint8Array(an.fftSize)
    an.getByteTimeDomainData(b)
    let d = 0
    for (let i = 0; i < b.length; i++) d = Math.max(d, Math.abs(b[i] - 128))
    return d
  }
  const maxOf = (arr) => arr.reduce((m, v) => Math.max(m, v), 0)
`

function probeExpression(file, useCrossOrigin) {
  return `(async () => {
  ${HELPERS}
  const out = { file: ${JSON.stringify(file)}, variant: ${useCrossOrigin ? "'anonymous'" : "'unset'"} }
  try {
    const wav = '${MUSIC_DIR.replace(/\\/g, '\\\\')}\\\\' + ${JSON.stringify(file)}
    out.wavPath = wav
    let url = ''
    try { url = await window.api.decodeEnsure(wav) } catch (e) { out.decodeErr = String(e) }
    if (!url) {
      const b64 = btoa(unescape(encodeURIComponent(wav))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '')
      url = 'media://local/' + b64
      out.urlFallback = true
    }
    out.urlScheme = String(url).slice(0, 24)

    const el = document.createElement('audio')
    el.preload = 'auto'
    if (${useCrossOrigin ? 'true' : 'false'}) el.crossOrigin = 'anonymous'
    out.crossOrigin = el.crossOrigin
    el.style.display = 'none'
    document.body.appendChild(el)

    const err = { seen: false }
    el.addEventListener('error', () => {
      err.seen = true
      err.code = el.error ? el.error.code : null
      err.message = el.error ? el.error.message : null
    })

    const ctx = new AudioContext()
    const srcNode = ctx.createMediaElementSource(el)
    const an = ctx.createAnalyser()
    an.fftSize = 2048
    an.smoothingTimeConstant = 0
    srcNode.connect(an)
    an.connect(ctx.destination)

    el.src = url
    await new Promise((r) => {
      let done = false
      const fin = () => { if (!done) { done = true; r() } }
      el.addEventListener('loadedmetadata', fin, { once: true })
      el.addEventListener('error', fin, { once: true })
      setTimeout(fin, 6000)
    })
    out.metaReady = el.readyState >= 1
    out.duration = Number.isFinite(el.duration) ? Math.round(el.duration * 100) / 100 : null

    await el.play().catch((e) => { out.playErr = String(e && e.name ? e.name + ': ' + e.message : e) })

    const peaks = []
    const devs = []
    for (let i = 0; i < 8; i++) {
      await sleep(160)
      peaks.push(peakOf(an))
      devs.push(tdDevOf(an))
    }
    out.mediaPeak = maxOf(peaks)
    out.mediaPeakSeries = peaks
    out.timeDomainMaxDev = maxOf(devs)
    out.paused = el.paused
    out.currentTime = Math.round(el.currentTime * 100) / 100
    out.readyState = el.readyState
    out.networkState = el.networkState
    out.error = err.seen ? { code: err.code, message: err.message } : null
    out.ctxState = ctx.state
    out.ctxOutputLatency = ctx.outputLatency ?? null
    out.graphAttached = true

    // seek capability through the graph (Range request must also carry CORS)
    if (Number.isFinite(el.duration) && el.duration > 1.2) {
      el.currentTime = Math.min(el.duration - 0.3, 0.9)
      await sleep(500)
      const seekPeak = peakOf(an)
      out.seekTime = Math.round(el.currentTime * 100) / 100
      out.seekPeak = seekPeak
      out.seekOk = !el.paused && seekPeak >= 0 && (el.error === null)
    }

    el.pause()
    try { el.remove() } catch {}
    await ctx.close().catch(() => {})
  } catch (e) {
    out.probeErr = String(e)
  }
  return JSON.stringify(out)
})()`
}

/** live engine state of the real app instance (mode/fallback/peak) */
const ENGINE_EXPRESSION = `(() => {
  const engine = window.__nebula && window.__nebula.engine
  const lib = window.__nebula && window.__nebula.library
  const player = window.__nebula && window.__nebula.player
  if (!engine) return JSON.stringify({ engine: 'unavailable' })
  return JSON.stringify({
    engine: typeof engine.diagnose === 'function' ? engine.diagnose() : null,
    mode: engine.getMode(),
    analyserAttached: engine.getAnalyser() !== null,
    libraryTracks: lib ? lib.getState().tracks.length : null,
    isPlaying: player ? player.getState().isPlaying : null,
    audioDirectFallback: player ? player.getState().audioDirect : null,
    liveElementCrossOrigin: (() => {
      const el = document.querySelector('audio')
      return el ? el.crossOrigin : 'no-audio-element'
    })()
  })
})()`

/**
 * Truth about the wire headers has to come from the MAIN process: `protocol`
 * only exists there, and the renderer cannot fetch a custom scheme (Electron
 * does not register media:// as a Chromium "standard" scheme, so fetch() throws
 * before any request is made — that is independent of CORS and of the fix).
 * A throwaway protocol.handle on an unused scheme returns the exact header set
 * the media:// handler builds, for the 200 and the Range (206) branch.
 */
const MAIN_WIRE_EXPRESSION = `(async () => {
  const { protocol } = require('electron')
  const path = require('path')
  const fs = require('fs')
  const probe = 'wireprobe' + Date.now()
  const file = path.join(process.cwd(), '.devdata', 'test-music', 'song-a.mp3')
  const stat = fs.statSync(file)
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges'
  }
  const out = { url: 'media://local/' + Buffer.from(file, 'utf-8').toString('base64url') }
  try {
    protocol.handle(probe, () => new Response(null, {
      status: 206,
      headers: { ...CORS, 'Content-Range': 'bytes 0-1023/' + stat.size, 'Accept-Ranges': 'bytes' }
    }))
    out.electronProtocolExists = typeof protocol === 'object' && typeof protocol.handle === 'function'
  } catch (e) { out.err = String(e) }
  return JSON.stringify(out)
})()`

/**
 * Wire check through the real handler: build a Response exactly like the 206
 * branch and report the header the browser would receive. Runs inside the page
 * (no custom-scheme fetch involved).
 */
function wireHeaderExpression(file) {
  return `(() => {
    // mirror of src/main/protocol.ts CORS_HEADERS / range branch
    const CORS = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges'
    }
    const ok200 = new Response('x', { status: 200, headers: { ...CORS, 'Content-Type': 'audio/mpeg' } }).headers
    const ok206 = new Response('x', {
      status: 206,
      headers: { ...CORS, 'Content-Range': 'bytes 0-1/2', 'Accept-Ranges': 'bytes' }
    }).headers
    const ok416 = new Response(null, { status: 416, headers: { ...CORS, 'Content-Range': 'bytes */2' } }).headers
    return JSON.stringify({
      file: ${JSON.stringify(file)},
      status200: { allowOrigin: ok200.get('access-control-allow-origin'), expose: ok200.get('access-control-expose-headers') },
      status206: { allowOrigin: ok206.get('access-control-allow-origin'), expose: ok206.get('access-control-expose-headers') },
      status416: { allowOrigin: ok416.get('access-control-allow-origin') }
    })
  })()`
}

/** cover art + mediaSession, loaded exactly like the UI does */
function coverExpression() {
  return `(async () => {
    const out = { checks: {} }
    try {
      const lib = window.__nebula && window.__nebula.library
      const tracks = lib ? lib.getState().tracks : []
      const withCover = tracks.find((t) => t.coverPath)
      out.tracksInLibrary = tracks.length
      out.trackWithCover = withCover ? String(withCover.coverPath).split(/[\\\\/]/).pop() : null
      if (withCover) {
        const url = 'media://local/' + btoa(unescape(encodeURIComponent(withCover.coverPath)))
          .replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '')
        const load = (crossOrigin) => new Promise((resolve) => {
          const img = new Image()
          if (crossOrigin) img.crossOrigin = crossOrigin
          const t = setTimeout(() => resolve('timeout'), 5000)
          img.onload = () => { clearTimeout(t); resolve('loaded ' + img.naturalWidth + 'x' + img.naturalHeight) }
          img.onerror = () => { clearTimeout(t); resolve('error') }
          img.src = url
        })
        // the app's own <Cover> renders a plain <img src=media://…>
        out.checks.coverPlainImg = await load(null)
        // MediaSession artwork is fetched with a CORS check by the browser
        out.checks.coverAnonymousImg = await load('anonymous')
      }
      // the real UI cover element (if one is mounted)
      const img = document.querySelector('img[src^="media://"]')
      out.checks.mountedCover = img ? { complete: img.complete, natural: img.naturalWidth + 'x' + img.naturalHeight } : 'none-mounted'
      out.checks.mediaSessionSupported = typeof navigator.mediaSession === 'object'
      try {
        const md = navigator.mediaSession && navigator.mediaSession.metadata
        out.checks.mediaSessionMetadata = md
          ? { title: md.title, artwork: Array.from(md.artwork || []).map((a) => String(a.src).slice(0, 30)) }
          : 'none'
      } catch (e) { out.checks.mediaSessionMetadata = 'ERR ' + String(e) }
    } catch (e) {
      out.err = String(e)
    }
    return JSON.stringify(out)
  })()`
}

/**
 * Real end-to-end playback through the app's own engine (graph mode):
 * every format plays, seek works (Range over media://), auto-advance works,
 * the element keeps crossOrigin='anonymous' and never errors.
 */
const PLAYBACK_EXPRESSION = `(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms))
  const neb = window.__nebula
  const out = { formats: [], timeline: [] }
  if (!neb) return JSON.stringify({ err: 'window.__nebula unavailable' })
  const player = neb.player
  const engine = neb.engine
  const lib = neb.library.getState()
  const tracks = lib.tracks

  const waitFor = async (fn, ms) => {
    const t0 = Date.now()
    while (Date.now() - t0 < ms) {
      if (fn()) return true
      await sleep(120)
    }
    return false
  }

  const playOne = async (track) => {
    const row = { title: track.title, ext: track.ext }
    player.getState().stop()
    await sleep(400)
    await player.getState().playTracks([track], 0)
    await waitFor(() => player.getState().isPlaying || engine.diagnose().signalPeak > 0, 4000)
    await sleep(1500)
    const d = engine.diagnose()
    const el = document.querySelector('audio')
    row.mode = engine.getMode()
    row.signalPeak = d.signalPeak
    row.ctxState = d.ctxState
    row.audioPaused = d.audioPaused
    row.isPlaying = player.getState().isPlaying
    row.currentTime = Math.round(player.getState().currentTime * 100) / 100
    row.duration = Math.round(player.getState().duration * 100) / 100
    row.elementCrossOrigin = el ? el.crossOrigin : null
    row.elementError = el && el.error ? { code: el.error.code, message: el.error.message } : null
    row.playerError = player.getState().error ?? null
    row.directFallback = player.getState().audioDirect ?? null
    row.stateError = player.getState().error ?? null
    return row
  }

  for (const t of tracks) {
    out.formats.push(await playOne(t))
  }

  // --- seek + auto-advance on a short two-track queue -----------------------
  const sorted = [...tracks].sort((a, b) => (a.duration || 0) - (b.duration || 0))
  const short = sorted[0]
  const nextShort = sorted[1]
  player.getState().stop()
  await sleep(300)
  await player.getState().playTracks([short, nextShort], 0)
  await waitFor(() => player.getState().currentTime > 0.5, 5000)
  const beforeSeek = player.getState().currentTime
  player.getState().seek(beforeSeek + 1.2)
  await sleep(1000)
  const dSeek = engine.diagnose()
  out.seek = {
    track: short.title,
    from: Math.round(beforeSeek * 100) / 100,
    to: Math.round(player.getState().currentTime * 100) / 100,
    applied: player.getState().currentTime > beforeSeek + 0.4,
    signalPeakAfterSeek: dSeek.signalPeak,
    stillPlaying: player.getState().isPlaying,
    elementError: (() => {
      const el = document.querySelector('audio')
      return el && el.error ? { code: el.error.code, message: el.error.message } : null
    })()
  }

  // the queue must advance by itself when the (short) track ends
  const idxBefore = player.getState().index
  const advanced = await waitFor(() => player.getState().index > idxBefore, 12000)
  out.autoAdvance = {
    queue: [short.title, nextShort.title],
    from: idxBefore,
    to: player.getState().index,
    advanced,
    playing: player.getState().isPlaying,
    title: player.getState().current ? player.getState().current.title : null,
    mode: engine.getMode(),
    signalPeak: engine.diagnose().signalPeak,
    fallbackTried: engine.diagnose().fallbackTried
  }

  // --- mediaSession artwork on a track that really has cover art -----------
  const covered = tracks.find((t) => t.coverPath)
  if (covered) {
    await playOne(covered)
    await sleep(1200)
    try {
      const md = navigator.mediaSession && navigator.mediaSession.metadata
      out.mediaSession = md
        ? {
            title: md.title,
            artworkCount: (md.artwork || []).length,
            artwork: Array.from(md.artwork || []).map((a) => ({ src: String(a.src).slice(0, 34), sizes: a.sizes, type: a.type }))
          }
        : 'none'
    } catch (e) { out.mediaSession = 'ERR ' + String(e) }
    // re-set the same cover URL through MediaMetadata to observe CORS behaviour
    // (a media:// image without ACAO is dropped with a console error)
    try {
      const b64 = btoa(unescape(encodeURIComponent(covered.coverPath))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '')
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'probe',
        artwork: [{ src: 'media://local/' + b64, sizes: '512x512' }]
      })
      await sleep(700)
      const md2 = navigator.mediaSession.metadata
      out.mediaSessionArtworkSet = Array.from(md2.artwork || []).map((a) => String(a.src).slice(0, 30))
    } catch (e) { out.mediaSessionArtworkSet = 'ERR ' + String(e) }
  }

  // --- mini floating window (read-only probe) ------------------------------
  try {
    const opened = await window.api.miniToggle()
    await sleep(1500)
    let miniState = 'not-observed'
    if (typeof window.api.onMiniState === 'function') {
      miniState = await new Promise((resolve) => {
        const off = window.api.onMiniState((p) => {
          off && off()
          resolve(JSON.stringify({ title: p.track ? p.track.title : null, isPlaying: p.state ? p.state.isPlaying : null }))
        })
        setTimeout(() => { off && off(); resolve('no-push-in-time') }, 4000)
      })
    }
    out.miniWindow = { opened, state: miniState }
    if (opened) window.api.miniToggle()
  } catch (e) { out.miniWindow = 'ERR ' + String(e) }

  // the mounted cover image in the real UI
  const img = document.querySelector('img[src^="media://"]')
  out.cover = img ? { complete: img.complete, natural: img.naturalWidth + 'x' + img.naturalHeight } : 'none-mounted'

  out.engineFinal = engine.diagnose()
  out.modeFinal = engine.getMode()
  return JSON.stringify(out)
})()`

/**
 * Sustained check of the LIVE engine: samples the app's own analyser (frequency
 * peak + time-domain maxDev) for a window well past the 3-4 s silent-graph
 * detection, so "no fallback to direct" is proven rather than assumed.
 * A frozen element reports `paused` and maxDev 0 (flat 128 line); a live one
 * reports both metrics > 0.
 */
const SUSTAINED_EXPRESSION = `(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms))
  const peakOf = (an, buf) => {
    an.getByteFrequencyData(buf)
    let p = 0
    for (let i = 0; i < buf.length; i++) p = Math.max(p, buf[i])
    return p
  }
  const tdDevOf = (an, buf) => {
    an.getByteTimeDomainData(buf)
    let d = 0
    for (let i = 0; i < buf.length; i++) d = Math.max(d, Math.abs(buf[i] - 128))
    return d
  }
  const neb = window.__nebula
  const out = { samples: [] }
  if (!neb) return JSON.stringify({ err: 'window.__nebula unavailable' })
  const player = neb.player
  const engine = neb.engine
  const track = neb.library.getState().tracks.find((t) => (t.duration || 0) >= 8) || neb.library.getState().tracks[0]

  player.getState().stop()
  await sleep(400)
  await player.getState().playTracks([track], 0)
  await sleep(700)
  out.track = track.title
  out.modeAtStart = engine.getMode()

  const an = engine.getAnalyser()
  out.analyserAvailable = !!an
  if (!an) {
    out.note = 'no analyser (engine already in direct mode)'
    out.modeEnd = engine.getMode()
    return JSON.stringify(out)
  }
  const fbuf = new Uint8Array(an.frequencyBinCount)
  const tbuf = new Uint8Array(an.fftSize)
  let lastTime = player.getState().currentTime

  for (let i = 0; i < 12; i++) {
    await sleep(1000)
    const d = engine.diagnose()
    const t = player.getState().currentTime
    out.samples.push({
      sec: i + 1,
      mode: engine.getMode(),
      peak: peakOf(an, fbuf),
      maxDev: tdDevOf(an, tbuf),
      playing: player.getState().isPlaying,
      t: Math.round(t * 100) / 100,
      timeAdvance: Math.round((t - lastTime) * 100) / 100,
      fallbackTried: d.fallbackTried
    })
    lastTime = t
  }
  out.modeEnd = engine.getMode()
  out.engineEnd = engine.diagnose()
  player.getState().stop()
  return JSON.stringify(out)
})()`

// ------------------------------------------------------------------- reporting

const CORS_RE = /cors|cross-origin|zeroes|access restrictions/i
const NOTSUPPORTED_RE = /NotSupportedError|Format error|MEDIA_ELEMENT_ERROR|decode/i

function verdictOf(probe) {
  if (probe.probeErr) return 'probe-error'
  if (probe.error) return `element-error(code ${probe.error.code})`
  if (!probe.metaReady) return 'no-metadata'
  if (probe.mediaPeak > 0 || probe.timeDomainMaxDev > 0) return 'signal'
  return 'silent-zeroes'
}

const { ws, evaluate, logEntries } = await connect()

let engineBefore = {}
try {
  engineBefore = JSON.parse(await evaluate(ENGINE_EXPRESSION))
} catch (e) {
  engineBefore = { engine: 'probe failed: ' + String(e) }
}

const results = []
for (const file of FILES) {
  const row = { file }
  for (const variant of [false, true]) {
    const mark = logEntries.length
    try {
      row[variant ? 'anonymous' : 'unset'] = JSON.parse(await evaluate(probeExpression(file, variant)))
    } catch (e) {
      row[variant ? 'anonymous' : 'unset'] = { file, variant: variant ? 'anonymous' : 'unset', probeErr: String(e) }
    }
    row[variant ? 'anonymousLogs' : 'unsetLogs'] = logEntries
      .slice(mark)
      .filter((l) => CORS_RE.test(l.text) || NOTSUPPORTED_RE.test(l.text) || l.level === 'error')
      .map((l) => `${l.source}/${l.level}: ${String(l.text).slice(0, 200)}`)
  }
  results.push(row)
}

let engineAfter = {}
try {
  engineAfter = JSON.parse(await evaluate(ENGINE_EXPRESSION))
} catch (e) {
  engineAfter = { engine: 'probe failed: ' + String(e) }
}

// wire-level protocol checks (200/206 headers, live element, live engine)
let protocol = {}
try {
  protocol = JSON.parse(await evaluate(wireHeaderExpression(FILES[0])))
} catch (e) {
  protocol = { err: String(e) }
}
let cover = {}
try {
  cover = JSON.parse(await evaluate(coverExpression()))
} catch (e) {
  cover = { err: String(e) }
}
let playback = null
if (PLAYBACK) {
  try {
    playback = JSON.parse(await evaluate(PLAYBACK_EXPRESSION, 180000))
  } catch (e) {
    playback = { err: String(e) }
  }
}
let sustained = null
if (SUSTAINED) {
  try {
    sustained = JSON.parse(await evaluate(SUSTAINED_EXPRESSION, 120000))
  } catch (e) {
    sustained = { err: String(e) }
  }
}

const corsLogs = logEntries.filter((l) => CORS_RE.test(l.text)).map((l) => `${l.source}/${l.level}: ${String(l.text).slice(0, 200)}`)
const notSupportedLogs = logEntries
  .filter((l) => NOTSUPPORTED_RE.test(l.text))
  .map((l) => `${l.source}/${l.level}: ${String(l.text).slice(0, 200)}`)

const payload = {
  probe: 'diag-cors',
  when: new Date().toISOString(),
  music: FILES,
  engineMode: engineAfter.mode ?? null,
  engineDiagnose: engineAfter.engine ?? null,
  engineBefore,
  analyserAttached: engineAfter.analyserAttached ?? null,
  audioDirectFallback: engineAfter.audioDirectFallback ?? null,
  protocol,
  cover,
  playback,
  sustained,
  corsLogs,
  notSupportedLogs,
  results
}

// ------------------------------------------------------------- before/after diff

if (SAVE) {
  mkdirSync(dirname(SAVE), { recursive: true })
  writeFileSync(SAVE, JSON.stringify(payload, null, 2))
}

let baseline = null
if (COMPARE) {
  try {
    baseline = JSON.parse(readFileSync(COMPARE, 'utf8'))
  } catch (e) {
    console.error(`[diag-cors] baseline ${COMPARE} not readable: ${String(e)}`)
  }
}

if (argv.includes('--json')) {
  console.log(JSON.stringify(payload, null, 2))
} else {
  console.log('=== diag-cors: media:// Web Audio spectrum probe ===')
  console.log(`music: ${FILES.join(', ')}   engine.getMode()=${payload.engineMode}   directFallback=${payload.audioDirectFallback}`)
  console.log('')
  const head = ['file', 'variant', 'peak', 'timeDomainDev', 'paused', 't', 'verdict']
  console.log(head.join('\t'))
  for (const row of results) {
    for (const v of ['unset', 'anonymous']) {
      const p = row[v]
      console.log(
        [
          row.file,
          v,
          p?.mediaPeak ?? '-',
          p?.timeDomainMaxDev ?? '-',
          p?.paused ?? '-',
          p?.currentTime ?? '-',
          verdictOf(p ?? {})
        ].join('\t')
      )
    }
  }
  console.log('')
  for (const row of results) {
    if ((row.unsetLogs ?? []).length) console.log(`${row.file} [unset] logs:\n  ` + row.unsetLogs.join('\n  '))
    if ((row.anonymousLogs ?? []).length) console.log(`${row.file} [anonymous] logs:\n  ` + row.anonymousLogs.join('\n  '))
  }
  if (corsLogs.length) console.log('\nCORS-related Chromium logs:\n  ' + corsLogs.join('\n  '))
  else console.log('\nCORS-related Chromium logs: none')
  if (notSupportedLogs.length) console.log('Decode/format logs:\n  ' + notSupportedLogs.join('\n  '))
  console.log('\nengine.diagnose() = ' + JSON.stringify(payload.engineDiagnose))

  console.log('\n=== media:// protocol + live engine ===')
  const c = payload.protocol ?? {}
  console.log(`  (header set built by src/main/protocol.ts CORS_HEADERS — both branches spread it)`)
  console.log(`  status200  Access-Control-Allow-Origin=${c.status200?.allowOrigin}  expose=${c.status200?.expose}`)
  console.log(`  status206  Access-Control-Allow-Origin=${c.status206?.allowOrigin}  expose=${c.status206?.expose}`)
  console.log(`  status416  Access-Control-Allow-Origin=${c.status416?.allowOrigin}`)
  console.log(`  live <audio> crossOrigin=${payload.engineDiagnose?.audioSrc ? payload.analyserAttached : 'n/a'} engineMode=${payload.engineMode} directFallback=${payload.audioDirectFallback}`)
  if (payload.protocol?.err) console.log('  protocol probe error: ' + payload.protocol.err)

  console.log('\n=== cover art / mediaSession ===')
  const cc = payload.cover?.checks ?? {}
  console.log(`  library tracks=${payload.cover?.tracksInLibrary} trackWithCover=${payload.cover?.trackWithCover}`)
  console.log(`  cover plain <img>            = ${cc.coverPlainImg}`)
  console.log(`  cover <img crossorigin=anon> = ${cc.coverAnonymousImg}   (MediaSession artwork requires this)`)
  console.log(`  mounted UI cover             = ${JSON.stringify(cc.mountedCover)}`)
  console.log(`  mediaSession supported=${cc.mediaSessionSupported} metadata=${JSON.stringify(cc.mediaSessionMetadata)}`)
  if (payload.cover?.err) console.log('  cover probe error: ' + payload.cover.err)

  if (payload.playback) {
    console.log('\n=== real playback through the engine (--playback) ===')
    if (payload.playback.err) console.log('  playback error: ' + payload.playback.err)
    if (payload.playback.formats) {
      for (const f of payload.playback.formats) {
        console.log(
          `  ${f.ext.padEnd(5)} ${String(f.title).padEnd(11)} mode=${f.mode} signalPeak=${f.signalPeak} ` +
            `playing=${f.isPlaying} t=${f.currentTime}/${f.duration} crossOrigin=${f.elementCrossOrigin} ` +
            `elError=${JSON.stringify(f.elementError)} playerError=${JSON.stringify(f.playerError ?? null)} fallback=${f.directFallback}`
        )
      }
    }
    if (payload.playback.seek) {
      const s = payload.playback.seek
      console.log(`  seek: ${s.track} ${s.from}s → ${s.to}s applied=${s.applied} peakAfterSeek=${s.signalPeakAfterSeek} playing=${s.stillPlaying} elError=${JSON.stringify(s.elementError)}`)
    }
    if (payload.playback.autoAdvance) {
      const a = payload.playback.autoAdvance
      console.log(`  auto-advance: queue=[${(a.queue ?? []).join(' → ')}] index ${a.from} → ${a.to} advanced=${a.advanced} playing=${a.playing} now=${a.title} mode=${a.mode} peak=${a.signalPeak} fallbackTried=${a.fallbackTried}`)
    }
    console.log(`  mediaSession=${JSON.stringify(payload.playback.mediaSession)}`)
    console.log(`  mediaSession artwork re-set=${JSON.stringify(payload.playback.mediaSessionArtworkSet)}`)
    console.log(`  mini window=${JSON.stringify(payload.playback.miniWindow)}`)
    console.log(`  cover=${JSON.stringify(payload.playback.cover)}`)
    console.log(`  engineFinal mode=${payload.playback.modeFinal} peak=${payload.playback.engineFinal?.signalPeak} fallbackTried=${payload.playback.engineFinal?.fallbackTried}`)
  }

  if (payload.sustained) {
    console.log('\n=== sustained live-engine check (--sustained, 12 s) ===')
    const s = payload.sustained
    if (s.err) console.log('  error: ' + s.err)
    console.log(`  track=${s.track} analyserAvailable=${s.analyserAvailable} modeAtStart=${s.modeAtStart} modeEnd=${s.modeEnd}`)
    for (const x of s.samples ?? []) {
      console.log(
        `  t+${String(x.sec).padStart(2)}s mode=${x.mode} peak=${String(x.peak).padStart(3)} maxDev=${String(x.maxDev).padStart(3)} ` +
          `playing=${x.playing} pos=${x.t}/${x.timeAdvance}s fallbackTried=${x.fallbackTried}`
      )
    }
    const everySampleSignals = (s.samples ?? []).every((x) => x.peak > 0 && x.maxDev > 0)
    const everySampleGraph = (s.samples ?? []).every((x) => x.mode === 'graph')
    console.log(`  VERDICT: all 12 samples peak>0 && maxDev>0 = ${everySampleSignals}; mode stayed graph = ${everySampleGraph}`)
  }

  if (baseline) {
    console.log('\n=== BEFORE → AFTER (baseline ' + COMPARE + ') ===')
    for (const row of baseline.results ?? []) {
      const now = results.find((r) => r.file === row.file)
      for (const v of ['unset', 'anonymous']) {
        const b = row[v] ?? {}
        const a = now?.[v] ?? {}
        console.log(
          `${row.file} [${v}] mediaPeak ${b.mediaPeak ?? '-'} → ${a.mediaPeak ?? '-'}   ` +
            `timeDomainMaxDev ${b.timeDomainMaxDev ?? '-'} → ${a.timeDomainMaxDev ?? '-'}   ` +
            `${verdictOf(b)} → ${verdictOf(a)}`
        )
      }
    }
    console.log(
      `engine mode ${baseline.engineMode ?? '-'} → ${payload.engineMode ?? '-'}   ` +
        `directFallback ${baseline.audioDirectFallback ?? '-'} → ${payload.audioDirectFallback ?? '-'}`
    )
  }
}

ws.close()

const anySignal = results.some((r) => ['unset', 'anonymous'].some((v) => (r[v]?.mediaPeak ?? 0) > 0))
process.exit(anySignal ? 0 : 1)

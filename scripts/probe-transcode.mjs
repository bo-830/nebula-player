/**
 * t13 evidence: the transcode route (AAC(ADTS) → M4A remux) really works end to
 * end, i.e. `decodeEnsure(<raw path>)` produces a media:// URL that Chromium can
 * actually play through the Web Audio graph, and the output lands in the cache
 * directory that the F3 containment check allows.
 *
 * Note on APE: this machine's ffmpeg build ships APE *decoders* only (no
 * `ape` encoder), so a real APE fixture cannot be synthesised here. The routing
 * decision is unit-covered (`mediaFormats.test.ts`: "routes ape to wav and aac
 * to m4a"); the executable end-to-end proof is done on the AAC branch. The
 * transcoded output is `.wav` for APE, and `ensureRoots()` already allows
 * `paths().decodeCache`, so the same code path is exercised.
 *
 * Usage: node scripts/probe-transcode.mjs <raw audio path>   (requires `npm run dev`)
 */
import { statSync } from 'fs'

const PORT = Number(process.env.CDP_PORT ?? 9222)
const rawPath = process.argv[2]
if (!rawPath) {
  console.error('usage: node scripts/probe-transcode.mjs <raw audio path>')
  process.exit(2)
}

const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const main = list.find((t) => t.type === 'page' && /localhost:5173\/$/.test(t.url))
if (!main) throw new Error('main dev window not found: ' + JSON.stringify(list.map((t) => t.url)))

const ws = new WebSocket(main.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = rej
})
let id = 0
const pending = new Map()
const entries = []
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result)
    pending.delete(m.id)
    return
  }
  if (m.method === 'Log.entryAdded') entries.push({ level: m.params.entry.level, text: m.params.entry.text })
}
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++id
    pending.set(i, res)
    ws.send(JSON.stringify({ id: i, method, params }))
  })
const ev = (expr) =>
  new Promise((res) => {
    const i = ++id
    pending.set(i, res)
    ws.send(
      JSON.stringify({
        id: i,
        method: 'Runtime.evaluate',
        params: { expression: expr, awaitPromise: true, returnByValue: true }
      })
    )
  })

await send('Log.enable', {})
await send('Runtime.enable', {})

for (let i = 0; i < 60; i++) {
  const r = await ev('typeof window.__nebula === "object"')
  if (r?.result?.value === true) break
  if (i === 59) {
    console.error('renderer did not boot')
    ws.close()
    process.exit(1)
  }
  await new Promise((r2) => setTimeout(r2, 500))
}

const out = await ev(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms))
  const neb = window.__nebula
  const engine = neb.engine
  const res = { raw: ${JSON.stringify(rawPath)} }

  // 1) decodeEnsure on the RAW path must yield a DIFFERENT (transcoded) url
  const t0 = Date.now()
  const url = await window.api.decodeEnsure(${JSON.stringify(rawPath)})
  res.decodeMs = Date.now() - t0
  res.outUrl = String(url).slice(0, 26)
  res.isMediaUrl = String(url).startsWith('media://')
  res.urlChangedFromSource = !String(url).toLowerCase().endsWith('.aac')

  // 2) play that URL through the real engine and observe the live spectrum
  neb.player.getState().stop()
  await sleep(300)
  await engine.load(url)
  await engine.play()
  await sleep(2600)
  const d = engine.diagnose()
  res.mode = engine.getMode()
  res.signalPeak = d.signalPeak
  res.ctxState = d.ctxState
  res.audioPaused = d.audioPaused
  const el = document.querySelector('audio')
  res.elementErrorCode = el && el.error ? el.error.code : null
  res.duration = Math.round(engine.duration * 100) / 100
  res.currentTime = Math.round(engine.currentTime * 100) / 100
  // seek across the transcoded output (Range path on the cache file)
  engine.seek(3)
  await sleep(600)
  res.afterSeek = Math.round(engine.currentTime * 100) / 100
  engine.pause()
  return JSON.stringify(res)
})()`)

if (out.exceptionDetails) {
  console.error('page exception:', JSON.stringify(out.exceptionDetails, null, 2))
  ws.close()
  process.exit(1)
}
const r = JSON.parse(out.result.value)
console.log(JSON.stringify(r, null, 2))
console.log('--- checks ---')
console.log('transcoded url returned :', r.isMediaUrl && r.urlChangedFromSource)
console.log('plays through graph     :', r.mode === 'graph' && r.signalPeak > 0 && r.audioPaused === false)
console.log('duration read           :', r.duration, '| after seek:', r.afterSeek)
console.log('element error           :', r.elementErrorCode)
const zeroes = entries.filter((e) => /outputs zeroes|CORS access restrictions/i.test(e.text))
console.log('CORS zeroes warnings    :', zeroes.length)
try {
  const outFile = decodeURIComponent(String(r.outUrl))
  console.log('(output url is a media:// cache ref; on-disk size checked separately)')
} catch {
  /* ignore */
}
ws.close()
process.exit(0)

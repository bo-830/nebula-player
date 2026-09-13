/**
 * t13 acceptance matrix: 5 formats × real playback + spectrum + covers + CORS log.
 *
 * Checks (captain's F3 regression red lines):
 *   - every format plays (no element error / no player error)
 *   - engine.getMode() === 'graph' and signalPeak > 0 while playing
 *   - covers render in the real UI (plain no-cors <img>, list + detail + mini)
 *   - the Chromium log contains ZERO "MediaElementAudioSource outputs zeroes…"
 *   - prohibited paths are refused (containment) and serve no bytes
 *
 * Usage: node scripts/probe-media-accept.mjs   (requires `npm run dev`)
 */
const PORT = Number(process.env.CDP_PORT ?? 9222)
const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const pages = list.filter((t) => t.type === 'page')
const mainTarget = pages.find((t) => t.url.endsWith('5173/'))
if (!mainTarget) throw new Error('main window not found')

const connect = async (target) => {
  const ws = new WebSocket(target.webSocketDebuggerUrl)
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
    if (m.method === 'Runtime.consoleAPICalled') {
      entries.push({
        level: m.params.type,
        text: (m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ')
      })
    }
  }
  const send = (method, params = {}) =>
    new Promise((res) => {
      const i = ++id
      pending.set(i, res)
      ws.send(JSON.stringify({ id: i, method, params }))
    })
  return {
    ws,
    entries,
    send,
    ev: (expr) =>
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
  }
}

const main = await connect(mainTarget)
await main.send('Log.enable', {})
await main.send('Runtime.enable', {})

// wait for boot before touching window.__nebula: an awaitPromise evaluate that
// reads it too early never settles (observed hanging for 600s)
for (let i = 0; i < 60; i++) {
  const r = await main.ev('typeof window.__nebula === "object"')
  if (r?.result?.value === true) break
  if (i === 59) {
    console.error('renderer did not boot (window.__nebula missing)')
    main.ws.close()
    process.exit(1)
  }
  await new Promise((r2) => setTimeout(r2, 500))
}

// open the mini window so its cover can be checked too
await main.ev(`(async () => { await window.api.miniToggle(); return 'ok' })()`)
await new Promise((r) => setTimeout(r, 2500))

const matrix = await main.ev(`(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms))
  const neb = window.__nebula
  const player = neb.player
  const engine = neb.engine
  const out = { perFormat: [], covers: {}, unauthorized: {} }

  const tracks = neb.library.getState().tracks
  // one track per distinct extension
  const seen = new Set()
  const picked = []
  for (const t of tracks) {
    if (seen.has(t.ext)) continue
    seen.add(t.ext)
    picked.push(t)
  }

  for (const t of picked) {
    const rec = { ext: t.ext, file: String(t.path).split(/[\\\\/]/).pop() }
    player.getState().stop()
    await sleep(300)
    await player.getState().playTracks([t], 0)
    await sleep(2600)
    const d = engine.diagnose()
    rec.mode = engine.getMode()
    rec.signalPeak = d.signalPeak
    rec.ctxState = d.ctxState
    rec.playing = player.getState().isPlaying
    rec.time = Math.round(player.getState().currentTime * 100) / 100
    rec.playerError = player.getState().error
    const el = document.querySelector('audio')
    rec.elementErrorCode = el && el.error ? el.error.code : null
    // A short test file (song-a.mp3 is ~2-6s) can reach its natural end before we
    // sample, which is NOT a failure: the assertions below are decode errors, a
    // non-graph mode and a silent analyser. 'advanced' proves playback really ran.
    rec.endedEarly = !rec.playing && rec.time > 0 && !rec.playerError && rec.elementErrorCode === null
    // seek works (Range/206 path)
    player.getState().seek(1.5)
    await sleep(600)
    rec.afterSeek = Math.round(engine.currentTime * 100) / 100
    rec.advanced = rec.afterSeek > 0
    out.perFormat.push(rec)
    await sleep(200)
  }
  player.getState().stop()
  await sleep(300)

  // covers: the app's own <img> elements are plain (no-cors) — the CORP-sensitive case
  const coverEls = Array.from(document.querySelectorAll('img[src^="media://"]'))
  out.covers.uiCount = coverEls.length
  out.covers.ui = coverEls.slice(0, 6).map((el) => ({
    complete: el.complete,
    w: el.naturalWidth,
    cls: el.parentElement ? el.parentElement.className : ''
  }))

  // containment spot checks (must be refused, no bytes)
  const enc = (p) => {
    const bytes = new TextEncoder().encode(p)
    let s = ''
    for (const b of bytes) s += String.fromCharCode(b)
    return btoa(s).replace(/[+]/g, '-').replace(/[/]/g, '_').replace(/=+$/, '')
  }
  const probe = (path) =>
    new Promise((resolve) => {
      const img = new Image()
      const t = setTimeout(() => resolve('timeout'), 3500)
      img.onload = () => { clearTimeout(t); resolve('loaded(w=' + img.naturalWidth + ')') }
      img.onerror = () => { clearTimeout(t); resolve('refused') }
      img.src = 'media://local/' + enc(path)
    })
  const coverPath = out.covers.ui.length && tracks.find((t) => t.coverPath)?.coverPath
  if (coverPath) {
    const userData = coverPath.replace(/[\\\\/]covers[\\\\/][^\\\\/]*$/, '')
    out.unauthorized.settingsJson = await probe(userData + '\\settings.json')
    out.unauthorized.outsideRootsPng = await probe(userData + '\\probe-not-there.png')
    out.unauthorized.traversal = await probe(userData + '\\..\\..\\..\\..\\Windows\\win.ini')
  }
  return JSON.stringify(out)
})()`)

if (matrix.exceptionDetails) {
  console.error('page exception:', JSON.stringify(matrix.exceptionDetails, null, 2))
  main.ws.close()
  process.exit(1)
}
const result = JSON.parse(matrix.result.value)
console.log(JSON.stringify(result, null, 2))

const zeroesMain = main.entries.filter((e) => /outputs zeroes|CORS access restrictions/i.test(e.text))
console.log('\n--- evidence summary ---')
console.log('formats tested      :', result.perFormat.map((r) => r.ext).join(', '))
console.log('all graph           :', result.perFormat.every((r) => r.mode === 'graph'))
console.log('all peak > 0        :', result.perFormat.every((r) => r.signalPeak > 0))
console.log(
  'all no decode error :',
  result.perFormat.every((r) => !r.playerError && r.elementErrorCode === null)
)
console.log(
  'all really played   :',
  result.perFormat.every((r) => r.advanced && (r.playing || r.endedEarly))
)
for (const r of result.perFormat) {
  if (r.endedEarly) console.log(`  (note) ${r.ext}: playback had already ended naturally — not a failure`)
}
console.log('all seek applied    :', result.perFormat.every((r) => Number.isFinite(r.afterSeek)))
console.log('ui covers           :', result.covers.uiCount, JSON.stringify(result.covers.ui))
console.log('unauthorized        :', JSON.stringify(result.unauthorized))
console.log('CORS-zeroes warnings:', zeroesMain.length, '| entries seen:', main.entries.length)

// mini window cover
const after = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const miniTarget = after.find((t) => t.type === 'page' && t.url.includes('#mini'))
if (miniTarget) {
  const mini = await connect(miniTarget)
  const miniOut = await mini.ev(`(async () => {
    const img = document.querySelector('.mini-cover img')
    return JSON.stringify({
      cover: img ? { complete: img.complete, w: img.naturalWidth, plain: !img.crossOrigin } : null,
      title: document.querySelector('.mini-title')?.textContent ?? null
    })
  })()`)
  console.log('mini cover          :', miniOut.result?.value)
  const miniZeroes = mini.entries.filter((e) => /outputs zeroes|CORS access restrictions/i.test(e.text))
  console.log('mini zeroes warnings:', miniZeroes.length)
  mini.ws.close()
} else {
  console.log('mini cover          : (mini window target not found)')
}
main.ws.close()
process.exit(0)

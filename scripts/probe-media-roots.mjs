/**
 * t13 evidence: media:// containment + extension whitelist, observed from the
 * renderer via subresource loads.
 *
 * Page CSP (`connect-src 'self'`) blocks cross-scheme fetch, but `img-src`
 * explicitly allows `media:`, so an <img> load is the honest probe: a refused
 * response surfaces as an error event, a served file as a decoded image.
 *
 * Expected:
 *   real cover inside <userData>/covers   → loads (naturalWidth > 0)
 *   settings.json in <userData>            → blocked (403: not in a root)
 *   .txt next to the audio                 → blocked (404: not servable)
 *   traversal out of a library root        → blocked (403)
 *
 * Usage: node scripts/tmp-probe-media-roots.mjs   (requires `npm run dev`)
 */
const PORT = Number(process.env.CDP_PORT ?? 9222)
const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
// exclude the floating lyric window (`#mini`): it has no `window.__nebula` hook
const main = list.find((t) => t.type === 'page' && /localhost:5173\/$/.test(t.url))
if (!main) {
  throw new Error(
    'main dev window not found (#mini is excluded): ' + JSON.stringify(list.map((t) => t.url))
  )
}

const ws = new WebSocket(main.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = rej
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

// wait for boot: an awaitPromise evaluate that reads window.__nebula too early
// never settles (observed hanging for 600s), so poll a cheap sync expression
for (let i = 0; i < 60; i++) {
  const r = await ev('typeof window.__nebula === "object"')
  if (r?.result?.value === true) break
  if (i === 59) {
    console.error('renderer did not boot (window.__nebula missing)')
    ws.close()
    process.exit(1)
  }
  await new Promise((r2) => setTimeout(r2, 500))
}

const probe = `(async () => {
  const out = {}
  const enc = (p) => {
    const bytes = new TextEncoder().encode(p)
    let s = ''
    for (const b of bytes) s += String.fromCharCode(b)
    return btoa(s).replace(/[+]/g, '-').replace(/[/]/g, '_').replace(/=+$/, '')
  }
  const mediaUrl = (p) => 'media://local/' + enc(p)

  const tryImg = (url) =>
    new Promise((resolve) => {
      const img = new Image()
      const t = setTimeout(() => resolve({ outcome: 'timeout' }), 4000)
      img.onload = () => { clearTimeout(t); resolve({ outcome: 'loaded', w: img.naturalWidth }) }
      img.onerror = () => { clearTimeout(t); resolve({ outcome: 'blocked' }) }
      img.src = url
    })

  const lib = await window.api.libraryGet()
  const track = lib.tracks[0]
  const cover = lib.tracks.find((t) => t.coverPath)?.coverPath ?? null
  out.trackPath = track.path
  out.coverPath = cover

  // real track still loads through <audio> (regression guard)
  {
    const el = new Audio()
    el.crossOrigin = 'anonymous'
    el.preload = 'metadata'
    el.src = mediaUrl(track.path)
    out.trackLoad = await new Promise((resolve) => {
      const t = setTimeout(() => resolve('timeout'), 5000)
      el.onloadedmetadata = () => { clearTimeout(t); resolve('metadata:' + Math.round(el.duration * 100) / 100) }
      el.onerror = () => { clearTimeout(t); resolve('error:' + (el.error ? el.error.code : '?')) }
    })
    try { el.remove() } catch {}
  }

  // 1) real cover inside <userData>/covers → must load
  if (cover) out.coverLoad = await tryImg(mediaUrl(cover))

  // 2) settings.json (same <userData>, but NOT in an allowed root) → must be refused
  if (cover) {
    const userData = cover.replace(/[\\\\/]covers[\\\\/][^\\\\/]*$/, '')
    out.userData = userData
    out.settingsJson = await tryImg(mediaUrl(userData + '\\\\settings.json'))
    // 2b) THE decisive containment case: a SERVABLE extension (png) that lives
    //     outside every allowed root → a 403, not the 404 of the ext whitelist
    out.pngOutsideRoots = await tryImg(mediaUrl(userData + '\\\\probe-outside-roots.png'))
    // 2c) same absolute file, but through a path that walks back INTO the covers
    //     dir after leaving it — must still be allowed (containment, not string match)
    out.pngViaDotDotIntoRoots = await tryImg(
      mediaUrl(userData + '\\\\..\\\\user\\\\covers\\\\' + cover.replace(/^.*[\\\\/]/, ''))
    )
    // 3) traversal out of the library root → must be refused
    const root = track.path.replace(/[\\\\/][^\\\\/]+$/, '')
    out.traversal = await tryImg(mediaUrl(root + '\\\\..\\\\..\\\\..\\\\..\\\\Windows\\\\win.ini'))
    // 4) non-servable extension beside the audio → must be refused
    out.txtBeside = await tryImg(mediaUrl(root + '\\\\probe-not-servable.txt'))
    // control: the same directory's real image (if any) or the cover again
    out.controlInsideRoot = await tryImg(mediaUrl(track.path))
  }
  return JSON.stringify(out)
})()`

const out = await ev(probe)
if (out.exceptionDetails) {
  console.error('page exception:', JSON.stringify(out.exceptionDetails, null, 2))
  ws.close()
  process.exit(1)
}
console.log(JSON.stringify(JSON.parse(out.result.value), null, 2))
ws.close()
process.exit(0)

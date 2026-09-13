/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS E2E probe (not shipped TS source); the rule targets typed TS modules.
 * If eslint.config.mjs later scopes this rule away from scripts/**, this
 * directive becomes redundant and can be deleted. */
/**
 * t6/t10 — cover rendering with a track that actually HAS artwork.
 *
 * song-a.mp3 / song-e.m4a carry an embedded cover (song-long.mp3 does not, which
 * is why a first pass saw zero cover URLs in the mini window). This probe picks a
 * track with coverPath, then verifies the list, the detail panel and the mini
 * window render it (naturalWidth > 0) and that no `MediaImage …` warning appears.
 *
 * Run:  npm run dev (CDP 9222)  →  node scripts/verify-covers.mjs
 */
import { cdp, mainTarget, miniTarget, targets, sleepMs } from './verify-lib.mjs'

const page = await cdp(mainTarget(await targets()))
const out = {}

await page.ev(`(() => {
  window.__t10log = window.__t10log || []
  window.__t10log.length = 0
  const cw = console.warn.bind(console)
  const ce = console.error.bind(console)
  console.warn = (...a) => { try { window.__t10log.push('warn: ' + a.map((x) => (x && x.message) || String(x)).join(' ')) } catch {} ; cw(...a) }
  console.error = (...a) => { try { window.__t10log.push('error: ' + a.map((x) => (x && x.message) || String(x)).join(' ')) } catch {} ; ce(...a) }
  return 1
})()`)

// ---------- who has artwork? ----------
out.library = await page.json(`(async () => {
  const lib = await window.api.libraryGet()
  return JSON.stringify(lib.tracks.map((t) => ({ title: t.title, ext: t.ext, hasCover: !!t.coverPath, cover: t.coverPath ? t.coverPath.slice(-28) : null })))
})()`)
out.withCover = out.library.filter((t) => t.hasCover).map((t) => t.title)

// ---------- switch to a track that has artwork ----------
out.setup = await page.json(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const p = window.__nebula.player
  const lib = await window.api.libraryGet()
  const t = lib.tracks.find((x) => x.coverPath)
  if (!t) return JSON.stringify({ error: 'no track with coverPath' })
  await p.getState().playTracks([t], 0)
  await wait(3000)
  const tab = Array.from(document.querySelectorAll('.detail-tab')).find((x) => x.innerText.trim() === '播放详情')
  if (tab && !tab.className.includes('active')) tab.click()
  await wait(1500)
  return JSON.stringify({ id: t.id, title: t.title, coverPath: t.coverPath.slice(-30), playing: p.getState().isPlaying })
})()`)

const readCovers = () =>
  page.json(`JSON.stringify((() => {
    const imgs = Array.from(document.querySelectorAll('img'))
    const cover = imgs.filter((i) => (i.src || '').includes('covers/') || (i.src || '').includes('media://'))
    return {
      allImg: imgs.length,
      covers: cover.map((i) => ({ tail: (i.src || '').slice(-34), natural: i.naturalWidth, complete: i.complete }))
    }
  })())`)

out.listCovers = await readCovers()
await sleepMs(800)
out.detailCovers = await readCovers()

// ---------- the cover request itself should be a clean 200 ----------
out.coverFetch = await page.json(`(async () => {
  const lib = await window.api.libraryGet()
  const t = lib.tracks.find((x) => x.coverPath)
  if (!t) return JSON.stringify({ error: 'no cover' })
  // the renderer cannot build the media URL itself; reuse an <img> already on screen
  const img = Array.from(document.querySelectorAll('img')).find((i) => (i.src || '').includes('covers/') || (i.src || '').includes('media://'))
  if (!img) return JSON.stringify({ error: 'no cover img in DOM' })
  try {
    const r = await fetch(img.src, { method: 'GET' })
    const buf = await r.arrayBuffer()
    return JSON.stringify({ url: img.src.slice(-34), status: r.status, type: r.headers.get('content-type'), bytes: buf.byteLength, acao: r.headers.get('access-control-allow-origin') })
  } catch (e) {
    return JSON.stringify({ url: img.src.slice(-34), error: String(e) })
  }
})()`)

// ---------- mini window ----------
await page.ev(`(async () => { await window.api.miniToggle(); return 1 })()`)
await sleepMs(3500)
try {
  const mini = await cdp(miniTarget(await targets()))
  out.mini = await mini.json(`JSON.stringify((() => {
    const imgs = Array.from(document.querySelectorAll('img'))
    return {
      title: document.querySelector('.mini-title') ? document.querySelector('.mini-title').innerText : null,
      imgCount: imgs.length,
      covers: imgs.map((i) => ({ tail: (i.src || '').slice(-34), natural: i.naturalWidth, complete: i.complete }))
    }
  })())`)
  mini.close()
} catch (e) {
  out.mini = { error: String(e.message) }
}

out.consoleLog = await page.json(`JSON.stringify(window.__t10log || [])`)
out.mediaImageWarnings = out.consoleLog.filter((l) => /MediaImage|can only be of/i.test(l))

console.log(JSON.stringify(out, null, 2))
page.close()
setTimeout(() => process.exit(0), 300)

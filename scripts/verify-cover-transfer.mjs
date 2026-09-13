/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS E2E probe (not shipped TS source); the rule targets typed TS modules.
 * If eslint.config.mjs later scopes this rule away from scripts/**, this
 * directive becomes redundant and can be deleted. */
/**
 * t6/t10 — settle the cover-transfer question and the mini-window cover sync.
 *
 * `fetch(coverUrl)` fails in the renderer while <img src=coverUrl> works, which is
 * expected for a media:// scheme served with Cross-Origin-Resource-Policy:
 * same-origin: subresource loads (img/audio) are allowed, cross-origin fetches are
 * not — and the app never fetches covers, it only renders them.
 *
 * The probe therefore checks the three things that actually matter:
 *   1. <img> decode of the SAME URL at a chosen size (naturalWidth), i.e. an
 *      image CORS load (media element hint path)
 *   2. navigator.mediaSession.metadata.artwork (OS media panel artwork source)
 *   3. the mini window catching up to the current track and rendering its cover
 *
 * Run:  npm run dev (CDP 9222)  →  node scripts/verify-cover-transfer.mjs
 */
import { cdp, mainTarget, miniTarget, targets, sleepMs } from './verify-lib.mjs'

const page = await cdp(mainTarget(await targets()))
const out = {}

out.track = await page.json(`(async () => {
  const lib = await window.api.libraryGet()
  const t = lib.tracks.find((x) => x.coverPath && x.ext === 'mp3')
  return JSON.stringify(t ? { id: t.id, title: t.title, coverPath: t.coverPath } : { error: 'no mp3 with cover' })
})()`)

/** reuse an <img> already on screen (only the renderer knows the media:// URL) */
out.imgDecode = await page.json(`(async () => {
  const img = Array.from(document.querySelectorAll('img')).find((i) => (i.src || '').includes('covers/') || (i.src || '').includes('media://'))
  if (!img) return JSON.stringify({ error: 'no cover img in DOM' })
  const fresh = new Image()
  fresh.decoding = 'sync'
  const loaded = await new Promise((resolve) => {
    fresh.onload = () => resolve(true)
    fresh.onerror = () => resolve(false)
    fresh.src = img.src
  })
  return JSON.stringify({ sameUrl: img.src.slice(-30), loaded, natural: fresh.naturalWidth, complete: fresh.complete })
})()`)

// a plain fetch is expected to be refused by the scheme's CORP policy — record it
out.fetchAttempt = await page.json(`(async () => {
  const img = Array.from(document.querySelectorAll('img')).find((i) => (i.src || '').includes('media://'))
  if (!img) return JSON.stringify({ error: 'no img' })
  try {
    const r = await fetch(img.src)
    return JSON.stringify({ ok: r.ok, status: r.status, note: 'fetch allowed' })
  } catch (e) {
    return JSON.stringify({ refused: true, note: String(e).slice(0, 70) })
  }
})()`)

out.mediaSession = await page.json(`JSON.stringify((() => {
  const m = navigator.mediaSession && navigator.mediaSession.metadata
  return {
    hasMetadata: !!m,
    title: m ? m.title : null,
    artwork: m && m.artwork ? m.artwork.map((a) => ({ src: (a.src || '').slice(-30), sizes: a.sizes, type: a.type })) : []
  }
})())`)

// ---------- mini window: wait for it to catch up to the current track ----------
await page.ev(`(async () => { await window.api.miniToggle(); return 1 })()`)
await sleepMs(3000)

let mini
try {
  mini = await cdp(miniTarget(await targets()))
} catch (e) {
  out.mini = { error: String(e.message) }
}
if (mini) {
  const readMini = () =>
    mini.json(`JSON.stringify((() => {
      const imgs = Array.from(document.querySelectorAll('img'))
      return {
        title: document.querySelector('.mini-title') ? document.querySelector('.mini-title').innerText : null,
        imgCount: imgs.length,
        covers: imgs.map((i) => ({ natural: i.naturalWidth, complete: i.complete, tail: (i.src || '').slice(-30) }))
      }
    })())`)

  const wantTitle = out.track.title
  let last = null
  for (let i = 0; i < 15; i++) {
    last = await readMini()
    if (last.title === wantTitle && last.covers.some((c) => c.natural > 0)) break
    // nudge the main window into re-pushing state (the mini window mirrors it)
    await page.ev(`(async () => {
      const p = window.__nebula.player.getState()
      p.seek(Math.min(1, p.currentTime + 0.2))
      await new Promise((r) => setTimeout(r, 300))
      return 1
    })()`)
    await sleepMs(1500)
  }
  out.mini = { expectedTitle: wantTitle, ...last }
  mini.close()
}

console.log(JSON.stringify(out, null, 2))
page.close()
setTimeout(() => process.exit(0), 300)

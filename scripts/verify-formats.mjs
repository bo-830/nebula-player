/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS E2E probe (not shipped TS source); the rule targets typed TS modules.
 * If eslint.config.mjs later scopes this rule away from scripts/**, this
 * directive becomes redundant and can be deleted. */
/**
 * t6/t10 — playback regression sweep across every shipped test format.
 *
 * For each of .devdata/test-music/{song-a.mp3, song-c.flac, song-b.wav,
 * song-d.ogg, song-e.m4a}: play it, watch for MEDIA_ELEMENT_ERROR /
 * NotSupportedError, confirm the element really advances, then exercise
 * seek / 切歌 / 音量. It closes with the auto-advance chain (t10 item 3).
 *
 * Run:  npm run dev (CDP 9222)  →  node scripts/verify-formats.mjs
 */
import { cdp, mainTarget, targets, sleepMs } from './verify-lib.mjs'

const page = await cdp(mainTarget(await targets()))
const out = { formats: [] }

// `mainTarget()` already excludes the `#mini` target (it has no dev hook). A
// renderer that has not finished booting makes `awaitPromise` evaluations hang,
// so wait for the hook before touching the app.
for (let i = 0; i < 30; i++) {
  const ready = await page.ev(`typeof window.__nebula === 'object'`)
  if (ready) break
  await sleepMs(1000)
}

// capture renderer console errors for the whole sweep
await page.ev(`(() => {
  if (!window.__t10log) {
    window.__t10log = []
    const ce = console.error.bind(console)
    console.error = (...a) => { try { window.__t10log.push(a.map((x) => (x && x.message) || String(x)).join(' ')) } catch {} ; ce(...a) }
    window.addEventListener('error', (e) => { try { window.__t10log.push('window.error: ' + e.message) } catch {} })
  }
  window.__t10log.length = 0
  return 1
})()`)

const FORMATS = ['song-a.mp3', 'song-c.flac', 'song-b.wav', 'song-d.ogg', 'song-e.m4a']

for (const file of FORMATS) {
  const before = await page.json(`JSON.stringify(window.__t10log || [])`)
  const res = await page.json(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    const p = window.__nebula.player
    const lib = await window.api.libraryGet()
    const t = lib.tracks.find((x) => x.path.endsWith(${JSON.stringify(file)}))
    if (!t) return JSON.stringify({ file: ${JSON.stringify(file)}, error: 'not in library' })
    await p.getState().playTracks([t], 0)
    await wait(2500)
    const st = p.getState()
    const el = document.querySelector('audio')
    const elInfo = el
      ? { paused: el.paused, currentTime: el.currentTime, readyState: el.readyState, error: el.error ? { code: el.error.code, msg: el.error.message } : null, src: (el.currentSrc || '').slice(0, 30) }
      : { missing: true }
    // seek
    const target = Math.max(0, Math.min(1.0, (el ? el.currentTime : 0) + 0.5))
    p.getState().seek(target)
    await wait(1000)
    const afterSeek = el ? el.currentTime : null
    // volume
    p.getState().setVolume(0.35)
    await wait(400)
    const vol = p.getState().volume
    p.getState().setVolume(0.8)
    return JSON.stringify({
      file: ${JSON.stringify(file)},
      title: t.title,
      ext: t.ext,
      playing: st.isPlaying,
      currentTime: Math.round((el ? el.currentTime : 0) * 100) / 100,
      duration: Math.round((el ? el.duration : 0) * 100) / 100,
      error: st.error,
      element: elInfo,
      seek: { requested: Math.round(target * 100) / 100, actual: afterSeek !== null ? Math.round(afterSeek * 100) / 100 : null },
      volumeAfterSet: vol,
      mode: window.__nebula.engine.diagnose().mode
    })
  })()`)
  await sleepMs(600)
  const after = await page.json(`JSON.stringify(window.__t10log || [])`)
  out.formats.push({ ...res, newConsoleErrors: after.slice(before.length) })
}

// ---------- 切歌 + 自动续播（参考 diag-chain 思路，用真实播放）----------
out.chain = await page.json(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const p = window.__nebula.player
  const lib = await window.api.libraryGet()
  const list = lib.tracks.slice(0, 3)
  await p.getState().playTracks(list, 0)
  await wait(2500)
  const start = { index: p.getState().index, title: p.getState().current ? p.getState().current.title : null }
  // manual 切歌
  p.getState().next()
  await wait(2500)
  const afterNext = { index: p.getState().index, title: p.getState().current ? p.getState().current.title : null, playing: p.getState().isPlaying }
  // 自动续播: jump near the end and let it roll over on its own
  const st = p.getState()
  p.getState().seek(Math.max(0, (st.duration || 3) - 1.2))
  await wait(6000)
  const afterAuto = { index: p.getState().index, title: p.getState().current ? p.getState().current.title : null, playing: p.getState().isPlaying, at: Math.round(p.getState().currentTime * 10) / 10 }
  return JSON.stringify({ queueLen: p.getState().queue.length, start, afterNext, afterAuto, mode: window.__nebula.engine.diagnose().mode })
})()`)

out.consoleErrors = await page.json(`JSON.stringify(window.__t10log || [])`)

console.log(JSON.stringify(out, null, 2))
page.close()
setTimeout(() => process.exit(0), 300)

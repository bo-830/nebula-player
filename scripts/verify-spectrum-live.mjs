/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS E2E probe (not shipped TS source); the rule targets typed TS modules.
 * If eslint.config.mjs later scopes this rule away from scripts/**, this
 * directive becomes redundant and can be deleted. */
/**
 * t6 — live spectrum check on the real engine (t2 setSinkId + t10 media:// CORS).
 *
 * diag-graph.mjs builds its own graphs; this probe drives the app's OWN engine
 * through a normal playback and reports:
 *   - engine.diagnose(): mode / ctx.state / setSinkId phase / signalPeak
 *   - the canvas the user actually sees (non-zero pixel variance = bars drawn)
 *   - that playback itself is unaffected (isPlaying, time advancing)
 *
 * Run:  npm run dev (CDP 9222)  →  node scripts/verify-spectrum-live.mjs
 */
import { cdp, mainTarget, targets, sleepMs } from './verify-lib.mjs'

const page = await cdp(mainTarget(await targets()))
const out = {}

async function waitHook() {
  for (let i = 0; i < 30; i++) {
    const ok = await page.ev(`!!(window.__nebula && window.__nebula.engine)`)
    if (ok) return true
    await sleepMs(1000)
  }
  return false
}
out.hookReady = await waitHook()

// ---------- play a track through the app itself ----------
out.start = await page.json(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const p = window.__nebula.player
  const lib = await window.api.libraryGet()
  const t = lib.tracks.find((x) => /song-long|song-a|song-c/.test(x.path))
  if (!t) return JSON.stringify({ error: 'no test track' })
  await p.getState().playTracks([t], 0)
  await wait(4000)
  const st = p.getState()
  return JSON.stringify({ title: st.current ? st.current.title : null, isPlaying: st.isPlaying, at: st.currentTime, queueLen: st.queue.length })
})()`)

/** canvas pixel variance: 0 = nothing drawn (silent/waveform-less), >0 = bars */
const canvasStats = () =>
  page.json(`JSON.stringify((() => {
    const c = document.querySelector('canvas.spectrum')
    if (!c) return { canvas: false }
    const ctx = c.getContext('2d')
    if (!ctx) return { canvas: true, ctx: false }
    const w = c.width, h = c.height
    const d = ctx.getImageData(0, 0, w, h).data
    let nonBg = 0
    let max = 0
    for (let i = 0; i < d.length; i += 4) {
      const lum = d[i] + d[i + 1] + d[i + 2]
      if (lum > max) max = lum
      if (lum > 90) nonBg++
    }
    return { canvas: true, w, h, nonBgPixels: nonBg, maxLum: max }
  })())`)

out.samples = []
for (let i = 0; i < 4; i++) {
  const diag = await page.json(`(async () => {
    const e = window.__nebula.engine
    return JSON.stringify(typeof e.diagnose === 'function' ? e.diagnose() : { error: 'no diagnose' })
  })()`)
  const canvas = await canvasStats()
  const player = await page.json(`JSON.stringify({ playing: window.__nebula.player.getState().isPlaying, at: Math.round(window.__nebula.player.getState().currentTime * 10) / 10, direct: window.__nebula.player.getState().audioDirect })`)
  out.samples.push({ diag, canvas, player })
  await sleepMs(1200)
}

// ---------- the direct-mode fallback must still be reachable ----------
out.fallbackState = await page.json(`JSON.stringify({
  audioDirect: window.__nebula.player.getState().audioDirect,
  engineMode: window.__nebula.engine.diagnose().mode,
  fallbackTried: window.__nebula.engine.diagnose().fallbackTried
})`)

console.log(JSON.stringify(out, null, 2))
page.close()
setTimeout(() => process.exit(0), 300)

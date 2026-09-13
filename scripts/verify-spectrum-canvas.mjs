/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS E2E probe (not shipped TS source); the rule targets typed TS modules.
 * If eslint.config.mjs later scopes this rule away from scripts/**, this
 * directive becomes redundant and can be deleted. */
/**
 * t6 — the spectrum canvas the user actually sees (播放详情 tab).
 *
 * The live engine already reports a healthy analyser in verify-spectrum-live.mjs;
 * here the 播放详情 panel is opened first and the canvas pixels are sampled, so
 * "real-time spectrum is back" is proven by what is drawn, not only by diagnose().
 * Also confirms the direct-mode fallback path is still wired (audioDirect flag and
 * engine.mode) so the fix cannot have broken the waveform fallback.
 *
 * Run:  npm run dev (CDP 9222)  →  node scripts/verify-spectrum-canvas.mjs
 */
import { cdp, mainTarget, targets, sleepMs } from './verify-lib.mjs'

const page = await cdp(mainTarget(await targets()))
const out = {}

// make sure a track plays and the 播放详情 tab is the visible one
out.setup = await page.json(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const p = window.__nebula.player
  const lib = await window.api.libraryGet()
  const t = lib.tracks.find((x) => /song-long|song-a|song-c/.test(x.path))
  if (!t) return JSON.stringify({ error: 'no test track' })
  if (!p.getState().current || p.getState().current.id !== t.id) {
    await p.getState().playTracks([t], 0)
    await wait(3000)
  }
  if (!p.getState().isPlaying) { await p.getState().toggle(); await wait(1500) }
  const tab = Array.from(document.querySelectorAll('.detail-tab')).find((x) => x.innerText.trim() === '播放详情')
  if (tab && !tab.className.includes('active')) tab.click()
  await wait(1200)
  return JSON.stringify({ title: p.getState().current ? p.getState().current.title : null, playing: p.getState().isPlaying, tab: !!tab })
})()`)

const stats = () =>
  page.json(`JSON.stringify((() => {
    const c = document.querySelector('canvas.spectrum')
    if (!c) return { canvas: false }
    const ctx = c.getContext('2d')
    if (!ctx) return { canvas: true, ctx: false }
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    let lit = 0, max = 0
    for (let i = 0; i < d.length; i += 4) {
      const lum = d[i] + d[i + 1] + d[i + 2]
      if (lum > max) max = lum
      if (lum > 90) lit++
    }
    return { canvas: true, w: c.width, h: c.height, litPixels: lit, maxLum: max }
  })())`)

out.canvasSamples = []
for (let i = 0; i < 3; i++) {
  const diag = await page.json(`JSON.stringify((() => {
    const d = window.__nebula.engine.diagnose()
    return { mode: d.mode, signalPeak: d.signalPeak, ctxState: d.ctxState, setSinkIdPhase: d.setSinkIdPhase, ctxSinkId: d.ctxSinkId }
  })())`)
  out.canvasSamples.push({ diag, canvas: await stats(), playing: await page.ev(`window.__nebula.player.getState().isPlaying`) })
  await sleepMs(1200)
}

// why a canvas can legitimately read as blank: the draw loop bails out while the
// window is not visible (NowPlaying.tsx tick: `if (document.hidden) return`)
out.visibility = await page.json(`JSON.stringify({
  hidden: document.hidden,
  visibilityState: document.visibilityState,
  bodyHasFocus: document.hasFocus()
})`)

// the waveform fallback must still be intact (flag present, direct mode reachable)
out.fallbackWiring = await page.json(`JSON.stringify({
  audioDirectFlag: window.__nebula.player.getState().audioDirect,
  engineMode: window.__nebula.engine.diagnose().mode,
  fallbackTried: window.__nebula.engine.diagnose().fallbackTried,
  hasSwitchToDirect: typeof window.__nebula.engine.switchToDirect === 'function'
})`)

console.log(JSON.stringify(out, null, 2))
page.close()
setTimeout(() => process.exit(0), 300)

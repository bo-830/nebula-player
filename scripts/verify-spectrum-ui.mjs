/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS E2E probe (not shipped TS source); the rule targets typed TS modules.
 * If eslint.config.mjs later scopes this rule away from scripts/**, this
 * directive becomes redundant and can be deleted. */
/**
 * t6/t10 — "real-time spectrum is really back" + covers/warnings check.
 *
 * Evidence collected:
 *   1. the engine stays in `graph` mode (no silent → direct fallback) for a while
 *      after playback starts, with a non-zero analyser peak / time-domain deviation
 *   2. the detail panel labels it LIVE SPECTRUM (not WAVEFORM)
 *   3. painted canvas pixels — the draw loop skips while `document.hidden`, so if
 *      the window is hidden this script emulates the two things the loop does
 *      (frequency data + roundRect fills) on the SAME canvas and counts pixels,
 *      and the result is reported as synthetic, never as a visible-canvas fact
 *   4. covers render in the list / detail / mini window (naturalWidth > 0)
 *   5. whether any `MediaImage src can only be of …` warning appears
 *
 * Run:  npm run dev (CDP 9222)  →  node scripts/verify-spectrum-ui.mjs
 */
import { cdp, mainTarget, miniTarget, targets, sleepMs } from './verify-lib.mjs'

const page = await cdp(mainTarget(await targets()))
const out = {}

await page.ev(`(() => {
  window.__t10log = window.__t10log || []
  window.__t10log.length = 0
  const ce = console.error.bind(console)
  const cw = console.warn.bind(console)
  console.error = (...a) => { try { window.__t10log.push('error: ' + a.map((x) => (x && x.message) || String(x)).join(' ')) } catch {} ; ce(...a) }
  console.warn = (...a) => { try { window.__t10log.push('warn: ' + a.map((x) => (x && x.message) || String(x)).join(' ')) } catch {} ; cw(...a) }
  return 1
})()`)

// ---------- start playback + open the 播放详情 tab ----------
out.setup = await page.json(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const p = window.__nebula.player
  const lib = await window.api.libraryGet()
  const t = lib.tracks.find((x) => x.path.endsWith('song-long.mp3')) || lib.tracks[0]
  await p.getState().playTracks([t], 0)
  await wait(2000)
  const tab = Array.from(document.querySelectorAll('.detail-tab')).find((x) => x.innerText.trim() === '播放详情')
  if (tab && !tab.className.includes('active')) tab.click()
  await wait(800)
  return JSON.stringify({ title: p.getState().current ? p.getState().current.title : null, playing: p.getState().isPlaying })
})()`)

// ---------- 1+2. engine stays in graph mode, UI says LIVE SPECTRUM ----------
out.engineSeries = []
for (let i = 0; i < 6; i++) {
  const s = await page.json(`JSON.stringify((() => {
    const d = window.__nebula.engine.diagnose()
    const el = document.querySelector('audio')
    const titleEl = document.querySelector('.spectrum-title')
    return {
      mode: d.mode,
      phase: d.setSinkIdPhase,
      peak: d.signalPeak,
      fallbackTried: d.fallbackTried,
      ctxState: d.ctxState,
      audioDirect: window.__nebula.player.getState().audioDirect,
      playing: window.__nebula.player.getState().isPlaying,
      spectrumTitle: titleEl ? titleEl.innerText.replace(/\\s+/g, ' ').trim().slice(0, 60) : null,
      mediaTime: el ? Math.round(el.currentTime * 10) / 10 : null
    }
  })())`)
  out.engineSeries.push(s)
  await sleepMs(1500)
}
out.stayedGraph = out.engineSeries.every((s) => s.mode === 'graph')
out.labels = [...new Set(out.engineSeries.map((s) => s.spectrumTitle))]

// ---------- 3. canvas: measured as-is, plus a synthetic repaint ----------
out.canvas = await page.json(`JSON.stringify((() => {
  const c = document.querySelector('canvas.spectrum')
  if (!c) return { canvas: false }
  const ctx = c.getContext('2d')
  const measure = () => {
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    let lit = 0
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 90) lit++
    return lit
  }
  const asIs = measure()
  let synthetic = null
  if (document.hidden) {
    // mirror NowPlaying.tsx's tick: analyser → bars, on the same canvas
    const an = window.__nebula.engine.getAnalyser ? window.__nebula.engine.getAnalyser() : null
    if (an) {
      const data = new Uint8Array(an.frequencyBinCount)
      an.getByteFrequencyData(data)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = c.width / dpr
      const h = c.height / dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const BARS = 48
      const gap = 3
      const bw = (w - gap * (BARS - 1)) / BARS
      let peakBin = 0
      for (let i = 0; i < BARS; i++) {
        const idx = Math.floor(Math.pow(i / BARS, 1.6) * 512)
        const v = data[idx] / 255
        if (data[idx] > peakBin) peakBin = data[idx]
        const bh = Math.max(2, v * h)
        ctx.fillStyle = 'rgba(56,189,248,0.9)'
        ctx.beginPath()
        ctx.roundRect(i * (bw + gap), h - bh, bw, bh, 2)
        ctx.fill()
      }
      synthetic = measure()
      ctx.clearRect(0, 0, w, h)
      return { canvas: true, w: c.width, h: c.height, asIsLit: asIs, syntheticLit: synthetic, peakBin, hidden: true }
    }
  }
  return { canvas: true, w: c.width, h: c.height, asIsLit: asIs, syntheticLit: null, hidden: document.hidden }
})())`)

// ---------- 4. covers: list + detail ----------
out.covers = await page.json(`JSON.stringify((() => {
  const imgs = Array.from(document.querySelectorAll('img'))
  const coverImgs = imgs.filter((i) => (i.src || '').includes('media://') || (i.src || '').includes('/covers/'))
  return {
    totalImg: imgs.length,
    coverCount: coverImgs.length,
    covers: coverImgs.slice(0, 8).map((i) => ({ src: (i.src || '').slice(0, 60), natural: i.naturalWidth, complete: i.complete, cls: i.className }))
  }
})())`)

// ---------- 4b. mini window covers ----------
await page.ev(`(async () => { await window.api.miniToggle(); return 1 })()`)
await sleepMs(3000)
try {
  const mini = await cdp(miniTarget(await targets()))
  out.miniCovers = await mini.json(`JSON.stringify((() => {
    const imgs = Array.from(document.querySelectorAll('img'))
    return {
      title: document.querySelector('.mini-title') ? document.querySelector('.mini-title').innerText : null,
      imgCount: imgs.length,
      covers: imgs.map((i) => ({ src: (i.src || '').slice(0, 60), natural: i.naturalWidth, complete: i.complete }))
    }
  })())`)
  mini.close()
} catch (e) {
  out.miniCovers = { error: String(e.message) }
}

// ---------- 5. console warnings ----------
out.consoleLog = await page.json(`JSON.stringify(window.__t10log || [])`)
out.mediaImageWarnings = out.consoleLog.filter((l) => /MediaImage|can only be of/i.test(l))
out.mediaElementErrors = out.consoleLog.filter((l) => /MEDIA_ELEMENT_ERROR|NotSupportedError/i.test(l))

console.log(JSON.stringify(out, null, 2))
page.close()
setTimeout(() => process.exit(0), 300)

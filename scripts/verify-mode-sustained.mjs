/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS E2E probe (not shipped TS source); the rule targets typed TS modules.
 * If eslint.config.mjs later scopes this rule away from scripts/**, this
 * directive becomes redundant and can be deleted. */
/**
 * t6/t10 — the engine must not fall back to `direct` during sustained playback.
 *
 * The silence detector polls every 1.2 s and needs 3 zero-peak samples to switch
 * to direct, so a single snapshot is not enough: this samples `engine.getMode()`
 * (plus peak/fallback flags) for 15 s of real playback.
 *
 * Run:  npm run dev (CDP 9222)  →  node scripts/verify-mode-sustained.mjs
 */
import { writeFile } from 'fs/promises'
import { cdp, mainTarget, targets, sleepMs } from './verify-lib.mjs'

const page = await cdp(mainTarget(await targets()))
const out = { samples: [] }

out.start = await page.json(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const p = window.__nebula.player
  const lib = await window.api.libraryGet()
  const t = lib.tracks.find((x) => x.path.endsWith('song-long.mp3')) || lib.tracks[0]
  await p.getState().playTracks([t], 0)
  await wait(2500)
  return JSON.stringify({ title: p.getState().current ? p.getState().current.title : null, playing: p.getState().isPlaying, duration: p.getState().duration })
})()`)

// 15 s of playback, sampled every 1.5 s (detector needs 3 x 1.2 s of silence)
for (let i = 0; i < 10; i++) {
  const s = await page.json(`JSON.stringify((() => {
    const d = window.__nebula.engine.diagnose()
    const el = document.querySelector('audio')
    return {
      mode: d.mode,
      peak: d.signalPeak,
      fallbackTried: d.fallbackTried,
      audioDirect: window.__nebula.player.getState().audioDirect,
      playing: window.__nebula.player.getState().isPlaying,
      t: el ? Math.round(el.currentTime * 10) / 10 : null,
      crossOrigin: el ? el.crossOrigin : null,
      elError: el && el.error ? el.error.code : null
    }
  })())`)
  out.samples.push(s)
  await sleepMs(1500)
}

out.allGraph = out.samples.every((s) => s.mode === 'graph')
out.noFallback = out.samples.every((s) => s.fallbackTried === false && s.audioDirect === false)
out.peakRange = [Math.min(...out.samples.map((s) => s.peak)), Math.max(...out.samples.map((s) => s.peak))]
out.span = [out.samples[0].t, out.samples[out.samples.length - 1].t]

const json = JSON.stringify(out, null, 2)
// written by Node so shell redirection (UTF-16 on this host) cannot corrupt it
await writeFile('.devdata/t6-evidence/probe-mode-sustained.json', json, 'utf8')
console.log(json)
page.close()
setTimeout(() => process.exit(out.allGraph && out.noFallback ? 0 : 1), 300)

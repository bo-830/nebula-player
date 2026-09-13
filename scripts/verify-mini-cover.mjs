/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS E2E probe (not shipped TS source); the rule targets typed TS modules.
 * If eslint.config.mjs later scopes this rule away from scripts/**, this
 * directive becomes redundant and can be deleted. */
/**
 * t6/t10 — mini window cover, sampled before the short test tracks auto-advance.
 *
 * The test files are 2-6 s long, so the player rolls to the next queue entry while
 * a probe is still sampling — that is why earlier runs saw a "stale" mini title
 * (it was actually syncing, just to a later track). Here playback is started on a
 * track WITH artwork and the mini window is sampled immediately (600 ms cadence),
 * recording the title+banner per sample so the artwork render is unambiguous.
 *
 * Run:  npm run dev (CDP 9222)  →  node scripts/verify-mini-cover.mjs
 */
import { cdp, mainTarget, miniTarget, targets, sleepMs } from './verify-lib.mjs'

const page = await cdp(mainTarget(await targets()))
const out = {}

// make sure the mini window is open (toggle back on if the last probe left it open)
const list0 = await targets()
if (!list0.some((t) => t.url.includes('#mini'))) {
  await page.ev(`(async () => { await window.api.miniToggle(); return 1 })()`)
  await sleepMs(2500)
}
out.targets = (await targets()).filter((t) => t.url.includes('#mini')).map((t) => t.url)

const mini = await cdp(miniTarget(await targets()))
const readMini = () =>
  mini.json(`JSON.stringify((() => {
    const imgs = Array.from(document.querySelectorAll('img'))
    return {
      title: document.querySelector('.mini-title') ? document.querySelector('.mini-title').innerText : null,
      imgs: imgs.map((i) => ({ natural: i.naturalWidth, complete: i.complete, tail: (i.src || '').slice(-26) }))
    }
  })())`)

out.samples = []
out.playback = []
for (let round = 0; round < 3; round++) {
  // (re)start the artwork track: one long-ish probe window is not available, so
  // restart it and sample fast instead
  const started = await page.json(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    const p = window.__nebula.player
    const lib = await window.api.libraryGet()
    const t = lib.tracks.find((x) => x.coverPath && x.ext === 'mp3')
    if (!t) return JSON.stringify({ error: 'no mp3 with cover' })
    await p.getState().playTracks([t], 0)
    await wait(600)
    return JSON.stringify({ id: t.id, title: t.title, playing: p.getState().isPlaying })
  })()`)
  out.playback.push(started)
  for (let i = 0; i < 4; i++) {
    const m = await readMini()
    const mainState = await page.json(`JSON.stringify({ title: window.__nebula.player.getState().current ? window.__nebula.player.getState().current.title : null })`)
    out.samples.push({ round, mainTitle: mainState.title, miniTitle: m.title, imgs: m.imgs })
    await sleepMs(500)
  }
}

out.artworkRenderObserved = out.samples.some(
  (s) => s.mainTitle === s.miniTitle && (s.imgs || []).some((i) => i.natural > 0)
)
out.matchingSamples = out.samples.filter((s) => s.mainTitle === s.miniTitle).length

mini.close()
console.log(JSON.stringify(out, null, 2))
page.close()
setTimeout(() => process.exit(0), 300)

/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS E2E probe (not shipped TS source); the rule targets typed TS modules.
 * If eslint.config.mjs later scopes this rule away from scripts/**, this
 * directive becomes redundant and can be deleted. */
/**
 * t6/t10 — is the mini window actually syncing (and rendering covers)?
 *
 * verify-cover-transfer.mjs left the mini window on a stale title, which could be
 * either a real sync defect or an artifact of toggling the window closed/open.
 * This probe drives it deterministically: closes the window, starts a NEW track
 * with artwork, opens the window, then polls both windows.
 *
 * Run:  npm run dev (CDP 9222)  →  node scripts/verify-mini-sync.mjs
 */
import { cdp, mainTarget, miniTarget, targets, sleepMs } from './verify-lib.mjs'

const page = await cdp(mainTarget(await targets()))
const out = {}

// close any existing mini window first so the next toggle definitely OPENS it
await page.ev(`(async () => { try { window.api.miniClose() } catch {} ; await new Promise((r) => setTimeout(r, 500)); return 1 })()`)
await sleepMs(1200)
const afterClose = await targets()
out.closedConfirmed = !afterClose.some((t) => t.url.includes('#mini'))

// pick a track WITH artwork and start it
out.start = await page.json(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const p = window.__nebula.player
  const lib = await window.api.libraryGet()
  const t = lib.tracks.find((x) => x.coverPath)
  if (!t) return JSON.stringify({ error: 'no track with cover' })
  await p.getState().playTracks([t], 0)
  await wait(2500)
  return JSON.stringify({ id: t.id, title: t.title, playing: p.getState().isPlaying, cover: t.coverPath.slice(-24) })
})()`)

// now OPEN the window (previous call closed it, so this is an open)
const toggled = await page.ev(`(async () => { return await window.api.miniToggle() })()`)
out.toggledTo = toggled
await sleepMs(3000)

const list = await targets()
out.miniTargets = list.filter((t) => t.url.includes('#mini')).map((t) => t.url)
if (out.miniTargets.length === 0) {
  console.log(JSON.stringify({ ...out, error: 'mini window did not open' }, null, 2))
  process.exit(0)
}

const mini = await cdp(miniTarget(list))
const readMini = () =>
  mini.json(`JSON.stringify((() => {
    const imgs = Array.from(document.querySelectorAll('img'))
    return {
      title: document.querySelector('.mini-title') ? document.querySelector('.mini-title').innerText : null,
      artist: document.querySelector('.mini-artist') ? document.querySelector('.mini-artist').innerText : null,
      imgs: imgs.map((i) => ({ natural: i.naturalWidth, complete: i.complete, tail: (i.src || '').slice(-28) }))
    }
  })())`)

out.samples = []
for (let i = 0; i < 8; i++) {
  out.samples.push(await readMini())
  await sleepMs(1500)
}
out.finalMini = out.samples[out.samples.length - 1]
out.synced = out.finalMini.title === out.start.title
out.coverRendered = (out.finalMini.imgs || []).some((i) => i.natural > 0)

mini.close()
console.log(JSON.stringify(out, null, 2))
page.close()
setTimeout(() => process.exit(0), 300)

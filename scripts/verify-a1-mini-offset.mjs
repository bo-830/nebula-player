/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS probe (not shipped TS source); the rule targets typed TS modules. */
/**
 * t25 / A1 — 歌词偏移在迷你窗的**判别性**取证（轻量：单曲、单格式、不切播放模式）。
 *
 * The earlier pair (`seek(13.5) ± 0.5`) could not discriminate: 13.12 and 14.12 both
 * fall inside [11.00, 15.50). The corrected pair on `song-long.lrc`
 * (lines at 2.00 / 6.50 / 11.00 / 15.50 …) is, at t = 15.0:
 *     offset  0   → threshold 15.12 → line「11.00」
 *     offset +0.5 → threshold 15.62 → line「15.50」   ← the highlight must move
 *
 * KEY MECHANISM NOTE (learned from attempt 1): the mini window's clock is driven by
 * engine events pushed by the main process (`mini:state`), so a store-level
 * `setState({currentTime})` on a paused engine never reaches the mini — it stays
 * frozen at the last push. This probe therefore pins the mini's clock by *seeking
 * the live engine* to 15.0 and pausing right after, then compares two offsets
 * against that same frozen clock.
 *
 * Evidence is read from the **mini window's own target** (DOM active line + that
 * window's `localStorage['nebula.lyricsoffset']`), never from the main window.
 *
 * Usage: node scripts/verify-a1-mini-offset.mjs   (dev instance required)
 */
import { mkdir, writeFile } from 'fs/promises'
import { cdp, mainTarget, miniTarget, targets, sleepMs } from './verify-lib.mjs'

const outDir = '.devdata/t13-r2-evidence'
await mkdir(outDir, { recursive: true })
const out = { capturedAt: new Date().toISOString(), runs: [], steps: [] }

const readMini = async () => {
  try {
    const mini = await cdp(miniTarget(await targets()))
    const r = await mini.json(`JSON.stringify({
      title: (document.querySelector('.mini-title') || {}).innerText || null,
      active: (document.querySelector('.mini-lyric-line.active') || {}).innerText || null,
      lines: document.querySelectorAll('.mini-lyric-line').length,
      lsOffset: localStorage.getItem('nebula.lyricsoffset')
    })`)
    mini.close()
    return r
  } catch (e) {
    return { error: String(e.message) }
  }
}

const list = await targets()
const page = await cdp(mainTarget(list))
for (let i = 0; i < 30; i++) {
  if (await page.ev(`typeof window.__nebula === 'object'`)) break
  await sleepMs(1000)
}

// ---------- setup: one track with lyrics, lyrics tab, mini window open ----------
out.setup = await page.json(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const p = window.__nebula.player
  const lib = await window.api.libraryGet()
  const t = lib.tracks.find((x) => x.path.endsWith('song-long.mp3')) || lib.tracks[0]
  await p.getState().playTracks([t], 0)
  await wait(1200)
  const tab = Array.from(document.querySelectorAll('.detail-tab')).find((x) => x.innerText.trim() === '歌词')
  if (tab && !tab.className.includes('active')) tab.click()
  await wait(500)
  return JSON.stringify({ id: t.id, title: t.title, mainLines: document.querySelectorAll('.lyric-line').length })
})()`)
const trackId = out.setup.id

if (!(await targets()).some((t) => t.url.includes('#mini'))) {
  await page.ev(`(async () => { await window.api.miniToggle(); return 1 })()`)
  await sleepMs(2500)
}
out.miniTargets = (await targets()).filter((t) => t.url.includes('#mini')).map((t) => t.url)

for (let i = 0; i < 15; i++) {
  const probe = await readMini()
  out.miniReady = probe
  if (probe && probe.title && probe.title !== '未在播放' && probe.lines >= 2 && probe.active) break
  await page.ev(`(async () => {
    const p = window.__nebula.player
    if (p.getState().current && !p.getState().isPlaying) await p.getState().toggle()
    await new Promise((r) => setTimeout(r, 300))
    return 1
  })()`)
  await sleepMs(1200)
}

// ---------- pin the mini's clock: seek the LIVE engine to 15.0, then pause ----------
const pinClock = async (seconds) => {
  await page.ev(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    const p = window.__nebula.player
    if (!p.getState().isPlaying) await p.getState().toggle()   // engine events must flow
    await wait(250)
    window.__nebula.engine.seek(${seconds})
    await wait(250)
    window.__nebula.engine.pause()
    await wait(1200)
    return 1
  })()`)
}

const readMain = () =>
  page.json(`JSON.stringify({
    active: (document.querySelector('.lyric-line.active') || {}).innerText || null,
    time: Math.round(window.__nebula.player.getState().currentTime * 100) / 100,
    lsOffset: localStorage.getItem('nebula.lyricsoffset')
  })`)

const setOff = (offset) =>
  page.ev(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    const mod = await import('/src/lib/lyricsOffset.ts')
    // offset-only change: the storage event alone must make BOTH windows recompute.
    // No play-nudge here — nudging advances the clock ~0.5 s and the crossing window
    // is only 0.5 s wide (that is exactly what sank the previous attempt).
    mod.setOffset(${JSON.stringify(trackId)}, ${offset})
    await wait(1300)
    return 1
  })()`)

// One pin, then offset-only flips: seek to 14.7 (so the frozen clock lands inside
// [14.88, 15.38) after the short play needed to push the value to the mini window).
await pinClock(14.7)
out.runs.push({ label: 'single pin @ seek 14.7', seconds: 14.7, miniClockBase: await readMini() })
for (const offset of [0, 0.5, 0]) {
  await setOff(offset)
  const main = await readMain()
  const mini = await readMini()
  out.steps.push({ label: 'pin 14.7 (offset-only flips)', offset, seconds: 14.7, main, mini })
}

const s = out.steps
const norm = (x) => (x ? String(x).replace(/\s+/g, '') : x)
const A = (i) => (s[i] && s[i].main ? s[i].main.active : null)
const M = (i) => (s[i] && s[i].mini ? s[i].mini.active : null)

out.assertions = {
  'main highlight crosses the 15.50 line when offset goes 0 → +0.5': norm(A(0)) !== norm(A(1)),
  'main highlight returns to the 11.00 line when offset goes +0.5 → 0': norm(A(1)) !== norm(A(2)) && norm(A(0)) === norm(A(2)),
  'mini highlight crosses the 15.50 line when offset goes 0 → +0.5': norm(M(0)) !== norm(M(1)),
  'mini highlight returns to the 11.00 line when offset goes +0.5 → 0': norm(M(1)) !== norm(M(2)) && norm(M(0)) === norm(M(2)),
  'mini highlight equals main highlight at every step':
    norm(M(0)) === norm(A(0)) && norm(M(1)) === norm(A(1)) && norm(M(2)) === norm(A(2)),
  "mini window's localStorage carries the written offset (shared-origin read)":
    !!s[1].mini.lsOffset && s[1].mini.lsOffset.includes(trackId),
  'mini window rendered lyric lines': M(1) !== null && s[1].mini.lines >= 2
}
out.allPass = Object.values(out.assertions).every(Boolean)

try {
  const v = await (await fetch('http://127.0.0.1:9222/json/version')).json()
  const tg = await targets()
  out.liveness = {
    cdpUp: true, browser: v.Browser,
    mainTargets: tg.filter((t) => /localhost:5173\/$/.test(t.url)).length,
    miniTargets: tg.filter((t) => t.url.includes('#mini')).length
  }
} catch (e) {
  out.liveness = { cdpUp: false, error: String(e.message) }
}

await writeFile(`${outDir}/t25-a1-mini-offset.json`, JSON.stringify(out, null, 2), 'utf8')
console.log(JSON.stringify(out, null, 2))
page.close()
setTimeout(() => process.exit(out.allPass ? 0 : 1), 200)

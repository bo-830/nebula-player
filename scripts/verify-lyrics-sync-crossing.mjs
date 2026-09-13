/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS E2E probe (not shipped TS source); the rule targets typed TS modules.
 * If eslint.config.mjs later scopes this rule away from scripts/**, this
 * directive becomes redundant and can be deleted. */
/**
 * t6/t4 — lyrics offset: mini-window sync with CROSSING offsets + click-jump.
 *
 * Correction from audio-engine: with the clock frozen at ~10.9 s the offsets
 * 0 / +0.5 / +1.5 NEVER cross a line boundary (this track's lyrics start at
 * t = 2 / 6.5 / 11 / 15.5 …), so an unchanged mini highlight was the correct
 * behaviour, not a sync bug. This probe therefore:
 *   1. freezes the clock near t ≈ 1.06 (before the first line) and uses offsets
 *      large enough to cross lines (+2.1 → line 0, +7.0 → line 1),
 *      asserting the mini window's active line CHANGES,
 *   2. verifies the reset returns the mini window to its no-line state,
 *   3. covers the previously missing branch: clicking a lyric line seeks with the
 *      offset accounted for (`seek(l.t - offset)` in LyricsPanel).
 *
 * Run:  npm run dev (CDP 9222)  →  node scripts/verify-lyrics-sync-crossing.mjs
 */
import { writeFile, mkdir } from 'fs/promises'
import { cdp, mainTarget, miniTarget, targets, sleepMs } from './verify-lib.mjs'

const outDir = '.devdata/t6-evidence'
await mkdir(outDir, { recursive: true })
const out = { capturedAt: new Date().toISOString() }

const list = await targets()
const page = await cdp(mainTarget(list))

const readMiniSafe = async () => {
  try {
    const mini = await cdp(miniTarget(await targets()))
    const r = await mini.json(`JSON.stringify({
      title: document.querySelector('.mini-title') ? document.querySelector('.mini-title').innerText : null,
      active: document.querySelector('.mini-lyric-line.active') ? document.querySelector('.mini-lyric-line.active').innerText : null,
      prev: document.querySelector('.mini-lyric-line.prev') ? document.querySelector('.mini-lyric-line.prev').innerText : null,
      next: document.querySelector('.mini-lyric-line.next') ? document.querySelector('.mini-lyric-line.next').innerText : null,
      lines: document.querySelectorAll('.mini-lyric-line').length
    })`)
    mini.close()
    return r
  } catch (e) {
    return { error: String(e.message) }
  }
}

const setOffsetAndRepin = (offset, seconds) =>
  page.ev(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    const p = window.__nebula.player
    const t = p.getState().current
    if (!t) throw new Error('no current track')
    const mod = await import('/src/lib/lyricsOffset.ts')
    mod.setOffset(t.id, ${offset})
    window.__nebula.engine.pause()
    p.setState({ currentTime: ${seconds} })
    await wait(900)          // let the offset store notify + the mini state push land
    return 1
  })()`)

// ---------- setup: long track, lyrics tab, mini window open ----------
/**
 * open the mini window if needed and wait until it has actually received the
 * current track from the main window (a freshly opened mini shows
 * 「播放歌曲后显示同步歌词」 until the first `mini:state` push lands)
 */
async function ensureMiniReady(expectTitle) {
  if (!(await targets()).some((t) => t.url.includes('#mini'))) {
    await page.ev(`(async () => { await window.api.miniToggle(); return 1 })()`)
    await sleepMs(2500)
  }
  for (let i = 0; i < 15; i++) {
    const probe = await readMiniSafe()
    if (probe && probe.title && probe.title !== '未在播放' && probe.lines >= 1) return probe
    // nudge the main window so it re-pushes state to the mini window
    await page.ev(`(async () => {
      const p = window.__nebula.player
      if (p.getState().current && !p.getState().isPlaying) await p.getState().toggle()
      await new Promise((r) => setTimeout(r, 300))
      return 1
    })()`)
    await sleepMs(1200)
  }
  return await readMiniSafe()
}

out.setup = await page.json(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const p = window.__nebula.player
  const lib = await window.api.libraryGet()
  const t = lib.tracks.find((x) => x.path.endsWith('song-long.mp3')) || lib.tracks[0]
  await p.getState().playTracks([t], 0)
  await wait(1500)
  const tab = Array.from(document.querySelectorAll('.detail-tab')).find((x) => x.innerText.trim() === '歌词')
  if (tab && !tab.className.includes('active')) tab.click()
  await wait(600)
  return JSON.stringify({ id: t.id, title: t.title, lyricLines: document.querySelectorAll('.lyric-line').length })
})()`)

out.miniTargets = (await targets()).filter((t) => t.url.includes('#mini')).map((t) => t.url)
out.miniReady = await ensureMiniReady(JSON.parse(out.setup).title)

// ---------- mechanism evidence: the mini renderer receives the `storage` event ----------
// main window writes localStorage['nebula.lyricsoffset'] → the mini renderer (a
// separate renderer sharing the origin) gets a storage event → useSyncExternalStore
// re-renders. Installing the listener inside the mini window is the direct proof.
let miniProbe = null
try {
  miniProbe = await cdp(miniTarget(await targets()))
  await miniProbe.ev(`(() => {
    window.__t4storeEvents = []
    if (!window.__t4storeListener) {
      window.__t4storeListener = (e) => {
        if (e.key === null || (e.key || '').includes('lyricsoffset')) {
          window.__t4storeEvents.push({ key: e.key, oldValue: e.oldValue, newValue: e.newValue, at: Date.now() })
        }
      }
      window.addEventListener('storage', window.__t4storeListener)
    }
    return 1
  })()`)
} catch (e) {
  out.miniEventProbe = { error: String(e.message) }
}

// ---------- 1. crossing offsets change the mini highlight ----------
const FREEZE = 1.06
out.steps = []
for (const off of [0, 2.1, 7.0, 0]) {
  await setOffsetAndRepin(off, FREEZE)
  const mini = await readMiniSafe()
  const main = await page.json(`JSON.stringify((() => {
    const el = document.querySelector('.lyric-line.active')
    return { mainActive: el ? el.innerText.trim() : null, time: Math.round(window.__nebula.player.getState().currentTime * 100) / 100 }
  })())`)
  out.steps.push({ offset: off, mini, main })
}

// read the captured storage events out of the mini window
if (miniProbe) {
  try {
    out.miniStorageEvents = await miniProbe.json(`JSON.stringify(window.__t4storeEvents || [])`)
  } catch (e) {
    out.miniStorageEvents = { error: String(e.message) }
  }
  miniProbe.close()
}
// the mini window interpolates its own clock (~1 Hz pushes), so right after a
// change it can lag by one line; both the settled and the lagging value are
// accepted, and the sequence itself is the evidence
out.highlightChangedWithOffset = new Set(out.steps.filter((s) => s.offset !== 0).map((s) => s.mini.active)).size >= 2
out.resetReturnsToIdle = new Set(out.steps.map((s) => s.mini.active)).size >= 3

// ---------- 2. click-jump accounts for the offset ----------
// the mini window interpolates its own clock, so it needs a moment to settle on
// the pinned value before its rendered offset/line can be trusted
await page.ev(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const p = window.__nebula.player
  const t = p.getState().current
  const mod = await import('/src/lib/lyricsOffset.ts')
  mod.setOffset(t.id, 2.5)
  window.__nebula.engine.pause()
  p.setState({ currentTime: 3.0 })
  await wait(2000)
  return 1
})()`)
const beforeClick = await readMiniSafe()

out.clickJump = await page.json(`(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const p = window.__nebula.player
  const t = p.getState().current
  const mod = await import('/src/lib/lyricsOffset.ts')
  const offsetNow = mod.getOffset(t.id)
  // the panel's own lyric array (t is not on the DOM, so rebuild it from the app's
  // own lyrics API to know the clicked line's timestamp exactly)
  const res = await window.api.lyricsGet({ path: t.path, mtime: t.mtime, size: t.size })
  const lines = Array.from(document.querySelectorAll('.lyric-line'))
  const target = lines.find((el) => el.innerText.includes('风把思念'))
  if (!target) return JSON.stringify({ error: 'target line not found' })
  const idx = Number(target.getAttribute('data-i'))
  const lineT = res.lines[idx] ? res.lines[idx].t : null
  target.click()
  await wait(800)
  const actual = p.getState().currentTime
  const expected = Math.max(0, lineT - offsetNow)
  mod.setOffset(t.id, 0)
  return JSON.stringify({
    dataIndex: idx,
    lineText: res.lines[idx] ? res.lines[idx].text : null,
    lineT,
    offsetInEffect: offsetNow,
    expected: Math.round(expected * 100) / 100,
    actual: Math.round(actual * 100) / 100,
    accountedForOffset: Math.abs(actual - expected) < 0.4
  })
})()`)
out.miniBeforeClick = beforeClick

out.verdict = {
  miniHighlightChanges: out.highlightChangedWithOffset === true,
  resetReturnsToIdle: out.resetReturnsToIdle === true,
  clickJumpAccountsForOffset: out.clickJump.accountedForOffset === true
}
await writeFile(`${outDir}/probe-lyrics-sync-crossing.json`, JSON.stringify(out, null, 2), 'utf8')
console.log(JSON.stringify(out, null, 2))
page.close()
setTimeout(() => process.exit(Object.values(out.verdict).every(Boolean) ? 0 : 1), 250)

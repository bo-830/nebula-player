/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS E2E probe (not shipped TS source); the rule targets typed TS modules.
 * If eslint.config.mjs later scopes this rule away from scripts/**, this
 * directive becomes redundant and can be deleted. */
/**
 * t6 — verification probe for the lyric-offset calibration (task t4).
 *
 * The shipped test lyric file (.devdata/test-music/song-long.lrc) has
 *     line index 2 @ 6.50s   「我在城市的边缘 轻声哼唱」
 *     line index 3 @ 11.00s  「风把思念 吹向远方」
 * and LyricsPanel highlights "max t <= currentTime + 0.12 + offset".
 * With the playback position pinned at 10.9s that gives a real cross-line case:
 *     offset 0     → 10.9 + 0.12 = 11.02 ≥ 11.00  → index 3
 *     offset −0.5s → 10.52                        → index 2
 *     offset +0.5s → 11.52                        → index 3
 *
 * Also checks per-track memory (switch away and back) and that the floating
 * mini window applies the same offset.
 *
 * Run:  npm run dev (CDP 9222)  →  node scripts/verify-lyrics-offset.mjs
 */
import { stat } from 'fs/promises'
import { cdp, mainTarget, miniTarget, targets, sleepMs } from './verify-lib.mjs'

const list = await targets()
const page = await cdp(mainTarget(list))
const results = {}

/** the dev instance dies on its own now and then — make that explicit */
async function assertLive(where) {
  const st = await page.json(`JSON.stringify({
    hook: !!window.__nebula,
    root: document.getElementById('root') ? document.getElementById('root').children.length : -1,
    detail: !!document.querySelector('.detail'),
    main: !!document.querySelector('.mv')
  })`)
  if (!st.hook || !st.main) throw new Error(`dev instance not usable at ${where}: ${JSON.stringify(st)}`)
  return st
}

const step = async (name, fn) => {
  try {
    results[name] = await fn()
  } catch (e) {
    results[name] = { error: String(e && e.message ? e.message : e) }
    process.exitCode = 1
  }
}

const SEEK = 10.9
const TRACK_FILE = 'song-long.mp3'

// ---------- stability guard: never verify a file that was just written ----------
{
  const files = [
    'src/renderer/src/lib/lyricsOffset.ts',
    'src/renderer/src/components/LyricsPanel.tsx',
    'src/renderer/src/components/MiniPlayer.tsx'
  ]
  const ages = []
  for (const f of files) {
    try {
      const s = await stat(f)
      ages.push({ file: f, modifiedAgoMs: Math.round(Date.now() - s.mtimeMs), size: s.size })
    } catch (e) {
      ages.push({ file: f, error: String(e.message) })
    }
  }
  const youngest = Math.min(...ages.filter((a) => a.modifiedAgoMs !== undefined).map((a) => a.modifiedAgoMs))
  results.sourceStability = { ages, youngestMs: youngest }
  if (Number.isFinite(youngest) && youngest < 20000) {
    console.error(`ABORT: t4 sources modified ${youngest}ms ago — the feature is still being written.`)
    console.error(JSON.stringify(ages, null, 2))
    process.exit(2)
  }
}

/* ------------------------------------------------------------------ helpers */

// selectors verified against LyricsPanel.tsx: the tuner is the div holding the
// 提前/延后 buttons, and the offset readout is its direct <span> child.
const PROBE_HELPERS = `
  const tuner = () => {
    const minus = Array.from(document.querySelectorAll('.detail button')).find((x) => (x.title || '').includes('提前'))
    return minus ? minus.parentElement : null
  }
  const minusBtn = () => Array.from(document.querySelectorAll('.detail button')).find((x) => (x.title || '').includes('提前')) || null
  const plusBtn = () => Array.from(document.querySelectorAll('.detail button')).find((x) => (x.title || '').includes('延后')) || null
  const resetBtn = () => Array.from(document.querySelectorAll('.detail button')).find((x) => (x.title || '').includes('重置')) || null
  const offsetText = () => {
    const t = tuner()
    if (!t) return null
    const span = Array.from(t.children).find((c) => c.tagName === 'SPAN')
    return span ? span.textContent.trim() : null
  }
  const lineInfo = () => {
    const lines = Array.from(document.querySelectorAll('.lyric-line'))
    const active = document.querySelector('.lyric-line.active')
    return {
      lineCount: lines.length,
      activeIndex: lines.findIndex((el) => el === active),
      activeText: active ? active.innerText.trim() : null
    }
  }
`

const readState = () =>
  page.json(`JSON.stringify((() => {
    ${PROBE_HELPERS}
    return Object.assign(lineInfo(), {
      offset: offsetText(),
      hasMinus: !!minusBtn(),
      hasPlus: !!plusBtn(),
      hasReset: !!resetBtn(),
      currentTime: Math.round(window.__nebula.player.getState().currentTime * 100) / 100,
      paused: !window.__nebula.player.getState().isPlaying,
      stored: Object.entries(localStorage).filter(([k]) => k.toLowerCase().includes('lyric'))
    })
  })())`)

/** pin the playback position (the engine keeps ticking otherwise) */
const repin = (seconds) =>
  page.ev(`(async () => {
    window.__nebula.engine.pause()
    window.__nebula.player.setState({ currentTime: ${seconds} })
    await new Promise((r) => setTimeout(r, 350))
    return window.__nebula.player.getState().currentTime
  })()`)

const openLyricsTab = () =>
  page.ev(`(async () => {
    const tab = Array.from(document.querySelectorAll('.detail-tab')).find((t) => t.innerText.trim() === '歌词')
    if (tab && !tab.className.includes('active')) tab.click()
    await new Promise((r) => setTimeout(r, 500))
    return 1
  })()`)

/** re-establish track + 歌词 tab + pinned time before every measurement */
const parkAt = async (seconds = SEEK) => {
  await assertLive('parkAt')
  const info = await page.json(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    const p = window.__nebula.player
    const lib = await window.api.libraryGet()
    const t = lib.tracks.find((x) => x.path.endsWith(${JSON.stringify(TRACK_FILE)}))
    if (!t) return JSON.stringify({ error: 'track not in library' })
    if (!p.getState().current || p.getState().current.id !== t.id) {
      await p.getState().playTracks([t], 0)
      await wait(1800)
    }
    window.__nebula.engine.pause()
    p.setState({ currentTime: ${seconds} })
    await wait(300)
    return JSON.stringify({
      id: t.id,
      title: t.title,
      current: !!(p.getState().current && p.getState().current.id === t.id),
      at: Math.round(p.getState().currentTime * 100) / 100
    })
  })()`)
  await openLyricsTab()
  await repin(seconds)
  await sleepMs(450)
  return info
}

/** measurement that first repairs the panel state, then reads it */
const measure = async (seconds = SEEK) => {
  const park = await parkAt(seconds)
  const state = await readState()
  return { park, ...state }
}

const click = (which) =>
  page.json(`JSON.stringify((() => {
    ${PROBE_HELPERS}
    const btn = ${which === 'minus' ? 'minusBtn()' : which === 'plus' ? 'plusBtn()' : 'resetBtn()'}
    if (!btn) return { clicked: false }
    btn.click()
    return { clicked: true, label: btn.innerText.trim(), title: btn.title }
  })())`)

// ---------- preflight ----------
await step('preflight', async () => {
  const info = await parkAt(SEEK)
  const state = await readState()
  const tabs = await page.json(`JSON.stringify(Array.from(document.querySelectorAll('.detail-tab')).map((t) => ({ text: t.innerText.trim(), active: t.className.includes('active') })))`)
  const dom = await assertLive('preflight')
  return { info, state, tabs, dom }
})

// ---------- 1. ±0.5s steps + cross-line highlight ----------
await step('stepAndHighlight', async () => {
  const out = {}

  await click('reset')
  out.offset0 = await measure(SEEK)

  out.clickMinus = await click('minus')
  out.afterMinus05 = await measure(SEEK)

  out.clickMinus2 = await click('minus')
  out.afterMinus10 = await measure(SEEK)

  out.clickPlus3 = await click('plus')
  await click('plus')
  await click('plus')
  out.afterPlus05 = await measure(SEEK)

  out.clickReset = await click('reset')
  out.backToZero = await measure(SEEK)
  return out
})

// ---------- 2. per-track memory across a track switch ----------
await step('perTrackMemory', async () => {
  const park = await parkAt(SEEK)
  const out = await page.json(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    ${PROBE_HELPERS}
    const p = window.__nebula.player
    const lib = await window.api.libraryGet()
    const long = lib.tracks.find((t) => t.path.endsWith(${JSON.stringify(TRACK_FILE)}))
    const other = lib.tracks.find((t) => t.id !== long.id)
    const plus = plusBtn()
    if (plus) { plus.click(); plus.click() }
    await wait(700)
    const longOffset = offsetText()
    const stored = Object.entries(localStorage).filter(([k]) => k.toLowerCase().includes('lyric'))
    await p.getState().playTracks([other], 0)
    await wait(2200)
    const otherOffset = offsetText()
    const otherTitle = p.getState().current ? p.getState().current.title : null
    const otherId = p.getState().current ? p.getState().current.id : null
    await p.getState().playTracks([long], 0)
    await wait(2200)
    const backOffset = offsetText()
    const backId = p.getState().current ? p.getState().current.id : null
    return JSON.stringify({ longTrackId: long.id, otherId, otherTitle, longOffset, stored, otherOffset, backOffset, backId })
  })()`)
  await openLyricsTab()
  await sleepMs(600)
  return { park, ...out, panel: await readState() }
})

// ---------- 3. mini window uses the same offset ----------
await step('miniSync', async () => {
  await parkAt(SEEK)
  await page.ev(`(async () => { await window.api.miniToggle(); return 1 })()`)
  await sleepMs(3000)

  const list2 = await targets()
  let mini
  try {
    mini = await cdp(miniTarget(list2))
  } catch (e) {
    return { error: 'mini window not found: ' + String(e.message), targets: list2.map((t) => t.url) }
  }
  const readMini = () =>
    mini.json(`JSON.stringify({
      title: document.querySelector('.mini-title') ? document.querySelector('.mini-title').innerText : null,
      active: document.querySelector('.mini-lyric-line.active') ? document.querySelector('.mini-lyric-line.active').innerText : null,
      prev: document.querySelector('.mini-lyric-line.prev') ? document.querySelector('.mini-lyric-line.prev').innerText : null,
      lines: document.querySelectorAll('.mini-lyric-line').length
    })`)

  // make sure the mini window sees the playing track before comparing
  for (let i = 0; i < 10; i++) {
    const probe = await readMini()
    if (probe.title && probe.title !== '未在播放' && probe.active) break
    await page.ev(`(async () => {
      window.__nebula.player.getState().seek(${SEEK})
      await new Promise((r) => setTimeout(r, 200))
      return 1
    })()`)
    await sleepMs(1500)
  }

  await repin(SEEK)
  await sleepMs(600)
  const mainBefore = await readState()
  const miniBefore = await readMini()

  await click('plus')
  await click('plus')
  await sleepMs(2000) // mini state is pushed ~per second
  const miniAfterPlus = await readMini()
  await repin(SEEK)
  await sleepMs(600)
  const mainAfter = await readState()
  const miniAfter = await readMini()

  mini.close()
  await click('reset')
  return { mainBefore, miniBefore, mainAfter, miniAfterPlus, miniAfter }
})

console.log(JSON.stringify(results, null, 2))
page.close()
setTimeout(() => process.exit(process.exitCode ?? 0), 400)

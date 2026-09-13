/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS E2E probe (not shipped TS source); the rule targets typed TS modules.
 * If eslint.config.mjs later scopes this rule away from scripts/**, this
 * directive becomes redundant and can be deleted. */
/**
 * t6 — verification probe for the sleep timer (task t1).
 *
 * Covers, with observable evidence:
 *   1. UI entry exists (moon button) and the menu offers 15/30/60 / 播完当前歌曲 / 播完当前队列 / 取消定时
 *   2. minute mode fires → playback pauses (no resume) + toast, timer cleared
 *   3. “播完当前歌曲” → track ends naturally → pause, queue does NOT advance
 *   4. “播完当前队列” → last track of the queue ends → pause (no wrap-around)
 *   5. cancel → timer cleared, UI un-armed, playback behaves normally afterwards
 *   6. not persisted → reload the page, timer must be gone
 *
 * Run:  npm run dev (CDP 9222)  →  node scripts/verify-sleep-timer.mjs
 */
import { cdp, mainTarget, targets, sleepMs } from './verify-lib.mjs'

const list = await targets()
const page = await cdp(mainTarget(list))

const results = {}
const step = async (name, fn) => {
  try {
    results[name] = await fn()
  } catch (e) {
    results[name] = { error: String(e && e.message ? e.message : e) }
    process.exitCode = 1
  }
}

// ---------- preflight ----------
await step('preflight', async () => {
  await page.ev(`(async () => { await window.__nebula.library.getState().load(); return 1 })()`)
  return page.json(`JSON.stringify((() => {
    const n = window.__nebula
    const tracks = n.library.getState().tracks
    return {
      tracks: tracks.length,
      haveLongTrack: tracks.some((t) => t.title === '长测试曲'),
      api: !!window.api,
      sleepFns: ['setSleepMinutes','setSleepTrackEnd','setSleepQueueEnd','clearSleep']
        .filter((f) => typeof n.player.getState()[f] === 'function')
    }
  })())`)
})

// ---------- 1. UI entry + menu ----------
await step('uiEntry', async () => {
  return page.json(`(async () => {
    const btn = document.querySelector('.sleep-btn')
    const out = { button: !!btn, classes: btn ? btn.className : null, title: btn ? btn.title : null }
    if (btn) {
      btn.click()
      await new Promise((r) => setTimeout(r, 150))
      const menu = document.querySelector('.sleep-menu')
      out.menuOpen = !!menu
      out.items = menu ? Array.from(menu.querySelectorAll('.sleep-item')).map((el) => el.innerText.trim()) : []
    }
    return JSON.stringify(out)
  })()`)
})

// ---------- 2. minute mode ----------
await step('minuteMode', async () => {
  return page.json(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const p = window.__nebula.player
    const ui = window.__nebula.ui

    const lib = await window.api.libraryGet()
    const t = lib.tracks.find((x) => x.title === '长测试曲') || lib.tracks.find((x) => x.duration > 30)
    if (!t) return JSON.stringify({ error: 'long track missing' })
    await p.getState().playTracks([t], 0)
    await sleep(1200)
    const startedPlaying = p.getState().isPlaying

    // arm via the public API (the store clamps minutes to a positive integer)
    p.getState().setSleepMinutes(15)
    const armed = { sleep: p.getState().sleep, remaining: p.getState().sleepRemaining }

    // UI reflects the armed state (allow React to re-render first)
    await sleep(400)
    const btnArmed = document.querySelector('.sleep-btn')
    const uiArmed = {
      cls: btnArmed.className.includes('mode-active'),
      title: btnArmed.title,
      badge: document.querySelector('.sleep-badge')?.innerText ?? null,
      menuOpenAfterArm: !!document.querySelector('.sleep-menu')
    }

    // shorten the deadline to now+2.2s: ticks over the very same ticker the
    // 15-minute arm uses (only the deadline value changes), so the observed
    // pause still comes from the production tick + applySleepStop path.
    // toasts are captured by wrapping the store action (the snapshot in the
    // zustand state object is replaced on every update, so record on the fn).
    ui.getState().toast.__hits = []
    const origToast = ui.getState().toast
    ui.setState({
      toast: (msg, kind) => {
        try {
          if (!Array.isArray(origToast.__hits)) origToast.__hits = []
          origToast.__hits.push({ msg, kind, at: Date.now() })
        } catch {}
        return origToast(msg, kind)
      }
    })
    p.setState({ sleep: { ...p.getState().sleep, deadline: Date.now() + 2200 } })
    await sleep(4200)
    const after = {
      isPlaying: p.getState().isPlaying,
      sleep: p.getState().sleep,
      remaining: p.getState().sleepRemaining,
      currentTimeFrozen: p.getState().currentTime,
      title: document.querySelector('.sleep-btn')?.title ?? null,
      badge: document.querySelector('.sleep-badge')?.innerText ?? null,
      toasts: origToast.__hits ?? []
    }
    await sleep(1500)
    after.stillPaused = !p.getState().isPlaying
    after.timeStillFrozen = p.getState().currentTime === after.currentTimeFrozen
    return JSON.stringify({ startedPlaying, armed, uiArmed, after })
  })()`)
})

// ---------- 3. 播完当前歌曲 ----------
await step('trackEndMode', async () => {
  return page.json(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const p = window.__nebula.player
    const lib = await window.api.libraryGet()
    const t = lib.tracks.find((x) => x.title === '长测试曲')
    await p.getState().playTracks([t], 0)
    await sleep(1200)
    const queueLen = p.getState().queue.length
    const startIndex = p.getState().index
    p.getState().setSleepTrackEnd()
    const armed = p.getState().sleep?.mode
    // jump to 1.2s before the natural end
    const dur = p.getState().duration || t.duration
    p.getState().seek(Math.max(0, dur - 1.2))
    await sleep(6000)
    return JSON.stringify({
      armed, queueLen, startIndex,
      afterEnded: {
        isPlaying: p.getState().isPlaying,
        index: p.getState().index,
        sleep: p.getState().sleep,
        currentTime: Math.round(p.getState().currentTime * 10) / 10,
        advanced: p.getState().index !== startIndex
      }
    })
  })()`)
})

// ---------- 4. 播完当前队列 ----------
await step('queueEndMode', async () => {
  return page.json(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const p = window.__nebula.player
    const lib = await window.api.libraryGet()
    const list = lib.tracks.slice(0, 3)
    if (list.length < 2) return JSON.stringify({ error: 'need >= 2 tracks' })
    await p.getState().playTracks(list, list.length - 1) // start on the LAST track
    await sleep(1200)
    const st = p.getState()
    p.getState().setSleepQueueEnd()
    const dur = st.duration || list[list.length - 1].duration
    p.getState().seek(Math.max(0, dur - 1.2))
    await sleep(6000)
    return JSON.stringify({
      armed: 'queue',
      queueLen: p.getState().queue.length,
      startedIndex: st.index,
      afterEnded: {
        isPlaying: p.getState().isPlaying,
        index: p.getState().index,
        sleep: p.getState().sleep,
        currentTime: Math.round(p.getState().currentTime * 10) / 10
      }
    })
  })()`)
})

// ---------- 4b. 队列中途不应停（非末尾）----------
await step('queueMidNoStop', async () => {
  return page.json(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const p = window.__nebula.player
    const lib = await window.api.libraryGet()
    // pass the WHOLE library so withQueueContext cannot extend the queue
    // (otherwise a 3-track request silently becomes the full 6-track library)
    const list = lib.tracks
    if (list.length < 3) return JSON.stringify({ error: 'need >= 3 tracks' })
    await p.getState().playTracks(list, 0) // first of many
    await sleep(1200)
    p.getState().setSleepQueueEnd()
    const before = { index: p.getState().index, queueLen: p.getState().queue.length }
    const dur = p.getState().duration || list[0].duration
    p.getState().seek(Math.max(0, dur - 1.2))
    await sleep(6500)
    return JSON.stringify({
      before,
      afterIndex: p.getState().index,
      advanced: p.getState().index !== before.index,
      isPlaying: p.getState().isPlaying,
      sleepMode: p.getState().sleep?.mode ?? null
    })
  })()`)
})

// ---------- 5. cancel ----------
await step('cancel', async () => {
  return page.json(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const p = window.__nebula.player
    p.getState().setSleepMinutes(15)
    await sleep(1200)
    const armedRemaining = p.getState().sleepRemaining
    p.getState().clearSleep()
    await sleep(1300)
    const btn = document.querySelector('.sleep-btn')
    const cleared = { sleep: p.getState().sleep, remaining: p.getState().sleepRemaining, armedClass: btn.className.includes('mode-active'), badge: document.querySelector('.sleep-badge')?.innerText ?? null }
    // normal behaviour afterwards: a manual next() must still advance
    const lib = await window.api.libraryGet()
    await p.getState().playTracks(lib.tracks.slice(0, 3), 0)
    await sleep(1200)
    const idxBefore = p.getState().index
    p.getState().next()
    await sleep(1200)
    return JSON.stringify({ armedRemaining, cleared, advancedAfterCancel: p.getState().index !== idxBefore })
  })()`)
})

// ---------- 6. not persisted ----------
await step('persistence', async () => {
  await page.ev(
    `(async () => { window.__nebula.player.getState().setSleepMinutes(15); return 1 })()`
  )
  const beforeReload = await page.json(
    `JSON.stringify({ sleep: window.__nebula.player.getState().sleep?.mode ?? null })`
  )
  await page.raw('Page.enable')
  await page.raw('Page.reload', { ignoreCache: false })
  await sleepMs(6000)
  // wait until the dev hook is back
  let afterReload = null
  for (let i = 0; i < 20; i++) {
    try {
      afterReload = await page.json(
        `JSON.stringify({ sleep: window.__nebula ? (window.__nebula.player.getState().sleep?.mode ?? null) : 'hook-missing', armed: !!document.querySelector('.sleep-btn.mode-active') })`
      )
      break
    } catch {
      await sleepMs(1000)
    }
  }
  return { beforeReload, afterReload }
})

console.log(JSON.stringify(results, null, 2))
page.close()
setTimeout(() => process.exit(process.exitCode ?? 0), 400)

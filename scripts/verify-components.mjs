/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS E2E probe (not shipped TS source); the rule targets typed TS modules.
 * If eslint.config.mjs later scopes this rule away from scripts/**, this
 * directive becomes redundant and can be deleted. */
/**
 * t6 — verification probe for the component-side fix (task t8, MainView hooks).
 *
 * Why it exists: t8 moved `useUiStore` in `PlaylistActions` above the
 * `if (!p) return null` early return. A hook-order violation is invisible in the
 * UI until React panics, so this probe
 *   - drives the four playlist actions through the real UI (播放 / 重命名 / 删除 / 清空收藏),
 *   - hammers the render path that used to change hook order (playlist exists /
 *     playlist missing / non-playlist views), asserting React never logs
 *     “change in the order of Hooks” / “Rendered more hooks” and the root never
 *     unmounts (an uncaught render error blanks #root),
 *   - checks the persisted playlists.json after each mutation.
 *
 * Run:  npm run dev (CDP 9222)  →  node scripts/verify-components.mjs
 */
import { cdp, mainTarget, targets, sleepMs } from './verify-lib.mjs'

const list = await targets()
const page = await cdp(mainTarget(list))
const results = {}

// page-side console collector: a hook-order violation or render panic shows up
// as a console warning/error, not as a DOM assertion
await page.ev(`(() => {
  if (!window.__t6console) {
    window.__t6console = []
    const push = (level, args) => {
      try { window.__t6console.push({ level, text: args.map((a) => (typeof a === 'string' ? a : (a && a.message) || String(a))).join(' ') }) } catch {}
      if (window.__t6console.length > 500) window.__t6console.shift()
    }
    const ce = console.error.bind(console)
    const cw = console.warn.bind(console)
    console.error = (...a) => { push('error', a); ce(...a) }
    console.warn = (...a) => { push('warn', a); cw(...a) }
    window.addEventListener('error', (e) => push('window.error', [e.message]))
  }
  return 1
})()`)

const step = async (name, fn) => {
  try {
    results[name] = await fn()
  } catch (e) {
    results[name] = { error: String(e && e.message ? e.message : e) }
    process.exitCode = 1
  }
}

const readConsole = () =>
  page.json(`JSON.stringify({
    hookWarnings: (window.__t6console || []).filter((m) => /order of Hooks|Rendered more hooks|Rendered fewer hooks|Invalid hook call/i.test(m.text)),
    errors: (window.__t6console || []).filter((m) => m.level === 'error' || m.level === 'window.error').map((m) => m.text.slice(0, 300)),
    rootAlive: !!document.querySelector('.mv') ,
    rootChildren: document.getElementById('root') ? document.getElementById('root').children.length : -1
  })`)

// ---------- preflight: clean slate ----------
await step('preflight', async () => {
  return page.json(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    window.__t6console.length = 0
    await window.__nebula.playlists.getState().load()
    await window.__nebula.library.getState().load()
    const lib = window.__nebula.library.getState().tracks
    // remove leftovers from earlier probes
    for (const p of window.__nebula.playlists.getState().playlists.filter((x) => !x.builtin && x.name.startsWith('t6-'))) {
      window.__nebula.playlists.getState().remove(p.id)
    }
    await sleep(500)
    const pl = window.__nebula.playlists.getState().create('t6-验证歌单')
    window.__nebula.playlists.getState().addTracks(pl.id, lib.slice(0, 3).map((t) => t.id))
    window.__nebula.ui.getState().navTo({ type: 'playlist', id: pl.id })
    await sleep(800)
    return JSON.stringify({
      playlistId: pl.id,
      seedIds: lib.slice(0, 3).map((t) => t.id),
      view: window.__nebula.ui.getState().view,
      title: document.querySelector('.mv-title') ? document.querySelector('.mv-title').innerText : null,
      buttons: Array.from(document.querySelectorAll('.mv-actions button')).map((b) => b.innerText.trim()),
      tracksShown: document.querySelectorAll('.track-row, .tl-row, li').length
    })
  })()`)
})

const seeded = results.preflight

// ---------- 1. 播放 from the playlist view ----------
await step('actionPlay', async () => {
  return page.json(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const btns = Array.from(document.querySelectorAll('.mv-actions button'))
    const play = btns.find((b) => b.innerText.includes('全部播放'))
    if (!play) return JSON.stringify({ clicked: false, buttons: btns.map((b) => b.innerText.trim()) })
    play.click()
    await sleep(2000)
    const p = window.__nebula.player.getState()
    return JSON.stringify({
      clicked: true,
      isPlaying: p.isPlaying,
      current: p.current ? p.current.title : null,
      queueLen: p.queue.length,
      firstThree: p.queue.slice(0, 3)
    })
  })()`)
})

// ---------- 2. 重命名 through the modal ----------
await step('actionRename', async () => {
  return page.json(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const rename = Array.from(document.querySelectorAll('.mv-actions button')).find((b) => b.innerText.includes('重命名'))
    if (!rename) return JSON.stringify({ clicked: false })
    rename.click()
    await sleep(400)
    const modal = document.querySelector('.overlay .modal')
    const input = modal ? modal.querySelector('input.form-input') : null
    if (!input) return JSON.stringify({ clicked: true, modal: !!modal, input: false })
    const before = input.value
    // React-controlled input: set through the native setter so onChange fires
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, 't6-已重命名')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await sleep(200)
    const save = Array.from(modal.querySelectorAll('button')).find((b) => b.innerText.includes('保存'))
    if (!save) return JSON.stringify({ clicked: true, modal: true, save: false })
    save.click()
    await sleep(800)
    const pl = window.__nebula.playlists.getState().playlists.find((p) => p.id === ${JSON.stringify(seeded.playlistId)})
    return JSON.stringify({ clicked: true, inputBefore: before, nameAfter: pl ? pl.name : null, modalClosed: !document.querySelector('.overlay .modal'), title: document.querySelector('.mv-title') ? document.querySelector('.mv-title').innerText : null })
  })()`)
})

// ---------- 3. boundary: playlist missing (used to change hook order) ----------
await step('boundaryMissing', async () => {
  await page.ev(`(async () => {
    window.__nebula.ui.getState().navTo({ type: 'playlist', id: 'does-not-exist' })
    return 1
  })()`)
  await sleepMs(700)
  const a = await readConsole()
  // and back to a real playlist, repeatedly: hook order must stay identical
  await page.ev(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const store = window.__nebula.ui.getState()
    for (let i = 0; i < 4; i++) {
      store.navTo({ type: 'playlist', id: ${JSON.stringify(seeded.playlistId)} })
      await sleep(120)
      store.navTo({ type: 'playlist', id: 'does-not-exist' })
      await sleep(120)
      store.navTo({ type: 'all' })
      await sleep(120)
    }
    store.navTo({ type: 'playlist', id: ${JSON.stringify(seeded.playlistId)} })
    await sleep(400)
    return 1
  })()`)
  const b = await readConsole()
  return { afterMissing: a, afterAlternating: b }
})

// ---------- 4. boundary: non-playlist views ----------
await step('boundaryOtherViews', async () => {
  await page.ev(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const nav = window.__nebula.ui.getState().navTo
    for (const v of [{type:'all'},{type:'artists'},{type:'albums'},{type:'folders'},{type:'recent-added'},{type:'recently-played'},{type:'most-played'},{type:'for-you'},{type:'search',text:'歌'}]) {
      nav(v)
      await sleep(250)
    }
    nav({ type: 'playlist', id: ${JSON.stringify(seeded.playlistId)} })
    await sleep(400)
    return 1
  })()`)
  return readConsole()
})

// ---------- 5. 清空收藏 ----------
await step('actionClearFavorites', async () => {
  return page.json(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const api = window.__nebula.playlists
    const lib = window.__nebula.library.getState().tracks
    api.getState().toggleFavorite(lib[0].id)
    api.getState().toggleFavorite(lib[1].id)
    api.getState().toggleFavorite(lib[2].id)
    await sleep(400)
    const before = api.getState().playlists.find((p) => p.id === 'favorites').trackIds.slice()
    window.__nebula.ui.getState().navTo({ type: 'playlist', id: 'favorites' })
    await sleep(800)
    const btn = Array.from(document.querySelectorAll('.mv-actions button')).find((b) => b.innerText.includes('清空'))
    if (!btn) return JSON.stringify({ found: false, before, buttons: Array.from(document.querySelectorAll('.mv-actions button')).map((b) => b.innerText.trim()) })
    btn.click()
    await sleep(800)
    const after = api.getState().playlists.find((p) => p.id === 'favorites').trackIds.slice()
    return JSON.stringify({ found: true, before, after, cleared: before.length > 0 && after.length === 0 })
  })()`)
})

// ---------- 6. 删除 (danger) ----------
await step('actionDelete', async () => {
  const res = await page.json(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    window.__nebula.ui.getState().navTo({ type: 'playlist', id: ${JSON.stringify(seeded.playlistId)} })
    await sleep(700)
    const btn = Array.from(document.querySelectorAll('.mv-actions button')).find((b) => b.innerText.includes('删除'))
    if (!btn) return JSON.stringify({ found: false, buttons: Array.from(document.querySelectorAll('.mv-actions button')).map((b) => b.innerText.trim()) })
    btn.click()
    await sleep(900)
    const store = window.__nebula.playlists.getState()
    return JSON.stringify({
      found: true,
      gone: !store.playlists.some((p) => p.id === ${JSON.stringify(seeded.playlistId)}),
      view: window.__nebula.ui.getState().view,
      title: document.querySelector('.mv-title') ? document.querySelector('.mv-title').innerText : null,
      rootAlive: !!document.querySelector('.mv')
    })
  })()`)
  const consoleState = await readConsole()
  return { ...res, console: consoleState }
})

// ---------- 7. persisted file matches the store ----------
await step('persistedFile', async () => {
  await sleepMs(1500) // playlist store debounce is 400ms
  const storeState = await page.json(
    `JSON.stringify(window.__nebula.playlists.getState().playlists.map((p) => ({ id: p.id, name: p.name, n: p.trackIds.length, builtin: !!p.builtin })))`
  )
  const disk = await page.json(`(async () => JSON.stringify(await window.api.playlistLoad()))()`)
  return { storeState, disk }
})

console.log(JSON.stringify(results, null, 2))
page.close()
setTimeout(() => process.exit(process.exitCode ?? 0), 400)

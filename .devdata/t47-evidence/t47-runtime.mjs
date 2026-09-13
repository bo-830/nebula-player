/**
 * t47 — MINI-WINDOW independent runtime verification (mini C).
 *
 * Requires: `npm run dev` with CDP 9222 + `node .devdata/t47-evidence/mock-llm-t47.mjs 9997`
 *
 * Evidence: size/expand/collapse + DOM residue, search→MAIN playback, mini↔main AI
 * (same session), play-control commands, destructive confirm bar inside the mini,
 * tray/minimised behaviour, hide→reopen reset. Writes .devdata/t47-evidence/t47-runtime.json
 */
import { mkdir, writeFile, readFile } from 'fs/promises'
import { createHash } from 'crypto'
import { cdp, mainTarget, miniTarget, targets, sleepMs } from '../../scripts/verify-lib.mjs'

const OUT = '.devdata/t47-evidence'
const MOCK = 'http://127.0.0.1:9997/v1'
const MOCK_ROOT = 'http://127.0.0.1:9997'
await mkdir(OUT, { recursive: true })

const KEY_FILES = [
  'src/renderer/src/components/MiniPlayer.tsx',
  'src/renderer/src/components/MiniSearch.tsx',
  'src/renderer/src/components/MiniChat.tsx',
  'src/main/miniBounds.ts',
  'src/main/mini.ts',
  'src/main/ipc.ts',
  'src/renderer/src/lib/mainWindowBridge.ts',
  'src/renderer/src/lib/chatProxy.ts'
]

const sha1 = (buf) => createHash('sha1').update(buf).digest('hex').toLowerCase()
const fingerprints = async () => {
  const out = {}
  for (const f of KEY_FILES) {
    try {
      out[f] = sha1(await readFile(f))
    } catch (e) {
      out[f] = 'MISSING:' + e.code
    }
  }
  return out
}

const mockApi = async (path, method = 'GET') => {
  const r = await fetch(`${MOCK_ROOT}${path}`, { method })
  return r.json()
}

const out = {
  capturedAt: new Date().toISOString(),
  mockUrl: MOCK,
  fingerprintsBefore: await fingerprints(),
  steps: {},
  assertions: {}
}
const fail = (msg) => {
  out.errors = out.errors ?? []
  out.errors.push(msg)
}

const page = await cdp(mainTarget(await targets()))
const ev = (expr) => page.ev(expr)
const js = (expr) => page.json(expr)

async function step(name, fn) {
  try {
    out.steps[name] = await fn()
  } catch (e) {
    out.steps[name] = { error: String(e && e.message ? e.message : e) }
    fail(`${name}: ${e && e.message ? e.message : e}`)
  }
}

/** a fresh CDP connection to the mini page (each call, like the A1 probe) */
async function miniJson(expr) {
  const m = await cdp(miniTarget(await targets()))
  try {
    return await m.json(expr)
  } finally {
    m.close()
  }
}
async function miniEv(expr) {
  const m = await cdp(miniTarget(await targets()))
  try {
    return await m.ev(expr)
  } finally {
    m.close()
  }
}

const GEO = `JSON.stringify({
  innerW: window.innerWidth,
  innerH: window.innerHeight,
  screenX: window.screenX,
  screenY: window.screenY,
  availLeft: screen.availLeft,
  availTop: screen.availTop,
  availW: screen.availWidth,
  availH: screen.availHeight,
  dpr: window.devicePixelRatio,
  dataExpanded: (document.querySelector('.mini-root') || {}).getAttribute
    ? document.querySelector('.mini-root').getAttribute('data-expanded') : null,
  searchZones: document.querySelectorAll('.mini-search-zone').length,
  searchInputs: document.querySelectorAll('.mini-search-input').length,
  chatPanes: document.querySelectorAll('.mini-chat').length,
  chatTextareas: document.querySelectorAll('.mini-chat-input textarea').length,
  lyricLines: document.querySelectorAll('.mini-lyric-line').length,
  transportBtns: document.querySelectorAll('.mini-controls .mini-btn').length,
  expandBtnTitle: (document.querySelector('button[aria-expanded]') || {}).getAttribute
    ? document.querySelector('button[aria-expanded]').getAttribute('title') : null,
  bodyText: (document.querySelector('.mini-root') || {}).innerText
    ? document.querySelector('.mini-root').innerText.replace(/\\n+/g, ' | ').slice(0, 240) : null
})`

const inside = (g) =>
  g.screenX >= g.availLeft &&
  g.screenY >= g.availTop &&
  g.screenX + g.innerW <= g.availLeft + g.availW &&
  g.screenY + g.innerH <= g.availTop + g.availH

const setValue = (sel, value) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)})
  if (!el) return 'missing'
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
  setter.call(el, ${JSON.stringify(value)})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return 'ok'
})()`

const pressEnter = (sel) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)})
  if (!el) return 'missing'
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
  return 'ok'
})()`

/**
 * Expansion must be driven through the mini's OWN button: `mini:expand` is a bare
 * IPC primitive that resizes the window but does NOT push a state event, so the
 * renderer's local mirror (data-expanded + the search/chat subtree) only follows
 * when MiniPlayer.toggleExpanded calls it itself.
 */
const clickExpandBtn = () =>
  miniEv(`(() => {
    const b = document.querySelector('button[aria-expanded]')
    if (!b) return 'missing'
    if (b.getAttribute('aria-expanded') === 'true') return 'already-expanded'
    b.click()
    return 'clicked'
  })()`)

const ensureExpanded = async () => {
  const before = await miniJson(GEO)
  if (before.dataExpanded === 'true') return { already: true, before }
  const clicked = await clickExpandBtn()
  await sleepMs(1400)
  const after = await miniJson(GEO)
  return { already: false, clicked, before, after }
}

const waitForMini = async (want = true, ms = 8000) => {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    const has = (await targets()).some((t) => t.url.includes('#mini'))
    if (has === want) return has
    await sleepMs(300)
  }
  return !want
}

// ---------------------------------------------------------------- preflight --
await step('preflight', async () => {
  for (let i = 0; i < 30; i++) {
    if (await ev(`typeof window.__nebula === 'object'`)) break
    await sleepMs(1000)
  }
  const cfg = await js(
    `(async () => JSON.stringify(await window.api.settingsSetApi({ baseURL: ${JSON.stringify(MOCK)}, model: 'deepseek-v4-flash', apiKey: 'test-key' })))()`
  )
  await ev(
    `(async () => { await window.__nebula.library.getState().load(); await window.__nebula.playlists.getState().load(); window.__nebula.chat.getState().setCollapsed(false); return 1 })()`
  )
  await sleepMs(500)
  const lib = await js(`(async () => {
    const r = await window.api.libraryGet()
    return JSON.stringify({ count: r.tracks.length, first: r.tracks.slice(0, 4).map((t) => ({ id: t.id, title: t.title })) })
  })()`)
  return { apiModel: cfg.api, library: lib }
})

// ------------------------------------------------------- 1. geometry states --
await step('geometry', async () => {
  if (!(await targets()).some((t) => t.url.includes('#mini'))) {
    await ev(`(async () => { await window.api.miniToggle(); return 1 })()`)
    await waitForMini(true)
  }
  await sleepMs(2500)
  const g0 = await miniJson(GEO)

  // expand through the UI button (not the API) — the user path
  const clickExpand = await miniEv(`(() => {
    const b = document.querySelector('button[aria-expanded]')
    if (!b) return 'missing'
    b.click()
    return 'clicked:' + b.getAttribute('title')
  })()`)
  await sleepMs(1200)
  const g1 = await miniJson(GEO)

  // the API's own answer must equal the applied geometry
  const apiSize = await miniJson(`(async () => JSON.stringify(await window.api.miniSetExpanded(true)))()`)
  await sleepMs(700)
  const g1b = await miniJson(GEO)

  const clickCollapse = await miniEv(`(() => {
    const b = document.querySelector('button[aria-expanded]')
    if (!b) return 'missing'
    b.click()
    return 'clicked:' + b.getAttribute('title')
  })()`)
  await sleepMs(1200)
  const g2 = await miniJson(GEO)

  out.assertions['open = 360x128'] = g0.innerW === 360 && g0.innerH === 128
  out.assertions['collapsed DOM has no search zone / chat pane'] =
    g0.searchZones === 0 && g0.chatPanes === 0 && g0.searchInputs === 0
  out.assertions['expand = 360x540 (height only)'] =
    g1.innerW === 360 && g1.innerH === 540
  out.assertions['expanded DOM renders search box + chat pane'] =
    g1.searchZones >= 1 && g1.searchInputs >= 1 && g1.chatPanes >= 1 && g1.chatTextareas >= 1
  out.assertions['expanded window stays inside the work area'] = inside(g1)
  out.assertions["miniSetExpanded(true) returns the applied size"] =
    apiSize.width === g1b.innerW && apiSize.height === g1b.innerH
  out.assertions['collapse returns to 360x128'] = g2.innerW === 360 && g2.innerH === 128
  out.assertions['collapsed again: DOM restored (no residue)'] =
    g2.searchZones === 0 && g2.chatPanes === 0 && g2.dataExpanded === 'false'

  return { clickExpand, g0, g1, apiSize, g1b, clickCollapse, g2, insideWorkArea: inside(g1) }
})

// --------------------------------------------- 2. hide then reopen = collapsed --
await step('hideReopenReset', async () => {
  // expand through the button (the user path, state mirror included), then hide
  const expand = await ensureExpanded()
  const before = await miniJson(GEO)
  await miniEv(`(() => { window.api.miniClose(); return 1 })()`)
  await sleepMs(1500)
  const hidden = await js(
    `(async () => JSON.stringify({ miniVisible: await window.api.miniToggle() }))()`
  )
  await sleepMs(2000)
  const after = await miniJson(GEO)
  out.assertions['hide→reopen comes back collapsed (360x128)'] =
    after.innerW === 360 && after.innerH === 128 && after.dataExpanded === 'false'
  out.assertions['reopen state reset from expanded'] = before.dataExpanded === 'true'
  return { expand, before, hidden, after }
})

// ------------------------------------------------------ 3. search → main play --
await step('searchThenMainPlays', async () => {
  const expand = await ensureExpanded()
  const lib = await js(`(async () => JSON.stringify((await window.api.libraryGet()).tracks.map((t) => ({ id: t.id, title: t.title }))))()`)
  if (!Array.isArray(lib) || lib.length === 0) throw new Error('dev library is empty — cannot test the search chain')
  const query = String(lib[0].title).slice(0, 2)

  const typed = await miniEv(setValue('.mini-search-input', query))
  await sleepMs(1500)
  const rows = await miniJson(`JSON.stringify(Array.from(document.querySelectorAll('.mini-search-row')).map((r) => ({
    title: (r.querySelector('.mini-search-row-title') || {}).innerText || null,
    artist: (r.querySelector('.mini-search-row-artist') || {}).innerText || null,
    empty: r.className.includes('empty')
  })))`)
  const real = rows.filter((r) => !r.empty)

  // click the SECOND row when possible — proves the index travels, not just row 0
  const clickIndex = real.length > 1 ? 1 : 0
  const clicked = await miniEv(`(() => {
    const rows = Array.from(document.querySelectorAll('.mini-search-row')).filter((r) => !r.className.includes('empty'))
    if (!rows[${clickIndex}]) return 'missing'
    rows[${clickIndex}].click()
    return 'clicked:' + rows[${clickIndex}].innerText.replace(/\\n+/g, '/')
  })()`)
  await sleepMs(2000)

  const mainState = await js(`JSON.stringify((() => {
    const p = window.__nebula.player.getState()
    return {
      currentId: p.current ? p.current.id : null,
      currentTitle: p.current ? p.current.title : null,
      isPlaying: p.isPlaying,
      queueLen: p.queue.length,
      queueTitles: p.queue.slice(0, 8).map((t) => t.title),
      index: p.index
    }
  })())`)

  const targetRow = real[clickIndex] ?? null
  const expected = targetRow ? lib.find((t) => t.title === targetRow.title) : null
  out.assertions['mini search shows result rows'] = real.length >= 1
  out.assertions['clicking a mini result plays it in the MAIN window'] =
    !!expected && mainState.currentId === expected.id
  out.assertions['queue comes from the result list'] =
    !!targetRow && mainState.queueLen >= real.length && mainState.queueTitles[0] === real[0].title
  return { expand, query, typed, rows: real, clickIndex, clicked, mainState, expectedId: expected ? expected.id : null }
})

// -------------------------------------------------- 4. AI round trip (1 session) --
const sendFromMini = async (text) => {
  const typed = await miniEv(setValue('.mini-chat-input textarea', text))
  await sleepMs(250)
  const sent = await miniEv(pressEnter('.mini-chat-input textarea'))
  return { typed, sent }
}

await step('aiRoundTrip', async () => {
  const expand = await ensureExpanded()
  const inputDiag = await miniJson(`JSON.stringify({
    textarea: !!document.querySelector('.mini-chat-input textarea'),
    placeholder: (document.querySelector('.mini-chat-input textarea') || {}).placeholder ?? null,
    sendBtn: !!document.querySelector('.mini-chat-send')
  })`)
  await mockApi('/__reset', 'POST')
  await ev(`(async () => { window.__nebula.chat.getState().clear(); window.__nebula.chat.getState().setCollapsed(false); return 1 })()`)
  await sleepMs(800)
  const sent = await sendFromMini('你好，请介绍一下你自己')
  await sleepMs(6000)

  const miniView = await miniJson(`JSON.stringify({
    msgs: Array.from(document.querySelectorAll('.mini-chat .chat-msg')).map((m) => m.className + '::' + m.innerText.trim().slice(0, 80)),
    chatChips: document.querySelectorAll('.mini-chat .chat-chip').length,
    suggestions: document.querySelectorAll('.mini-chat-suggestions .chat-chip').length
  })`)
  const mainView = await js(`JSON.stringify((() => {
    const c = window.__nebula.chat.getState()
    return {
      messages: c.messages.map((m) => ({ role: m.role, content: String(m.content).slice(0, 80) })),
      busy: c.busy,
      domMsgs: Array.from(document.querySelectorAll('.chat .chat-msg')).map((m) => m.className + '::' + m.innerText.trim().slice(0, 60)),
      collapsed: c.collapsed
    }
  })())`)
  const log = await mockApi('/__log')

  const miniHasUser = miniView.msgs.some((m) => m.startsWith('chat-msg user') && m.includes('介绍一下'))
  const miniHasAi = miniView.msgs.some((m) => m.startsWith('chat-msg ai') && m.includes('测试网关'))
  const mainHasUser = mainView.messages.some((m) => m.role === 'user' && m.content.includes('介绍一下'))
  const mainHasSameAi = mainView.messages.some((m) => m.role === 'assistant' && m.content.includes('测试网关'))

  out.assertions['mini received the user bubble'] = miniHasUser
  out.assertions['mini streamed the AI reply'] = miniHasAi
  out.assertions['MAIN window chat holds the same turn (same session)'] =
    mainHasUser && mainHasSameAi
  out.assertions['gateway saw the turn with no 400'] = log.requests.length >= 1 && log.errors400.length === 0
  return { expand, inputDiag, sent, miniView, mainView, gateway: { requests: log.requests, errors400: log.errors400 } }
})

// ----------------------------------------------------- 5. play-control commands --
await step('miniPlayControl', async () => {
  const expand = await ensureExpanded()
  await mockApi('/__reset', 'POST')
  const before = await js(`JSON.stringify((() => {
    const p = window.__nebula.player.getState()
    return { isPlaying: p.isPlaying, currentId: p.current ? p.current.id : null, volume: p.volume, queueLen: p.queue.length }
  })())`)
  if (!before.isPlaying) {
    await ev(`(async () => { const p = window.__nebula.player.getState(); if (p.current && !p.isPlaying) await p.toggle(); return 1 })()`)
    await sleepMs(1500)
  }

  await sendFromMini('暂停')
  await sleepMs(5000)
  const afterPause = await js(`JSON.stringify((() => {
    const p = window.__nebula.player.getState()
    const c = window.__nebula.chat.getState()
    return { isPlaying: p.isPlaying, currentId: p.current ? p.current.id : null, chips: c.chips, lastAi: [...c.messages].reverse().find((m) => m.role === 'assistant')?.content ?? null }
  })())`)

  // a REAL baseline for "next": whatever was playing when the paused turn finished
  const idBeforeNext = afterPause.currentId
  const indexBeforeNext = await js(`JSON.stringify(window.__nebula.player.getState().index)`)
  await sendFromMini('下一曲')
  await sleepMs(5000)
  const afterNext = await js(`JSON.stringify((() => {
    const p = window.__nebula.player.getState()
    const c = window.__nebula.chat.getState()
    return { isPlaying: p.isPlaying, currentId: p.current ? p.current.id : null, index: p.index, chips: c.chips }
  })())`)

  const volumeBefore = afterNext ? await js(`JSON.stringify(window.__nebula.player.getState().volume)`) : null
  await sendFromMini('把音量调到 50%')
  await sleepMs(5000)
  const afterVolume = await js(`JSON.stringify((() => {
    const p = window.__nebula.player.getState()
    const c = window.__nebula.chat.getState()
    const miniChips = document.querySelectorAll('.mini-chat .chat-chip').length
    return { volume: p.volume, chips: c.chips, miniChipDom: miniChips }
  })())`)

  const log = await mockApi('/__log')
  out.assertions['mini "暂停" paused the MAIN player'] = afterPause.isPlaying === false
  out.assertions['mini "下一曲" advanced the MAIN player'] =
    idBeforeNext !== null && afterNext.currentId !== null &&
    (afterNext.currentId !== idBeforeNext || afterNext.index !== indexBeforeNext)
  out.assertions['mini "音量 50%" set MAIN volume to 0.5'] =
    Math.abs(afterVolume.volume - 0.5) < 0.06
  out.assertions['mini chips show feedback'] =
    Array.isArray(afterPause.chips) && (afterPause.chips.length > 0 || afterVolume.miniChipDom > 0)
  out.assertions['play-control turns reached the gateway without 400'] =
    log.requests.length >= 3 && log.errors400.length === 0
  return { expand, before, afterPause, idBeforeNext, indexBeforeNext, afterNext, volumeBefore, afterVolume, gateway: { tools: log.tools, requests: log.requests.length, errors400: log.errors400 } }
})

// --------------------------------------------- 6. destructive confirm in the MINI --
await step('destructiveConfirmInMini', async () => {
  const expand = await ensureExpanded()
  await mockApi('/__reset', 'POST')
  const seeded = await js(`(async () => {
    const lib = (await window.api.libraryGet()).tracks
    const store = window.__nebula.playlists.getState()
    let pl = store.playlists.find((p) => p.name === '夜跑')
    if (!pl) pl = store.create('夜跑')
    const ids = lib.slice(0, 2).map((t) => t.id)
    store.addTracks(pl.id, ids)
    await new Promise((r) => setTimeout(r, 600))
    window.__nebula.chat.getState().clear()
    await new Promise((r) => setTimeout(r, 500))
    const now = store.playlists.find((p) => p.id === pl.id)
    return JSON.stringify({ playlistId: pl.id, ids, trackIds: now ? now.trackIds : null })
  })()`)
  await sleepMs(600)

  const send1 = await sendFromMini(`把夜跑歌单里的 ${seeded.ids[0]} 这首歌删掉`)
  await sleepMs(6000)
  const parked = await js(`JSON.stringify((() => {
    const c = window.__nebula.chat.getState()
    const pl = window.__nebula.playlists.getState().playlists.find((p) => p.name === '夜跑')
    return { pending: c.pendingConfirm ? { name: c.pendingConfirm.name, summary: c.pendingConfirm.summary } : null, trackIds: pl ? pl.trackIds : null }
  })())`)
  const miniBar = await miniJson(`JSON.stringify({
    buttons: Array.from(document.querySelectorAll('.mini-chat button.btn')).map((b) => b.innerText.trim()),
    text: (document.querySelector('.mini-chat') || {}).innerText
      ? document.querySelector('.mini-chat').innerText.replace(/\\n+/g, ' | ').slice(0, 400) : null
  })`)

  // ---- cancel path: nothing may change
  const cancelClick = await miniEv(`(() => {
    const b = Array.from(document.querySelectorAll('.mini-chat button.btn')).find((x) => x.innerText.trim() === '取消')
    if (!b) return 'missing'
    b.click()
    return 'clicked'
  })()`)
  await sleepMs(6000)
  const afterCancel = await js(`JSON.stringify((() => {
    const c = window.__nebula.chat.getState()
    const pl = window.__nebula.playlists.getState().playlists.find((p) => p.name === '夜跑')
    return { pending: !!c.pendingConfirm, busy: c.busy, trackIds: pl ? pl.trackIds : null }
  })())`)

  // ---- confirm path: the removal must really happen
  await mockApi('/__reset', 'POST')
  await ev(`(async () => {
    const store = window.__nebula.playlists.getState()
    const pl = store.playlists.find((p) => p.name === '夜跑')
    store.addTracks(pl.id, ${JSON.stringify(seeded.ids)})
    window.__nebula.chat.getState().clear()
    await new Promise((r) => setTimeout(r, 600))
    return 1
  })()`)
  await sleepMs(600)
  const send2 = await sendFromMini(`把夜跑歌单里的 ${seeded.ids[0]} 这首歌删掉`)
  await sleepMs(6000)
  const confirmClick = await miniEv(`(() => {
    const b = document.querySelector('.mini-chat button.btn.primary') ||
      Array.from(document.querySelectorAll('.mini-chat button.btn')).find((x) => x.innerText.trim() === '确认执行')
    if (!b) return 'missing'
    b.click()
    return 'clicked'
  })()`)
  await sleepMs(8000)
  const afterConfirm = await js(`JSON.stringify((() => {
    const c = window.__nebula.chat.getState()
    const pl = window.__nebula.playlists.getState().playlists.find((p) => p.name === '夜跑')
    return { pending: !!c.pendingConfirm, busy: c.busy, trackIds: pl ? pl.trackIds : null }
  })())`)
  const log = await mockApi('/__log')

  out.assertions['destructive call parks for confirmation (not executed)'] =
    !!parked.pending && Array.isArray(parked.trackIds) && parked.trackIds.length === 2
  out.assertions['confirmation bar is rendered INSIDE the mini window'] =
    miniBar.buttons.includes('确认执行') && miniBar.buttons.includes('取消')
  out.assertions['mini 「取消」 leaves the MAIN playlist untouched'] =
    cancelClick === 'clicked' && !!afterCancel.trackIds && afterCancel.trackIds.length === 2
  out.assertions['mini 「确认执行」 really mutates the MAIN playlist'] =
    confirmClick === 'clicked' && !!afterConfirm.trackIds && !afterConfirm.trackIds.includes(seeded.ids[0])
  out.assertions['destructive turn completed without gateway 400'] = log.errors400.length === 0
  return {
    expand, seeded, send1, parked, miniBar, cancelClick, afterCancel,
    send2, confirmClick, afterConfirm,
    gateway: { tools: log.tools, requests: log.requests.length, errors400: log.errors400 }
  }
})

// ------------------------------------------- 7. main window hidden (tray) still works --
await step('trayScenario', async () => {
  await mockApi('/__reset', 'POST')
  const closeSent = await ev(`(async () => { window.api.windowClose(); return 1 })()`)
  await sleepMs(2500)
  const mainVis = await js(`JSON.stringify({ visibilityState: document.visibilityState, hidden: document.hidden })`)

  // search → play must still reach the (hidden) main window
  const lib = await js(`(async () => JSON.stringify((await window.api.libraryGet()).tracks.map((t) => ({ id: t.id, title: t.title }))))()`)
  if (!Array.isArray(lib) || lib.length === 0) throw new Error('dev library is empty — cannot test the tray search chain')
  const expandAgain = await ensureExpanded()
  await miniEv(setValue('.mini-search-input', String(lib[0].title).slice(0, 2)))
  await sleepMs(1500)
  const clicked = await miniEv(`(() => {
    const rows = Array.from(document.querySelectorAll('.mini-search-row')).filter((r) => !r.className.includes('empty'))
    if (!rows.length) return 'missing'
    rows[0].click()
    return 'clicked'
  })()`)
  await sleepMs(2500)
  const afterSearch = await js(`JSON.stringify((() => {
    const p = window.__nebula.player.getState()
    return { currentId: p.current ? p.current.id : null, isPlaying: p.isPlaying }
  })())`)

  // a control command and an AI turn must still work while the main window is hidden
  const t0 = (await mockApi('/__log')).requests.length
  await sendFromMini('暂停')
  await sleepMs(5000)
  const afterPause = await js(`JSON.stringify((() => {
    const p = window.__nebula.player.getState()
    const c = window.__nebula.chat.getState()
    return { isPlaying: p.isPlaying, lastAi: [...c.messages].reverse().find((m) => m.role === 'assistant')?.content ?? null }
  })())`)
  await sendFromMini('给我讲个关于音乐的笑话')
  await sleepMs(6000)
  const afterChat = await js(`JSON.stringify((() => {
    const c = window.__nebula.chat.getState()
    return { lastAi: [...c.messages].reverse().find((m) => m.role === 'assistant')?.content ?? null, busy: c.busy }
  })())`)
  const log = await mockApi('/__log')

  out.assertions['main window really went to tray/hidden'] = mainVis.visibilityState === 'hidden'
  out.assertions['mini search→play works with the main window hidden'] =
    clicked === 'clicked' && afterSearch.currentId !== null
  out.assertions['mini control command works with the main window hidden'] =
    afterPause.isPlaying === false && String(afterPause.lastAi ?? '').length > 0
  out.assertions['mini AI round trip works with the main window hidden'] =
    String(afterChat.lastAi ?? '').includes('测试网关') && log.errors400.length === 0
  return {
    closeSent, mainVis, expandAgain, clicked, afterSearch, afterPause, afterChat,
    gateway: { requestsBefore: t0, requestsAfter: log.requests.length, lastUser: log.requests.slice(-1)[0]?.lastUser ?? null, errors400: log.errors400 }
  }
})

// ------------------------------------------------------------- liveness + write --
out.fingerprintsAfter = await fingerprints()
out.filesUnchanged = Object.keys(out.fingerprintsBefore).every(
  (k) => out.fingerprintsBefore[k] === out.fingerprintsAfter[k]
)
try {
  const v = await (await fetch('http://127.0.0.1:9222/json/version')).json()
  const tg = await targets()
  out.liveness = {
    cdpUp: true,
    browser: v.Browser,
    mainTargets: tg.filter((t) => t.type === 'page' && t.url.includes('localhost:5173') && !t.url.includes('#mini')).length,
    miniTargets: tg.filter((t) => t.url.includes('#mini')).length
  }
} catch (e) {
  out.liveness = { cdpUp: false, error: String(e.message) }
}

const passed = Object.values(out.assertions).filter(Boolean).length
out.summary = { passed, total: Object.keys(out.assertions).length, failed: Object.keys(out.assertions).filter((k) => !out.assertions[k]) }
await writeFile(`${OUT}/t47-runtime.json`, JSON.stringify(out, null, 2), 'utf8')
console.log(JSON.stringify({ summary: out.summary, assertions: out.assertions, errors: out.errors ?? [] }, null, 2))
page.close()
setTimeout(() => process.exit(out.summary.failed === 0 && (out.errors ?? []).length === 0 ? 0 : 1), 300)

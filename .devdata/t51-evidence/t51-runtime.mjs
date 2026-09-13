/**
 * t51 — independent re-verification of the T47-F1 fix.
 *
 * Order matters (the main window can be hidden but not re-shown from the renderer),
 * so the VISIBLE control runs before hiding, and every group is written to disk the
 * moment it finishes (captain's incremental-evidence rule).
 *
 * Requires: `npm run dev` (CDP 9222) + `node .devdata/t47-evidence/mock-llm-t47.mjs 9997`
 * Usage:    node .devdata/t51-evidence/t51-runtime.mjs
 */
import { mkdir, writeFile, readFile } from 'fs/promises'
import { createHash } from 'crypto'
import { cdp, mainTarget, miniTarget, targets, sleepMs } from '../../scripts/verify-lib.mjs'

const OUT = '.devdata/t51-evidence'
const MOCK_ROOT = 'http://127.0.0.1:9997'
const MOCK = `${MOCK_ROOT}/v1`
await mkdir(OUT, { recursive: true })

const KEY_FILES = [
  'src/renderer/src/stores/chatStore.ts',
  'src/renderer/src/lib/mainWindowBridge.ts',
  'src/renderer/src/components/MiniChat.tsx',
  'src/renderer/src/components/MiniPlayer.tsx'
]
const sha1 = (b) => createHash('sha1').update(b).digest('hex').toLowerCase()
const fingerprints = async () => {
  const o = {}
  for (const f of KEY_FILES) o[f] = sha1(await readFile(f))
  return o
}
const save = async (name, obj) => {
  await writeFile(`${OUT}/${name}`, JSON.stringify(obj, null, 2), 'utf8')
  console.log(`[saved] ${OUT}/${name}`)
}
const mockApi = async (path, method = 'GET') => (await fetch(`${MOCK_ROOT}${path}`, { method })).json()

const page = await cdp(mainTarget(await targets()))
const ev = (e) => page.ev(e)
const js = (e) => page.json(e)
const miniJson = async (e) => {
  const m = await cdp(miniTarget(await targets()))
  try {
    return await m.json(e)
  } finally {
    m.close()
  }
}
const miniEv = async (e) => {
  const m = await cdp(miniTarget(await targets()))
  try {
    return await m.ev(e)
  } finally {
    m.close()
  }
}

const setValue = (sel, v) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)})
  if (!el) return 'missing'
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(v)})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return 'ok'
})()`
const enter = (sel) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)})
  if (!el) return 'missing'
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
  return 'ok'
})()`
const sendFromMini = async (text) => {
  const typed = await miniEv(setValue('.mini-chat-input textarea', text))
  await sleepMs(250)
  const sent = await miniEv(enter('.mini-chat-input textarea'))
  return { typed, sent }
}
const clickExpand = () =>
  miniEv(`(() => {
    const b = document.querySelector('button[aria-expanded]')
    if (!b) return 'missing'
    if (b.getAttribute('aria-expanded') === 'true') return 'already-expanded'
    b.click()
    return 'clicked'
  })()`)
const GEO = `JSON.stringify({
  innerW: window.innerWidth, innerH: window.innerHeight,
  dataExpanded: (document.querySelector('.mini-root') || {}).getAttribute
    ? document.querySelector('.mini-root').getAttribute('data-expanded') : null,
  searchZones: document.querySelectorAll('.mini-search-zone').length,
  chatPanes: document.querySelectorAll('.mini-chat').length,
  searchInputs: document.querySelectorAll('.mini-search-input').length,
  hasNebula: typeof window.__nebula
})`

/** main-window state at read time + last assistant text */
const mainState = () =>
  js(`JSON.stringify((() => {
    const c = window.__nebula.chat.getState()
    const last = [...c.messages].reverse().find((m) => m.role === 'assistant')
    return {
      lastAssistant: last ? String(last.content) : null,
      lastUser: [...c.messages].reverse().find((m) => m.role === 'user')?.content ?? null,
      busy: c.busy,
      streamRawLen: (c.streamRaw || '').length,
      streamShown: c.streamShown,
      messageCount: c.messages.length,
      visibility: document.visibilityState
    }
  })())`)
const miniChatText = () =>
  miniJson(`JSON.stringify({
    ai: Array.from(document.querySelectorAll('.mini-chat .chat-msg.ai')).map((m) => m.innerText.trim()),
    user: Array.from(document.querySelectorAll('.mini-chat .chat-msg.user')).map((m) => m.innerText.trim())
  })`)

/** install a store observer so late delivery (post-settle) becomes observable */
const installObserver = async () => {
  await ev(`(() => {
    const st = window.__nebula.chat
    window.__t51 = window.__t51 || { events: [] }
    if (window.__t51.unsub) try { window.__t51.unsub() } catch (e) {}
    window.__t51.events.length = 0
    window.__t51.unsub = st.subscribe((s) => {
      const e = {
        t: Math.round(performance.now()),
        busy: s.busy,
        rawLen: (s.streamRaw || '').length,
        msgs: s.messages.length
      }
      const a = window.__t51.events
      const p = a[a.length - 1]
      if (!p || p.rawLen !== e.rawLen || p.busy !== e.busy || p.msgs !== e.msgs) a.push(e)
      if (a.length > 500) a.shift()
    })
    return 1
  })()`)
}
const readObserver = () => js(`JSON.stringify(window.__t51.events)`)

const out = { capturedAt: new Date().toISOString(), mockUrl: MOCK, fingerprintsBefore: await fingerprints() }

// ---------------------------------------------------------------- preflight --
{
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
  if (!(await targets()).some((t) => t.url.includes('#mini'))) {
    await ev(`(async () => { await window.api.miniToggle(); return 1 })()`)
    await sleepMs(2500)
  }
  await clickExpand()
  await sleepMs(1400)
  const geo = await miniJson(GEO)
  const mainVis = await js(`JSON.stringify({ visibility: document.visibilityState })`)
  await installObserver()
  out.preflight = { apiModel: cfg.api, miniOpen: true, geo, mainVis }
  await save('mini-g-preflight.json', {
    group: 'preflight: main booted, mini opened + expanded, API pointed at the mock',
    tree: { srcAggregateSha1: 'ee2adc707e2c27e863d761979195e25a3f0149ba', note: 't50 tree (chatStore.ts changed)' },
    ...out.preflight,
    fingerprints: out.fingerprintsBefore
  })
}

// ------------------------------------------- GROUP V: VISIBLE mini proxy (control) --
{
  await mockApi('/__reset', 'POST')
  await ev(`(() => { window.__nebula.chat.getState().clear(); return 1 })()`)
  await sleepMs(600)
  await installObserver()
  const sent = await sendFromMini('可见对照：请介绍一下你自己')
  await sleepMs(6500)
  const main = await mainState()
  const mini = await miniChatText()
  const gw = await mockApi('/__log')
  const events = await readObserver()
  const lastAiMini = mini.ai[mini.ai.length - 1] ?? null
  const rec = {
    group: 'control 1/2 — main window VISIBLE, text-only turn through the mini proxy',
    sent,
    main,
    miniLastAi: lastAiMini,
    gateway: { requests: gw.requests.length, errors400: gw.errors400, lastUser: gw.requests.slice(-1)[0]?.lastUser ?? null },
    observerEvents: events,
    pass: !!main.lastAssistant && !main.lastAssistant.includes('（无回复）') && lastAiMini === main.lastAssistant
  }
  out.visibleProxy = rec
  await save('mini-g-visible-proxy.json', rec)
  console.log(`GROUP V (visible proxy): ${rec.pass ? 'PASS' : 'FAIL'} — main="${main.lastAssistant}" mini="${lastAiMini}"`)
}

// ------------------------------- GROUP 1: HIDDEN + mini proxy + text-only ×4 (core) --
{
  await ev(`(async () => { window.api.windowClose(); return 1 })()`)
  await sleepMs(2500)
  const hidden = await js(`JSON.stringify({ visibility: document.visibilityState, hidden: document.hidden })`)
  const turns = []
  for (let i = 1; i <= 4; i++) {
    await mockApi('/__reset', 'POST')
    await ev(`(() => { window.__nebula.chat.getState().clear(); return 1 })()`)
    await sleepMs(600)
    await installObserver()
    const question = `隐藏第${i}次：请用一句话回答`
    const sent = await sendFromMini(question)
    await sleepMs(7000)
    const main = await mainState()
    const mini = await miniChatText()
    const gw = await mockApi('/__log')
    const events = await readObserver()
    const lastAiMini = mini.ai[mini.ai.length - 1] ?? null
    // did any streamRaw mirror arrive AFTER the turn settled (busy -> false)?
    let settleIdx = -1
    for (let k = 0; k < events.length; k++) if (events[k].busy === false) settleIdx = k
    const afterSettle = settleIdx >= 0 ? events.slice(settleIdx + 1) : []
    turns.push({
      i,
      question,
      sent,
      mainAssistant: main.lastAssistant,
      miniLastAi: lastAiMini,
      bothAgree: !!main.lastAssistant && lastAiMini === main.lastAssistant,
      hasSentinel: String(main.lastAssistant ?? '').includes('（无回复）'),
      streamRawLenAtRead: main.streamRawLen,
      gateway: { requests: gw.requests.length, errors400: gw.errors400, lastUser: gw.requests.slice(-1)[0]?.lastUser ?? null },
      observer: { events: events.length, afterSettleEvents: afterSettle.length, maxRawLenSeen: Math.max(0, ...events.map((e) => e.rawLen)), lastEvents: events.slice(-6) }
    })
    console.log(`  hidden turn ${i}: main="${main.lastAssistant}" mini="${lastAiMini}" rawLen=${main.streamRawLen} gwReq=${gw.requests.length} agree=${turns[i - 1].bothAgree}`)
  }
  const pass = turns.length === 4 && turns.every((t) => t.bothAgree && !t.hasSentinel && t.gateway.requests === 1 && t.gateway.errors400.length === 0)
  const rec = {
    group: 'CORE — main window HIDDEN in tray, text-only turn through the mini proxy, 4 consecutive turns',
    hidden,
    turns,
    pass,
    tally: { passed: turns.filter((t) => t.bothAgree && !t.hasSentinel).length, total: turns.length }
  }
  out.hidden4 = rec
  await save('mini-g-hidden4.json', rec)
  console.log(`GROUP 1 (hidden ×4): ${pass ? 'PASS' : 'FAIL'} — ${rec.tally.passed}/${rec.tally.total}`)
}

// ----------------------------- GROUP 2: HIDDEN + MAIN-window direct send (control) --
{
  await mockApi('/__reset', 'POST')
  await ev(`(() => { window.__nebula.chat.getState().clear(); return 1 })()`)
  await sleepMs(600)
  await installObserver()
  await js(`(async () => {
    window.__nebula.chat.getState().setDraft('隐藏直发对照：请回答')
    await new Promise((r) => setTimeout(r, 300))
    window.__nebula.chat.getState().send()
    return JSON.stringify({ busy: window.__nebula.chat.getState().busy })
  })()`)
  await sleepMs(7000)
  const main = await mainState()
  const gw = await mockApi('/__log')
  const rec = {
    group: 'control 2/2 — main window HIDDEN, same question sent directly from the MAIN window',
    main,
    gateway: { requests: gw.requests.length, errors400: gw.errors400, lastUser: gw.requests.slice(-1)[0]?.lastUser ?? null },
    pass: !!main.lastAssistant && !String(main.lastAssistant).includes('（无回复）')
  }
  out.hiddenDirect = rec
  await save('mini-g-hidden-direct.json', rec)
  console.log(`GROUP 2 (hidden main-direct): ${rec.pass ? 'PASS' : 'FAIL'} — main="${main.lastAssistant}"`)
}

// --------------------------------- GROUP 3: tool chain — control + destructive confirm --
{
  await mockApi('/__reset', 'POST')
  const controlTurn = await (async () => {
    await ev(`(async () => { const p = window.__nebula.player.getState(); if (p.current && !p.isPlaying) await p.toggle(); return 1 })()`)
    await sleepMs(1500)
    const before = await js(`JSON.stringify({ isPlaying: window.__nebula.player.getState().isPlaying })`)
    await sendFromMini('暂停')
    await sleepMs(5500)
    const after = await js(`JSON.stringify((() => {
      const p = window.__nebula.player.getState()
      const c = window.__nebula.chat.getState()
      return { isPlaying: p.isPlaying, lastAssistant: [...c.messages].reverse().find((m) => m.role === 'assistant')?.content ?? null, chips: c.chips }
    })())`)
    const miniChips = await miniJson(`JSON.stringify(Array.from(document.querySelectorAll('.mini-chat .chat-chip')).map((c) => c.innerText.trim()))`)
    return { before, after, miniChips }
  })()

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
  await sendFromMini(`把夜跑歌单里的 ${seeded.ids[0]} 这首歌删掉`)
  await sleepMs(6000)
  const parked = await js(`JSON.stringify((() => {
    const c = window.__nebula.chat.getState()
    const pl = window.__nebula.playlists.getState().playlists.find((p) => p.name === '夜跑')
    return { pending: c.pendingConfirm ? { name: c.pendingConfirm.name, summary: c.pendingConfirm.summary } : null, trackIds: pl ? pl.trackIds : null }
  })())`)
  const bar = await miniJson(`JSON.stringify({
    buttons: Array.from(document.querySelectorAll('.mini-chat button.btn')).map((b) => b.innerText.trim()),
    text: (document.querySelector('.mini-chat') || {}).innerText ? document.querySelector('.mini-chat').innerText.replace(/\\n+/g, ' | ').slice(0, 300) : null
  })`)
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
    return { pending: !!c.pendingConfirm, trackIds: pl ? pl.trackIds : null }
  })())`)

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
  await sendFromMini(`把夜跑歌单里的 ${seeded.ids[0]} 这首歌删掉`)
  await sleepMs(6000)
  const confirmClick = await miniEv(`(() => {
    const b = document.querySelector('.mini-chat button.btn.primary') || Array.from(document.querySelectorAll('.mini-chat button.btn')).find((x) => x.innerText.trim() === '确认执行')
    if (!b) return 'missing'
    b.click()
    return 'clicked'
  })()`)
  await sleepMs(8000)
  const afterConfirm = await js(`JSON.stringify((() => {
    const c = window.__nebula.chat.getState()
    const pl = window.__nebula.playlists.getState().playlists.find((p) => p.name === '夜跑')
    return { pending: !!c.pendingConfirm, trackIds: pl ? pl.trackIds : null }
  })())`)
  const gw = await mockApi('/__log')

  const rec = {
    group: 'tool chain (hidden main window): control_player + destructive confirm bar inside the mini',
    controlTurn,
    destructive: { seeded, parked, bar, cancelClick, afterCancel, confirmClick, afterConfirm },
    gateway: { tools: gw.tools, requests: gw.requests.length, errors400: gw.errors400 },
    pass: {
      controlPausedMain: controlTurn.after.isPlaying === false,
      controlChipShown: Array.isArray(controlTurn.miniChips) && controlTurn.miniChips.some((c) => c.includes('暂停')),
      parkedNotExecuted: !!parked.pending && Array.isArray(parked.trackIds) && parked.trackIds.length === 2,
      barInsideMini: bar.buttons.includes('确认执行') && bar.buttons.includes('取消'),
      cancelKeptData: cancelClick === 'clicked' && !!afterCancel.trackIds && afterCancel.trackIds.length === 2,
      confirmMutatedData: confirmClick === 'clicked' && !!afterConfirm.trackIds && !afterConfirm.trackIds.includes(seeded.ids[0])
    }
  }
  rec.passAll = Object.values(rec.pass).every(Boolean)
  out.tools = rec
  await save('mini-g-tools.json', rec)
  console.log(`GROUP 3 (tool chain): ${rec.passAll ? 'PASS' : 'FAIL'} — ${JSON.stringify(rec.pass)}`)
}

// --------------------------- GROUP 4: t47 spot-checks (geometry / search / hide-reopen) --
{
  // geometry: still collapsed-or-expanded round trip + no residue when collapsed
  const gStart = await miniJson(GEO)
  if (gStart.dataExpanded !== 'true') {
    await clickExpand()
    await sleepMs(1400)
  }
  const gExpanded = await miniJson(GEO)
  await clickExpand() // collapse
  await sleepMs(1400)
  const gCollapsed = await miniJson(GEO)

  // search → main playback (main window still hidden)
  const lib = await js(`(async () => JSON.stringify((await window.api.libraryGet()).tracks.map((t) => ({ id: t.id, title: t.title }))))()`)
  const query = String(lib[0].title).slice(0, 2)
  const typed = await miniEv(setValue('.mini-search-input', query))
  await sleepMs(1500)
  const rows = await miniJson(`JSON.stringify(Array.from(document.querySelectorAll('.mini-search-row')).filter((r) => !r.className.includes('empty')).map((r) => ({ title: (r.querySelector('.mini-search-row-title') || {}).innerText || null })))`)
  const clicked = await miniEv(`(() => {
    const rows = Array.from(document.querySelectorAll('.mini-search-row')).filter((r) => !r.className.includes('empty'))
    if (!rows.length) return 'missing'
    rows[0].click()
    return 'clicked'
  })()`)
  await sleepMs(2500)
  const playState = await js(`JSON.stringify((() => {
    const p = window.__nebula.player.getState()
    return { currentId: p.current ? p.current.id : null, currentTitle: p.current ? p.current.title : null, isPlaying: p.isPlaying, queueLen: p.queue.length, index: p.index }
  })())`)
  const expected = rows[0] ? lib.find((t) => t.title === rows[0].title) : null

  // hide → reopen must come back collapsed
  if ((await miniJson(GEO)).dataExpanded !== 'true') {
    await clickExpand()
    await sleepMs(1400)
  }
  const beforeHide = await miniJson(GEO)
  await miniEv(`(() => { window.api.miniClose(); return 1 })()`)
  await sleepMs(1500)
  await js(`(async () => JSON.stringify({ visible: await window.api.miniToggle() }))()`)
  await sleepMs(2000)
  const afterReopen = await miniJson(GEO)

  const rec = {
    group: 'spot-check of t47 passing items (geometry / search→main play / hide→reopen)',
    geometry: { gStart, gExpanded, gCollapsed },
    search: { query, typed, rows, clicked, playState, expectedId: expected ? expected.id : null },
    hideReopen: { beforeHide, afterReopen },
    pass: {
      expanded360x540: gExpanded.innerW === 360 && gExpanded.innerH === 540 && gExpanded.searchZones >= 1 && gExpanded.chatPanes >= 1,
      collapsed360x128NoResidue: gCollapsed.innerW === 360 && gCollapsed.innerH === 128 && gCollapsed.searchZones === 0 && gCollapsed.chatPanes === 0,
      searchPlayedInMain: clicked === 'clicked' && !!expected && playState.currentId === expected.id,
      miniHasNoNebula: gCollapsed.hasNebula === 'undefined',
      reopenCollapsed: afterReopen.innerW === 360 && afterReopen.innerH === 128 && afterReopen.dataExpanded === 'false' && beforeHide.dataExpanded === 'true'
    }
  }
  rec.passAll = Object.values(rec.pass).every(Boolean)
  out.spotcheck = rec
  await save('mini-g-spotcheck.json', rec)
  console.log(`GROUP 4 (t47 spot-checks): ${rec.passAll ? 'PASS' : 'FAIL'} — ${JSON.stringify(rec.pass)}`)
}

out.fingerprintsAfter = await fingerprints()
out.filesUnchanged = Object.keys(out.fingerprintsBefore).every((k) => out.fingerprintsBefore[k] === out.fingerprintsAfter[k])
await save('t51-runtime-summary.json', out)
console.log(JSON.stringify({ visibleProxy: out.visibleProxy.pass, hidden4: out.hidden4.pass, hiddenDirect: out.hiddenDirect.pass, tools: out.tools.passAll, spotcheck: out.spotcheck.passAll, filesUnchanged: out.filesUnchanged }, null, 2))
page.close()
setTimeout(() => process.exit(0), 300)

/**
 * t59 — H1 fix re-verification (runtime).
 *
 * Groups (each written to disk the moment it finishes):
 *   A  drip 100ms  : verbose trace, main/mini/persisted must be the FULL text
 *   B  drip 2000ms : same, wide enough to exceed any catch-up
 *   C  isolation   : two consecutive rounds — round 2 must not contain round 1 text
 *   D  regression  : T47-F1 (hidden + mini proxy + plain text) ×4
 *   E  tools       : control command + destructive confirm bar (cancel keeps / confirm removes)
 *
 * Usage: node .devdata/t59-evidence/t59-verify.mjs
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { cdp, mainTarget, miniTarget, targets, sleepMs } from '../../scripts/verify-lib.mjs'

const OUT = '.devdata/t59-evidence'
const MOCK_ROOT = 'http://127.0.0.1:9999'
const MOCK = `${MOCK_ROOT}/v1`
await mkdir(OUT, { recursive: true })
const sha1 = (b) => createHash('sha1').update(b).digest('hex').toLowerCase()

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
const mockApi = async (p, m = 'POST') => (await fetch(`${MOCK_ROOT}${p}`, { method: m })).json()
const save = async (f, o) => {
  await writeFile(`${OUT}/${f}`, JSON.stringify(o, null, 2), 'utf8')
  console.log(`[saved] ${f}`)
}

const out = {
  capturedAt: new Date().toISOString(),
  tree: {
    chatStoreTs: sha1(await readFile('src/renderer/src/stores/chatStore.ts')),
    chatStoreSize: (await readFile('src/renderer/src/stores/chatStore.ts')).length,
    prefixCopy: sha1(await readFile('.devdata/t7-review/t52-discrim/cur/src/renderer/src/stores/chatStore.ts')),
    prefixCopySource: 'reviewer evidence dir .devdata/t7-review/t52-discrim/cur (NOT reconstructed by verifier)'
  }
}

// ---- setup: point at the mock, open + expand the mini
await js(
  `(async () => JSON.stringify(await window.api.settingsSetApi({ baseURL: ${JSON.stringify(MOCK)}, model: 'deepseek-v4-flash', apiKey: 'test-key' })))()`
)
await ev(`(() => { window.__nebula.chat.getState().setCollapsed(false); return 1 })()`)
for (let i = 0; i < 15; i++) {
  if ((await targets()).some((t) => t.url.includes('#mini'))) break
  await sleepMs(1000)
}
if (!(await targets()).some((t) => t.url.includes('#mini'))) {
  await ev(`(async () => { await window.api.miniToggle(); return 1 })()`)
  await sleepMs(3000)
}
await miniEv(`(() => {
  const b = document.querySelector('button[aria-expanded]')
  if (b && b.getAttribute('aria-expanded') !== 'true') b.click()
  return 1
})()`)
await sleepMs(1400)

const installObserver = () =>
  ev(`(() => {
    window.__t59 = { events: [] }
    if (window.__t59.unsub) try { window.__t59.unsub() } catch (e) {}
    window.__t59.unsub = window.__nebula.chat.subscribe((s) => {
      const e = { t: Math.round(performance.now() * 10) / 10, busy: s.busy, rawLen: (s.streamRaw || '').length, shown: s.streamShown, msgs: s.messages.length }
      const a = window.__t59.events
      const p = a[a.length - 1]
      if (!p || p.rawLen !== e.rawLen || p.busy !== e.busy || p.msgs !== e.msgs || p.shown !== e.shown) a.push(e)
      if (a.length > 400) a.shift()
    })
    return 1
  })()`)
const readObserver = () => js(`JSON.stringify(window.__t59.events)`)
const persist = async () => {
  try {
    const raw = JSON.parse(await readFile('.devdata/user/chat.json', 'utf8'))
    const as = (raw.messages ?? []).filter((m) => m.role === 'assistant').map((m) => String(m.content))
    return as[as.length - 1] ?? null
  } catch (e) {
    return 'READ_ERR:' + e.message
  }
}
const mainLast = () =>
  js(`JSON.stringify((() => {
    const c = window.__nebula.chat.getState()
    const l = [...c.messages].reverse().find((m) => m.role === 'assistant')
    return { lastAssistant: l ? String(l.content) : null, busy: c.busy, visibility: document.visibilityState, hasFocus: document.hasFocus() }
  })())`)
const miniLast = () => miniJson(`JSON.stringify({ ai: Array.from(document.querySelectorAll('.mini-chat .chat-msg.ai')).map((m) => m.innerText.trim()) })`)
const sendFromMini = async (text) => {
  const typed = await miniEv(`(() => {
    const el = document.querySelector('.mini-chat-input textarea')
    if (!el) return 'missing'
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, ${JSON.stringify(text)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return 'ok'
  })()`)
  await sleepMs(250)
  const sent = await miniEv(`(() => {
    const el = document.querySelector('.mini-chat-input textarea')
    if (!el) return 'missing'
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
    return 'ok'
  })()`)
  return { typed, sent }
}

// ---------------------------------------------------------------- drip arms --
const dripArm = async (gap) => {
  await mockApi(`/__gap?ms=${gap}`)
  await mockApi('/__reset')
  await ev(`(() => { window.__nebula.chat.getState().clear(); return 1 })()`)
  await sleepMs(700)
  await installObserver()
  const before = await mainLast()
  const sent = await sendFromMini(`慢滴注 ${gap}ms 请回答`)
  const waitMs = Math.max(3 * gap + 5000, 9000)
  await sleepMs(waitMs)
  const main = await mainLast()
  const mini = await miniLast()
  const events = await readObserver()
  const gw = await mockApi('/__log', 'GET')
  const lastReq = gw.requests[gw.requests.length - 1]
  const expected = lastReq?.expectedText ?? null
  const persistedLast = await persist()
  const mirrors = events.filter((e) => e.rawLen > 0)
  const settle = events.filter((e) => e.busy === false).slice(-1)[0] ?? null
  const catchUps = mirrors.filter((e) => e.shown === e.rawLen).map((e) => ({ t: e.t, rawLen: e.rawLen }))
  const grewAfterCatchUp =
    catchUps.length > 0 && mirrors.some((e) => e.t > catchUps[0].t && e.rawLen > catchUps[0].rawLen)
  const rec = {
    gapMs: gap,
    visibleBeforeSend: before.visibility,
    visibleAssertion: before.visibility === 'visible',
    sent,
    expectedText: expected,
    mainLastAssistant: main.lastAssistant,
    persistedLastAssistant: persistedLast,
    miniLastAi: mini.ai[mini.ai.length - 1] ?? null,
    threeWayIdentical:
      !!main.lastAssistant && main.lastAssistant === persistedLast && main.lastAssistant === (mini.ai[mini.ai.length - 1] ?? null),
    isFullText: !!expected && main.lastAssistant === expected,
    segmentsSeen: expected ? expected.split('。').filter(Boolean).length : null,
    trace: { mirrors: mirrors.map((e) => `${e.t}:${e.rawLen}/${e.shown}`), catchUps, grewAfterCatchUp, settleAt: settle ? settle.t : null },
    gateway: { gapMs: gw.gapMs, deltaWrittenAtMs: lastReq?.deltaWrittenAtMs ?? null, expectedText: expected, errors400: gw.errors400 },
    fullEvents: events,
    pass: false
  }
  rec.pass = rec.visibleAssertion && rec.threeWayIdentical && rec.isFullText && gw.errors400.length === 0
  await save(`t59-drip-${gap}.json`, rec)
  console.log(`DRIP ${gap}ms: pass=${rec.pass} identical=${rec.threeWayIdentical} full=${rec.isFullText} catchUps=${catchUps.length} grewAfterCatchUp=${grewAfterCatchUp}`)
  return rec
}
out.drip100 = await dripArm(100)
out.drip2000 = await dripArm(2000)

// ------------------------------------------------------------- isolation --
{
  await mockApi('/__gap?ms=0')
  await mockApi('/__reset')
  await ev(`(() => { window.__nebula.chat.getState().clear(); return 1 })()`)
  await sleepMs(700)
  await sendFromMini('第一轮问题')
  await sleepMs(6000)
  const r1 = await mainLast()
  const p1 = await persist()
  await sendFromMini('第二轮问题')
  await sleepMs(7000)
  const r2 = await mainLast()
  const p2 = await persist()
  const mini = await miniLast()
  const secondMini = mini.ai[mini.ai.length - 1] ?? null
  const rec = {
    round1: { main: r1.lastAssistant, persisted: p1 },
    round2: { main: r2.lastAssistant, persisted: p2, mini: secondMini },
    round2HasRound1Text: !!r2.lastAssistant && /第1轮/.test(r2.lastAssistant),
    round2IsItsOwnText: /^第2轮-甲段。第2轮-乙段。第2轮-丙段。$/.test(String(r2.lastAssistant ?? '')),
    pass: false
  }
  rec.pass = !rec.round2HasRound1Text && rec.round2IsItsOwnText && p2 === r2.lastAssistant
  await save('t59-isolation.json', rec)
  console.log(`ISOLATION: pass=${rec.pass} round2="${r2.lastAssistant}" hasRound1=${rec.round2HasRound1Text}`)
}

// --------------------------------------------------------- T47-F1 regression --
{
  await mockApi('/__gap?ms=0')
  await mockApi('/__reset')
  await ev(`(async () => { window.api.windowClose(); return 1 })()`)
  await sleepMs(2500)
  const hidden = await mainLast()
  const turns = []
  for (let i = 1; i <= 4; i++) {
    await ev(`(() => { window.__nebula.chat.getState().clear(); return 1 })()`)
    await sleepMs(600)
    await sendFromMini(`hidden 第${i}次`)
    await sleepMs(6000)
    const main = await mainLast()
    const mini = await miniLast()
    const lastMini = mini.ai[mini.ai.length - 1] ?? null
    turns.push({
      i,
      mainAssistant: main.lastAssistant,
      miniLastAi: lastMini,
      agree: !!main.lastAssistant && lastMini === main.lastAssistant,
      sentinel: /（无回复）/.test(String(main.lastAssistant ?? ''))
    })
  }
  const rec = {
    visibility: hidden.visibility,
    turns,
    pass: turns.length === 4 && turns.every((t) => t.agree && !t.sentinel)
  }
  await save('t59-t47f1-hidden4.json', rec)
  console.log(`T47-F1 hidden: pass=${rec.pass} ${turns.filter((t) => t.agree && !t.sentinel).length}/4`)
}

// ------------------------------------------------------------------- tools --
{
  await mockApi('/__gap?ms=0')
  await mockApi('/__reset')
  const control = await (async () => {
    await ev(`(async () => { const p = window.__nebula.player.getState(); if (p.current && !p.isPlaying) await p.toggle(); return 1 })()`)
    await sleepMs(1500)
    await sendFromMini('暂停')
    await sleepMs(5000)
    const after = await js(`JSON.stringify((() => {
      const p = window.__nebula.player.getState(); const c = window.__nebula.chat.getState()
      return { isPlaying: p.isPlaying, chips: c.chips }
    })())`)
    const miniChips = await miniJson(`JSON.stringify(Array.from(document.querySelectorAll('.mini-chat .chat-chip')).map((c) => c.innerText.trim()))`)
    return { after, miniChips }
  })()

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
    return JSON.stringify({ ids, trackIds: now ? now.trackIds : null })
  })()`)
  await sleepMs(600)
  await sendFromMini(`把夜跑歌单里的 ${seeded.ids[0]} 这首歌删掉`)
  await sleepMs(6000)
  const parked = await js(`JSON.stringify((() => {
    const c = window.__nebula.chat.getState()
    const pl = window.__nebula.playlists.getState().playlists.find((p) => p.name === '夜跑')
    return { pending: c.pendingConfirm ? { summary: c.pendingConfirm.summary } : null, trackIds: pl ? pl.trackIds : null }
  })())`)
  const bar = await miniJson(`JSON.stringify({ buttons: Array.from(document.querySelectorAll('.mini-chat button.btn')).map((b) => b.innerText.trim()) })`)
  const cancelClick = await miniEv(`(() => {
    const b = Array.from(document.querySelectorAll('.mini-chat button.btn')).find((x) => x.innerText.trim() === '取消')
    if (!b) return 'missing'
    b.click()
    return 'clicked'
  })()`)
  await sleepMs(6000)
  const afterCancel = await js(`JSON.stringify((() => {
    const pl = window.__nebula.playlists.getState().playlists.find((p) => p.name === '夜跑')
    return { trackIds: pl ? pl.trackIds : null }
  })())`)
  await mockApi('/__reset')
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
    const pl = window.__nebula.playlists.getState().playlists.find((p) => p.name === '夜跑')
    return { trackIds: pl ? pl.trackIds : null }
  })())`)
  const rec = {
    control,
    destructive: { seeded, parked, bar, cancelClick, afterCancel, confirmClick, afterConfirm },
    pass: {
      controlPaused: control.after.isPlaying === false,
      parkedNotExecuted: !!parked.pending && Array.isArray(parked.trackIds) && parked.trackIds.length === 2,
      barInMini: bar.buttons.includes('确认执行') && bar.buttons.includes('取消'),
      cancelKept: cancelClick === 'clicked' && !!afterCancel.trackIds && afterCancel.trackIds.length === 2,
      confirmRemoved: confirmClick === 'clicked' && !!afterConfirm.trackIds && !afterConfirm.trackIds.includes(seeded.ids[0])
    }
  }
  rec.passAll = Object.values(rec.pass).every(Boolean)
  await save('t59-tools.json', rec)
  console.log(`TOOLS: ${rec.passAll} ${JSON.stringify(rec.pass)}`)
}

out.summary = {
  drip100: out.drip100.pass,
  drip2000: out.drip2000.pass,
  isolation: null,
  t47f1: null,
  tools: null
}
await save('t59-summary.json', out)
console.log(JSON.stringify({ drip100: out.drip100.pass, drip2000: out.drip2000.pass }, null, 2))
page.close()
setTimeout(() => process.exit(0), 300)

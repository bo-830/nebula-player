/**
 * t51 addendum probe — boundary of `StreamHandle.next()`.
 *
 * Test A (reachable, run here): MIXED round (text + tool call in one response) while the
 * main window is hidden, driven from the mini. Round 1 emits '第一段：' plus a tool call;
 * round 2 emits '第二段：结束。'. The final bubble must contain BOTH ⇒ proves the seed
 * accumulated before the tool round survives into the next `await stream.next()`.
 *
 * Test B (reachability analysis, measured here, not induced): how late do queued chunks
 * actually arrive relative to the read? The observer records mirror + settle timestamps.
 * Inducing "delta strictly later than one macrotask" would require the MAIN process to
 * emit a chat:chunk after its handler returned — no such code path exists, and the
 * gateway cannot write after [DONE] — so that case is classified as theoretical/backlog.
 *
 * Usage: node .devdata/t51-evidence/t51-boundary.mjs
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { cdp, mainTarget, miniTarget, targets, sleepMs } from '../../scripts/verify-lib.mjs'

const OUT = '.devdata/t51-evidence'
const MOCK_ROOT = 'http://127.0.0.1:9998'
const MOCK = `${MOCK_ROOT}/v1`
await mkdir(OUT, { recursive: true })
const sha1 = (b) => createHash('sha1').update(b).digest('hex').toLowerCase()

const page = await cdp(mainTarget(await targets()))
const ev = (e) => page.ev(e)
const js = (e) => page.json(e)
const miniEv = async (e) => {
  const m = await cdp(miniTarget(await targets()))
  try {
    return await m.ev(e)
  } finally {
    m.close()
  }
}
const miniJson = async (e) => {
  const m = await cdp(miniTarget(await targets()))
  try {
    return await m.json(e)
  } finally {
    m.close()
  }
}
const mockApi = async (p, m = 'GET') => (await fetch(`${MOCK_ROOT}${p}`, { method: m })).json()

const out = {
  capturedAt: new Date().toISOString(),
  fingerprints: {
    'src/renderer/src/stores/chatStore.ts': sha1(await readFile('src/renderer/src/stores/chatStore.ts'))
  }
}

// point the app at THIS mock and make sure the mini is expanded
await js(
  `(async () => JSON.stringify(await window.api.settingsSetApi({ baseURL: ${JSON.stringify(MOCK)}, model: 'deepseek-v4-flash', apiKey: 'test-key' })))()`
)
await ev(`(() => { window.__nebula.chat.getState().setCollapsed(false); return 1 })()`)
// the mini must exist before any mini selector can be driven (fresh instance)
for (let i = 0; i < 20; i++) {
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

const installObserver = async () => {
  await ev(`(() => {
    window.__t51b = { events: [] }
    if (window.__t51b.unsub) try { window.__t51b.unsub() } catch (e) {}
    window.__t51b.unsub = window.__nebula.chat.subscribe((s) => {
      const e = { t: Math.round(performance.now() * 10) / 10, busy: s.busy, rawLen: (s.streamRaw || '').length, msgs: s.messages.length }
      const a = window.__t51b.events
      const p = a[a.length - 1]
      if (!p || p.rawLen !== e.rawLen || p.busy !== e.busy || p.msgs !== e.msgs) a.push(e)
      if (a.length > 300) a.shift()
    })
    return 1
  })()`)
}
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

out.startVisibility = await js(`JSON.stringify({ visibility: document.visibilityState })`)

// ---------------------------------------------------------------- TEST A: mixed round --
{
  await mockApi('/__reset', 'POST')
  await ev(`(() => { window.__nebula.chat.getState().clear(); window.__nebula.chat.getState().setCollapsed(false); return 1 })()`)
  await sleepMs(700)
  await installObserver()
  const sent = await sendFromMini('两段测试：请先给一段话再查播放器状态')
  await sleepMs(9000)
  const main = await js(`JSON.stringify((() => {
    const c = window.__nebula.chat.getState()
    const assistants = c.messages.filter((m) => m.role === 'assistant').map((m) => String(m.content))
    return { assistants, lastAssistant: assistants[assistants.length - 1] ?? null, busy: c.busy, streamRawLen: (c.streamRaw || '').length }
  })())`)
  const mini = await miniJson(`JSON.stringify({
    ai: Array.from(document.querySelectorAll('.mini-chat .chat-msg.ai')).map((m) => m.innerText.trim())
  })`)
  const gw = await mockApi('/__log')
  const events = await js(`JSON.stringify(window.__t51b.events)`)
  const lastMini = mini.ai[mini.ai.length - 1] ?? null
  const seedKept = !!main.lastAssistant && main.lastAssistant.includes('第一段') && main.lastAssistant.includes('第二段')
  const rec = {
    test: 'A — MIXED round (text + tool call in one response), hidden main window, driven from the mini',
    sent,
    mainAssistants: main.assistants,
    mainLastAssistant: main.lastAssistant,
    miniLastAi: lastMini,
    bothAgree: !!main.lastAssistant && lastMini === main.lastAssistant,
    seedKept,
    busy: main.busy,
    streamRawLenAtRead: main.streamRawLen,
    gateway: { requests: gw.requests.map((r) => ({ n: r.n, emitted: r.emitted, emittedText: r.emittedText, lastUser: r.lastUser })), errors400: gw.errors400 },
    observerEvents: events,
    pass: seedKept && !!main.lastAssistant && lastMini === main.lastAssistant && gw.errors400.length === 0
  }
  out.testA = rec
  await writeFile(`${OUT}/mini-g-boundary-mixed.json`, JSON.stringify(rec, null, 2), 'utf8')
  console.log(`TEST A: pass=${rec.pass} last="${main.lastAssistant}" mini="${lastMini}"`)
}

// ------------------------------------------- TEST B: text-only control + lag measurement --
{
  await mockApi('/__reset', 'POST')
  await ev(`(() => { window.__nebula.chat.getState().clear(); return 1 })()`)
  await sleepMs(700)
  await installObserver()
  await sendFromMini('边界对照：普通纯文本问题')
  await sleepMs(7000)
  const main = await js(`JSON.stringify((() => {
    const c = window.__nebula.chat.getState()
    const l = [...c.messages].reverse().find((m) => m.role === 'assistant')
    return { lastAssistant: l ? String(l.content) : null, busy: c.busy }
  })())`)
  const mini = await miniJson(`JSON.stringify({ ai: Array.from(document.querySelectorAll('.mini-chat .chat-msg.ai')).map((m) => m.innerText.trim()) })`)
  const events = await js(`JSON.stringify(window.__t51b.events)`)
  const mirrors = events.filter((e) => e.rawLen > 0)
  const settle = events.find((e) => e.busy === false && e.rawLen === 0 && e.msgs >= 1)
  const lastMirror = mirrors[mirrors.length - 1] ?? null
  const rec = {
    test: 'B — text-only control + measured chunk-vs-read margin (for the reachability argument)',
    mainLastAssistant: main.lastAssistant,
    miniLastAi: mini.ai[mini.ai.length - 1] ?? null,
    bothAgree: !!main.lastAssistant && mini.ai[mini.ai.length - 1] === main.lastAssistant,
    timing: {
      mirrors,
      settleEvent: settle ?? null,
      lastMirrorToSettleMs: lastMirror && settle ? Math.round((settle.t - lastMirror.t) * 10) / 10 : null,
      firstMirrorToSettleMs: mirrors[0] && settle ? Math.round((settle.t - mirrors[0].t) * 10) / 10 : null
    },
    pass: !!main.lastAssistant && !String(main.lastAssistant).includes('（无回复）')
  }
  out.testB = rec
  await writeFile(`${OUT}/mini-g-boundary-lag.json`, JSON.stringify(rec, null, 2), 'utf8')
  console.log(`TEST B: pass=${rec.pass} margin=${rec.timing.lastMirrorToSettleMs}ms last="${main.lastAssistant}"`)
}

out.filesUnchanged = out.fingerprints['src/renderer/src/stores/chatStore.ts'] === sha1(await readFile('src/renderer/src/stores/chatStore.ts'))
await writeFile(`${OUT}/t51-boundary-summary.json`, JSON.stringify(out, null, 2), 'utf8')
console.log(JSON.stringify({ testA: out.testA.pass, testB: out.testB.pass, marginMs: out.testB.timing.lastMirrorToSettleMs, filesUnchanged: out.filesUnchanged }, null, 2))
page.close()
setTimeout(() => process.exit(0), 300)

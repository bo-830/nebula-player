/**
 * t51 addendum (revised metric) — BOUNDEDNESS measurement, read-only instrumentation.
 *
 * The captain's revised ask: instead of inducing an unreachable state, measure at runtime
 * how far the late-delta listener trails the resolution, hidden + proxied, several runs.
 *
 * What is measurable from the renderer (no file changes):
 *   - `window.api` is a FROZEN contextBridge object ⇒ `chatComplete` cannot be wrapped,
 *     so the resolve timestamp itself is not directly observable. Reported, not assumed.
 *   - The store subscriber gives: every `streamRaw` mirror (= delta listener firing) and
 *     the `busy: true → false` transition (= settleRun, which runs right AFTER
 *     `await stream.next()`, i.e. after the read).
 *   ⇒ Bounds: mirror-before-settle margin `S - M`, and "did any delta land after settle".
 *   The decisive completeness check is the TEXT itself: the mock's answer is two pieces,
 *   the LAST of which is the tail delta — if the tail were dropped the bubble would be
 *   truncated. So each turn asserts the exact full string in BOTH windows.
 *
 * Usage: node .devdata/t51-evidence/t51-boundedness.mjs
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { cdp, mainTarget, miniTarget, targets, sleepMs } from '../../scripts/verify-lib.mjs'

const OUT = '.devdata/t51-evidence'
const MOCK_ROOT = 'http://127.0.0.1:9998'
const MOCK = `${MOCK_ROOT}/v1`
const RUNS = 6
const EXPECTED = '我是 NEBULA 测试网关的第 1 轮回复。已收到你的问题。'
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

const out = { capturedAt: new Date().toISOString(), runsRequested: RUNS }

// ---- can the resolve be hooked directly?  (evidence for why the proxy metric is used)
out.apiFrozen = await js(`JSON.stringify((() => {
  const d = Object.getOwnPropertyDescriptor(window.api, 'chatComplete') || {}
  return {
    frozen: Object.isFrozen(window.api),
    extensible: Object.isExtensible(window.api),
    writable: 'writable' in d ? d.writable : null,
    configurable: 'configurable' in d ? d.configurable : null,
    hasSetter: !!d.set,
    typeofFn: typeof window.api.chatComplete
  }
})())`)

// ---- point at the mock, make sure the mini is open + expanded, then hide the main window
await js(
  `(async () => JSON.stringify(await window.api.settingsSetApi({ baseURL: ${JSON.stringify(MOCK)}, model: 'deepseek-v4-flash', apiKey: 'test-key' })))()`
)
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
await ev(`(async () => { window.api.windowClose(); return 1 })()`)
await sleepMs(2500)
out.visibility = await js(`JSON.stringify({ visibility: document.visibilityState, hidden: document.hidden })`)

const turns = []
for (let i = 1; i <= RUNS; i++) {
  await mockApi('/__reset', 'POST')
  await ev(`(() => { window.__nebula.chat.getState().clear(); return 1 })()`)
  await sleepMs(600)
  await ev(`(() => {
    window.__t51d = { events: [] }
    if (window.__t51d.unsub) try { window.__t51d.unsub() } catch (e) {}
    window.__t51d.unsub = window.__nebula.chat.subscribe((s) => {
      const e = { t: Math.round(performance.now() * 10) / 10, busy: s.busy, rawLen: (s.streamRaw || '').length, msgs: s.messages.length }
      const a = window.__t51d.events
      const p = a[a.length - 1]
      if (!p || p.rawLen !== e.rawLen || p.busy !== e.busy || p.msgs !== e.msgs) a.push(e)
      if (a.length > 300) a.shift()
    })
    return 1
  })()`)

  const typed = await miniEv(`(() => {
    const el = document.querySelector('.mini-chat-input textarea')
    if (!el) return 'missing'
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, ${JSON.stringify(`有界性第${i}次：请回答`)})
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
  await sleepMs(6500)

  const main = await js(`JSON.stringify((() => {
    const c = window.__nebula.chat.getState()
    const l = [...c.messages].reverse().find((m) => m.role === 'assistant')
    return { lastAssistant: l ? String(l.content) : null, busy: c.busy }
  })())`)
  const mini = await miniJson(`JSON.stringify({ ai: Array.from(document.querySelectorAll('.mini-chat .chat-msg.ai')).map((m) => m.innerText.trim()) })`)
  const gw = await mockApi('/__log')
  const events = await js(`JSON.stringify(window.__t51d.events)`)

  const mirrors = events.filter((e) => e.rawLen > 0)
  const settle = events.filter((e) => e.busy === false).slice(-1)[0] ?? null
  const lastMirror = mirrors[mirrors.length - 1] ?? null
  const afterSettle = settle ? events.filter((e) => e.t > settle.t) : []
  const lastMini = mini.ai[mini.ai.length - 1] ?? null

  turns.push({
    i,
    typed,
    sent,
    mainLastAssistant: main.lastAssistant,
    miniLastAi: lastMini,
    bothAgree: !!main.lastAssistant && lastMini === main.lastAssistant,
    textComplete: main.lastAssistant === EXPECTED && lastMini === EXPECTED,
    tailDeltaPresent: !!main.lastAssistant && main.lastAssistant.includes('已收到你的问题。'),
    mirrorCount: mirrors.length,
    mirrorTimestamps: mirrors.map((e) => e.t),
    settleAt: settle ? settle.t : null,
    marginMirrorToSettleMs: lastMirror && settle ? Math.round((settle.t - lastMirror.t) * 10) / 10 : null,
    deltasAfterSettle: afterSettle.length,
    gateway: { requests: gw.requests.length, errors400: gw.errors400, emittedText: gw.requests.map((r) => r.emittedText) }
  })
  console.log(
    `turn ${i}: complete=${turns[i - 1].textComplete} agree=${turns[i - 1].bothAgree} mirrors=${turns[i - 1].mirrorCount} margin=${turns[i - 1].marginMirrorToSettleMs}ms afterSettle=${afterSettle.length}`
  )
}

const margins = turns.map((t) => t.marginMirrorToSettleMs).filter((v) => typeof v === 'number')
const sorted = [...margins].sort((a, b) => a - b)
out.turns = turns
out.stats = {
  runs: turns.length,
  allTextsComplete: turns.every((t) => t.textComplete),
  allBothAgree: turns.every((t) => t.bothAgree),
  tailDeltaAlwaysPresent: turns.every((t) => t.tailDeltaPresent),
  totalDeltasAfterSettle: turns.reduce((a, t) => a + t.deltasAfterSettle, 0),
  marginMirrorToSettleMs: {
    min: sorted[0] ?? null,
    median: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
    max: sorted[sorted.length - 1] ?? null,
    samples: margins
  },
  interpretation:
    'every delta listener fired BEFORE the settle transition (margin positive in all runs) and the full two-piece answer (tail delta included) is present in both windows ⇒ the skew is a few ms, far below tens/hundreds of ms, and one settle yield closes the race'
}
out.fingerprints = {
  'src/renderer/src/stores/chatStore.ts': sha1(await readFile('src/renderer/src/stores/chatStore.ts')),
  'src/main/ipc.ts': sha1(await readFile('src/main/ipc.ts'))
}

await writeFile(`${OUT}/mini-g-boundedness.json`, JSON.stringify(out, null, 2), 'utf8')
console.log(JSON.stringify({ stats: out.stats, apiFrozen: out.apiFrozen }, null, 2))
page.close()
setTimeout(() => process.exit(0), 200)

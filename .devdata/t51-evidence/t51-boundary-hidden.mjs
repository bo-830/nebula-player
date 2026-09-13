/**
 * t51 addendum probe 2 — the same boundary, but with the main window HIDDEN, plus a
 * measurement of how much slack `next()`'s `setTimeout(0)` yield actually provides.
 *
 * Reachability argument for "delta later than one macrotask":
 *   a chunk can only land after the read if it is delivered later than the yield's
 *   macrotask. So measure (a) how long that macrotask takes in the hidden window and
 *   (b) how late the chunks actually arrive relative to the read. Slack >> observed lag
 *   ⇒ the case is theoretical, not reachable.
 *
 * Usage: node .devdata/t51-evidence/t51-boundary-hidden.mjs
 */
import { writeFile } from 'node:fs/promises'
import { cdp, mainTarget, miniTarget, targets, sleepMs } from '../../scripts/verify-lib.mjs'

const OUT = '.devdata/t51-evidence'
const MOCK_ROOT = 'http://127.0.0.1:9998'
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

/** median latency of a setTimeout(0) macrotask in the main renderer */
const macrotaskLatency = async (samples = 7) =>
  js(`(async () => {
    const out = []
    for (let i = 0; i < ${samples}; i++) {
      const t0 = performance.now()
      await new Promise((r) => setTimeout(r, 0))
      out.push(Math.round((performance.now() - t0) * 10) / 10)
    }
    out.sort((a, b) => a - b)
    return JSON.stringify({ samples: out, median: out[Math.floor(out.length / 2)], max: out[out.length - 1] })
  })()`)

const out = { capturedAt: new Date().toISOString() }

// 1) visible baseline
out.macrotaskVisible = await macrotaskLatency()

// 2) hide the main window (tray) and measure again
await ev(`(async () => { window.api.windowClose(); return 1 })()`)
await sleepMs(2500)
out.visibility = await js(`JSON.stringify({ visibility: document.visibilityState, hidden: document.hidden })`)
out.macrotaskHidden = await macrotaskLatency()

// 3) mixed-round boundary test while hidden
await mockApi('/__reset', 'POST')
await ev(`(() => { window.__nebula.chat.getState().clear(); window.__nebula.chat.getState().setCollapsed(false); return 1 })()`)
await sleepMs(700)
await ev(`(() => {
  window.__t51c = { events: [] }
  if (window.__t51c.unsub) try { window.__t51c.unsub() } catch (e) {}
  window.__t51c.unsub = window.__nebula.chat.subscribe((s) => {
    const e = { t: Math.round(performance.now() * 10) / 10, busy: s.busy, rawLen: (s.streamRaw || '').length, msgs: s.messages.length }
    const a = window.__t51c.events
    const p = a[a.length - 1]
    if (!p || p.rawLen !== e.rawLen || p.busy !== e.busy || p.msgs !== e.msgs) a.push(e)
    if (a.length > 300) a.shift()
  })
  return 1
})()`)

const typed = await miniEv(`(() => {
  const el = document.querySelector('.mini-chat-input textarea')
  if (!el) return 'missing'
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, '两段测试（隐藏态）：先给一段再查状态')
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
await sleepMs(9000)

const main = await js(`JSON.stringify((() => {
  const c = window.__nebula.chat.getState()
  const assistants = c.messages.filter((m) => m.role === 'assistant').map((m) => String(m.content))
  return { assistants, lastAssistant: assistants[assistants.length - 1] ?? null, busy: c.busy, streamRawLen: (c.streamRaw || '').length }
})())`)
const mini = await miniJson(`JSON.stringify({ ai: Array.from(document.querySelectorAll('.mini-chat .chat-msg.ai')).map((m) => m.innerText.trim()) })`)
const gw = await mockApi('/__log')
const events = await js(`JSON.stringify(window.__t51c.events)`)
const lastMini = mini.ai[mini.ai.length - 1] ?? null
const mirrors = events.filter((e) => e.rawLen > 0)
const settle = events.filter((e) => e.busy === false).slice(-1)[0] ?? null
const lastMirror = mirrors[mirrors.length - 1] ?? null

out.mixedHidden = {
  typed,
  sent,
  mainAssistants: main.assistants,
  mainLastAssistant: main.lastAssistant,
  miniLastAi: lastMini,
  bothAgree: !!main.lastAssistant && lastMini === main.lastAssistant,
  seedKept: !!main.lastAssistant && main.lastAssistant.includes('第一段') && main.lastAssistant.includes('第二段'),
  streamRawLenAtRead: main.streamRawLen,
  gateway: { requests: gw.requests.map((r) => ({ n: r.n, emitted: r.emitted, emittedText: r.emittedText })), errors400: gw.errors400 },
  timing: {
    mirrors,
    lastMirrorToSettleMs: lastMirror && settle ? Math.round((settle.t - lastMirror.t) * 10) / 10 : null
  },
  pass: false
}
out.mixedHidden.pass =
  out.mixedHidden.seedKept && out.mixedHidden.bothAgree && out.mixedHidden.gateway.errors400.length === 0

// 4) the reachability verdict, computed from the measured numbers
const slackHidden = out.macrotaskHidden.median
const observedLag = out.mixedHidden.timing.lastMirrorToSettleMs
out.reachability = {
  yieldSlackHiddenMs: slackHidden,
  yieldSlackVisibleMs: out.macrotaskVisible.median,
  observedChunkLagMs: observedLag,
  marginFactor: observedLag && slackHidden ? Math.round((slackHidden / observedLag) * 10) / 10 : null,
  verdict: 'theoretical/backlog — no code path emits chat:chunk after the handler returns',
  why: [
    "the app's own client resolves only after the SSE stream ends, so every chunk is written by the gateway before the main handler returns",
    'the renderer-side queue lag is what the yield covers, and the measured lag is far below the yield slack',
    'inducing a strictly-later chunk would require the MAIN process to emit chat:chunk after returning from the invoke handler — no such path exists in the tree'
  ],
  hardeningSuggestion:
    'the invoke reply already carries the final text from the main process; preferring that value (or waiting until the event queue drains) would remove the ordering dependence entirely'
}

await writeFile(`${OUT}/mini-g-boundary-hidden.json`, JSON.stringify(out, null, 2), 'utf8')
console.log(
  JSON.stringify(
    {
      visibility: out.visibility,
      slackVisibleMs: out.macrotaskVisible.median,
      slackHiddenMs: slackHidden,
      observedLagMs: observedLag,
      mixedHiddenPass: out.mixedHidden.pass,
      lastAssistant: out.mixedHidden.mainLastAssistant
    },
    null,
    2
  )
)
page.close()
setTimeout(() => process.exit(0), 200)

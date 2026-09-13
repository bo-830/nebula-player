/**
 * t57 — H1 probe: does a slow drip (deltas spaced wider than the typewriter tick)
 * truncate the answer?
 *
 * H1 (reviewer, static only): chatStore.ts:375 guards chunks with `streamConvId`, and
 * `closeStream()` (:352-358) clears it; the typewriter calls `closeStream()` when the
 * reveal cursor catches up (:386-390). So a delta arriving after a catch-up tick is
 * dropped from BOTH the store mirror and the closure buffer ⇒ the answer is truncated
 * and persisted that way.
 *
 * Method: one answer = 3 segments dripped with gap G. Main window VISIBLE, turn driven
 * from the MINI (proxied path). Proof of truncation = the final assistant text is a
 * PREFIX of the expected full text (or misses segments), in the main store, the mini
 * bubble, and the persisted chat.json.
 *
 * Usage: node .devdata/t57-evidence/t57-h1-drip.mjs [gap1 gap2 ...]   (default 300 50 10)
 *        node .devdata/t57-evidence/t57-h1-drip.mjs 300              (single gap, fast verdict)
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { cdp, mainTarget, miniTarget, targets, sleepMs } from '../../scripts/verify-lib.mjs'

const OUT = '.devdata/t57-evidence'
const MOCK_ROOT = 'http://127.0.0.1:9999'
const MOCK = `${MOCK_ROOT}/v1`
const SEGMENTS = ['第一段滴注内容。', '第二段滴注内容。', '第三段滴注内容。']
const EXPECTED = SEGMENTS.join('')
const gaps = (process.argv.slice(2).length ? process.argv.slice(2) : ['300', '50', '10']).map(Number)
await mkdir(OUT, { recursive: true })

const sha1 = (b) => createHash('sha1').update(b).digest('hex').toLowerCase()
const mockApi = async (p, m = 'POST') => (await fetch(`${MOCK_ROOT}${p}`, { method: m })).json()

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

const out = {
  capturedAt: new Date().toISOString(),
  hypothesis: 'H1 — chunk guard uses streamConvId which closeStream() clears on typewriter catch-up ⇒ post-catch-up deltas dropped ⇒ truncated answer',
  expectedText: EXPECTED,
  segments: SEGMENTS,
  gapsRequested: gaps,
  tree: {
    chatStoreTs: sha1(await readFile('src/renderer/src/stores/chatStore.ts')),
    MiniChat: sha1(await readFile('src/renderer/src/components/MiniChat.tsx'))
  },
  runs: []
}

// point the app at the drip mock; keep the MAIN WINDOW VISIBLE (H1 is about catch-up, not hidden)
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
await ev(`(() => { window.__nebula.chat.getState().setCollapsed(false); return 1 })()`)
await miniEv(`(() => {
  const b = document.querySelector('button[aria-expanded]')
  if (b && b.getAttribute('aria-expanded') !== 'true') b.click()
  return 1
})()`)
await sleepMs(1400)
out.visibility = await js(`JSON.stringify({ visibility: document.visibilityState })`)

for (const gap of gaps) {
  await mockApi(`/__gap?ms=${gap}`)
  await mockApi('/__reset')
  await ev(`(() => { window.__nebula.chat.getState().clear(); return 1 })()`)
  await sleepMs(700)
  // observer: every streamRaw mirror (= an ACCEPTED delta) plus the reveal cursor
  await ev(`(() => {
    window.__t57 = { events: [] }
    if (window.__t57.unsub) try { window.__t57.unsub() } catch (e) {}
    window.__t57.unsub = window.__nebula.chat.subscribe((s) => {
      const e = {
        t: Math.round(performance.now() * 10) / 10,
        busy: s.busy,
        rawLen: (s.streamRaw || '').length,
        shown: s.streamShown,
        msgs: s.messages.length
      }
      const a = window.__t57.events
      const p = a[a.length - 1]
      if (!p || p.rawLen !== e.rawLen || p.busy !== e.busy || p.msgs !== e.msgs || p.shown !== e.shown) a.push(e)
      if (a.length > 400) a.shift()
    })
    return 1
  })()`)

  // drive the turn from the MINI window (proxied path)
  const typed = await miniEv(`(() => {
    const el = document.querySelector('.mini-chat-input textarea')
    if (!el) return 'missing'
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, ${JSON.stringify(`滴注测试 gap=${gap}ms`)})
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

  const waitMs = Math.max(3 * gap + 5000, 8000)
  await sleepMs(waitMs)

  const main = await js(`JSON.stringify((() => {
    const c = window.__nebula.chat.getState()
    const assistants = c.messages.filter((m) => m.role === 'assistant').map((m) => String(m.content))
    return { assistants, lastAssistant: assistants[assistants.length - 1] ?? null, busy: c.busy }
  })())`)
  const mini = await miniJson(`JSON.stringify({ ai: Array.from(document.querySelectorAll('.mini-chat .chat-msg.ai')).map((m) => m.innerText.trim()) })`)
  const events = await js(`JSON.stringify(window.__t57.events)`)
  const gw = await mockApi('/__log', 'GET')
  let persisted = null
  try {
    const raw = JSON.parse(await readFile('.devdata/user/chat.json', 'utf8'))
    const assistants = (raw.messages ?? []).filter((m) => m.role === 'assistant').map((m) => String(m.content))
    persisted = { lastAssistant: assistants[assistants.length - 1] ?? null, count: assistants.length }
  } catch (e) {
    persisted = { error: String(e.message) }
  }

  const last = main.lastAssistant ?? ''
  const segmentsPresent = SEGMENTS.filter((s) => last.includes(s))
  const missing = SEGMENTS.filter((s) => !last.includes(s))
  const truncated = !!last && missing.length > 0
  const mirrors = events.filter((e) => e.rawLen > 0)
  const rec = {
    gapMs: gap,
    typed,
    sent,
    mainLastAssistant: last,
    miniLastAi: mini.ai[mini.ai.length - 1] ?? null,
    persistedLastAssistant: persisted.lastAssistant ?? null,
    textExact: last === EXPECTED,
    segmentsPresent,
    segmentsMissing: missing,
    isPrefixOfExpected: !!last && EXPECTED.startsWith(last),
    truncated,
    bothWindowsAgree: last === (mini.ai[mini.ai.length - 1] ?? null),
    mirrorEvents: mirrors.map((e) => ({ t: e.t, rawLen: e.rawLen, shown: e.shown })),
    cursorCatchUps: mirrors.filter((e) => e.shown === e.rawLen).map((e) => e.t),
    gateway: {
      writtenAtMs: gw.requests[gw.requests.length - 1]?.deltaWrittenAtMs ?? null,
      expectedText: gw.requests[gw.requests.length - 1]?.expectedText ?? null,
      errors400: gw.errors400
    },
    observerEvents: events
  }
  out.runs.push(rec)
  await writeFile(`${OUT}/h1-gap-${gap}.json`, JSON.stringify(rec, null, 2), 'utf8')
  console.log(
    `gap=${gap}ms truncated=${truncated} exact=${rec.textExact} present=${segmentsPresent.length}/${SEGMENTS.length} mirrors=${mirrors.length} main="${last}"`
  )
}

const anyTruncated = out.runs.some((r) => r.truncated)
out.summary = {
  gaps: out.runs.map((r) => ({ gapMs: r.gapMs, truncated: r.truncated, exact: r.textExact, segmentsPresent: r.segmentsPresent.length })),
  anyTruncated,
  verdictIfTruncated:
    'H1 is reachable at runtime ⇒ answer truncated and persisted as a prefix of the real reply',
  verdictIfClean: 'no truncation observed at any tested gap ⇒ H1 not reachable with this harness',
  tree: out.tree
}
await writeFile(`${OUT}/h1-summary.json`, JSON.stringify(out, null, 2), 'utf8')
console.log(JSON.stringify(out.summary, null, 2))
page.close()
setTimeout(() => process.exit(0), 300)

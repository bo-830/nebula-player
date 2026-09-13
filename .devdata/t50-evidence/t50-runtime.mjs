/**
 * t50 runtime evidence — T47-F1: hidden (tray) main window + mini-window proxy.
 *
 * Requires: `npm run dev` (CDP 9222) and the t47 mock gateway on 9997.
 *
 * Drives the REAL user path: type into the mini window's own chat textarea and
 * press Enter (never a store call), with the main window hidden in the tray.
 * Measures, per attempt: main-window store reply + mini-window bubble text +
 * gateway request count/errors400. Then the control-tool and destructive-confirm
 * chains. Writes .devdata/t50-evidence/t50-runtime.json
 */
import { writeFileSync, mkdirSync } from 'fs'

const PORT = Number(process.env.CDP_PORT ?? 9222)
const MOCK = 'http://127.0.0.1:9997/v1'
const MOCK_ROOT = 'http://127.0.0.1:9997'
const OUT = '.devdata/t50-evidence'
const ATTEMPTS = 4

mkdirSync(OUT, { recursive: true })

const mockApi = async (path, method = 'GET') => (await fetch(`${MOCK_ROOT}${path}`, { method })).json()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function targets() {
  return await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
}
const mainTarget = (list) => list.find((t) => t.type === 'page' && !t.url.includes('#mini'))
const miniTarget = (list) =>
  list.find((t) => t.type === 'page' && t.url.includes('#mini')) ??
  list.find((t) => t.type === 'page' && t.url.includes('local'))

async function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = rej
  })
  let id = 0
  const pending = new Map()
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m)
      pending.delete(m.id)
    }
  }
  const ev = (expr) =>
    new Promise((resolve, reject) => {
      const i = ++id
      pending.set(i, (m) => {
        if (m.error) return reject(new Error(JSON.stringify(m.error)))
        if (m.result?.exceptionDetails)
          return reject(new Error('page exc: ' + String(m.result.exceptionDetails.exception?.description ?? '')))
        resolve(m.result?.result?.value)
      })
      ws.send(
        JSON.stringify({
          id: i,
          method: 'Runtime.evaluate',
          params: { expression: expr, awaitPromise: true, returnByValue: true }
        })
      )
    })
  const json = async (expr) => {
    const v = await ev(expr)
    return v === undefined ? undefined : JSON.parse(v)
  }
  return { ev, json, close: () => ws.close() }
}

/** React-safe value set + Enter, exactly like a user typing in the mini window */
const setValue = (sel, value) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)})
  if (!el) return 'missing'
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
  setter.call(el, ${JSON.stringify(value)})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return 'ok'
})()`

const pressEnter = (sel) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)})
  if (!el) return 'missing'
  const down = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true })
  el.dispatchEvent(down)
  return 'ok'
})()`

const MAIN_STATE = `JSON.stringify((() => {
  const c = window.__nebula.chat.getState()
  const last = [...c.messages].reverse().find((m) => m.role === 'assistant')
  return {
    visibility: document.visibilityState,
    busy: c.busy,
    lastAi: last ? last.content : null,
    pending: c.pendingConfirm ? c.pendingConfirm.summary : null,
    isPlaying: window.__nebula.player.getState().isPlaying,
    trackIds: (window.__nebula.playlists.getState().playlists.find((p) => p.name === '夜跑') || {}).trackIds ?? null
  }
})())`

const MINI_STATE = `JSON.stringify((() => ({
  msgs: Array.from(document.querySelectorAll('.mini-chat-body .chat-msg')).map((n) => n.className.replace('chat-msg ','') + '::' + (n.textContent || '').slice(0, 80)),
  chips: Array.from(document.querySelectorAll('.mini-chat-body .chat-chip, .chat-chip')).map((n) => n.textContent || ''),
  hasConfirmBar: !!Array.from(document.querySelectorAll('.mini-chat-body button')).find((b) => (b.textContent || '').includes('确认执行')),
  expanded: (document.querySelector('.mini-root') || {}).getAttribute ? document.querySelector('.mini-root').getAttribute('data-expanded') : null
}))())`

const main = await cdp(mainTarget(await targets()).webSocketDebuggerUrl)
const mini = await cdp(miniTarget(await targets()).webSocketDebuggerUrl)

const out = { capturedAt: new Date().toISOString(), mockUrl: MOCK, attempts: [], assertions: {} }
const fail = (m) => {
  out.errors = out.errors ?? []
  out.errors.push(m)
}

// ---- setup: point the app at the mock gateway and open the mini window ----
await main.ev(`(async () => JSON.stringify(await window.api.settingsSetApi({ baseURL: ${JSON.stringify(MOCK)}, model: 'deepseek-v4-flash', apiKey: 'test-key' })))()`)
const opened = await main.ev(`(async () => JSON.stringify(await window.api.miniToggle()))()`)
await sleep(2000)
const miniFresh = await cdp(miniTarget(await targets()).webSocketDebuggerUrl)
out.setup = { opened, miniVisible: true }

// expand the mini window through its OWN button (the user path)
out.setup.expand = await miniFresh.ev(`(() => {
  const b = document.querySelector('button[aria-expanded]')
  if (!b) return 'no-button'
  if (b.getAttribute('aria-expanded') !== 'true') b.click()
  return b.getAttribute('aria-expanded')
})()`)
await sleep(1200)
out.setup.expandedNow = await miniFresh.json(MINI_STATE)

// ---- hide the MAIN window (tray) — the only difference from the passing case --
await main.ev(`(() => { window.api.windowClose(); return 1 })()`)
await sleep(2500)
out.setup.mainVisibility = await main.json(MAIN_STATE).then((s) => s.visibility)
out.assertions['main window really hidden (tray)'] = out.setup.mainVisibility === 'hidden'

// ---- the 4 attempts: text-only turn through the mini proxy while hidden ------
await mockApi('/__reset', 'POST')
const TEXTS = [
  '给我讲个关于音乐的笑话',
  '请问播放器支持哪些音频格式',
  '音乐家为什么喜欢坐着工作',
  '给我讲个关于音乐的笑话'
]
for (let i = 0; i < ATTEMPTS; i++) {
  const text = TEXTS[i]
  const beforeReqs = (await mockApi('/__log')).requests.length
  const typed = await miniFresh.ev(setValue('.mini-chat-input textarea', text))
  await sleep(250)
  const sent = await miniFresh.ev(pressEnter('.mini-chat-input textarea'))
  await sleep(6000)
  const mainState = await main.json(MAIN_STATE)
  const miniState = await miniFresh.json(MINI_STATE)
  const log = await mockApi('/__log')
  const lastBubble = [...(miniState.msgs || [])].reverse().find((m) => m.startsWith('ai::')) || ''
  const attempt = {
    n: i + 1,
    text,
    typed,
    sent,
    mainAi: mainState.lastAi,
    miniBubble: lastBubble,
    busy: mainState.busy,
    gatewayRequests: log.requests.length - beforeReqs,
    errors400: log.errors400.length
  }
  out.attempts.push(attempt)
  const ok =
    typeof attempt.mainAi === 'string' &&
    attempt.mainAi !== '（无回复）' &&
    attempt.mainAi.length > 0 &&
    lastBubble.includes(attempt.mainAi.slice(0, 8)) &&
    attempt.gatewayRequests === 1 &&
    attempt.errors400 === 0
  out.assertions[`attempt ${i + 1}: hidden + mini proxy returns real text in BOTH windows`] = ok
  if (!ok) fail(`attempt ${i + 1} failed: ${JSON.stringify(attempt)}`)
}

// ---- no-regression: tool call (control_player) while hidden ------------------
{
  const before = await main.json(MAIN_STATE)
  const beforeReqs = (await mockApi('/__log')).requests.length
  await miniFresh.ev(setValue('.mini-chat-input textarea', '暂停'))
  await sleep(250)
  await miniFresh.ev(pressEnter('.mini-chat-input textarea'))
  await sleep(6000)
  const after = await main.json(MAIN_STATE)
  const miniState = await miniFresh.json(MINI_STATE)
  const log = await mockApi('/__log')
  out.toolChain = {
    isPlayingBefore: before.isPlaying,
    isPlayingAfter: after.isPlaying,
    lastAi: after.lastAi,
    gatewayRequests: log.requests.length - beforeReqs,
    errors400: log.errors400.length,
    miniChipPaused: (miniState.chips || []).some((c) => c.includes('已暂停'))
  }
  out.assertions['tool chain (control_player) works while hidden'] =
    out.toolChain.isPlayingAfter === false && out.toolChain.errors400 === 0
}

// ---- no-regression: destructive confirm bar inside the mini window -----------
{
  const before = await main.json(MAIN_STATE)
  const target = (before.trackIds || [])[0]
  await miniFresh.ev(
    setValue('.mini-chat-input textarea', `把夜跑歌单里的 ${target} 这首歌删掉`)
  )
  await sleep(250)
  await miniFresh.ev(pressEnter('.mini-chat-input textarea'))
  await sleep(6000)
  const parked = await main.json(MAIN_STATE)
  const miniState = await miniFresh.json(MINI_STATE)
  const note = { target, parkedSummary: parked.pending, hasConfirmBar: miniState.hasConfirmBar, trackIdsUnchanged: JSON.stringify(parked.trackIds) === JSON.stringify(before.trackIds) }
  // cancel it so the dev playlist is left untouched (read-only on user data)
  const cancelClicked = await miniFresh.ev(`(() => {
    const b = Array.from(document.querySelectorAll('.mini-chat-body button')).find((x) => (x.textContent || '').trim() === '取消')
    if (!b) return 'no-cancel'
    b.click()
    return 'clicked'
  })()`)
  await sleep(2500)
  const afterCancel = await main.json(MAIN_STATE)
  out.confirmChain = { ...note, cancelClicked, afterCancelPending: afterCancel.pending, afterCancelTrackIds: afterCancel.trackIds }
  out.assertions['destructive confirm bar usable inside the mini window while hidden'] =
    !!parked.pending && miniState.hasConfirmBar === true && note.trackIdsUnchanged === true && afterCancel.pending === null
}

out.liveness = { cdpUp: true, targetsAfter: (await targets()).map((t) => t.url) }
writeFileSync(`${OUT}/t50-runtime.json`, JSON.stringify(out, null, 2))
console.log(JSON.stringify({ assertions: out.assertions, attempts: out.attempts, toolChain: out.toolChain, confirmChain: out.confirmChain, errors: out.errors ?? [] }, null, 2))
const allPass = Object.values(out.assertions).every(Boolean)
main.close()
mini.close()
miniFresh.close()
console.log(`ALL ASSERTIONS PASS: ${allPass}`)
process.exit(allPass ? 0 : 1)

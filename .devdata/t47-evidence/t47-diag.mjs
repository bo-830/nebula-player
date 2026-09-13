/**
 * t47 follow-up diagnostic — why a TEXT-ONLY mini chat turn lands as '（无回复）'
 * while the main window is hidden in the tray, and whether chips reach the mini.
 *
 * Runs against the SAME dev instance (main window already hidden by the probe).
 * Usage: node .devdata/t47-evidence/t47-diag.mjs
 */
import { mkdir, writeFile } from 'fs/promises'
import { cdp, mainTarget, miniTarget, targets, sleepMs } from '../../scripts/verify-lib.mjs'

const OUT = '.devdata/t47-evidence'
await mkdir(OUT, { recursive: true })
const MOCK = 'http://127.0.0.1:9997'

const page = await cdp(mainTarget(await targets()))
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
const chatDump = () =>
  js(`JSON.stringify((() => {
    const c = window.__nebula.chat.getState()
    return {
      busy: c.busy,
      streamRawLen: (c.streamRaw || '').length,
      streamShown: c.streamShown,
      streamRawHead: (c.streamRaw || '').slice(0, 60),
      chips: c.chips,
      tail: c.messages.slice(-3).map((m) => ({ role: m.role, content: String(m.content).slice(0, 60), chips: m.chips })),
      bubbleChips: c.bubbles.slice(-3).map((b) => ({ role: b.role, chips: b.chips }))
    }
  })())`)

const out = { capturedAt: new Date().toISOString(), steps: {} }

// expand the mini (button path) if needed
out.geo = await miniJson(`JSON.stringify({
  expanded: (document.querySelector('.mini-root') || {}).getAttribute
    ? document.querySelector('.mini-root').getAttribute('data-expanded') : null,
  height: window.innerHeight
})`)
if (out.geo.expanded !== 'true') {
  await miniEv(`(() => { const b = document.querySelector('button[aria-expanded]'); if (b) b.click(); return 1 })()`)
  await sleepMs(1500)
}
out.geoAfter = await miniJson(`JSON.stringify({
  expanded: document.querySelector('.mini-root').getAttribute('data-expanded'), height: window.innerHeight
})`)

// queue shape + the chips from the earlier 暂停 turn
out.queueShape = await js(`JSON.stringify((() => {
  const p = window.__nebula.player.getState()
  return { isArray: Array.isArray(p.queue), len: p.queue.length, sample: p.queue.slice(0, 4), typeofFirst: typeof p.queue[0], currentId: p.current ? p.current.id : null }
})())`)
out.beforeVisibility = await js(`JSON.stringify({ visibilityState: document.visibilityState, hidden: document.hidden })`)
out.chatBefore = await chatDump()

// ---- hidden-window text-only turn #1
await fetch(`${MOCK}/__reset`, { method: 'POST' })
await miniEv(setValue('.mini-chat-input textarea', '请问播放器支持哪些音频格式'))
await sleepMs(250)
out.send1 = await miniEv(enter('.mini-chat-input textarea'))
await sleepMs(2000)
out.during1 = await chatDump()
await sleepMs(6000)
out.after1 = await chatDump()
out.gateway1 = await (await fetch(`${MOCK}/__log`)).json()

// ---- hidden-window text-only turn #2 (repeat, different wording)
await fetch(`${MOCK}/__reset`, { method: 'POST' })
await miniEv(setValue('.mini-chat-input textarea', '今天天气怎么样'))
await sleepMs(250)
out.send2 = await miniEv(enter('.mini-chat-input textarea'))
await sleepMs(8000)
out.after2 = await chatDump()
out.gateway2 = await (await fetch(`${MOCK}/__log`)).json()

out.miniChatDom = await miniJson(`JSON.stringify({
  msgs: Array.from(document.querySelectorAll('.mini-chat .chat-msg')).map((m) => m.className + '::' + m.innerText.trim().slice(0, 70)),
  chips: Array.from(document.querySelectorAll('.mini-chat .chat-chip')).map((c) => c.innerText.trim()).slice(0, 12)
})`)

await writeFile(`${OUT}/t47-diag.json`, JSON.stringify(out, null, 2), 'utf8')
console.log(JSON.stringify(out, null, 2))
page.close()
setTimeout(() => process.exit(0), 200)

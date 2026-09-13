/**
 * t63 — packaged-state smoke (DOM only: the packaged renderer has no `window.__nebula`).
 *
 *  1. window visibilityState at send time (packaged window is foreground ⇒ the "visible" arm
 *     the captain asked for)
 *  2. slow drip: type into the chat input, Enter, wait, read the LAST assistant bubble ⇒
 *     must be the FULL text (mock drips 3 segments 1500ms apart)
 *  3. mini window shape 360×128 → expand 360×540 → collapse 360×128 + search/chat DOM
 *  4. chat panel title must be 「薇拉 Vela」
 *
 * Usage: node .devdata/release-evidence/t63-packaged-smoke.mjs
 */
import { writeFileSync } from 'node:fs'
import { cdp, sleepMs } from '../../scripts/verify-lib.mjs'

const PORT = Number(process.env.CDP_PORT ?? 9222)
const list = async () => (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const MAIN = (l) => l.find((t) => t.type === 'page' && !t.url.includes('#mini'))
const MINI = (l) => l.find((t) => t.url.includes('#mini'))

const out = { capturedAt: new Date().toISOString(), expectedText: null }
const mainT = MAIN(await list())
out.mainUrl = mainT?.url ?? null
const page = await cdp(mainT)
const ev = (e) => page.ev(e)
const js = (e) => page.json(e)
const miniJson = async (e) => {
  const t = MINI(await list())
  if (!t) return null
  const m = await cdp(t)
  try {
    return await m.json(e)
  } finally {
    m.close()
  }
}
const miniEv = async (e) => {
  const t = MINI(await list())
  if (!t) return null
  const m = await cdp(t)
  try {
    return await m.ev(e)
  } finally {
    m.close()
  }
}

for (let i = 0; i < 20; i++) {
  if (await ev(`typeof document.querySelector === 'function'`)) break
  await sleepMs(1000)
}

// ---- 4. title
out.title = await js(`JSON.stringify((() => {
  const texts = Array.from(document.querySelectorAll('body *')).filter((n) => n.children.length === 0).map((n) => n.textContent.trim())
  return { hasVela: texts.includes('薇拉 Vela'), sample: texts.filter((t) => t.includes('薇拉')).slice(0, 3) }
})())`)

// ---- 1+2. slow drip via the packaged UI
out.beforeSend = await js(`JSON.stringify({ visibility: document.visibilityState, hasFocus: document.hasFocus() })`)
const inputSel = await js(`JSON.stringify((() => {
  const areas = Array.from(document.querySelectorAll('textarea'))
  return { count: areas.length, first: areas[0] ? (areas[0].className || areas[0].getAttribute('placeholder') || 'textarea') : null }
})())`)
out.inputSel = inputSel
const typed = await ev(`(() => {
  const el = document.querySelector('textarea')
  if (!el) return 'missing'
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, '打包态慢滴注测试')
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.focus()
  return 'ok'
})()`)
await sleepMs(400)
const sent = await ev(`(() => {
  const el = document.querySelector('textarea')
  if (!el) return 'missing'
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
  return 'ok'
})()`)
await sleepMs(14000)
const readBubbles = () =>
  js(`JSON.stringify(Array.from(document.querySelectorAll('.chat-msg.ai')).map((n) => n.innerText.trim()))`)
out.bubbles = await readBubbles()
out.lastAssistant = out.bubbles[out.bubbles.length - 1] ?? null
out.typed = typed
out.sent = sent
out.gatewayLog = await (await fetch('http://127.0.0.1:9999/__log')).json().catch(() => null)
if (out.gatewayLog?.requests?.length) {
  out.expectedText = out.gatewayLog.requests[out.gatewayLog.requests.length - 1].expectedText
}
out.slowDrip = {
  expected: out.expectedText,
  got: out.lastAssistant,
  fullText: !!out.expectedText && out.lastAssistant === out.expectedText,
  truncatedToFirstSegment: !!out.lastAssistant && !!out.expectedText && out.lastAssistant !== out.expectedText
}

// ---- 3. mini window shape
out.miniBefore = await miniJson(`JSON.stringify({
  w: window.innerWidth, h: window.innerHeight,
  expanded: (document.querySelector('.mini-root') || {}).getAttribute ? document.querySelector('.mini-root').getAttribute('data-expanded') : null,
  search: document.querySelectorAll('.mini-search-zone').length, chat: document.querySelectorAll('.mini-chat').length,
  vela: (document.querySelector('.mini-chat') || {}).innerText ? document.querySelector('.mini-chat').innerText.includes('薇拉 Vela') : null
})`)
const expand = async (want) =>
  miniEv(`(() => {
    const b = document.querySelector('button[aria-expanded]')
    if (!b) return 'missing'
    const isExp = b.getAttribute('aria-expanded') === 'true'
    if (isExp === ${want}) return 'noop'
    b.click()
    return 'clicked'
  })()`)
if (out.miniBefore && out.miniBefore.expanded !== 'true') {
  await expand(true)
  await sleepMs(1500)
}
out.miniExpanded = await miniJson(`JSON.stringify({
  w: window.innerWidth, h: window.innerHeight, expanded: document.querySelector('.mini-root').getAttribute('data-expanded'),
  search: document.querySelectorAll('.mini-search-zone').length, chat: document.querySelectorAll('.mini-chat').length,
  vela: (document.querySelector('.mini-chat') || {}).innerText ? document.querySelector('.mini-chat').innerText.includes('薇拉 Vela') : null
})`)
await expand(false)
await sleepMs(1500)
out.miniCollapsed = await miniJson(`JSON.stringify({
  w: window.innerWidth, h: window.innerHeight, expanded: document.querySelector('.mini-root').getAttribute('data-expanded'),
  search: document.querySelectorAll('.mini-search-zone').length, chat: document.querySelectorAll('.mini-chat').length
})`)

out.pass = {
  titleVela: !!out.title?.hasVela,
  visibleAtSend: out.beforeSend?.visibility === 'visible',
  slowDripFull: out.slowDrip.fullText,
  miniCollapsed360x128: out.miniBefore?.w === 360 && out.miniBefore?.h === 128,
  miniExpanded360x540: out.miniExpanded?.w === 360 && out.miniExpanded?.h === 540,
  miniRendersSearchAndChat: (out.miniExpanded?.search ?? 0) >= 1 && (out.miniExpanded?.chat ?? 0) >= 1,
  miniCollapsesBack: out.miniCollapsed?.w === 360 && out.miniCollapsed?.h === 128 && (out.miniCollapsed?.search ?? 0) === 0,
  miniTitleVela: out.miniExpanded?.vela === true
}
writeFileSync('.devdata/release-evidence/t63-packaged-smoke.json', JSON.stringify(out, null, 2), 'utf8')
console.log(JSON.stringify({ title: out.title, beforeSend: out.beforeSend, slowDrip: out.slowDrip, mini: { before: out.miniBefore, expanded: out.miniExpanded, collapsed: out.miniCollapsed }, pass: out.pass }, null, 2))
page.close()
setTimeout(() => process.exit(0), 300)

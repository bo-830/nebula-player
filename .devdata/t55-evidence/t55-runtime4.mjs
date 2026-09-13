/**
 * t55 — runtime arm 4 (post-restart, all-DOM captures with a visibility gate).
 *
 * Lesson baked in: arms 2/3 read a FROZEN renderer (`document.hidden === true`
 * made the store update but React never re-rendered, so the DOM stayed stale).
 * Every DOM capture here records `document.hidden` at read time; a capture with
 * `hidden:true` is INVALID and is reported as such instead of being trusted.
 *
 * Order matters: the main-window captures run FIRST, before the mini window is
 * shown, so they cannot be affected by the freeze that followed arm 1's
 * `miniToggle()`.
 */
import { writeFileSync } from 'fs'

const PORT = Number(process.env.CDP_PORT ?? 9222)
const MOCK_ROOT = 'http://127.0.0.1:9997'
const OUT = '.devdata/t55-evidence'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}]/gu
const emojiIn = (t) => [...String(t ?? '').matchAll(EMOJI_RE)].map((m) => m[0])

async function targets() {
  return await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
}
const isMini = (t) => t.type === 'page' && t.url.includes('#mini')
const isMain = (t) => t.type === 'page' && !t.url.includes('#mini')
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
  const raw = (method, params = {}) =>
    new Promise((resolve) => {
      const i = ++id
      pending.set(i, resolve)
      ws.send(JSON.stringify({ id: i, method, params }))
    })
  const ev = async (expr) => {
    const r = await raw('Runtime.evaluate', {
      expression: expr,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true
    })
    if (r?.result?.exceptionDetails) {
      throw new Error('page exc: ' + String(r.result.exceptionDetails.exception?.description ?? ''))
    }
    return r?.result?.result?.value
  }
  const json = async (expr) => {
    const v = await ev(expr)
    return typeof v === 'string' ? JSON.parse(v) : v
  }
  return { raw, ev, json, close: () => ws.close() }
}
const setValue = (sel, value) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)})
  if (!el) return 'missing'
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return 'ok'
})()`
const pressEnter = (sel) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)})
  if (!el) return 'missing'
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
  return 'ok'
})()`

const out = {}
const step = async (name, fn) => {
  try {
    out[name] = await fn()
    console.log(`--- ${name} OK`)
  } catch (e) {
    out[name] = { error: String(e && e.message ? e.message : e) }
    process.exitCode = 1
    console.log(`--- ${name} ERROR: ${out[name].error}`)
  }
}

const page = await cdp((await targets()).find(isMain).webSocketDebuggerUrl)
const vis = () => page.ev(`String(document.hidden)`)

/** real user path: expand the panel through its own head button */
async function expandViaButton() {
  const state = await page.ev(`JSON.stringify({
    hidden: document.hidden,
    cls: document.querySelector('.chat')?.className ?? null,
    btn: Array.from(document.querySelectorAll('.chat-head-actions .tb-btn')).map((b) => b.title)
  })`)
  const s = JSON.parse(state)
  if (!s.cls?.includes('collapsed')) return { action: 'already-expanded', state: s }
  const click = await page.ev(`(() => {
    const b = Array.from(document.querySelectorAll('.chat-head-actions .tb-btn')).find((x) => x.title === '展开聊天')
    if (!b) return 'missing'
    b.click()
    return 'clicked'
  })()`)
  await sleep(1200)
  const after = await page.ev(
    `JSON.stringify({ cls: document.querySelector('.chat')?.className ?? null, empty: !!document.querySelector('.chat-empty') })`
  )
  return { action: click, state: s, after: JSON.parse(after) }
}

await step('mainEmptyStateDom', async () => {
  const hiddenAtStart = await vis()
  await page.ev(
    `(async () => { const c = window.__nebula.chat.getState(); c.clear(); return 1 })()`
  )
  await sleep(1500)
  const expand = await expandViaButton()
  const dom = await page.json(`JSON.stringify((() => {
    const txt = (s) => { const e = document.querySelector(s); return e ? e.innerText.trim() : null }
    return {
      hidden: document.hidden,
      collapsed: window.__nebula.chat.getState().collapsed,
      chatClassName: document.querySelector('.chat')?.className ?? null,
      chatTitle: txt('.chat-title'),
      chatHint: txt('.chat-hint'),
      emptyText: txt('.chat-empty'),
      suggestions: Array.from(document.querySelectorAll('.chat-empty .chip-badge')).map((b) => b.innerText.trim()),
      textareaPlaceholder: document.querySelector('.chat-input textarea')?.placeholder ?? null
    }
  })())`)
  const before = await page.json(`JSON.stringify({ messages: window.__nebula.chat.getState().messages.length, hidden: document.hidden })`)
  const click = await page.ev(`(() => {
    const b = document.querySelector('.chat-empty .chip-badge')
    if (!b) return 'missing'
    b.click()
    return 'clicked'
  })()`)
  await sleep(1200)
  const after = await page.json(
    `JSON.stringify({ messages: window.__nebula.chat.getState().messages.length, draft: window.__nebula.chat.getState().draft, textarea: document.querySelector('.chat-input textarea')?.value ?? null, busy: window.__nebula.chat.getState().busy, hidden: document.hidden })`
  )
  await page.ev(`(async () => { window.__nebula.chat.getState().setDraft(''); return 1 })()`)
  return {
    hiddenAtStart,
    expand,
    dom,
    domValid: dom.hidden === false,
    suggestionsEmoji: emojiIn(dom.suggestions.join('')),
    suggestionClick: { click, before, after, autoSent: after.messages > before.messages }
  }
})

await step('destructiveBarDom', async () => {
  const victim = await page.json(`JSON.stringify((() => {
    const pl = window.__nebula.playlists.getState().playlists.find((x) => x.name === '夜跑')
    window.__nebula.chat.getState().clear()
    return { before: pl ? pl.trackIds.slice() : null, names: (pl ? pl.trackIds : []).map((id) => window.__nebula.library.getState().map[id]?.title ?? id) }
  })())`)
  await sleep(1500)
  await expandViaButton()
  const v = (victim.before ?? [])[0] ?? 't55-missing-id'
  await page.ev(setValue('.chat-input textarea', `把夜跑歌单里的 ${v} 这首歌删掉`))
  await sleep(200)
  await page.ev(pressEnter('.chat-input textarea'))
  let domBar = null
  for (let i = 0; i < 40; i++) {
    domBar = await page.json(`JSON.stringify((() => {
      const bar = Array.from(document.querySelectorAll('.chat-msg.ai')).find((d) => d.innerText.includes('需要你确认的破坏性操作'))
      return {
        hidden: document.hidden,
        found: !!bar,
        text: bar ? bar.innerText.replace(/\\n+/g, ' | ') : null,
        summary: bar ? (bar.children[1]?.innerText ?? '').trim() || null : null,
        buttons: bar ? Array.from(bar.querySelectorAll('button')).map((b) => b.innerText.trim()) : [],
        chips: Array.from(document.querySelectorAll('.chat-chip')).map((x) => x.innerText.trim()),
        storePending: window.__nebula.chat.getState().pendingConfirm?.toolCallId ?? null
      }
    })())`)
    if (domBar.found) break
    await sleep(400)
  }
  const summary = domBar?.summary ?? ''
  const cancel = await page.ev(`(() => {
    const bar = Array.from(document.querySelectorAll('.chat-msg.ai')).find((d) => d.innerText.includes('需要你确认的破坏性操作'))
    if (!bar) return 'no-bar'
    const b = Array.from(bar.querySelectorAll('button')).find((x) => x.innerText.trim() === '取消')
    if (!b) return 'no-btn'
    b.click()
    return 'clicked'
  })()`)
  await sleep(2500)
  const after = await page.json(`JSON.stringify((() => {
    const c = window.__nebula.chat.getState()
    const pl = window.__nebula.playlists.getState().playlists.find((x) => x.name === '夜跑')
    return {
      hidden: document.hidden,
      pending: c.pendingConfirm ? c.pendingConfirm.toolCallId : null,
      trackIds: pl ? pl.trackIds.slice() : null,
      lastMessage: c.messages.at(-1)?.content ?? null,
      messages: c.messages.length,
      barStillInDom: Array.from(document.querySelectorAll('.chat-msg.ai')).some((d) => d.innerText.includes('需要你确认的破坏性操作')),
      aiBubbles: Array.from(document.querySelectorAll('.chat-msg.ai')).map((d) => d.innerText)
    }
  })())`)
  return {
    victim: v,
    before: victim.before,
    names: victim.names,
    domBar,
    domValid: domBar?.hidden === false,
    summaryChecks: {
      summary,
      hasPlaylist: summary.includes('夜跑'),
      hasCount: /\d+\s*首/.test(summary),
      emoji: emojiIn(summary),
      cutesy: ['呀', '哦', '啦', '～', '~', '呢', '嘛', '请慢慢', '要不要'].filter((w) => summary.includes(w))
    },
    cancelClick: cancel,
    after,
    dataUnchanged: JSON.stringify(victim.before) === JSON.stringify(after.trackIds)
  }
})

await step('miniWindowDom', async () => {
  await page.ev(`(async () => { await window.api.miniToggle(); return 1 })()`)
  await sleep(2000)
  const miniTarget = (await targets()).find(isMini)
  if (!miniTarget) return { miniWindowFound: false }
  const mini = await cdp(miniTarget.webSocketDebuggerUrl)
  const click = await mini.ev(`(() => {
    const b = Array.from(document.querySelectorAll('.mini-close')).find((x) => (x.getAttribute('aria-label') || '').includes('展开'))
    if (!b) return 'missing'
    b.click()
    return 'clicked'
  })()`)
  let mounted = false
  for (let i = 0; i < 30; i++) {
    mounted = Boolean(await mini.ev(`Boolean(document.querySelector('.mini-chat'))`))
    if (mounted) break
    await sleep(400)
  }
  const dom = await mini.json(`JSON.stringify((() => {
    const txt = (s) => { const e = document.querySelector(s); return e ? e.innerText.trim() : null }
    return {
      hidden: document.hidden,
      expandedAttr: document.querySelector('.mini-root')?.getAttribute('data-expanded') ?? null,
      title: txt('.mini-chat-head'),
      emptyText: txt('.mini-chat-empty'),
      suggestions: Array.from(document.querySelectorAll('.mini-chat-suggestions button, .mini-chat-suggestions .chat-chip')).map((b) => b.innerText.trim()),
      textareaPlaceholder: document.querySelector('.mini-chat-input textarea, .mini-chat-input input')?.placeholder ?? null
    }
  })())`)
  // does the mini window mirror the parked confirmation bar?
  const miniBarNo = await mini.json(
    `JSON.stringify({ hasBar: Array.from(document.querySelectorAll('.chat-msg.ai')).some((d) => d.innerText.includes('需要你确认的破坏性操作')) })`
  )
  mini.close()
  return {
    miniWindowFound: true,
    expandClick: click,
    miniChatMounted: mounted,
    dom,
    domValid: dom.hidden === false,
    titleEmoji: emojiIn(dom.title),
    suggestionsEmoji: emojiIn(dom.suggestions.join('')),
    miniBarAtRest: miniBarNo
  }
})

writeFileSync(`${OUT}/t55-runtime4.json`, JSON.stringify(out, null, 2), 'utf8')
console.log(JSON.stringify(out, null, 2))
page.close()
setTimeout(() => process.exit(process.exitCode ?? 0), 500)

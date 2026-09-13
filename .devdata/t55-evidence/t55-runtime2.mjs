/**
 * t55 — runtime arm 2: empty-state suggestions (main) + the MINI window surface.
 *
 * Arm 1 (`t55-runtime.mjs`) captured the tone tiers, the confirm bar and the
 * failure text, but two surfaces were not reachable there:
 *   - the main window's empty state, because the chat still held messages;
 *   - the mini window's chat, because `MiniPlayer.tsx` mounts `<MiniChat/>` only
 *     while the mini window is EXPANDED (`{expanded && <MiniChat />}`).
 *
 * This arm clears the chat, expands the mini window through the real API, reads
 * both windows' titles/suggestions, and then parks a destructive call again to
 * read the confirmation bar copy in BOTH windows (the summary string is the
 * single source from `summarizeDestructiveTool`). Cancel is pressed in the MINI
 * window, so the proxy path is the one that has to keep the data intact.
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
  const ev = (expr) =>
    new Promise((resolve, reject) => {
      const i = ++id
      pending.set(i, (m) => {
        if (m.error) return reject(new Error(JSON.stringify(m.error)))
        if (m.result?.exceptionDetails) {
          return reject(
            new Error('page exc: ' + String(m.result.exceptionDetails.exception?.description ?? ''))
          )
        }
        resolve(m.result?.result?.value)
      })
      ws.send(
        JSON.stringify({
          id: i,
          method: 'Runtime.evaluate',
          params: { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true }
        })
      )
    })
  const json = async (expr) => {
    const v = await ev(expr)
    return typeof v === 'string' ? JSON.parse(v) : v
  }
  return { ev, json, close: () => ws.close() }
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

const list0 = await targets()
const page = await cdp(list0.find(isMain).webSocketDebuggerUrl)

await step('mainEmptyState', async () => {
  await page.ev(
    `(async () => { const c = window.__nebula.chat.getState(); c.clear(); c.setCollapsed(false); return 1 })()`
  )
  await sleep(800)
  const dom = await page.json(`JSON.stringify((() => {
    const txt = (s) => { const e = document.querySelector(s); return e ? e.innerText.trim() : null }
    return {
      chatTitle: txt('.chat-title'),
      chatHint: txt('.chat-hint'),
      emptyText: txt('.chat-empty'),
      suggestions: Array.from(document.querySelectorAll('.chat-empty .chip-badge')).map((b) => b.innerText.trim()),
      textareaPlaceholder: document.querySelector('.chat-input textarea')?.placeholder ?? null,
      bubbles: document.querySelectorAll('.chat-msg').length
    }
  })())`)
  const before = await page.json(
    `JSON.stringify({ messages: window.__nebula.chat.getState().messages.length, busy: window.__nebula.chat.getState().busy })`
  )
  const click = await page.ev(`(() => {
    const b = document.querySelector('.chat-empty .chip-badge')
    if (!b) return 'missing'
    b.click()
    return 'clicked'
  })()`)
  await sleep(600)
  const after = await page.json(
    `JSON.stringify({ messages: window.__nebula.chat.getState().messages.length, draft: window.__nebula.chat.getState().draft, textarea: document.querySelector('.chat-input textarea')?.value ?? null, busy: window.__nebula.chat.getState().busy })`
  )
  await page.ev(`(async () => { window.__nebula.chat.getState().setDraft(''); return 1 })()`)
  return { dom, suggestionClick: { click, before, after, autoSent: after.messages > before.messages } }
})

await step('expandMiniAndReadDom', async () => {
  const size = await page.json(
    `(async () => JSON.stringify(await window.api.miniSetExpanded(true)))()`
  )
  await sleep(2500)
  const list = await targets()
  const t = list.find(isMini)
  if (!t) return { miniWindowFound: false, urls: list.map((x) => x.url) }
  const mini = await cdp(t.webSocketDebuggerUrl)
  let ready = false
  for (let i = 0; i < 20; i++) {
    ready = Boolean(await mini.ev(`Boolean(document.querySelector('.mini-chat'))`))
    if (ready) break
    await sleep(400)
  }
  const dom = await mini.json(`JSON.stringify((() => {
    const txt = (s) => { const e = document.querySelector(s); return e ? e.innerText.trim() : null }
    return {
      miniChatMounted: !!document.querySelector('.mini-chat'),
      title: txt('.mini-chat-head'),
      emptyText: txt('.mini-chat-empty'),
      suggestions: Array.from(document.querySelectorAll('.mini-chat-suggestions button, .mini-chat-suggestions .chat-chip')).map((b) => b.innerText.trim()),
      textareaPlaceholder: document.querySelector('.mini-chat-input textarea, .mini-chat-input input')?.placeholder ?? null,
      titleEmoji: null,
      bodyHead: (document.body.innerText || '').slice(0, 200)
    }
  })())`)
  dom.titleEmoji = emojiIn(dom.title)
  dom.suggestionsEmoji = emojiIn(dom.suggestions.join(''))
  return { expandedSize: size, miniWindowFound: true, miniChatReady: ready, dom }
})

await step('miniSuggestionClick', async () => {
  const list = await targets()
  const mini = await cdp(list.find(isMini).webSocketDebuggerUrl)
  const before = await page.json(
    `JSON.stringify({ messages: window.__nebula.chat.getState().messages.length, draft: window.__nebula.chat.getState().draft })`
  )
  const click = await mini.ev(`(() => {
    const b = document.querySelector('.mini-chat-suggestions .chat-chip, .mini-chat-suggestions button')
    if (!b) return 'missing'
    b.click()
    return 'clicked'
  })()`)
  await sleep(800)
  const miniVal = await mini.ev(
    `document.querySelector('.mini-chat-input textarea, .mini-chat-input input')?.value ?? null`
  )
  const after = await page.json(
    `JSON.stringify({ messages: window.__nebula.chat.getState().messages.length, draft: window.__nebula.chat.getState().draft, busy: window.__nebula.chat.getState().busy })`
  )
  mini.close()
  return { click, mainBefore: before, mainAfter: after, miniTextareaValue: miniVal, autoSent: after.messages > before.messages }
})

await step('miniConfirmBar', async () => {
  const victim = await page.json(`JSON.stringify((() => {
    const pl = window.__nebula.playlists.getState().playlists.find((x) => x.name === '夜跑')
    const before = pl ? pl.trackIds.slice() : null
    window.__nebula.chat.getState().clear()
    return { before }
  })())`)
  await sleep(700)
  const v = (victim.before ?? [])[0] ?? 't55-missing-id'
  await page.ev(setValue('.chat-input textarea', `把夜跑歌单里的 ${v} 这首歌删掉`))
  await sleep(120)
  await page.ev(pressEnter('.chat-input textarea'))
  let parked = null
  for (let i = 0; i < 40; i++) {
    const st = await page.json(
      `JSON.stringify({ busy: window.__nebula.chat.getState().busy, pending: window.__nebula.chat.getState().pendingConfirm?.toolCallId ?? null })`
    )
    if (st.pending) {
      parked = st
      break
    }
    await sleep(300)
  }
  await sleep(900)

  const barOf = (sel) => `JSON.stringify((() => {
    const bar = Array.from(document.querySelectorAll(${JSON.stringify(sel)})).find((d) => d.innerText.includes('需要你确认的破坏性操作'))
    return {
      text: bar ? bar.innerText.replace(/\\n+/g, ' | ') : null,
      summary: bar ? bar.children[1]?.innerText?.trim() ?? null : null,
      buttons: bar ? Array.from(bar.querySelectorAll('button')).map((b) => b.innerText.trim()) : []
    }
  })())`

  const mainBar = await page.json(barOf('.chat-msg.ai'))
  const mini = await cdp((await targets()).find(isMini).webSocketDebuggerUrl)
  const miniBar = await mini.json(barOf('.chat-msg.ai'))
  const miniSummary = await mini.json(
    `JSON.stringify({ pendingText: (document.querySelector('.mini-chat')?.innerText ?? '').slice(0, 300) })`
  )
  // press 取消 in the MINI window
  const clicked = await mini.ev(`(() => {
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
    return { pending: c.pendingConfirm ? c.pendingConfirm.toolCallId : null, trackIds: pl ? pl.trackIds.slice() : null, lastMessage: c.messages.at(-1)?.content ?? null, busy: c.busy }
  })())`)
  const miniAfter = await mini.json(
    `JSON.stringify({ stillHasBar: (document.querySelector('.mini-chat')?.innerText ?? '').includes('需要你确认的破坏性操作') })`
  )
  mini.close()
  return {
    victim: v,
    before: victim.before,
    parked,
    mainBar,
    miniBar,
    mainBarSummaryEmoji: emojiIn(mainBar.summary ?? ''),
    miniBarSummaryEmoji: emojiIn(miniBar.summary ?? ''),
    summariesIdentical: mainBar.summary === miniBar.summary && Boolean(mainBar.summary),
    miniSummary,
    cancelClickedInMini: clicked,
    after,
    miniBarGoneAfterCancel: !miniAfter.stillHasBar,
    dataUnchanged: JSON.stringify(victim.before) === JSON.stringify(after.trackIds)
  }
})

const wire = await (await fetch(`${MOCK_ROOT}/__log`)).json()
out.wireSummary = {
  requests: wire.requests.length,
  emitted: wire.requests.flatMap((r) => r.emitted),
  errors400: wire.errors400
}

writeFileSync(`${OUT}/t55-runtime2.json`, JSON.stringify(out, null, 2), 'utf8')
console.log(JSON.stringify(out, null, 2))
page.close()
setTimeout(() => process.exit(process.exitCode ?? 0), 500)

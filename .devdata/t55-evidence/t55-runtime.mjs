/**
 * t55 — runtime evidence for the 薇拉 Vela persona verification.
 *
 * Requires: `npm run dev` (CDP 9222) + `.devdata/t55-evidence/mock-llm-t55.mjs` on 9997.
 * Writes .devdata/t55-evidence/t55-runtime.json + t55-wire-system-prompt.txt
 *
 * PROVENANCE RULE: every assistant bubble text produced here comes from the mock
 * gateway (see mock-llm-t55.mjs), NOT from a model. The run therefore proves
 *   (a) the persona prompt is really on the wire, verbatim, on every round;
 *   (b) how the APP-authored copy behaves (confirm bar, chips, failure text, titles);
 *   (c) whether the app clamps/tones anything itself (it must not — and the
 *       OVERCAP arm measures exactly that).
 * It does NOT prove that a model obeys the prompt.
 */
import { writeFileSync, mkdirSync } from 'fs'
import { createHash } from 'crypto'

const PORT = Number(process.env.CDP_PORT ?? 9222)
const MOCK = 'http://127.0.0.1:9997/v1'
const MOCK_ROOT = 'http://127.0.0.1:9997'
const DEAD = 'http://127.0.0.1:9996/v1'
const OUT = '.devdata/t55-evidence'

mkdirSync(OUT, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sha1 = (s) => createHash('sha1').update(s, 'utf8').digest('hex')
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}]/gu
const emojiIn = (t) => [...String(t ?? '').matchAll(EMOJI_RE)].map((m) => m[0])
const vsCount = (t) => [...String(t ?? '')].filter((c) => c === '\uFE0F').length
const nonEmptyLines = (t) => String(t ?? '').split('\n').filter((l) => l.trim()).length

// ---------- CDP plumbing ------------------------------------------------------
async function targets() {
  return await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
}
const isMain = (t) => t.type === 'page' && !t.url.includes('#mini') && t.url.includes('1')
const isMini = (t) => t.type === 'page' && t.url.includes('#mini')

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
            new Error(
              'page exc: ' + String(m.result.exceptionDetails.exception?.description ?? '')
            )
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
    if (v === undefined) return undefined
    return typeof v === 'string' ? JSON.parse(v) : v
  }
  return { ev, json, close: () => ws.close() }
}

/** React-safe value set + Enter, i.e. the real user path (never a store call) */
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

const mockApi = async (path, method = 'GET') => (await fetch(`${MOCK_ROOT}${path}`, { method })).json()

const results = {}
const step = async (name, fn) => {
  try {
    results[name] = await fn()
    console.log(`--- ${name} OK`)
  } catch (e) {
    results[name] = { error: String(e && e.message ? e.message : e) }
    process.exitCode = 1
    console.log(`--- ${name} ERROR: ${results[name].error}`)
  }
}

const list = await targets()
console.log('targets: ' + JSON.stringify(list.map((t) => t.url)))
const page = await cdp(list.find(isMain).webSocketDebuggerUrl)

const waitIdle = async (ms = 20000) => {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    const st = await page.json(
      `JSON.stringify({ busy: window.__nebula.chat.getState().busy, pending: window.__nebula.chat.getState().pendingConfirm?.toolCallId ?? null })`
    )
    if (!st.busy && !st.pending) return st
    await sleep(300)
  }
  return { timeout: true }
}

const waitPending = async (ms = 15000) => {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    const st = await page.json(
      `JSON.stringify({ busy: window.__nebula.chat.getState().busy, pending: window.__nebula.chat.getState().pendingConfirm?.toolCallId ?? null })`
    )
    if (st.pending) return st
    await sleep(300)
  }
  return { timeout: true }
}

async function sendFromUi(text, sel = '.chat-input textarea') {
  const a = await page.ev(setValue(sel, text))
  await sleep(120)
  const b = await page.ev(pressEnter(sel))
  return `${a}/${b}`
}

/** snapshot of the main-window chat surface (DOM + store) */
const chatSnapshot = (extra = '{}') => `JSON.stringify((() => {
  const c = window.__nebula.chat.getState()
  const aiBubbles = Array.from(document.querySelectorAll('.chat-msg.ai')).map((d) => d.innerText)
  const bar = Array.from(document.querySelectorAll('.chat-msg.ai')).find((d) => d.innerText.includes('需要你确认的破坏性操作'))
  const p = window.__nebula.player.getState()
  const pl = window.__nebula.playlists.getState().playlists.find((x) => x.name === '夜跑')
  return {
    pending: c.pendingConfirm ? { toolCallId: c.pendingConfirm.toolCallId, name: c.pendingConfirm.name, summary: c.pendingConfirm.summary } : null,
    busy: c.busy,
    chips: c.chips,
    bubbles: c.bubbles.map((b) => ({ role: b.role, content: b.content, chips: b.chips })),
    lastMessage: c.messages.at(-1)?.content ?? null,
    messages: c.messages.length,
    aiBubbles,
    confirmBarText: bar ? bar.innerText.replace(/\\n+/g, ' | ') : null,
    confirmBarButtons: bar ? Array.from(bar.querySelectorAll('button')).map((x) => x.innerText.trim()) : [],
    chatChips: Array.from(document.querySelectorAll('.chat-chip')).map((x) => x.innerText.trim()),
    playing: p.isPlaying,
    current: p.current ? p.current.title : null,
    playlistTrackIds: pl ? pl.trackIds.slice() : null,
    extra: ${extra}
  }
})())`

// ---------- 0. preflight ------------------------------------------------------
await step('preflight', async () => {
  const cfg = await page.json(
    `(async () => JSON.stringify({ before: await window.api.settingsGet() }))()`
  )
  const applied = await page.json(
    `(async () => { await window.api.settingsSetApi({ baseURL: ${JSON.stringify(MOCK)}, model: 'deepseek-v4-flash', apiKey: 't55-verify-key' });
      return JSON.stringify({ after: (await window.api.settingsGet()).api }) })()`
  )
  const seeded = await page.json(`(async () => {
    await window.__nebula.playlists.getState().load()
    await window.__nebula.library.getState().load()
    window.__nebula.chat.getState().setCollapsed(false)
    window.__nebula.chat.getState().clear()
    const lib = window.__nebula.library.getState().tracks
    const ids = lib.slice(0, 2).map((t) => t.id)
    const ps = window.__nebula.playlists.getState()
    let pl = ps.playlists.find((p) => p.name === '夜跑')
    if (!pl) pl = ps.create('夜跑')
    if (ids.length) ps.addTracks(pl.id, ids)
    await new Promise((r) => setTimeout(r, 600))
    const now = window.__nebula.playlists.getState().playlists.find((p) => p.id === pl.id)
    return JSON.stringify({ libraryTracks: lib.length, seededIds: ids, seededNames: lib.slice(0, 2).map((t) => t.title), playlistId: pl.id, trackIds: now.trackIds })
  })()`)
  await mockApi('/__reset', 'POST')
  return { cfg, applied, seeded }
})

// ---------- 1. exec-class tier (暂停) ----------------------------------------
await step('execTier', async () => {
  await page.ev(`(async () => { const c = window.__nebula.chat.getState(); c.clear(); c.setCollapsed(false); return 1 })()`)
  await sleep(500)
  const sent = await sendFromUi('暂停')
  await waitIdle()
  await sleep(900)
  const snap = await page.json(chatSnapshot())
  const wire = await mockApi('/__log')
  return {
    sent,
    snapshot: snap,
    gateway: {
      requests: wire.requests.length,
      emitted: wire.requests.flatMap((r) => r.emitted),
      lastUser: wire.requests.map((r) => String(r.messages.filter((m) => m.role === 'user').at(-1)?.content ?? '')).at(-1),
      toolResults: wire.requests
        .flatMap((r) => r.messages.filter((m) => m.role === 'tool').map((m) => String(m.content).slice(0, 160)))
    },
    bubbleEmoji: emojiIn(snap.lastMessage),
    chipEmoji: emojiIn((snap.chips ?? []).join(''))
  }
})

// ---------- 2. chat/recommend tier (推荐) ------------------------------------
await step('chatTier', async () => {
  await page.ev(`(async () => { const c = window.__nebula.chat.getState(); c.clear(); return 1 })()`)
  await sleep(500)
  const sent = await sendFromUi('推荐几首适合雨天的歌')
  await waitIdle()
  await sleep(900)
  const snap = await page.json(chatSnapshot())
  return {
    sent,
    snapshot: snap,
    gatewayText: '（网关脚本产生，非模型输出）',
    bubbleEmoji: emojiIn(snap.lastMessage),
    emojiCount: emojiIn(snap.lastMessage).length,
    nonEmptyLines: nonEmptyLines(snap.lastMessage)
  }
})

// ---------- 3. OVERCAP arm: does the app clamp emoji itself? ------------------
await step('overCapProbe', async () => {
  await page.ev(`(async () => { const c = window.__nebula.chat.getState(); c.clear(); return 1 })()`)
  await sleep(500)
  const sent = await sendFromUi('OVERCAP 这条用来测量应用侧是否有 emoji 上限')
  await waitIdle()
  await sleep(900)
  const snap = await page.json(chatSnapshot())
  const emojis = emojiIn(snap.lastMessage)
  return {
    sent,
    snapshot: snap,
    bubbleEmoji: emojis,
    emojiCount: emojis.length,
    note: '网关故意回了 5 个 emoji：若应用侧有「单条 ≤2」的实现，这里应被裁剪或拦截；实测未被裁剪 ⇒ 上限只存在于提示词中（应用不保证）'
  }
})

// ---------- 4. destructive tier: park → DOM confirm bar → cancel --------------
await step('destructiveTier', async () => {
  const before = await page.json(`JSON.stringify((() => {
    const c = window.__nebula.chat.getState()
    c.clear()
    const pl = window.__nebula.playlists.getState().playlists.find((x) => x.name === '夜跑')
    const lib = window.__nebula.library.getState()
    return {
      trackIds: pl ? pl.trackIds.slice() : null,
      names: (pl ? pl.trackIds : []).map((id) => lib.map[id]?.title ?? id)
    }
  })())`)
  await sleep(500)
  const victim = (before.trackIds ?? [])[0] ?? 't55-missing-id'
  const sent = await sendFromUi(`把夜跑歌单里的 ${victim} 这首歌删掉`)
  const parked = await waitPending()
  await sleep(700)
  const snap = await page.json(chatSnapshot())
  const emojis = emojiIn(snap.pending?.summary ?? '')
  const summary = snap.pending?.summary ?? ''
  // real DOM click on 取消
  const cancelClick = await page.ev(`(() => {
    const bar = Array.from(document.querySelectorAll('.chat-msg.ai')).find((d) => d.innerText.includes('需要你确认的破坏性操作'))
    if (!bar) return 'no-bar'
    const btn = Array.from(bar.querySelectorAll('button')).find((b) => b.innerText.trim() === '取消')
    if (!btn) return 'no-btn'
    btn.click()
    return 'clicked'
  })()`)
  await waitIdle()
  await sleep(1000)
  const after = await page.json(chatSnapshot())
  const wire = await mockApi('/__log')
  return {
    sent,
    victim,
    before,
    parked,
    parkedSnapshot: snap,
    summaryChecks: {
      summary,
      containsPlaylist: summary.includes('夜跑'),
      containsCount: /\d+\s*首/.test(summary),
      emoji: emojis,
      emojiCount: emojis.length,
      cutesyWords: ['呀', '哦', '啦', '～', '~', '呢', '嘛'].filter((w) => summary.includes(w))
    },
    cancelClick,
    after: { playlistTrackIds: after.playlistTrackIds, pending: after.pending, lastMessage: after.lastMessage, messages: after.messages },
    dataUnchanged: JSON.stringify(before.trackIds) === JSON.stringify(after.playlistTrackIds),
    gatewayCancelToolResult: wire.requests
      .flatMap((r) => r.messages.filter((m) => m.role === 'tool').map((m) => String(m.content)))
      .filter((c) => c.includes('用户已取消'))
  }
})

// ---------- 5. titles + suggestions (main window DOM) -------------------------
await step('titlesMain', async () => {
  const dom = await page.json(`JSON.stringify((() => {
    const txt = (s) => { const e = document.querySelector(s); return e ? e.innerText.trim() : null }
    return {
      chatTitle: txt('.chat-title'),
      chatHint: txt('.chat-hint'),
      emptyText: txt('.chat-empty'),
      suggestions: Array.from(document.querySelectorAll('.chat-empty .chip-badge')).map((b) => b.innerText.trim()),
      textareaPlaceholder: document.querySelector('.chat-input textarea')?.placeholder ?? null
    }
  })())`)
  // clicking a suggestion must only fill the textarea (never send)
  const before = await page.json(
    `JSON.stringify({ messages: window.__nebula.chat.getState().messages.length })`
  )
  const click = await page.ev(`(() => {
    const b = document.querySelector('.chat-empty .chip-badge')
    if (!b) return 'missing'
    b.click()
    return 'clicked'
  })()`)
  await sleep(500)
  const after = await page.json(
    `JSON.stringify({ messages: window.__nebula.chat.getState().messages.length, draft: window.__nebula.chat.getState().draft, textarea: document.querySelector('.chat-input textarea')?.value ?? null, busy: window.__nebula.chat.getState().busy })`
  )
  return { dom, suggestionClick: { click, before, after } }
})

// ---------- 6. mini window DOM ------------------------------------------------
await step('titlesMini', async () => {
  let listNow = await targets()
  if (!listNow.find(isMini)) {
    await page.ev(`(async () => { await window.api.miniToggle(); return 1 })()`)
    await sleep(2500)
    listNow = await targets()
  }
  const t = listNow.find(isMini)
  if (!t) return { miniWindowFound: false, urls: listNow.map((x) => x.url) }
  const mini = await cdp(t.webSocketDebuggerUrl)
  const dom = await mini.json(`JSON.stringify((() => {
    const txt = (s) => { const e = document.querySelector(s); return e ? e.innerText.trim() : null }
    return {
      title: txt('.mini-chat-head'),
      empty: txt('.mini-chat-empty'),
      suggestions: Array.from(document.querySelectorAll('.mini-chat-suggestions button, .mini-chat-suggestions .chip-badge')).map((b) => b.innerText.trim()),
      textareaPlaceholder: document.querySelector('.mini-chat-input textarea, .mini-chat-input input')?.placeholder ?? null,
      hasMiniChat: !!document.querySelector('.mini-chat')
    }
  })())`)
  mini.close()
  return { miniWindowFound: true, dom }
})

// ---------- 7. failure tier (dead baseURL) ------------------------------------
await step('failureTier', async () => {
  await page.ev(
    `(async () => { await window.api.settingsSetApi({ baseURL: ${JSON.stringify(DEAD)}, model: 'deepseek-v4-flash', apiKey: 't55-verify-key' }); return 1 })()`
  )
  await page.ev(`(async () => { const c = window.__nebula.chat.getState(); c.clear(); return 1 })()`)
  await sleep(500)
  const sent = await sendFromUi('随便放首歌来听')
  await waitIdle(15000)
  await sleep(900)
  const snap = await page.json(chatSnapshot())
  const text = snap.lastMessage ?? ''
  const emojis = emojiIn(text)
  // restore the mock endpoint so the in-app state is consistent again
  await page.ev(
    `(async () => { await window.api.settingsSetApi({ baseURL: ${JSON.stringify(MOCK)}, model: 'deepseek-v4-flash', apiKey: 't55-verify-key' }); return 1 })()`
  )
  return {
    sent,
    settingsBeforeFailure: { baseURL: DEAD },
    text,
    nonEmptyLines: nonEmptyLines(text),
    emoji: emojis,
    emojiCount: emojis.length,
    leadingPictograph: /^\u26A0/.test(text) ? '⚠(U+26A0)' : null,
    containsPointer: text.includes('设置 → AI 配置'),
    containsKeyHint: text.includes('接口地址、API Key 与网络连接'),
    selfPity: ['对不起对不起', '抱歉抱歉', '实在不好意思'].filter((w) => text.includes(w)),
    impossiblePromise: ['马上就好', '立刻恢复', '保证', '一定帮你'].filter((w) => text.includes(w)),
    domBubble: snap.aiBubbles.at(-1) ?? null,
    settingsRestoredTo: MOCK
  }
})

// ---------- 8. wire capture of the persona prompt -----------------------------
await step('wireSystemPrompt', async () => {
  const wire = await mockApi('/__log')
  const systems = wire.requests.map((r) => String(r.messages.find((m) => m.role === 'system')?.content ?? ''))
  const uniq = [...new Set(systems)]
  const prompt = uniq[0] ?? ''
  writeFileSync(`${OUT}/t55-wire-system-prompt.txt`, prompt, 'utf8')
  const rules = {
    name: prompt.includes('薇拉 Vela'),
    execTier: prompt.includes('执行类指令只回一句结果：先给结论，不寒暄'),
    execExample: prompt.includes('例如「已暂停。下一首是《X》」'),
    chatTier: prompt.includes('可以卖萌、可以用 emoji（仅此类回复，单条最多 1–2 个）'),
    destructiveTier: prompt.includes('破坏性操作必须直白，禁止软化、禁止卖萌、禁止 emoji'),
    failTier: prompt.includes('失败与能力边界：一句话说明原因，再加一句指路'),
    failPointer: prompt.includes('设置 → AI 配置'),
    noPromise: prompt.includes('不要承诺做不到的事'),
    selfRef: prompt.includes('自称「我」，称用户「你」')
  }
  const occurrences = (needle) => {
    const out = []
    let i = prompt.indexOf(needle)
    while (i >= 0) {
      out.push(prompt.slice(Math.max(0, i - 18), i + needle.length + 8))
      i = prompt.indexOf(needle, i + 1)
    }
    return out
  }
  return {
    requests: wire.requests.length,
    requestsWithSystem: systems.filter(Boolean).length,
    distinctSystemPrompts: uniq.length,
    promptSha1: sha1(prompt),
    promptBytes: Buffer.byteLength(prompt, 'utf8'),
    promptChars: prompt.length,
    promptEmoji: emojiIn(prompt),
    rules,
    forbiddenAppellationOccurrences: {
      '主人': occurrences('主人'),
      '亲爱的': occurrences('亲爱的')
    },
    errors400: wire.errors400,
    perRequestSystemSha1: systems.map((s) => sha1(s).slice(0, 12))
  }
})

console.log(JSON.stringify(results, null, 2))
writeFileSync(`${OUT}/t55-runtime.json`, JSON.stringify(results, null, 2), 'utf8')
page.close()
setTimeout(() => process.exit(process.exitCode ?? 0), 500)

/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS E2E probe (not shipped TS source); the rule targets typed TS modules.
 * If eslint.config.mjs later scopes this rule away from scripts/**, this
 * directive becomes redundant and can be deleted. */
/**
 * t6 — verification probe for the destructive-tool confirmation flow (task t3).
 *
 * Evidence collected:
 *   1. a destructive tool call is NOT executed on the first model round
 *      (playlist unchanged) and the confirmation bar appears with a summary
 *   2. 「确认执行」 → the real tool runs, the parked turn continues, and the gateway
 *      accepts the follow-up (no 400, one tool message per tool_call_id)
 *   3. 「取消」 → nothing is executed and the model is told the user cancelled
 *   4. the non-destructive search→play chain still auto-executes (no confirmation)
 *
 * Requires:
 *   node scripts/mock-llm-confirm.mjs 9998 .devdata/mock-confirm-log.json
 *   npm run dev  (CDP 9222)
 *
 * Run: node scripts/verify-ai-confirm.mjs
 */
import { cdp, mainTarget, targets, sleepMs } from './verify-lib.mjs'

const MOCK = process.env.MOCK_URL ?? 'http://127.0.0.1:9998/v1'

const list = await targets()
const page = await cdp(mainTarget(list))
const results = {}

const mock = async (path) =>
  (
    await fetch(`http://127.0.0.1:9998${path}`, { method: path === '/__log' ? 'GET' : 'POST' })
  ).json()

/** wait until the chat turn settles (busy false and no pending confirm) */
async function waitIdle(ms = 15000) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    const st = await page.json(
      `JSON.stringify({ busy: window.__nebula.chat.getState().busy, pending: window.__nebula.chat.getState().pendingConfirm?.toolCallId ?? null })`
    )
    if (!st.busy && !st.pending) return st
    await sleepMs(400)
  }
  return { timeout: true }
}

const step = async (name, fn) => {
  try {
    results[name] = await fn()
  } catch (e) {
    results[name] = { error: String(e && e.message ? e.message : e) }
    process.exitCode = 1
  }
}

/** make sure the chat panel is expanded so the confirmation bar is rendered */
async function ensureChatOpen() {
  await page.ev(`(async () => { window.__nebula.chat.getState().setCollapsed(false); return 1 })()`)
  await sleepMs(400)
}

/** dump what the chat UI currently shows (diagnostic for a missing button) */
async function chatDiagnosis() {
  return page.json(`JSON.stringify((() => {
    const c = window.__nebula.chat.getState()
    const btns = Array.from(document.querySelectorAll('.chat button')).map((b) => b.innerText.trim())
    return {
      collapsed: c.collapsed,
      busy: c.busy,
      pending: c.pendingConfirm,
      chatExists: !!document.querySelector('.chat'),
      confirmBarMarkup: !!Array.from(document.querySelectorAll('.chat div')).find((d) => d.innerText.includes('需要你确认的破坏性操作')),
      buttons: btns,
      bubbles: c.bubbles.map((b) => ({ role: b.role, content: b.content.slice(0, 120), chips: b.chips })),
      messages: c.messages.map((m) => ({ role: m.role, content: m.content.slice(0, 160) }))
    }
  })())`)
}

// ---------- preflight: point the app at the mock + seed a playlist ----------
await step('preflight', async () => {
  await page.ev(
    `(async () => {
      await window.api.settingsSetApi({ baseURL: ${JSON.stringify(MOCK)}, model: 'deepseek-v4-flash', apiKey: 'test-key' })
      await window.__nebula.playlists.getState().load()
      await window.__nebula.library.getState().load()
      // the confirmation bar only renders while the chat panel is expanded
      window.__nebula.chat.getState().setCollapsed(false)
      window.__nebula.chat.getState().clear()
      return { busy: window.__nebula.chat.getState().busy, pending: window.__nebula.chat.getState().pendingConfirm?.toolCallId ?? null }
    })()`
  )
  await sleepMs(700)
  const seeded = await page.json(`(async () => {
    const api = window.__nebula.playlists
    const lib = window.__nebula.library.getState().tracks
    const ids = lib.slice(0, 2).map((t) => t.id)
    let pl = api.getState().playlists.find((p) => p.name === '夜跑')
    if (!pl) pl = api.getState().create('夜跑')
    api.getState().addTracks(pl.id, ids)
    await new Promise((r) => setTimeout(r, 500))
    const now = api.getState().playlists.find((p) => p.id === pl.id)
    return JSON.stringify({ playlistId: pl.id, seededIds: ids, trackIds: now.trackIds, names: lib.slice(0, 2).map((t) => t.title) })
  })()`)
  await mock('/__reset')
  const cfg = await page.json(
    `(async () => JSON.stringify({ model: (await window.api.settingsGet()).api.model, baseURL: (await window.api.settingsGet()).api.baseURL }))()`
  )
  return { seeded, cfg }
})

// ---------- 1+2. destructive → confirm ----------
await step('confirmPath', async () => {
  await ensureChatOpen()
  const confirmId = results.preflight.seeded.seededIds[0]
  await page.ev(
    `(async () => {
      const c = window.__nebula.chat.getState()
      c.clear()
      await new Promise((r) => setTimeout(r, 500))
      c.setDraft(${JSON.stringify(`把夜跑歌单里的 ${confirmId} 这首歌删掉`)})
      return 1
    })()`
  )
  await page.ev(
    `(async () => {
      window.__nebula.chat.getState().setDraft(${JSON.stringify(`把夜跑歌单里的 ${confirmId} 这首歌删掉`)})
      window.__nebula.chat.getState().send()
      return 1
    })()`
  )
  await sleepMs(3500)

  const parked = await page.json(`JSON.stringify((() => {
    const c = window.__nebula.chat.getState()
    const pl = window.__nebula.playlists.getState().playlists.find((p) => p.name === '夜跑')
    const bar = document.querySelector('.chat-msg.ai')
    const buttons = Array.from(document.querySelectorAll('.chat button.btn')).map((b) => b.innerText.trim())
    return {
      pending: c.pendingConfirm ? { toolCallId: c.pendingConfirm.toolCallId, name: c.pendingConfirm.name, summary: c.pendingConfirm.summary } : null,
      busy: c.busy,
      trackIds: pl ? pl.trackIds : null,
      confirmBarText: bar ? bar.innerText.replace(/\\n+/g, ' | ') : null,
      buttons,
      chips: c.chips
    }
  })())`)

  // press 确认执行 in the UI
  const clickResult = await page.ev(`(async () => {
    const btn = Array.from(document.querySelectorAll('.chat button.btn')).find((b) => b.innerText.trim() === '确认执行')
    if (!btn) return 'missing'
    btn.click()
    return 'clicked'
  })()`)
  if (clickResult !== 'clicked') {
    return { parked, clickResult, diagnosis: await chatDiagnosis() }
  }
  await waitIdle(20000)
  await sleepMs(1200)

  const after = await page.json(`JSON.stringify((() => {
    const c = window.__nebula.chat.getState()
    const pl = window.__nebula.playlists.getState().playlists.find((p) => p.name === '夜跑')
    return {
      trackIds: pl ? pl.trackIds : null,
      pending: !!c.pendingConfirm,
      busy: c.busy,
      lastMessage: c.messages[c.messages.length - 1]?.content ?? null,
      chips: c.chips
    }
  })())`)

  const log = await mock('/__log')
  return {
    parked,
    after,
    gateway: {
      requests: log.requests.length,
      errors400: log.errors400,
      transcript: log.requests.map((r) =>
        r.messages
          .map((m) =>
            m.tool_calls
              ? `assistant.tool_calls(${m.tool_calls.map((t) => t.name + '#' + t.id).join(',')})`
              : m.role === 'tool'
                ? `tool(${m.tool_call_id}):${String(m.content).slice(0, 40)}`
                : m.role
          )
          .flat()
      )
    }
  }
})

// ---------- 3. destructive → cancel ----------
await step('cancelPath', async () => {
  await mock('/__reset')
  await ensureChatOpen()
  const seeded = results.preflight.seeded
  await page.ev(
    `(async () => {
      const store = window.__nebula.playlists.getState()
      const pl = store.playlists.find((p) => p.name === '夜跑')
      store.addTracks(pl.id, ${JSON.stringify(seeded.seededIds)})
      window.__nebula.chat.getState().clear()
      await new Promise((r) => setTimeout(r, 600))
      window.__nebula.chat.getState().setDraft(${JSON.stringify(`把夜跑歌单里的 ${seeded.seededIds[0]} 这首歌删掉`)})
      window.__nebula.chat.getState().send()
      return 1
    })()`
  )
  await sleepMs(3500)
  const parked = await page.json(`JSON.stringify((() => {
    const c = window.__nebula.chat.getState()
    const pl = window.__nebula.playlists.getState().playlists.find((p) => p.name === '夜跑')
    return { pending: !!c.pendingConfirm, trackIds: pl ? pl.trackIds : null }
  })())`)

  const cancelClick = await page.ev(`(async () => {
    const btn = Array.from(document.querySelectorAll('.chat button.btn')).find((b) => b.innerText.trim() === '取消')
    if (!btn) return 'missing'
    btn.click()
    return 'clicked'
  })()`)
  if (cancelClick !== 'clicked') {
    return { parked, cancelClick, diagnosis: await chatDiagnosis() }
  }
  await waitIdle(20000)
  await sleepMs(1200)

  const after = await page.json(`JSON.stringify((() => {
    const c = window.__nebula.chat.getState()
    const pl = window.__nebula.playlists.getState().playlists.find((p) => p.name === '夜跑')
    return {
      trackIds: pl ? pl.trackIds : null,
      pending: !!c.pendingConfirm,
      busy: c.busy,
      lastMessage: c.messages[c.messages.length - 1]?.content ?? null,
      chips: c.chips
    }
  })())`)
  const log = await mock('/__log')
  return {
    parked,
    after,
    gateway: {
      requests: log.requests.length,
      errors400: log.errors400,
      lastToolContent:
        log.requests.flatMap((r) => r.messages.filter((m) => m.role === 'tool')).slice(-1)[0]
          ?.content ?? null
    }
  }
})

// ---------- 4. non-destructive chain stays automatic ----------
await step('nonDestructiveChain', async () => {
  await mock('/__reset')
  await page.ev(`(async () => {
    window.__nebula.chat.getState().clear()
    await new Promise((r) => setTimeout(r, 600))
    window.__nebula.chat.getState().setDraft('随便放首歌来听')
    window.__nebula.chat.getState().send()
    return 1
  })()`)
  await waitIdle(20000)
  await sleepMs(1500)
  const after = await page.json(`JSON.stringify((() => {
    const c = window.__nebula.chat.getState()
    const p = window.__nebula.player.getState()
    return {
      pending: !!c.pendingConfirm,
      busy: c.busy,
      playing: p.isPlaying,
      current: p.current ? p.current.title : null,
      queueLen: p.queue.length,
      lastMessage: c.messages[c.messages.length - 1]?.content ?? null,
      chips: c.chips
    }
  })())`)
  const log = await mock('/__log')
  return {
    after,
    gateway: {
      requests: log.requests.length,
      errors400: log.errors400,
      tools: log.requests
        .flatMap((r) => r.messages)
        .flatMap((m) => (m.tool_calls ?? []).map((t) => t.name))
    }
  }
})

console.log(JSON.stringify(results, null, 2))
page.close()
setTimeout(() => process.exit(process.exitCode ?? 0), 400)

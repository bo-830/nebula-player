/**
 * E2E: configure wrong model → test → expect extracted model suggestions;
 * then pick the suggested model → chat completes (tool call) against mock.
 * Usage: node scripts/diag-model-suggest.mjs
 */
const PORT = 9222
const res = await fetch(`http://127.0.0.1:${PORT}/json`)
const list = await res.json()
const page = list.find((t) => t.type === 'page' && t.url.includes('localhost:5173'))
if (!page) throw new Error('dev page not found')

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = reject
})
let id = 0
const pending = new Map()
ws.onmessage = (evMsg) => {
  const m = JSON.parse(evMsg.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result)
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
  const r = await raw('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  return r?.result?.value ?? r
}

await ev(`(async () => {
  await window.api.settingsSetApi({ baseURL: 'http://127.0.0.1:9999/v1', model: 'deepseek', apiKey: 'sk-x' })
  return 'set'
})()`)

const bad = JSON.parse(
  await ev(`(async () => {
    const r = await window.api.settingsTestApi()
    return JSON.stringify(r)
  })()`)
)
console.log('testApi (bad model):', JSON.stringify(bad, null, 2))

// pick suggested model and run a real chat round
const good = JSON.parse(
  await ev(`(async () => {
    const m = ${JSON.stringify('')} || 'deepseek-v4-flash'
    await window.api.settingsSetApi({ baseURL: 'http://127.0.0.1:9999/v1', model: m, apiKey: 'sk-x' })
    const tryTest = await window.api.settingsTestApi()
    const C = window.__nebula.chat
    await C.getState().load()
    C.getState().setDraft('帮我找一下歌')
    await C.getState().send()
    await new Promise(r => setTimeout(r, 6000))
    const st = C.getState()
    const last = st.messages[st.messages.length - 1]
    return JSON.stringify({ testOk: tryTest.ok, chips: last?.chips ?? [], last: (last?.content ?? '').slice(0, 40) })
  })()`)
)
console.log('after picking suggested model:', JSON.stringify(good, null, 2))
ws.close()
process.exit(0)

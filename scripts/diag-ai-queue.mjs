/**
 * Verify the AI play flow now builds a usable queue (single requested song →
 * album/artist/library context) and auto-advance works afterwards.
 * Usage: node scripts/diag-ai-queue.mjs
 */
const PORT = 9222
const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const page = list.find((t) => t.type === 'page' && t.url.includes('localhost:5173') && !t.url.includes('#mini'))
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
  if (r?.exceptionDetails) return 'EXC: ' + (r.exceptionDetails.exception?.description ?? '')
  return r?.result?.value ?? r
}

const out = JSON.parse(
  await ev(`(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms))
    await window.api.settingsSetApi({ baseURL: 'http://127.0.0.1:9999/v1', model: 'deepseek-v4-flash', apiKey: 'sk-x' })
    const C = window.__nebula.chat
    await C.getState().load()
    C.getState().setDraft('播放一首歌')
    await C.getState().send()
    await sleep(7000)
    const p = window.__nebula.player.getState()
    const last = C.getState().messages[C.getState().messages.length - 1]
    return JSON.stringify({
      queueLen: p.queue.length,
      current: p.current?.title ?? null,
      isPlaying: p.isPlaying,
      mode: p.mode,
      chips: last?.chips ?? [],
      reply: (last?.content ?? '').slice(0, 40)
    })
  })()`)
)
console.log('AI play flow:', JSON.stringify(out, null, 2))

// let the shortest queue member finish and confirm auto-advance
await ev(`(async () => {
  const p = window.__nebula.player.getState()
  p.seek(Math.max(0, (p.duration || 5) - 1.2))
  return 'near-end'
})()`)
await new Promise((r) => setTimeout(r, 6000))
console.log(
  'after end:',
  await ev(`JSON.stringify({
    current: window.__nebula.player.getState().current?.title,
    index: window.__nebula.player.getState().index,
    isPlaying: window.__nebula.player.getState().isPlaying
  })`)
)

ws.close()
setTimeout(() => process.exit(0), 300)

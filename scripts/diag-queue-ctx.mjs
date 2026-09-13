/**
 * Verify queue context: (A) single-track playTracks expands, consecutive
 * auto-advances play different songs; (B) restart restore also expands.
 * Usage: node scripts/diag-queue-ctx.mjs
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// --- A) single-track playTracks ---
console.log(
  'A) single-track queue:',
  await ev(`(async () => {
    const lib = await window.api.libraryGet()
    const one = lib.tracks.find(t => t.title === 'song-c')
    await window.__nebula.player.getState().playTracks([one], 0)
    const p = window.__nebula.player.getState()
    return JSON.stringify({ requested: 1, queueLen: p.queue.length, first: p.current?.title })
  })()`)
)
const seq = []
for (let i = 0; i < 3; i++) {
  await sleep(6200)
  seq.push(
    await ev(`JSON.stringify({
      cur: window.__nebula.player.getState().current?.title,
      idx: window.__nebula.player.getState().index,
      playing: window.__nebula.player.getState().isPlaying
    })`)
  )
}
console.log('A) auto-advance sequence:', seq)

// --- B) restart restore ---
const trackId = await ev(`(async () => {
  const lib = await window.api.libraryGet()
  const t = lib.tracks.find(x => x.title === 'song-c')
  localStorage.setItem('nebula.player.state', JSON.stringify({ trackId: t.id, position: 0, mode: 'list', volume: 0.8 }))
  return t.id
})()`)
console.log('B) seeded restore track:', trackId)
await raw('Page.reload', {})
await sleep(9000)
console.log(
  'B) after restart:',
  await ev(`JSON.stringify({
    queueLen: window.__nebula.player.getState().queue.length,
    current: window.__nebula.player.getState().current?.title,
    mode: window.__nebula.player.getState().mode
  })`)
)

ws.close()
setTimeout(() => process.exit(0), 300)

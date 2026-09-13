/**
 * Prove continuous auto-advance: repeatedly jump near the end and record the
 * titles, expecting different songs each time.
 * Usage: node scripts/diag-chain.mjs
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

// list mode, start from a single requested track
await ev(`(async () => {
  window.__nebula.player.getState().setMode('list')
  const lib = await window.api.libraryGet()
  const one = lib.tracks.find(t => t.title === 'song-c')
  await window.__nebula.player.getState().playTracks([one], 0)
  return 'started'
})()`)
await new Promise((r) => setTimeout(r, 2500))

const seen = []
for (let i = 0; i < 4; i++) {
  const state = await ev(`(async () => {
    const p = window.__nebula.player.getState()
    // jump close to the end so the track finishes quickly
    p.seek(Math.max(0, (p.duration || 5) - 1))
    return JSON.stringify({ cur: p.current?.title, queueLen: p.queue.length, idx: p.index })
  })()`)
  seen.push(state)
  await new Promise((r) => setTimeout(r, 4200))
}
const final = await ev(`JSON.stringify({
  cur: window.__nebula.player.getState().current?.title,
  idx: window.__nebula.player.getState().index,
  playing: window.__nebula.player.getState().isPlaying,
  queueLen: window.__nebula.player.getState().queue.length
})`)
console.log('steps:', seen)
console.log('final:', final)
ws.close()
setTimeout(() => process.exit(0), 300)

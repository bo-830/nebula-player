/**
 * Test auto-advance: play a 2-track queue, wait past the first track's end,
 * report whether the player advanced on its own. Also test a 1-track queue.
 * Usage: node scripts/diag-autonext.mjs
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
  if (r?.exceptionDetails) return 'EXC: ' + (r.exceptionDetails.exception?.description ?? 'unknown')
  return r?.result?.value ?? r
}

// instrument: record ended events on the engine
console.log(
  'instrument:',
  await ev(`(async () => {
    const N = window.__nebula
    window.__endedLog = []
    N.engine.on('ended', () => window.__endedLog.push(Date.now()))
    return 'ok'
  })()`)
)

// --- 2-track queue: first track is 5s (song-c), second 6s (SongB) ---
console.log(
  'two-track start:',
  await ev(`(async () => {
    const lib = await window.api.libraryGet()
    const two = lib.tracks.filter(t => t.duration <= 8).slice(0, 2)
    const N = window.__nebula.player.getState()
    await N.playTracks(two, 0)
    return JSON.stringify({ queue: two.map(t => t.title), durations: two.map(t => t.duration) })
  })()`)
)
await new Promise((r) => setTimeout(r, 9000))
console.log(
  'two-track after 9s:',
  await ev(`JSON.stringify({
    current: window.__nebula.player.getState().current?.title,
    index: window.__nebula.player.getState().index,
    isPlaying: window.__nebula.player.getState().isPlaying,
    endedEvents: window.__endedLog.length,
    engineMode: window.__nebula.engine.getMode()
  })`)
)

// --- 1-track queue ---
console.log(
  'one-track start:',
  await ev(`(async () => {
    const lib = await window.api.libraryGet()
    const one = lib.tracks.filter(t => t.duration <= 5)[0]
    window.__nebula.player.getState().playTracks([one], 0)
    return JSON.stringify({ track: one.title, duration: one.duration })
  })()`)
)
await new Promise((r) => setTimeout(r, 9000))
console.log(
  'one-track after 9s:',
  await ev(`JSON.stringify({
    current: window.__nebula.player.getState().current?.title,
    isPlaying: window.__nebula.player.getState().isPlaying,
    time: Math.round(window.__nebula.player.getState().currentTime),
    endedEvents: window.__endedLog.length
  })`)
)

ws.close()
setTimeout(() => process.exit(0), 300)

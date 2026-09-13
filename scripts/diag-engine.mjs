/**
 * Probe the audio engine internals while playing (dev app must be running).
 * Usage: node scripts/diag-engine.mjs
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
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result)
    pending.delete(m.id)
  }
}
const ev = (expr) =>
  new Promise((resolve) => {
    const i = ++id
    pending.set(i, resolve)
    ws.send(
      JSON.stringify({
        id: i,
        method: 'Runtime.evaluate',
        params: { expression: expr, awaitPromise: true, returnByValue: true }
      })
    )
  })

await ev(`(async () => {
  const lib = await window.api.libraryGet()
  await window.__nebula.player.getState().playTracks(lib.tracks, 0)
  return 'played'
})()`)
await new Promise((r) => setTimeout(r, 6500))

const out = await ev(`JSON.stringify({
  engine: window.__nebula?.engine ? window.__nebula.engine.diagnose() : 'no-engine-hook',
  storePlaying: window.__nebula.player.getState().isPlaying
})`)
console.log(out.result.value)
ws.close()
process.exit(0)

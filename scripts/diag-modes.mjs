/**
 * Verify the three play modes behave correctly on a multi-track queue.
 * Usage: node scripts/diag-modes.mjs
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

async function start(mode) {
  return ev(`(async () => {
    window.__nebula.player.getState().setMode('${mode}')
    const lib = await window.api.libraryGet()
    const one = lib.tracks.find(t => t.title === 'song-c')
    await window.__nebula.player.getState().playTracks([one], 0)
    return 'ok'
  })()`)
}

async function nudge() {
  return ev(`(async () => {
    const p = window.__nebula.player.getState()
    p.seek(Math.max(0, (p.duration || 5) - 1))
    return 'seeked'
  })()`)
}

const observe = async () =>
  JSON.parse(
    await ev(`JSON.stringify({
      cur: window.__nebula.player.getState().current?.title,
      idx: window.__nebula.player.getState().index,
      playing: window.__nebula.player.getState().isPlaying,
      mode: window.__nebula.player.getState().mode
    })`)
  )

// --- 单曲循环 one ---
await start('one')
await sleep(2200)
await nudge()
await sleep(4200)
console.log('one-mode (expect same song, playing):', await observe())

// --- 随机 shuffle ---
await start('shuffle')
await sleep(2200)
const shuf = []
for (let i = 0; i < 3; i++) {
  await nudge()
  await sleep(4200)
  shuf.push((await observe()).idx)
}
console.log('shuffle indices (expect non-sequential):', shuf)

// --- 列表循环 list (wrap at end) ---
await start('list')
await ev(`(async () => {
  const p = window.__nebula.player.getState()
  // jump to the last queue item to test wrap-around
  const last = p.queue.length - 1
  p.seek(0)
  window.__nebula.player.setState({ index: last - 1 })
  return 'prepared'
})()`)
await start('list')
await sleep(2200)
const wrap = []
for (let i = 0; i < 3; i++) {
  await nudge()
  await sleep(4200)
  wrap.push(await observe())
}
console.log('list-mode sequence:', wrap)

ws.close()
setTimeout(() => process.exit(0), 300)

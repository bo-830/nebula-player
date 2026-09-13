/**
 * Live audio diagnostics via CDP (dev app must be running).
 * Usage: node scripts/diag-audio.mjs
 */
const PORT = 9222

async function connect() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json`)
  const list = await res.json()
  const page = list.find((t) => t.type === 'page' && t.url.includes('localhost:5173'))
  if (!page) throw new Error('dev page not found')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })
  let seq = 0
  const pending = new Map()
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
    }
  }
  const evaluate = (expression, awaitPromise = true) =>
    new Promise((resolve, reject) => {
      const id = ++seq
      pending.set(id, { resolve, reject })
      ws.send(
        JSON.stringify({
          id,
          method: 'Runtime.evaluate',
          params: { expression, awaitPromise, returnByValue: true }
        })
      )
    }).then((r) => {
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'page exception')
      return r.result?.value
    })
  return { ws, evaluate }
}

const { ws, evaluate } = await connect()

// 1) play first track via store
await evaluate(`(async () => {
  const lib = await window.api.libraryGet()
  await window.__nebula.player.getState().playTracks(lib.tracks, 0)
  return 'playing started'
})()`)
await new Promise((r) => setTimeout(r, 2500))

const result = JSON.parse(
  await evaluate(`(() => {
    const a = document.querySelector('audio')
    let freshCtx = null
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      freshCtx = new Ctx()
      rawFresh = freshCtx.state
    } catch (e) { rawFresh = 'ERR:' + String(e) }
    var rawFresh
    if (freshCtx) freshCtx.close()
    const raw = {}
    try {
      const ai = a
      raw.el = {
        paused: ai.paused, muted: ai.muted, volume: ai.volume,
        currentTime: ai.currentTime, duration: ai.duration,
        readyState: ai.readyState, networkState: ai.networkState,
        src: (ai.currentSrc || '').slice(0, 40),
        error: ai.error ? { code: ai.error.code, msg: ai.error.message } : null
      }
    } catch (e) { raw.el = 'ERR:' + String(e) }
    return JSON.stringify({ element: raw.el, freshContextState: rawFresh })
  })()`)
)

console.log(JSON.stringify(result, null, 2))
ws.close()
process.exit(0)

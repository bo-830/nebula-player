/**
 * Manually poke the engine graph creation and report.
 * Usage: node scripts/diag-poke.mjs
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

const before = await ev(`JSON.stringify(window.__nebula.engine.diagnose())`)
const after = await ev(`(() => {
  try {
    window.__nebula.engine.ensureGraph()
    return JSON.stringify({ ok: true, diag: window.__nebula.engine.diagnose() })
  } catch (e) {
    return JSON.stringify({ ok: false, err: String(e), diag: window.__nebula.engine.diagnose() })
  }
})()`)
console.log('BEFORE:', before.result.value)
console.log('AFTER :', after.result.value)
ws.close()
process.exit(0)

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

const r = await raw('Runtime.evaluate', {
  expression: `Promise.race([
    window.api.updateCheck().then(r => 'OK ' + JSON.stringify(r), e => 'REJECTED: ' + String(e)),
    new Promise(res => setTimeout(() => res('TIMEOUT 8s'), 8000))
  ])`,
  awaitPromise: true,
  returnByValue: true
})
console.log('result:', JSON.stringify(r))
ws.close()
process.exit(0)

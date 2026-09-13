/**
 * Auto-update E2E: configure local feed → check → available → download → downloaded.
 * Usage: node scripts/diag-update.mjs
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

// 1) not configured → expect not-configured
const noneCfg = JSON.parse(await ev(`(async () => JSON.stringify(await window.api.updateCheck()))()`))
console.log('no feed:', JSON.stringify(noneCfg))

// 2) configure the local feed (fake 1.0.2)
await ev(`(async () => {
  await window.api.settingsUpdateGeneral({ updateURL: 'http://127.0.0.1:8888/' })
  return 'set'
})()`)
const checkResult = JSON.parse(await ev(`(async () => JSON.stringify(await window.api.updateCheck()))()`))
console.log('check:', JSON.stringify(checkResult))

// 3) download
const dl = JSON.parse(await ev(`(async () => {
  const s = await window.api.updateDownload()
  return JSON.stringify(s)
})()`))
console.log('download result:', JSON.stringify(dl))

// 4) status subscription sanity via a second check
const after = JSON.parse(await ev(`(async () => JSON.stringify(await window.api.updateCheck()))()`))
console.log('recheck:', JSON.stringify(after))

ws.close()
process.exit(0)

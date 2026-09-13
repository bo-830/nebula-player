/**
 * Finish the update E2E: check → available → download → downloaded.
 * Usage: node scripts/diag-update4.mjs
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
const safe = async (expr, ms = 30000) => {
  try {
    return await Promise.race([ev(expr), new Promise((r) => setTimeout(() => r('<<TIMEOUT>>'), ms))])
  } catch (e) {
    return '<<ERR ' + String(e) + '>>'
  }
}

console.log('check:', await safe(`(async () => JSON.stringify(await window.api.updateCheck()))()`))
console.log(
  'download:',
  await safe(`(async () => {
    const s = await Promise.race([
      window.api.updateDownload().then(r => JSON.stringify(r), e => 'ERR ' + String(e)),
      new Promise(res => setTimeout(() => res('<<hang>>'), 45000))
    ])
    return s
  })()`, 60000)
)
console.log('after states:', await safe(`(async () => JSON.stringify(await window.api.updateCheck()))()`))

ws.close()
process.exit(0)

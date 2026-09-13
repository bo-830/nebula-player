/**
 * Incremental auto-update debug — prints after EVERY step.
 * Usage: node scripts/diag-update3.mjs
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
const safe = async (expr) => {
  try {
    return await Promise.race([
      ev(expr),
      new Promise((r) => setTimeout(() => r('<<TIMEOUT>>'), 10000))
    ])
  } catch (e) {
    return '<<ERR ' + String(e) + '>>'
  }
}

console.log('1) basic probe:', await safe(`JSON.stringify({ready: !!window.__nebula})`))
console.log('2) updateCheck(no feed):', await safe(`(async () => JSON.stringify(await window.api.updateCheck()))()`))
console.log('3) save feed url:', await safe(`(async () => { await window.api.settingsUpdateGeneral({ updateURL: 'http://127.0.0.1:8888/' }); return 'saved' })()`))
console.log('4) updateCheck(with feed):', await safe(`(async () => {
  const s = await Promise.race([
    window.api.updateCheck().then(r => r, e => ({ state: 'invoke-error', message: String(e) })),
    new Promise(res => setTimeout(() => res({ state: 'hang-8s' }), 8000))
  ])
  return JSON.stringify(s)
})()`))
console.log('5) page alive after all:', await safe(`JSON.stringify({ready: !!window.__nebula})`))

ws.close()
process.exit(0)

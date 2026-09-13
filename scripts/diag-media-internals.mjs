/**
 * Open chrome://media-internals via CDP and dump its log window text.
 * Usage: node scripts/diag-media-internals.mjs
 */
const PORT = 9222
const res = await fetch(`http://127.0.0.1:${PORT}/json/version`)
const browser = await res.json()
const ws = new WebSocket(browser.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = reject
})

let id = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
}
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const i = ++id
    pending.set(i, resolve)
    ws.send(JSON.stringify({ id: i, method, params }))
  })

// create the target on the browser endpoint
const created = await send('Target.createTarget', { url: 'chrome://media-internals/', newWindow: true })
if (created.error) {
  console.error('createTarget error:', JSON.stringify(created.error))
  process.exit(1)
}
const targetId = created.result.targetId
await new Promise((r) => setTimeout(r, 3000))

const attached = await send('Target.attachToTarget', { targetId, flatten: true })
const sessionId = attached.result.sessionId

const evalIn = (expr) =>
  new Promise((resolve) => {
    const i = ++id
    pending.set(i, (m) => resolve(m.result?.result?.value ?? null))
    ws.send(
      JSON.stringify({
        id: i,
        method: 'Runtime.evaluate',
        sessionId,
        params: { expression: expr, returnByValue: true }
      })
    )
  })

const text = await evalIn(`(function () {
  const logs = document.querySelector('#logs') || document.querySelector('body')
  return (logs.innerText || '').slice(-6000)
})()`)

console.log(text)
await send('Target.closeTarget', { targetId })
ws.close()
process.exit(0)

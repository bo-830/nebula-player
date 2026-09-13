const list = await (await fetch('http://127.0.0.1:9222/json')).json()
console.log('targets:', JSON.stringify(list.map((t) => ({ type: t.type, url: t.url.slice(0, 60) }))))
const page = list.find((t) => t.type === 'page' && t.url.includes('localhost:5173'))
if (!page) {
  console.log('no page')
  process.exit(0)
}
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = reject
})
ws.onmessage = (m) => {
  console.log('resp:', m.data.slice(0, 300))
  ws.close()
  process.exit(0)
}
ws.send(
  JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: { expression: 'document.title + " | " + (window.__nebula ? "nebula-ok" : "no-nebula")', returnByValue: true }
  })
)
setTimeout(() => {
  console.log('NO RESPONSE')
  process.exit(1)
}, 8000)

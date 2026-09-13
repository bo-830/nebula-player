/**
 * Rescan + verify an artist has 2+ covers, then screenshot the artists page.
 * Usage: node scripts/diag-artist-badge.mjs
 */
import { writeFile } from 'fs/promises'

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

const rawInfo = await ev(`(async () => {
  try {
    const res = await window.__nebula.library.getState().scan(['C:\\\\博830\\\\vibecoding\\\\nebula-player\\\\.devdata\\\\test-music'])
    const lib = await window.api.libraryGet()
    return JSON.stringify({ scan: res, tracks: lib.tracks.map(t => ({ title: t.title, artist: t.artist, cover: !!t.coverPath })) })
  } catch (e) {
    return JSON.stringify({ err: String(e) })
  }
})()`)
if (typeof rawInfo !== 'string') {
  console.error('unexpected evaluate result:', JSON.stringify(rawInfo))
  ws.close()
  process.exit(1)
}
const info = JSON.parse(rawInfo)
console.log(JSON.stringify(info, null, 2))

await new Promise((r) => setTimeout(r, 1400))
const shot = await raw('Page.captureScreenshot', { format: 'png' })
await writeFile('.devdata/shot-artists-badge.png', Buffer.from(shot.data, 'base64'))
console.log('saved')
ws.close()
process.exit(0)

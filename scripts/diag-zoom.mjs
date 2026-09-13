/**
 * Verify the 30s scrolling waveform window using a long test track.
 * Usage: node scripts/diag-zoom.mjs
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

const info = JSON.parse(
  await ev(`(async () => {
    await window.__nebula.library.getState().scan(['C:\\\\博830\\\\vibecoding\\\\nebula-player\\\\.devdata\\\\test-music'])
    const lib = await window.api.libraryGet()
    const t = lib.tracks.find(x => x.title === '长测试曲' && !x.missing)
    if (!t) return JSON.stringify({ error: 'long track missing', titles: lib.tracks.map(x => x.title) })
    await window.__nebula.player.getState().playTracks([t], 0)
    await new Promise(r => setTimeout(r, 300))
    window.__nebula.player.getState().seek(62)
    await new Promise(r => setTimeout(r, 6500))
    const st = window.__nebula.player.getState()
    return JSON.stringify({ duration: t.duration, time: Math.round(st.currentTime), direct: st.audioDirect })
  })()`)
)
console.log(JSON.stringify(info, null, 2))

const shot = await raw('Page.captureScreenshot', { format: 'png' })
await writeFile('.devdata/shot-zoom.png', Buffer.from(shot.data, 'base64'))
console.log('saved shot-zoom.png')
ws.close()
process.exit(0)

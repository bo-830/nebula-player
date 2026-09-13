/**
 * Visual verification: play a track (waveform with pulsing playhead),
 * screenshot; rescan for covers, open artists page, screenshot.
 * Usage: node scripts/diag-shots.mjs
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
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result)
    pending.delete(m.id)
  }
}
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const i = ++id
    pending.set(i, resolve)
    ws.send(JSON.stringify({ id: i, method, params }))
  })
const ev = (expr) =>
  new Promise((resolve) => {
    const i = ++id
    pending.set(i, (m) => resolve(m.result?.result?.value ?? m.result))
    ws.send(
      JSON.stringify({
        id: i,
        method: 'Runtime.evaluate',
        params: { expression: expr, awaitPromise: true, returnByValue: true }
      })
    )
  })

// rescan to pick up new covers
await ev(`(async () => {
  await window.__nebula.library.getState().scan(['C:\\\\博830\\\\vibecoding\\\\nebula-player\\\\.devdata\\\\test-music'])
  return 'rescanned'
})()`)

// play first track → fallback → waveform (wait for env + a few painted frames)
await ev(`(async () => {
  const lib = await window.api.libraryGet()
  await window.__nebula.player.getState().playTracks([lib.tracks[0]], 0)
  return 'playing'
})()`)
await new Promise((r) => setTimeout(r, 9000))

const shot1 = await send('Page.captureScreenshot', { format: 'png' })
await writeFile('.devdata/shot-waveform.png', Buffer.from(shot1.data, 'base64'))
console.log('waveform screenshot saved')

// artists page
await ev(`(async () => {
  window.__nebula.ui.getState().navTo({ type: 'artists' })
  window.__nebula.ui.getState().setSettingsOpen(false)
  return 'artists'
})()`)
await new Promise((r) => setTimeout(r, 1200))
const shot2 = await send('Page.captureScreenshot', { format: 'png' })
await writeFile('.devdata/shot-artists.png', Buffer.from(shot2.data, 'base64'))
console.log('artists screenshot saved')

ws.close()
process.exit(0)

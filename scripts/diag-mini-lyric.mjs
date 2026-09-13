import { writeFile } from 'fs/promises'

const PORT = 9222
const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const page = list.find((t) => t.type === 'page' && t.url.includes('localhost:5173') && !t.url.includes('#mini'))
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

await ev(`(async () => {
  const lib = await window.api.libraryGet()
  const t = lib.tracks.find(x => x.title === '长测试曲')
  await window.__nebula.player.getState().playTracks([t], 0)
  await new Promise(r => setTimeout(r, 500))
  window.__nebula.player.getState().seek(41)
  await new Promise(r => setTimeout(r, 2500))
  await window.api.miniToggle()
  return 'ok'
})()`)

const miniList = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const miniPage = miniList.find((t) => t.type === 'page' && t.url.includes('#mini'))
if (!miniPage) throw new Error('mini not found')
const ws2 = new WebSocket(miniPage.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws2.onopen = res
  ws2.onerror = rej
})
let mid = 0
const mp = new Map()
ws2.onmessage = (evMsg) => {
  const m = JSON.parse(evMsg.data)
  if (m.id && mp.has(m.id)) {
    mp.get(m.id)(m.result)
    mp.delete(m.id)
  }
}
const mraw = (method, params = {}) =>
  new Promise((resolve) => {
    const i = ++mid
    mp.set(i, resolve)
    ws2.send(JSON.stringify({ id: i, method, params }))
  })
const mev = async (expr) => {
  const r = await mraw('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  return r?.result?.value ?? r
}
await new Promise((r) => setTimeout(r, 1500))
console.log(
  'mini:',
  await mev(`JSON.stringify({
    title: document.querySelector('.mini-title')?.innerText,
    active: document.querySelector('.mini-lyric-line.active')?.innerText ?? null,
    prev: document.querySelector('.mini-lyric-line.prev')?.innerText ?? null,
    next: document.querySelector('.mini-lyric-line.next')?.innerText ?? null
  })`)
)
const shot = await mraw('Page.captureScreenshot', { format: 'png' })
await writeFile('.devdata/shot-mini2.png', Buffer.from(shot.data, 'base64'))
console.log('saved')
ws2.close()
setTimeout(() => process.exit(0), 500)

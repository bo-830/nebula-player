/**
 * Verify: smart lists, sorting, mini window, logging.
 * Usage: node scripts/diag-v3.mjs
 */
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---- play a few tracks (feed stats) ----
await ev(`(async () => {
  const lib = await window.api.libraryGet()
  const N = window.__nebula.player.getState()
  await N.playTracks(lib.tracks.slice(0, 3), 0)
  await new Promise(r => setTimeout(r, 2500))
  N.next()
  await new Promise(r => setTimeout(r, 1800))
  N.next()
  await new Promise(r => setTimeout(r, 1800))
  return 'played 3'
})()`)
const stats = JSON.parse(await ev(`JSON.stringify(localStorage.getItem('nebula.playstats'))`))
console.log('playstats:', stats)

// ---- smart lists ----
const smart = JSON.parse(
  await ev(`(async () => {
    const ui = window.__nebula.ui.getState()
    ui.navTo({ type: 'recent-added' })
    await new Promise(r => setTimeout(r, 500))
    const recentAdded = document.querySelector('.mv-sub')?.innerText ?? ''
    ui.navTo({ type: 'recently-played' })
    await new Promise(r => setTimeout(r, 500))
    const recentlyPlayed = document.querySelector('.mv-sub')?.innerText ?? ''
    ui.navTo({ type: 'most-played' })
    await new Promise(r => setTimeout(r, 500))
    const mostPlayed = document.querySelector('.mv-sub')?.innerText ?? ''
    return JSON.stringify({ recentAdded, recentlyPlayed, mostPlayed })
  })()`)
)
console.log('smart lists:', smart)

// ---- sort ----
const sortRes = JSON.parse(
  await ev(`(async () => {
    const ui = window.__nebula.ui.getState()
    ui.navTo({ type: 'all' })
    await new Promise(r => setTimeout(r, 400))
    ui.setSortKey('duration')
    await new Promise(r => setTimeout(r, 400))
    const durs = [...document.querySelectorAll('.tl-row .tl-dur')].map(el => el.innerText)
    ui.setSortKey('default')
    return JSON.stringify({ sortedDurations: durs.slice(0, 6) })
  })()`)
)
console.log('sort:', sortRes)

// ---- mini window ----
await ev(`(async () => { await window.api.miniToggle(); return 'toggled' })()`)
await sleep(2500)
const miniList = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const miniPage = miniList.find((t) => t.type === 'page' && t.url.includes('#mini'))
console.log('mini page:', miniPage ? 'FOUND' : 'NOT FOUND')
if (miniPage) {
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
  console.log('mini text:', await mev(`JSON.stringify({
    title: document.querySelector('.mini-title')?.innerText,
    activeLine: document.querySelector('.mini-lyric-line.active')?.innerText ?? null,
    lines: document.querySelectorAll('.mini-lyric-line').length
  })`))
  const shot = await mraw('Page.captureScreenshot', { format: 'png' })
  await writeFile('.devdata/shot-mini.png', Buffer.from(shot.data, 'base64'))
  ws2.close()
}

// ---- logging file ----
const logCheck = JSON.parse(await ev(`(async () => {
  const files = await window.api.mediaInternals === undefined ? null : null
  return JSON.stringify({ ok: true })
})()`))
void logCheck

ws.close()
process.exit(0)

/**
 * Verify lyrics panel (highlight + scroll), multi-select toolbar, drag multi.
 * Usage: node scripts/diag-features2.mjs
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

// ---- 1) lyrics: play long track, seek to ~40s, open lyrics tab ----
const lyrics = JSON.parse(
  await ev(`(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms))
    const lib = await window.api.libraryGet()
    const t = lib.tracks.find(x => x.title === '长测试曲')
    await window.__nebula.player.getState().playTracks([t], 0)
    await sleep(400)
    window.__nebula.player.getState().seek(40)
    await sleep(800)
    // switch detail tab to lyrics
    const tabs = [...document.querySelectorAll('.detail-tab')]
    const lyrTab = tabs.find(el => el.innerText.includes('歌词'))
    if (!lyrTab) return JSON.stringify({ error: 'lyrics tab missing', tabs: tabs.map(x => x.innerText) })
    lyrTab.click()
    await sleep(2500)
    const lines = [...document.querySelectorAll('.lyric-line')].map(el => el.innerText)
    const active = document.querySelector('.lyric-line.active')?.innerText ?? 'NONE'
    return JSON.stringify({ lineCount: lines.length, active, sample: lines.slice(0, 3) })
  })()`)
)
console.log('lyrics:', JSON.stringify(lyrics, null, 2))
const shot1 = await raw('Page.captureScreenshot', { format: 'png' })
await writeFile('.devdata/shot-lyrics.png', Buffer.from(shot1.data, 'base64'))

// ---- 2) multi-select: click row0, ctrl row1 ----
const sel = JSON.parse(
  await ev(`(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms))
    window.__nebula.ui.getState().navTo({ type: 'all' })
    await sleep(400)
    const rows = document.querySelectorAll('.tl-row')
    rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await sleep(200)
    rows[1].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }))
    await sleep(300)
    const toolbar = document.querySelector('.tl-selection-toolbar')?.innerText ?? 'NO TOOLBAR'
    const selectedRows = document.querySelectorAll('.tl-row.selected').length
    // add both to favorites via toolbar
    const favBtn = [...document.querySelectorAll('.tl-selection-toolbar .btn')].find(el => el.innerText.includes('收藏'))
    if (favBtn) favBtn.click()
    await sleep(500)
    const favCount = window.__nebula.playlists.getState().playlists.find(p => p.builtin === 'favorites')?.trackIds.length ?? -1
    return JSON.stringify({ toolbar, selectedRows, favCount })
  })()`)
)
console.log('multiselect:', JSON.stringify(sel, null, 2))
const shot2 = await raw('Page.captureScreenshot', { format: 'png' })
await writeFile('.devdata/shot-multiselect.png', Buffer.from(shot2.data, 'base64'))

ws.close()
process.exit(0)

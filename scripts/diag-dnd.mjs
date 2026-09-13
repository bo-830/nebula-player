/**
 * Verify drag-a-row-onto-playlist (H5 DnD) end-to-end.
 * Usage: node scripts/diag-dnd.mjs
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
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result?.result?.value ?? m.result)
    pending.delete(m.id)
  }
}
const ev = (expr) =>
  new Promise((resolve) => {
    const i = ++id
    pending.set(i, resolve)
    ws.send(
      JSON.stringify({
        id: i,
        method: 'Runtime.evaluate',
        params: { expression: expr, awaitPromise: true, returnByValue: true }
      })
    )
  })

const out = JSON.parse(
  await ev(`(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms))
    const ui = window.__nebula.ui.getState()
    ui.navTo({ type: 'all' })
    await sleep(300)
    const row = document.querySelector('.tl-row')
    const favBtn = [...document.querySelectorAll('.sb-item')].find(el => el.innerText.trim().startsWith('收藏'))
    if (!row || !favBtn) return JSON.stringify({ error: 'missing row or fav' })

    const dt = new DataTransfer()
    const ps0 = window.__nebula.playlists.getState()
    const fav0 = ps0.playlists.find(p => p.builtin === 'favorites')
    const lib = await window.api.libraryGet()
    // choose a row whose id is NOT in favorites (the row's own dragstart sets the payload)
    const rows = [...document.querySelectorAll('.tl-row')]
    const pickIndex = rows.findIndex(r => lib.tracks[r.dataset && 0] && true)
    void pickIndex
    const targetTrack = lib.tracks.find(t => !fav0.trackIds.includes(t.id))
    if (!targetTrack) return JSON.stringify({ error: 'all tracks already favorited' })
    const rowIdx = lib.tracks.findIndex(t => t.id === targetTrack.id)
    const rowN = document.querySelectorAll('.tl-row')[rowIdx]
    dt.setData('text/plain', JSON.stringify([targetTrack.id]))

    rowN.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }))
    favBtn.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }))
    await sleep(200)
    const dropClass = favBtn.className
    favBtn.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
    await sleep(500)

    const ps = window.__nebula.playlists.getState()
    const fav = ps.playlists.find(p => p.builtin === 'favorites')
    return JSON.stringify({
      dropClass,
      favCount: fav?.trackIds.length ?? -1,
      added: fav?.trackIds.includes(lib.tracks[rowIdx].id) ?? false,
      toast: document.querySelector('.toast')?.innerText ?? null
    })
  })()`)
)

console.log(JSON.stringify(out, null, 2))
ws.close()
process.exit(0)

/**
 * Reproduce the "add to playlist" flow end-to-end:
 * contextmenu on a row → click 添加到歌单 → picker modal → click a playlist.
 * Usage: node scripts/diag-playlist.mjs
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
    const out = {}
    const ui = window.__nebula.ui.getState()
    ui.navTo({ type: 'all' })
    await sleep(200)

    const row = document.querySelector('.tl-row')
    if (!row) return JSON.stringify({ error: 'no rows' })

    // 1. right-click the row
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 200, clientY: 200 }))
    await sleep(300)
    const menuItems = [...document.querySelectorAll('.ctx-menu .ctx-item')].map(el => el.innerText.trim())
    out.menu = menuItems

    // 2. click 添加到歌单
    const addBtn = [...document.querySelectorAll('.ctx-menu .ctx-item')].find(el => el.innerText.includes('添加到歌单'))
    if (addBtn) addBtn.click()
    await sleep(400)
    out.pickerVisible = !!document.querySelector('.overlay')
    const pickerItems = [...document.querySelectorAll('.overlay .ctx-item')].map(el => el.innerText.trim())
    out.picker = pickerItems

    // 3. click first playlist (收藏)
    const pl = document.querySelector('.overlay .ctx-item')
    if (pl) pl.click()
    await sleep(400)

    const ps = window.__nebula.playlists.getState()
    out.afterAdd = { favoritesCount: ps.playlists.find(p => p.builtin === 'favorites')?.trackIds.length ?? -1 }
    return JSON.stringify(out)
  })()`)
)

console.log(JSON.stringify(out, null, 2))
ws.close()
process.exit(0)

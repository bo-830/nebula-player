/**
 * E2E for the new features: search dropdown flow, waveform API,
 * fallback → waveform spectrum painting.
 * Usage: node scripts/diag-features.mjs
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

const out = {}

// ---- search flow: type → dropdown appears, list unchanged; Enter → results ----
out.search = JSON.parse(
  await ev(`(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms))
    const input = document.querySelector('.nb-search input')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    const type = (v) => {
      setter.call(input, v)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    // reset state cleanly
    type('')
    await sleep(150)
    window.__nebula.ui.getState().navTo({ type: 'all' })
    await sleep(150)
    const before = window.__nebula.ui.getState().view
    type('测')
    await sleep(350)
    const items = [...document.querySelectorAll('.search-drop .search-item')].map(el => el.innerText.trim())
    const viewWhileTyping = window.__nebula.ui.getState().view
    // press Enter
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await sleep(350)
    const after = window.__nebula.ui.getState()
    return JSON.stringify({
      beforeView: before.type,
      dropItems: items,
      viewWhileTyping: viewWhileTyping.type,
      afterView: after.view.type,
      queryKept: after.globalSearch,
      afterSub: document.querySelector('.mv-sub')?.innerText?.slice(0, 80) ?? ''
    })
  })()`)
)

// ---- waveform API ----
out.waveform = JSON.parse(
  await ev(`(async () => {
    const lib = await window.api.libraryGet()
    const t = lib.tracks[0]
    if (!t) return JSON.stringify({ error: 'no tracks' })
    const wf = await window.api.waveformGet({ path: t.path, mtime: t.mtime, size: t.size, duration: t.duration })
    return JSON.stringify({ id: t.id, len: wf.length, max: Math.max(...wf), nonZero: wf.filter(v => v > 0).length })
  })()`)
)

// ---- play → fallback → waveform painted on the spectrum canvas ----
out.play = JSON.parse(
  await ev(`(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms))
    const lib = await window.api.libraryGet()
    const track = lib.tracks.find(t => t.duration >= 8) ?? lib.tracks[0]
    await window.__nebula.player.getState().playTracks([track], 0)
    await sleep(7000) // silent-graph env → fallback engages ~4-5s
    const st = window.__nebula.player.getState()
    const canvas = document.querySelector('.spectrum')
    let painted = 0
    if (canvas) {
      const c = canvas.getContext('2d')
      const img = c.getImageData(0, 0, canvas.width, canvas.height).data
      for (let i = 3; i < img.length; i += 4) if (img[i] > 10) painted++
    }
    return JSON.stringify({
      audioDirect: st.audioDirect,
      isPlaying: st.isPlaying,
      current: st.current?.title,
      paintedPixels: painted
    })
  })()`)
)

console.log(JSON.stringify(out, null, 2))
ws.close()
process.exit(0)

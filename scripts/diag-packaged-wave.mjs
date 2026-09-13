/**
 * Verify waveform generation INSIDE the packaged app (asar-ffmpeg path)
 * against the user's real library tracks.
 * Usage: node scripts/diag-packaged-wave.mjs [port]
 */
const PORT = Number(process.argv[2] ?? 9222)
const res = await fetch(`http://127.0.0.1:${PORT}/json`)
const list = await res.json()
const page = list.find((t) => t.type === 'page')
if (!page) throw new Error('no page target')

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
    const lib = await window.api.libraryGet()
    const tracks = lib.tracks.filter(t => !t.missing)
    const t = tracks[0]
    if (!t) return JSON.stringify({ error: 'empty library', total: lib.tracks.length })
    let wf = null, err = null
    try {
      wf = await window.api.waveformGet({ path: t.path, mtime: t.mtime, size: t.size, duration: t.duration })
    } catch (e) { err = String(e) }
    return JSON.stringify({
      total: lib.tracks.length,
      track: t.title,
      path: t.path,
      wfLen: wf ? wf.length : null,
      wfMax: wf ? Math.max(...wf) : null,
      err
    })
  })()`)
)

console.log(JSON.stringify(out, null, 2))
ws.close()
process.exit(0)

/**
 * OfflineAudioContext oscillator render test — CPU-only, device-independent.
 * If even this yields silence, the whole Web Audio stack in this Electron is
 * disabled/stubbed; if it renders, the problem is device rendering only.
 * Usage: node scripts/diag-offline.mjs
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
    pending.get(m.id)(m.result)
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

const out = await ev(`(async () => {
  const out = {}
  try {
    const off = new OfflineAudioContext(1, 22050, 44100)
    const osc = off.createOscillator()
    osc.frequency.value = 440
    osc.connect(off.destination)
    osc.start(0)
    osc.stop(0.5)
    const buf = await off.startRendering()
    const d = buf.getChannelData(0)
    let peak = 0
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]))
    out.offlinePeak = peak
  } catch (e) { out.offlineErr = String(e) }

  // also: does a realtime graph report ANY state info?
  try {
    const ctx = new AudioContext()
    out.online = {
      state: ctx.state,
      sampleRate: ctx.sampleRate,
      baseLatency: ctx.baseLatency,
      outputLatency: ctx.outputLatency,
      destinationChannelCount: ctx.destination.channelCount
    }
    await ctx.close()
  } catch (e) { out.onlineErr = String(e) }

  try {
    out.offlineSupported = 'OfflineAudioContext' in window
  } catch (e) {}
  return JSON.stringify(out)
})()`)
console.log(out.result.value)
ws.close()
process.exit(0)

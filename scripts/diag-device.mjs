/**
 * Probe audio device realness in ANY CDP-enabled instance (dev or packaged).
 * Usage: node scripts/diag-device.mjs [port]
 */
const PORT = Number(process.argv[2] ?? 9222)
const res = await fetch(`http://127.0.0.1:${PORT}/json`)
const list = await res.json()
const page = list.find((t) => t.type === 'page')
if (!page) throw new Error('no page target: ' + JSON.stringify(list.map((t) => t.url)))

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
  const sleep = (ms) => new Promise(r => setTimeout(r, ms))
  const out = {}

  const ctx = new AudioContext()
  out.online = { state: ctx.state, sampleRate: ctx.sampleRate, outputLatency: ctx.outputLatency, baseLatency: ctx.baseLatency }

  // oscillator → analyser peak
  const osc = ctx.createOscillator()
  osc.frequency.value = 440
  const an = ctx.createAnalyser()
  osc.connect(an); an.connect(ctx.destination)
  osc.start()
  await sleep(500)
  const b = new Uint8Array(an.frequencyBinCount)
  an.getByteFrequencyData(b)
  let peak = 0
  for (let i = 0; i < b.length; i++) peak = Math.max(peak, b[i])
  out.oscPeak = peak
  osc.stop()
  await ctx.close()

  // devices
  try {
    const devs = await navigator.mediaDevices.enumerateDevices()
    out.outputs = devs.filter(d => d.kind === 'audiooutput').map(d => d.label)
  } catch (e) { out.outputsErr = String(e) }

  return JSON.stringify(out)
})()`)
console.log(JSON.stringify(JSON.parse(out.result.value), null, 2))
ws.close()
process.exit(0)

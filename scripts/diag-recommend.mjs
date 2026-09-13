/**
 * Verify personalized recommendations: 为你推荐 smart list + AI recommend_music tool.
 * Usage: node scripts/diag-recommend.mjs
 */
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
  if (r?.exceptionDetails) return 'EXC: ' + (r.exceptionDetails.exception?.description ?? '')
  return r?.result?.value ?? r
}

// seed play history: play rock-ish/artist tracks a few times
await ev(`(async () => {
  const lib = await window.api.libraryGet()
  const stats = {}
  // pretend 测试歌手's tracks were played a lot
  for (const t of lib.tracks) {
    if (t.artist === '测试歌手') stats[t.id] = { count: 6, last: Date.now() - 1000 }
    else if (t.artist === 'ArtistB') stats[t.id] = { count: 1, last: Date.now() - 60000 }
  }
  localStorage.setItem('nebula.playstats', JSON.stringify(stats))
  return 'seeded'
})()`)

// --- 为你推荐 list ---
const rec = JSON.parse(
  await ev(`(async () => {
    window.__nebula.ui.getState().navTo({ type: 'for-you' })
    await new Promise(r => setTimeout(r, 600))
    const rows = [...document.querySelectorAll('.tl-row')]
    return JSON.stringify({
      sub: document.querySelector('.mv-sub')?.innerText ?? '',
      rows: rows.map(r => ({
        title: r.querySelector('.tl-name')?.innerText,
        artist: r.querySelector('.tl-artist')?.innerText,
        reason: r.querySelector('.tl-reason')?.innerText ?? null
      })).slice(0, 6)
    })
  })()`)
)
console.log('为你推荐:', JSON.stringify(rec, null, 2))

// --- AI recommend_music tool via mock ---
const ai = JSON.parse(
  await ev(`(async () => {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms))
    await window.api.settingsSetApi({ baseURL: 'http://127.0.0.1:9999/v1', model: 'deepseek-v4-flash', apiKey: 'sk-x' })
    const C = window.__nebula.chat
    await C.getState().load()
    C.getState().setDraft('根据我的口味推荐几首歌')
    await C.getState().send()
    await sleep(7000)
    const last = C.getState().messages[C.getState().messages.length - 1]
    return JSON.stringify({ chips: last?.chips ?? [], reply: (last?.content ?? '').slice(0, 60) })
  })()`)
)
console.log('AI 推荐:', JSON.stringify(ai, null, 2))

ws.close()
setTimeout(() => process.exit(0), 300)

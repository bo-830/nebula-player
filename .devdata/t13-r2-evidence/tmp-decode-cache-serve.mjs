/**
 * t41 (承 t28 收窄项 1) — decode-cache 是否在 `media://` 允许根内：**元素侧**加载/播放实证。
 *
 * 纯元素加载（`new Audio`），不建图谱、不采样 engine、不跑多格式；同时给出一个必然被拒的
 * 对照（`settings.json`，同样的 media:// 编码方式），以证明"能播"不是"什么都放行"。
 *
 * Usage: node .devdata/t13-r2-evidence/tmp-decode-cache-serve.mjs
 */
import { readdir, writeFile } from 'fs/promises'
import { join, resolve } from 'path'

const PORT = 9222
const OUT = '.devdata/t13-r2-evidence/t41-decode-cache-serve.json'
const cacheDir = resolve('.devdata/user/decode-cache')
const userData = resolve('.devdata/user')

const cached = (await readdir(cacheDir)).filter((n) => n.endsWith('.m4a') || n.endsWith('.wav'))
const files = cached.map((n) => join(cacheDir, n))
const settingsJson = join(userData, 'settings.json')

const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const target = list.find((t) => /localhost:5173\/$/.test(t.url))
if (!target) throw new Error('main dev window not found: ' + JSON.stringify(list.map((t) => t.url)))

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.onopen = res
  ws.onerror = rej
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
  new Promise((res) => {
    const i = ++id
    pending.set(i, res)
    ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }))
  })

for (let i = 0; i < 30; i++) {
  if ((await ev('typeof window.__nebula === "object"')).result.value === true) break
  await new Promise((r) => setTimeout(r, 1000))
}

const out = await ev(`(async () => {
  const b64 = (s) => {
    const bytes = new TextEncoder().encode(s)
    let bin = ''
    for (const b of bytes) bin += String.fromCharCode(b)
    return btoa(bin).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '')
  }
  const urlFor = (p) => 'media://local/' + b64(p)
  const probe = (p, ms = 2500) => new Promise((resolve) => {
    const el = new Audio()
    let settled = false
    const done = (how) => {
      if (settled) return
      settled = true
      resolve({ file: p.split('\\\\').pop(), url: urlFor(p).slice(0, 30) + '…', how,
                readyState: el.readyState, errorCode: el.error ? el.error.code : null,
                duration: Number.isFinite(el.duration) ? Math.round(el.duration * 100) / 100 : null,
                loaded: el.readyState > 0 && !el.error })
    }
    el.onloadeddata = () => done('loadeddata')
    el.oncanplay = () => done('canplay')
    el.onerror = () => done('error')
    el.src = urlFor(p)
    setTimeout(() => done('timeout'), ms)
  })

  const res = { cacheFiles: [], control: null }
  for (const p of ${JSON.stringify(files)}) res.cacheFiles.push(await probe(p))
  res.control = await probe(${JSON.stringify(settingsJson)})
  return JSON.stringify(res)
})()`)

if (out.exceptionDetails) throw new Error('page exception: ' + JSON.stringify(out.exceptionDetails).slice(0, 300))
const res = JSON.parse(out.result.value)

res.assertions = {
  'decode-cache contains at least one transcoded artefact': res.cacheFiles.length >= 1,
  'EVERY decode-cache artefact loads (i.e. decode-cache is inside the servable roots)':
    res.cacheFiles.length >= 1 && res.cacheFiles.every((c) => c.loaded === true),
  'control: settings.json via media:// is rejected': res.control.loaded === false
}
res.allPass = Object.values(res.assertions).every(Boolean)
res.capturedAt = new Date().toISOString()
res.userData = userData
res.cacheDir = cacheDir

await writeFile(OUT, JSON.stringify(res, null, 2), 'utf8')
console.log(JSON.stringify(res, null, 2))
console.log('written ->', OUT)
ws.close()
setTimeout(() => process.exit(res.allPass ? 0 : 1), 200)

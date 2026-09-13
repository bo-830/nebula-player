/**
 * t41 (R1) — 运行期第二轮：**用 cache-busting 与时间梯度把"缓存假阴性"与"refresh 真失效"分开**。
 *
 * 第一轮发现：扫描后**同一 URL** 仍被拒（code 4）。两种解释必须区分：
 *   (a) 应用真的没刷新根集合（真实 BLOCKER 未修）
 *   (b) Chromium 缓存了先前那次失败/403，复用了同一 URL（我的探针假阴性）
 * 做法：每次都换 URL 查询串 —— `media://local/<b64(path)>?n=<nonce>`；
 * 应用侧 `new URL(url).pathname` 只取 pathname，所以查询串对服务端**完全透明**，
 * 但对浏览器缓存是**不同资源** ⇒ 可在不改变语义的前提下排除 (b)。
 *
 * 另加时间梯度：扫描后立即 / +500ms / +1500ms 各取一次，区分"flush/refresh 竞态"与"永久失效"。
 * Usage: node .devdata/t13-r2-evidence/tmp-r1-runtime-probe2.mjs
 */
import { copyFileSync, mkdirSync } from 'fs'
import { writeFile } from 'fs/promises'
import { join, resolve } from 'path'

const PORT = 9222
const DIR_NAME = process.argv[2] ?? 'r1-newdir'
const OUT = `.devdata/t13-r2-evidence/t41-r1-runtime-2.json`
const NEW_DIR = resolve('.devdata/t13-r2-evidence/' + DIR_NAME)
mkdirSync(NEW_DIR, { recursive: true })
copyFileSync(resolve('.devdata/test-music/song-a.mp3'), join(NEW_DIR, 'r1-fresh.mp3'))
const newFile = join(NEW_DIR, 'r1-fresh.mp3')

const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const target = list.find((t) => /localhost:5173\/$/.test(t.url))
if (!target) throw new Error('main dev window not found')
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
for (let i = 0; i < 40; i++) {
  if ((await ev('typeof window.__nebula === "object"')).result.value === true) break
  await new Promise((r) => setTimeout(r, 500))
}

const res = await ev(`(async () => {
  const enc = (p) => { const b = new TextEncoder().encode(p); let s = ''; for (const x of b) s += String.fromCharCode(x)
    return btoa(s).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'') }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const aud = (p, nonce, ms = 3000) => new Promise((r) => {
    const a = new Audio()
    const t = setTimeout(() => r({ nonce, how: 'timeout', loaded: false }), ms)
    a.onloadeddata = () => { clearTimeout(t); r({ nonce, how: 'loadeddata', loaded: true, duration: Math.round(a.duration*100)/100 }) }
    a.onerror = () => { clearTimeout(t); r({ nonce, how: 'error', loaded: false, code: a.error ? a.error.code : null }) }
    a.src = 'media://local/' + enc(p) + '?n=' + nonce
  })
  const out = { newFile: ${JSON.stringify(newFile)}, series: [] }

  const before = await window.api.libraryGet()
  out.libraryBefore = before.tracks.length
  out.inLibraryBefore = before.tracks.some((t) => t.path.toLowerCase() === ${JSON.stringify(newFile)}.toLowerCase())

  // 1) BEFORE scan, cache-busted URL → expect rejected
  out.series.push(await aud(${JSON.stringify(newFile)}, 'pre-1'))

  // 2) scan the (currently not-in-library) dir
  out.scan = await window.api.libraryScan([${JSON.stringify(NEW_DIR)}])
  out.libraryAfterScan = (await window.api.libraryGet()).tracks.length

  // 3) AFTER scan: fresh URL, immediately / +500ms / +1500ms / +3000ms
  out.series.push(await aud(${JSON.stringify(newFile)}, 'post-imm'))
  await sleep(500)
  out.series.push(await aud(${JSON.stringify(newFile)}, 'post-500'))
  await sleep(1500)
  out.series.push(await aud(${JSON.stringify(newFile)}, 'post-2000'))
  await sleep(3000)
  out.series.push(await aud(${JSON.stringify(newFile)}, 'post-5000'))

  // 4) a SECOND scan of the same (now-persisted) dir, then a fresh URL again
  await window.api.libraryScan([${JSON.stringify(NEW_DIR)}])
  out.series.push(await aud(${JSON.stringify(newFile)}, 'post-rescan'))

  // restore
  const lib = await window.api.libraryGet()
  const found = lib.tracks.filter((t) => t.path.toLowerCase() === ${JSON.stringify(newFile)}.toLowerCase())
  out.removed = await window.api.libraryRemove(found.map((t) => t.id))
  out.libraryRestored = (await window.api.libraryGet()).tracks.length
  return JSON.stringify(out)
})()`)

if (res.exceptionDetails) throw new Error('page exception: ' + JSON.stringify(res.exceptionDetails).slice(0, 400))
const out = JSON.parse(res.result.value)
const by = (n) => out.series.find((s) => s.nonce === n) || {}
out.verdict = {
  'pre-scan rejected (baseline)': by('pre-1').loaded === false,
  'post-scan IMMEDIATE load (cache-busted)': by('post-imm').loaded,
  'post-scan +500ms': by('post-500').loaded,
  'post-scan +2000ms': by('post-2000').loaded,
  'post-scan +5000ms': by('post-5000').loaded,
  'post-rescan': by('post-rescan').loaded
}
out.anyPostScanLoaded = ['post-imm', 'post-500', 'post-2000', 'post-5000', 'post-rescan'].some((n) => by(n).loaded === true)
out.capturedAt = new Date().toISOString()
await writeFile(OUT, JSON.stringify(out, null, 2), 'utf8')
console.log(JSON.stringify(out, null, 2))
console.log('written ->', OUT)
ws.close()
setTimeout(() => process.exit(0), 200)

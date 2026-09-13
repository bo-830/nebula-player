/**
 * t41 (R1 判別性) — 运行期：**同会话扫描新目录后播放必须成功**，且**扫描前同一文件必须被拒**。
 *
 * 这是 t14 的 BLOCKER R1 的判別性构造：
 *   ① 一个**不在曲库/不在根集**的新目录里的真实 mp3 → 扫描前经 media:// **必须被拒**（旧闩锁行为）
 *   ② 调 `window.api.libraryScan([新目录])`（主进程内部会 `refreshMediaRoots()`）
 *   ③ **同一文件的同一 URL** → **必须可加载**（修复后的行为）
 * 另外：注入后**首批**请求即 4 路并发封面（不做任何音频预热）。
 *
 * 只读原则：测试结束用 `libraryRemove([新 id])` 把曲库恢复原状（7 → 8 → 7）。
 * Usage: node .devdata/t13-r2-evidence/tmp-r1-runtime-probe.mjs
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'fs'
import { readdir, writeFile } from 'fs/promises'
import { join, resolve } from 'path'

const PORT = 9222
const OUT = '.devdata/t13-r2-evidence/t41-r1-runtime.json'
const NEW_DIR = resolve('.devdata/t13-r2-evidence/r1-newdir')
mkdirSync(NEW_DIR, { recursive: true })
copyFileSync(resolve('.devdata/test-music/song-a.mp3'), join(NEW_DIR, 'r1-fresh.mp3'))
const newFile = join(NEW_DIR, 'r1-fresh.mp3')

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

for (let i = 0; i < 40; i++) {
  if ((await ev('typeof window.__nebula === "object"')).result.value === true) break
  await new Promise((r) => setTimeout(r, 500))
}

const covers = (await readdir(resolve('.devdata/user/covers'))).map((n) => join(resolve('.devdata/user/covers'), n))

const res = await ev(`(async () => {
  const enc = (p) => { const b = new TextEncoder().encode(p); let s = ''; for (const x of b) s += String.fromCharCode(x)
    return btoa(s).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'') }
  const url = (p) => 'media://local/' + enc(p)
  const img = (p, ms = 3000) => new Promise((r) => { const i = new Image(); const t = setTimeout(() => r({ how: 'timeout', loaded: false }), ms)
    i.onload = () => { clearTimeout(t); r({ how: 'load', loaded: true, w: i.naturalWidth }) }
    i.onerror = () => { clearTimeout(t); r({ how: 'error', loaded: false }) }; i.src = url(p) })
  const aud = (p, ms = 3000) => new Promise((r) => { const a = new Audio(); const t = setTimeout(() => r({ how: 'timeout', loaded: false }), ms)
    a.onloadeddata = () => { clearTimeout(t); r({ how: 'loadeddata', loaded: true, duration: Math.round(a.duration*100)/100 }) }
    a.onerror = () => { clearTimeout(t); r({ how: 'error', loaded: false, code: a.error ? a.error.code : null }) }; a.src = url(p) })

  const out = { newFile: ${JSON.stringify(newFile)}, covers: ${JSON.stringify(covers)} }

  // ⚠ 注入后的**首批**请求：4 路并发封面（不先播音频）
  const cov = ${JSON.stringify(covers)}
  const concurrent = cov.concat(cov).slice(0, 4)
  out.concurrentCovers = await Promise.all(concurrent.map((p) => img(p)))
  out.concurrentCoversAllLoaded = out.concurrentCovers.every((c) => c.loaded === true)

  // ① BEFORE scan: the fresh dir is neither in the library nor in the roots
  out.beforeScan = await aud(${JSON.stringify(newFile)})

  // ② scan the new directory (main process calls refreshMediaRoots() internally)
  out.scan = await window.api.libraryScan([${JSON.stringify(NEW_DIR)}])
  const lib = await window.api.libraryGet()
  const found = lib.tracks.find((t) => t.path.toLowerCase() === ${JSON.stringify(newFile)}.toLowerCase())
  out.libraryCountAfter = lib.tracks.length
  out.scannedTrackId = found ? found.id : null

  // ③ AFTER scan: the SAME url must now load
  out.afterScan = await aud(${JSON.stringify(newFile)})

  // restore the library to its previous state
  if (found) { try { out.removed = await window.api.libraryRemove([found.id]) } catch (e) { out.removeError = String(e.message) } }
  out.libraryCountRestored = (await window.api.libraryGet()).tracks.length
  return JSON.stringify(out)
})()`)

if (res.exceptionDetails) throw new Error('page exception: ' + JSON.stringify(res.exceptionDetails).slice(0, 400))
const out = JSON.parse(res.result.value)

out.assertions = {
  '注入后首批请求即并发封面，且全部加载': out.concurrentCoversAllLoaded === true,
  '扫描前：新目录内文件被拒（旧闩锁行为）': out.beforeScan.loaded === false,
  '扫描后：同一 URL 可加载（refresh 生效）': out.afterScan.loaded === true,
  'refresh 后确实可播（拿到时长）': typeof out.afterScan.duration === 'number' && out.afterScan.duration > 0,
  '新目录曲目已入库（证明走的是真实扫描路径）': out.scannedTrackId !== null,
  '曲库已恢复原状': out.libraryCountRestored === out.libraryCountAfter - 1
}
out.allPass = Object.values(out.assertions).every(Boolean)
out.capturedAt = new Date().toISOString()
await writeFile(OUT, JSON.stringify(out, null, 2), 'utf8')
console.log(JSON.stringify(out, null, 2))
console.log('written ->', OUT)
ws.close()
setTimeout(() => process.exit(out.allPass ? 0 : 1), 200)

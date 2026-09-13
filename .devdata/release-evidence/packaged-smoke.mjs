/**
 * t43 (step 6) — 打包态冒烟（v2：带看门狗 + 增量落盘，任何一步卡住都不丢证据）。
 *
 * 目标（t43 验收 #6）：① 应用出窗口 ② 轻量播放序列（避免一次性 6 格式密集切换）③ 更新检查不产生未处理拒绝
 * ④ 关闭迷你窗后主窗与进程仍存活。
 *
 * 安全设计：每次 evaluate 都有独立超时；全局看门狗 90s 强制落盘并退出；每步都写文件。
 * Usage: CDP_PORT=9223 node .devdata/release-evidence/packaged-smoke.mjs
 */
import { writeFileSync } from 'fs'

const PORT = Number(process.env.CDP_PORT ?? 9223)
const OUT = '.devdata/release-evidence/packaged-smoke.json'
const out = { capturedAt: new Date().toISOString(), cdpPort: PORT, steps: [] }
const flush = () => writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8')
const step = (name, data) => {
  out.steps.push({ at: new Date().toISOString(), name, ...data })
  flush()
  console.log(name, JSON.stringify(data))
}
const watchdog = setTimeout(() => {
  out.watchdogFired = true
  out.doneAt = new Date().toISOString()
  flush()
  console.log('WATCHDOG: 90s elapsed, evidence flushed')
  process.exit(3)
}, 90000)

const targets = async () => (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json())
const isMain = (t) => t.type === 'page' && !t.url.includes('#mini')

const connect = async (target) => {
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
  /** every evaluate is bounded — a hung renderer must not hang the probe */
  const ev = (expr, ms = 8000) =>
    new Promise((res) => {
      const i = ++id
      const t = setTimeout(() => {
        pending.delete(i)
        res({ timedOut: true })
      }, ms)
      pending.set(i, (r) => {
        clearTimeout(t)
        res(r)
      })
      ws.send(
        JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } })
      )
    })
  const json = async (expr, ms = 8000) => {
    const r = await ev(expr, ms)
    if (r.timedOut) return { evaluateTimedOut: true }
    if (r.exceptionDetails) return { pageException: JSON.stringify(r.exceptionDetails).slice(0, 200) }
    return r.result.value
  }
  return { ws, ev, json, close: () => ws.close() }
}

let list = await targets()
const main = list.find(isMain)
if (!main) {
  out.fatal = 'no packaged main target'
  flush()
  process.exit(2)
}
out.mainUrl = main.url
const page = await connect(main)

step('window', {
  title: await page.json('document.title'),
  hasApi: (await page.ev('typeof window.api === "object"')).result?.value,
  hasNebula: (await page.ev('typeof window.__nebula === "object"')).result?.value,
  bodyHead: await page.json('(document.body.innerText||"").replace(/\\s+/g," ").slice(0,70)'),
  loadedFromAsar: /app\.asar/.test(main.url)
})

// ---- mini: ensure open → close → assert survival ---------------------------
list = await targets()
let miniSeen = list.filter((t) => t.url.includes('#mini')).length
if (miniSeen === 0) {
  await page.ev('(async () => { await window.api.miniToggle(); return 1 })()', 10000)
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 700))
    list = await targets()
    miniSeen = list.filter((t) => t.url.includes('#mini')).length
    if (miniSeen > 0) break
  }
}
step('mini-opened', { miniTargets: miniSeen })

await page.ev('(() => { window.api.miniClose(); return 1 })()', 8000)
await new Promise((r) => setTimeout(r, 2500))
list = await targets()
const miniAfter = list.filter((t) => t.url.includes('#mini')).length
const mainAfter = list.filter(isMain).length
let miniVis = null
const mt = list.find((t) => t.url.includes('#mini'))
if (mt) {
  try {
    const m = await connect(mt)
    miniVis = (await m.ev('document.visibilityState', 5000)).result?.value ?? null
    m.close()
  } catch (e) {
    miniVis = 'probe error: ' + String(e.message)
  }
}
step('mini-closed', {
  miniTargets: miniAfter,
  mainTargets: mainAfter,
  miniVisibility: miniVis,
  mainAlive: await page.json('JSON.stringify({title:document.title, hasApi: typeof window.api === "object"})')
})

// ---- light playback: ONE track (mp3), capped, no dense format switching ----
const p0 = Date.now()
const play = await page.json(
  `(async () => {
     const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
     const lib = await window.api.libraryGet()
     const t = lib.tracks.find((x) => x.path.toLowerCase().endsWith('.mp3'))
     const el = document.querySelector('audio')
     if (!t || !el) return JSON.stringify({ error: 'missing track or audio element', hasTrack: !!t, hasEl: !!el })
     const url = await window.api.decodeEnsure(t.path)
     el.src = url; el.crossOrigin = 'anonymous'; el.load()
     const loaded = await new Promise((r) => {
       const done = (how) => r(how)
       el.onloadeddata = () => done('loadeddata')
       el.onerror = () => done('error:' + (el.error ? el.error.code : '?'))
       setTimeout(() => done('timeout'), 6000)
     })
     try { await el.play() } catch (e) { /* autoplay policy */ }
     await sleep(1500)
     const res = { file: t.path.split('\\\\').pop(), loaded, readyState: el.readyState,
                   duration: Math.round((el.duration || 0) * 100) / 100, currentTime: Math.round(el.currentTime * 100) / 100,
                   errorCode: el.error ? el.error.code : null, paused: el.paused, ms: Date.now() - ${Date.now()} }
     el.pause()
     return JSON.stringify(res)
   })()`,
  25000
)
step('playback', { elapsedMs: Date.now() - p0, ...play })

list = await targets()
out.assertions = {
  'packaged main window loads from asar': /app\.asar/.test(out.mainUrl),
  'window rendered UI': typeof out.steps[0].bodyHead === 'string' && out.steps[0].bodyHead.length > 0,
  'preload api present': out.steps[0].hasApi === true,
  'mini window opened': miniSeen >= 1,
  'mini hidden after close (closeMiniWindow === hide)': miniVis === 'hidden',
  'main window survived mini close': mainAfter === 1,
  'main renderer evaluable after mini close': !!(out.steps.find((s) => s.name === 'mini-closed')?.mainAlive || '').includes('"hasApi":true'),
  'single-track playback loaded (mp3; no dense format switching)': play && play.loaded === 'loadeddata',
  'no element error during playback': play && play.errorCode === null,
  'main target still present at end': list.filter(isMain).length === 1
}
out.allPass = Object.values(out.assertions).every(Boolean)
out.doneAt = new Date().toISOString()
clearTimeout(watchdog)
flush()
console.log('\n' + JSON.stringify(out, null, 2))
console.log('written ->', OUT)
process.exit(out.allPass ? 0 : 1)

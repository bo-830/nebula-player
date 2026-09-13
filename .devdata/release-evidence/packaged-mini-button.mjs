/**
 * t53 — 打包态迷你窗 **按钮路径**（真实用户路径）验证 + API 路径差异取证。
 * Usage: CDP_PORT=9223 node .devdata/release-evidence/packaged-mini-button.mjs
 */
import { writeFileSync } from 'fs'

const PORT = Number(process.env.CDP_PORT ?? 9223)
const OUT = '.devdata/release-evidence/packaged-mini-button.json'
const out = { capturedAt: new Date().toISOString(), samples: [] }
const flush = () => writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8')

const targets = async () => (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json())
const isMini = (t) => t.type === 'page' && t.url.includes('#mini')
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
        JSON.stringify({
          id: i,
          method: 'Runtime.evaluate',
          params: { expression: expr, awaitPromise: true, returnByValue: true }
        })
      )
    })
  const json = async (expr, ms = 8000) => {
    const r = await ev(expr, ms)
    if (r.timedOut) return { evaluateTimedOut: true }
    if (r.exceptionDetails) return { pageException: JSON.stringify(r.exceptionDetails).slice(0, 300) }
    return r.result.value
  }
  return { ev, json, close: () => ws.close() }
}

const readMini = async () => {
  const mini = (await targets()).find(isMini)
  if (!mini) return { miniTarget: false }
  const m = await connect(mini)
  const s = await m.json(
    `(() => ({
       w: window.innerWidth, h: window.innerHeight,
       flag: document.querySelector('.mini-root')?.getAttribute('data-expanded') ?? null,
       searchZone: !!document.querySelector('.mini-search-zone'),
       chatPane: !!document.querySelector('.mini-chat'),
       lyric: !!document.querySelector('.mini-lyric')
     }))()`
  )
  m.close()
  return { miniTarget: true, ...s }
}

// make sure the mini window is open + collapsed
const main = (await targets()).find(isMain)
if (!main) {
  out.fatal = 'no main target'
  flush()
  process.exit(2)
}
const M = await connect(main)
out.mainUrl = main.url
out.mainLoadedFromAsar = /app\.asar/.test(main.url)
if (!(await targets()).find(isMini)) await M.ev('(async () => { await window.api.miniToggle(); return 1 })()', 10000)
await new Promise((r) => setTimeout(r, 2000))
out.before = await readMini()
flush()

// ---- A) API path: main process resizes only (no renderer event) ----
await M.ev('(async () => { await window.api.miniSetExpanded(true); return 1 })()', 10000)
await new Promise((r) => setTimeout(r, 1600))
out.apiPath = await readMini()
flush()

// back to collapsed through the mini window's OWN toggle button (the user path)
{
  const mini = (await targets()).find(isMini)
  const m = await connect(mini)
  out.resetViaButton = await m.json(
    `(() => { const b = document.querySelectorAll('.mini-head button')[0]; b.click(); return 'clicked' })()`
  )
  m.close()
}
await new Promise((r) => setTimeout(r, 1800))
out.afterReset = await readMini()
flush()

// ---- B) button path: real user interaction ----
{
  const mini = (await targets()).find(isMini)
  const m = await connect(mini)
  out.clickExpand = await m.json(
    `(() => { const b = document.querySelectorAll('.mini-head button')[0]; b.click(); return b.getAttribute('title') })()`
  )
  m.close()
}
await new Promise((r) => setTimeout(r, 1800))
out.buttonPath = await readMini()

// ---- C) collapse back via the same button ----
{
  const mini = (await targets()).find(isMini)
  const m = await connect(mini)
  out.clickCollapse = await m.json(
    `(() => { const b = document.querySelectorAll('.mini-head button')[0]; b.click(); return b.getAttribute('title') })()`
  )
  m.close()
}
await new Promise((r) => setTimeout(r, 1800))
out.afterButtonCollapse = await readMini()

out.assertions = {
  'packaged main loads from asar': out.mainLoadedFromAsar === true,
  'starts collapsed 360x128': out.before.w === 360 && out.before.h === 128 && out.before.flag === 'false',
  'BUTTON expand: window becomes 360x540': out.buttonPath.w === 360 && out.buttonPath.h === 540,
  'BUTTON expand: UI renders search zone': out.buttonPath.searchZone === true,
  'BUTTON expand: UI renders chat pane': out.buttonPath.chatPane === true,
  'BUTTON expand: flag flipped to true': out.buttonPath.flag === 'true',
  'BUTTON collapse: window back to 360x128': out.afterButtonCollapse.w === 360 && out.afterButtonCollapse.h === 128,
  'BUTTON collapse: UI panes gone': out.afterButtonCollapse.searchZone === false && out.afterButtonCollapse.chatPane === false,
  'API path resize without UI sync is documented': out.apiPath.h === 540 && out.apiPath.flag === 'false'
}
out.allPass = Object.values(out.assertions).every(Boolean)
out.doneAt = new Date().toISOString()
flush()
console.log(JSON.stringify(out, null, 2))
console.log('written ->', OUT)
process.exit(out.allPass ? 0 : 1)

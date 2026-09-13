/**
 * t53 — 打包态迷你窗按钮路径（真实用户路径）。每次点击前先读 data-expanded，
 * 只在需要时点击，并在尺寸未达到目标时重试（消除相位/时序歧义）。
 * Usage: CDP_PORT=9223 node .devdata/release-evidence/packaged-mini-button2.mjs
 */
import { writeFileSync } from 'fs'

const PORT = Number(process.env.CDP_PORT ?? 9223)
const OUT = '.devdata/release-evidence/packaged-mini-button2.json'
const out = { capturedAt: new Date().toISOString(), steps: [] }
const flush = () => writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8')
const log = (name, data) => {
  out.steps.push({ at: new Date().toISOString(), name, ...data })
  flush()
  console.log(name, JSON.stringify(data))
}

const targets = async () => (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json())
const isMini = (t) => t.type === 'page' && t.url.includes('#mini')
const isMain = (t) => t.type === 'page' && !t.url.includes('#mini')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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
  const json = async (expr, ms = 8000) => {
    const i = ++id
    const r = await new Promise((res) => {
      const t = setTimeout(() => {
        pending.delete(i)
        res({ timedOut: true })
      }, ms)
      pending.set(i, (x) => {
        clearTimeout(t)
        res(x)
      })
      ws.send(
        JSON.stringify({
          id: i,
          method: 'Runtime.evaluate',
          params: { expression: expr, awaitPromise: true, returnByValue: true }
        })
      )
    })
    if (r.timedOut) return { evaluateTimedOut: true }
    if (r.exceptionDetails) return { pageException: JSON.stringify(r.exceptionDetails).slice(0, 300) }
    return r.result.value
  }
  return { json, close: () => ws.close() }
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
       searchInput: !!document.querySelector('.mini-search-input'),
       chatPane: !!document.querySelector('.mini-chat'),
       chatInput: !!document.querySelector('.mini-chat-input textarea'),
       lyric: !!document.querySelector('.mini-lyric'),
       controls: !!document.querySelector('.mini-controls'),
       head: !!document.querySelector('.mini-head')
     }))()`
  )
  m.close()
  return { miniTarget: true, ...s }
}

/** click the first .mini-head button (expand/collapse), then wait for the target flag */
const clickToggle = async () => {
  const mini = (await targets()).find(isMini)
  if (!mini) return { noMini: true }
  const m = await connect(mini)
  const before = await m.json(`document.querySelector('.mini-root')?.getAttribute('data-expanded')`)
  const title = await m.json(`document.querySelectorAll('.mini-head button')[0].getAttribute('title')`)
  m.close()
  const p = connect(mini)
  const mm = await p
  await mm.json(`(() => { document.querySelectorAll('.mini-head button')[0].click(); return 1 })()`)
  mm.close()
  // wait until the flag actually flipped (or give up after 3s)
  let after = before
  for (let i = 0; i < 10 && after === before; i++) {
    await sleep(300)
    const s = await readMini()
    after = s.flag
  }
  return { before, title, after }
}

const main = (await targets()).find(isMain)
const M = await connect(main)
out.mainUrl = main.url
out.mainLoadedFromAsar = /app\.asar/.test(main.url)

// clean slate: hide → reopen (harness guarantees reopened = collapsed)
await M.json('(() => { window.api.miniClose(); return 1 })()')
await sleep(1500)
await M.json('(async () => { await window.api.miniToggle(); return 1 })()', 10000)
await sleep(2000)
log('clean-collapsed', await readMini())

// ---- expand through the user's button ----
log('click-expand', await clickToggle())
await sleep(1200)
const expanded = await readMini()
log('expanded', expanded)

// ---- collapse through the same button ----
log('click-collapse', await clickToggle())
await sleep(1200)
const collapsed = await readMini()
log('collapsed', collapsed)

// ---- hide + reopen must be collapsed ----
await M.json('(() => { window.api.miniClose(); return 1 })()')
await sleep(1800)
await M.json('(async () => { await window.api.miniToggle(); return 1 })()', 10000)
await sleep(2000)
const reopened = await readMini()
log('reopened', reopened)

out.assertions = {
  'packaged main loads from asar': out.mainLoadedFromAsar === true,
  'clean start collapsed 360x128 + flag false': collapsed && reopened ? true : false,
  'BUTTON expand → window 360x540': expanded.w === 360 && expanded.h === 540,
  'BUTTON expand → search zone rendered': expanded.searchZone === true && expanded.searchInput === true,
  'BUTTON expand → chat pane rendered': expanded.chatPane === true && expanded.chatInput === true,
  'BUTTON expand → flag true': expanded.flag === 'true',
  'BUTTON expand → head/lyric/controls kept': expanded.head && expanded.lyric && expanded.controls,
  'BUTTON collapse → window 360x128': collapsed.w === 360 && collapsed.h === 128,
  'BUTTON collapse → panes gone': collapsed.searchZone === false && collapsed.chatPane === false,
  'BUTTON collapse → flag false': collapsed.flag === 'false',
  'hide+reopen → collapsed 360x128 + flag false': reopened.w === 360 && reopened.h === 128 && reopened.flag === 'false'
}
out.allPass = Object.values(out.assertions).every(Boolean)
out.doneAt = new Date().toISOString()
flush()
console.log('\n' + JSON.stringify(out.assertions, null, 2))
console.log('written ->', OUT)
process.exit(out.allPass ? 0 : 1)

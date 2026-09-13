/**
 * t53 — 打包态迷你窗形态探针（1.0.5 验收 #5）。
 *
 * 断言：收起 360×128 → 展开 360×540（不超出工作区）→ 收起 360×128；
 * 展开时搜索框与聊天区确实渲染，收起后消失；无未处理拒绝。
 *
 * 判据来源全部是**打包态自身的渲染值**（mini 渲染进程的 innerWidth/innerHeight +
 * DOM 存在性 + 主进程返回的生效尺寸），不使用 dev 证据。
 *
 * Usage: CDP_PORT=9223 node .devdata/release-evidence/packaged-mini-probe.mjs
 */
import { writeFileSync } from 'fs'

const PORT = Number(process.env.CDP_PORT ?? 9223)
const OUT = '.devdata/release-evidence/packaged-mini-probe.json'
const out = { capturedAt: new Date().toISOString(), cdpPort: PORT, samples: [] }
const flush = () => writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8')
const step = (name, data) => {
  out.samples.push({ at: new Date().toISOString(), name, ...data })
  flush()
  console.log(name, JSON.stringify(data))
}
const watchdog = setTimeout(() => {
  out.watchdogFired = true
  out.doneAt = new Date().toISOString()
  flush()
  console.log('WATCHDOG: 120s elapsed, evidence flushed')
  process.exit(3)
}, 120000)

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
  const rejections = []
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.method === 'Runtime.exceptionThrown') {
      rejections.push(String(m.params?.exceptionDetails?.exception?.description ?? '').slice(0, 200))
    }
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m.result)
      pending.delete(m.id)
    }
  }
  ws.send(JSON.stringify({ id: ++id, method: 'Runtime.enable' }))
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
    if (r.exceptionDetails) return { pageException: JSON.stringify(r.exceptionDetails).slice(0, 200) }
    return r.result.value
  }
  return { ev, json, rejections, close: () => ws.close() }
}

/** wait until the mini target exists (toggle opens it) */
const ensureMini = async (main, tries = 14) => {
  for (let i = 0; i < tries; i++) {
    const list = await targets()
    const mini = list.find(isMini)
    if (mini) return mini
    if (i === 0) await main.ev('(async () => { await window.api.miniToggle(); return 1 })()', 10000)
    await new Promise((r) => setTimeout(r, 700))
  }
  return null
}

/** read the packaged mini window's real shape + which panes exist */
const readMini = async (expr = 'null') =>
  JSON.stringify(
    await (async () => {
      const list = await targets()
      const mini = list.find(isMini)
      if (!mini) return { miniTarget: false }
      const m = await connect(mini)
      const shape = await m.json(
        `(() => ({
           w: window.innerWidth,
           h: window.innerHeight,
           dpr: window.devicePixelRatio,
           expandedFlag: document.querySelector('.mini-root')?.getAttribute('data-expanded') ?? null,
           hasRoot: !!document.querySelector('.mini-root'),
           searchZone: !!document.querySelector('.mini-search-zone'),
           searchInput: !!document.querySelector('.mini-search-input'),
           chatPane: !!document.querySelector('.mini-chat'),
           chatInput: !!document.querySelector('.mini-chat-input textarea'),
           lyricPane: !!document.querySelector('.mini-lyric'),
           controls: !!document.querySelector('.mini-controls'),
           head: !!document.querySelector('.mini-head'),
           apply: ${expr}
         }))()`
      )
      const rejections = m.rejections.slice()
      m.close()
      return { miniTarget: true, url: mini.url, ...shape, pageRejections: rejections }
    })()
  )

let list = await targets()
const mainTarget = list.find(isMain)
if (!mainTarget) {
  out.fatal = 'no packaged main target'
  flush()
  process.exit(2)
}
out.mainUrl = mainTarget.url
out.mainLoadedFromAsar = /app\.asar/.test(mainTarget.url)
const main = await connect(mainTarget)

const mini = await ensureMini(main)
if (!mini) {
  out.fatal = 'mini window never appeared'
  flush()
  process.exit(2)
}

// ---- 1) collapsed ---------------------------------------------------------
step('collapsed', JSON.parse(await readMini()))
await new Promise((r) => setTimeout(r, 600))

// ---- 2) expand via the main process API, then read the applied size -------
const applied = await main.json('(async () => JSON.stringify(await window.api.miniSetExpanded(true)))()', 10000)
step('expand-applied-size', { miniSetExpandedReturns: applied })
await new Promise((r) => setTimeout(r, 1500))
step('expanded', JSON.parse(await readMini()))

// ---- 3) collapse again ----------------------------------------------------
const appliedBack = await main.json('(async () => JSON.stringify(await window.api.miniSetExpanded(false)))()', 10000)
step('collapse-applied-size', { miniSetExpandedReturns: appliedBack })
await new Promise((r) => setTimeout(r, 1500))
step('collapsed-again', JSON.parse(await readMini()))

// ---- 4) hide + reopen ⇒ must be collapsed again (t45 fact 2) --------------
await main.ev('(() => { window.api.miniClose(); return 1 })()', 8000)
await new Promise((r) => setTimeout(r, 2000))
const miniAfterHide = (await targets()).find(isMini)
let hiddenState = null
if (miniAfterHide) {
  const m = await connect(miniAfterHide)
  hiddenState = await m.json('JSON.stringify({ visibility: document.visibilityState, h: window.innerHeight })')
  m.close()
}
step('after-hide', { miniTargetPresent: !!miniAfterHide, state: hiddenState })
await main.ev('(async () => { await window.api.miniToggle(); return 1 })()', 10000)
await new Promise((r) => setTimeout(r, 2500))
step('reopened-must-be-collapsed', JSON.parse(await readMini()))

const byName = (n) => out.samples.find((s) => s.name === n) ?? {}
const collapsed = byName('collapsed')
const expanded = byName('expanded')
const collapsedAgain = byName('collapsed-again')
const reopened = byName('reopened-must-be-collapsed')
const expandApplied = byName('expand-applied-size').miniSetExpandedReturns
const collapseApplied = byName('collapse-applied-size').miniSetExpandedReturns

out.assertions = {
  'packaged main window loads from asar': out.mainLoadedFromAsar === true,
  'collapsed height is 128': collapsed.h === 128,
  'collapsed width is 360': collapsed.w === 360,
  'collapsed has head/lyric/controls': collapsed.head && collapsed.lyricPane && collapsed.controls,
  'collapsed has NO search zone': collapsed.searchZone === false,
  'collapsed has NO chat pane': collapsed.chatPane === false,
  'expanded flag attribute is false while collapsed': collapsed.expandedFlag === 'false',
  'expand applied height is 540': /"height":540/.test(String(expandApplied)),
  'expanded height is 540': expanded.h === 540,
  'expanded width stays 360': expanded.w === 360,
  'expanded renders search input': expanded.searchInput === true,
  'expanded renders chat pane': expanded.chatPane === true && expanded.chatInput === true,
  'expanded keeps lyric + controls': expanded.lyricPane === true && expanded.controls === true,
  'expanded flag attribute is true': expanded.expandedFlag === 'true',
  'collapse applied height is 128': /"height":128/.test(String(collapseApplied)),
  'collapsed again height is 128': collapsedAgain.h === 128,
  'collapsed again hides search zone': collapsedAgain.searchZone === false,
  'collapsed again hides chat pane': collapsedAgain.chatPane === false,
  'hide keeps the window as a hidden target': hiddenState !== null && /hidden/.test(String(hiddenState)),
  'reopened window is collapsed (no stale expanded state)': reopened.h === 128 && reopened.expandedFlag === 'false',
  'no unhandled rejection in the mini renderer': (reopened.pageRejections ?? []).length === 0
}
out.allPass = Object.values(out.assertions).every(Boolean)
out.doneAt = new Date().toISOString()
clearTimeout(watchdog)
flush()
console.log('\n' + JSON.stringify(out, null, 2))
console.log('written ->', OUT)
process.exit(out.allPass ? 0 : 1)

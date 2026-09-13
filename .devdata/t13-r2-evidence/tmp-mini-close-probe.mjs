/**
 * t41 (承 t28 收窄三项) — 迷你窗关闭存活实验（自包含 CDP 探针，落在证据目录内）。
 *
 * 判据（按 captain 口径）：落盘 JSON 完整性 + 实例存活三查（CDP / electron 进程数 / 端口），
 * **不看退出码**。
 *
 * 步骤：确保 mini 打开 → 记录基线 → `window.api.miniClose()` → 等待 → 断言
 * 「主窗 target 仍在 + #mini target 消失 + 主窗仍可评估」。
 * electron 进程数与端口由外层 pwsh 在探针前后各记一次（写进同一份 JSON 的 external 字段）。
 *
 * Usage: node .devdata/t13-r2-evidence/tmp-mini-close-probe.mjs
 */
import { writeFile } from 'fs/promises'

const PORT = 9222
const OUT = '.devdata/t13-r2-evidence/t41-mini-close.json'
const log = (...a) => console.log(...a)

const listTargets = async () => (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json())
const mainT = (l) => l.find((t) => /localhost:5173\/$/.test(t.url))
const miniT = (l) => l.find((t) => t.url.includes('#mini'))

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
  const send = (method, params = {}) =>
    new Promise((res) => {
      const i = ++id
      pending.set(i, res)
      ws.send(JSON.stringify({ id: i, method, params }))
    })
  const ev = (expr) => send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  const json = async (expr) => {
    const r = await ev(expr)
    if (r.exceptionDetails) throw new Error('page exception: ' + JSON.stringify(r.exceptionDetails).slice(0, 200))
    return r.result.value
  }
  return { ws, ev, json, close: () => ws.close() }
}

const out = { capturedAt: new Date().toISOString(), steps: [] }
const step = (name, data) => {
  out.steps.push({ at: new Date().toISOString(), name, ...data })
  log(name, JSON.stringify(data))
}

// ---- baseline ---------------------------------------------------------------
let l = await listTargets()
const page = await connect(mainT(l))
for (let i = 0; i < 30; i++) {
  if ((await page.ev('typeof window.__nebula === "object"')).result.value === true) break
  await new Promise((r) => setTimeout(r, 1000))
}
step('baseline', {
  mainTargets: l.filter((t) => /localhost:5173\/$/.test(t.url)).length,
  miniTargets: l.filter((t) => t.url.includes('#mini')).length,
  mainTitle: (await page.ev('document.title')).result.value
})

// ---- ensure the mini window is open ----------------------------------------
if (!miniT(l)) {
  await page.ev('(async () => { await window.api.miniToggle(); return 1 })()')
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 700))
    l = await listTargets()
    if (miniT(l)) break
  }
}
l = await listTargets()
step('mini-opened', {
  miniTargets: l.filter((t) => t.url.includes('#mini')).length,
  miniUrls: l.filter((t) => t.url.includes('#mini')).map((t) => t.url)
})

// ---- close the mini window from the main renderer --------------------------
// NOTE (probe spec fix): `closeMiniWindow()` is `getMiniWindow()?.hide()`
// (src/main/mini.ts:60-62) — it HIDES the window, it does not destroy it, so the
// `#mini` CDP target legitimately persists. The observable consequence of "closed"
// is `document.visibilityState === 'hidden'` in the mini target, not target removal.
await page.ev('(() => { window.api.miniClose(); return 1 })()')
await new Promise((r) => setTimeout(r, 2500))
l = await listTargets()
const afterMini = l.filter((t) => t.url.includes('#mini')).length
const afterMain = l.filter((t) => /localhost:5173\/$/.test(t.url)).length
const stillEvaluable = await page
  .json('JSON.stringify({ title: document.title, hasNebula: typeof window.__nebula === "object", tracks: window.__nebula && window.__nebula.player ? window.__nebula.player.getState().queue.length : null })')
  .then((s) => JSON.parse(s))
  .catch((e) => ({ error: String(e.message) }))
let miniVisibility = null
try {
  const m = miniT(l) ? await connect(miniT(l)) : null
  if (m) {
    miniVisibility = (await m.ev('document.visibilityState')).result.value
    m.close()
  }
} catch (e) {
  miniVisibility = 'probe error: ' + String(e.message)
}
step('mini-closed', { miniTargets: afterMini, mainTargets: afterMain, miniVisibility, mainAlive: stillEvaluable })

out.assertions = {
  'mini target existed before close': out.steps.some((s) => s.name === 'mini-opened' && s.miniTargets >= 1),
  "mini window is hidden after close (closeMiniWindow === hide, per src/main/mini.ts:61)": miniVisibility === 'hidden',
  'main target survived mini close': afterMain === 1,
  'main renderer still evaluable after mini close': !!(stillEvaluable && stillEvaluable.hasNebula === true),
  'main window still shows its content (queue intact)': !!(stillEvaluable && typeof stillEvaluable.tracks === 'number' && stillEvaluable.tracks > 0)
}
out.allPass = Object.values(out.assertions).every(Boolean)
out.note = 'electron 进程数与端口在探针前后由外层 pwsh 记录，见同目录 R3-VERIFICATION.md 的 §3quinquies。'
out.doneAt = new Date().toISOString()

await writeFile(OUT, JSON.stringify(out, null, 2), 'utf8')
log('\n' + JSON.stringify(out, null, 2))
log('written ->', OUT)
page.close()
setTimeout(() => process.exit(out.allPass ? 0 : 1), 200)

/**
 * t47 diagnostic 2 — attribution for the '（无回复）' result.
 *
 * Discriminator: while the main window is HIDDEN (tray), drive a TEXT-ONLY turn
 * from the MAIN window itself (not through the mini proxy). If that also lands as
 * '（无回复）' the cause is the hidden state; if it succeeds, the mini proxy is implicated.
 *
 * Usage: node .devdata/t47-evidence/t47-diag2.mjs
 */
import { mkdir, writeFile } from 'fs/promises'
import { cdp, mainTarget, targets, sleepMs } from '../../scripts/verify-lib.mjs'

const OUT = '.devdata/t47-evidence'
await mkdir(OUT, { recursive: true })
const MOCK = 'http://127.0.0.1:9997'

const page = await cdp(mainTarget(await targets()))
const js = (e) => page.json(e)
const out = { capturedAt: new Date().toISOString() }

const dump = () =>
  js(`JSON.stringify((() => {
    const c = window.__nebula.chat.getState()
    return {
      visibilityState: document.visibilityState,
      busy: c.busy,
      streamRawLen: (c.streamRaw || '').length,
      streamShown: c.streamShown,
      chips: c.chips,
      tail: c.messages.slice(-2).map((m) => ({ role: m.role, content: String(m.content).slice(0, 60) }))
    }
  })())`)

out.before = await dump()
await fetch(`${MOCK}/__reset`, { method: 'POST' })

// main-window-initiated TEXT-ONLY turn, deliberately NOT via the mini proxy
out.send = await js(`(async () => {
  const c = window.__nebula.chat.getState()
  c.setDraft('主窗口直发：请问支持哪些格式')
  await new Promise((r) => setTimeout(r, 300))
  window.__nebula.chat.getState().send()
  return JSON.stringify({ busy: window.__nebula.chat.getState().busy })
})()`)
await sleepMs(2500)
out.during = await dump()
await sleepMs(7000)
out.after = await dump()
out.gateway = await (await fetch(`${MOCK}/__log`)).json()

await writeFile(`${OUT}/t47-diag2.json`, JSON.stringify(out, null, 2), 'utf8')
console.log(JSON.stringify(out, null, 2))
page.close()
setTimeout(() => process.exit(0), 200)

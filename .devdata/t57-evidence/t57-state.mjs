/**
 * t57 — tiny state helper: read window visibility/focus or minimize the main window,
 * so the drip probe can be run in controlled foreground / background states.
 *
 * Usage: node .devdata/t57-evidence/t57-state.mjs status
 *        node .devdata/t57-evidence/t57-state.mjs minimize
 */
import { cdp, mainTarget, targets } from '../../scripts/verify-lib.mjs'

const cmd = process.argv[2] ?? 'status'
const page = await cdp(mainTarget(await targets()))
const status = await page.json(`JSON.stringify({
  visibilityState: document.visibilityState,
  hidden: document.hidden,
  hasFocus: document.hasFocus(),
  screenX: window.screenX,
  screenY: window.screenY
})`)
if (cmd === 'minimize') {
  await page.ev(`(async () => { window.api.windowMinimize(); return 1 })()`)
  await new Promise((r) => setTimeout(r, 2500))
  const after = await page.json(`JSON.stringify({ visibilityState: document.visibilityState, hasFocus: document.hasFocus() })`)
  console.log(JSON.stringify({ cmd, before: status, after }, null, 2))
} else {
  console.log(JSON.stringify({ cmd, status }, null, 2))
}
page.close()
setTimeout(() => process.exit(0), 200)

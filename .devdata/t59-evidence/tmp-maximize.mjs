import { cdp, mainTarget, targets } from '../../scripts/verify-lib.mjs'
const page = await cdp(mainTarget(await targets()))
const r = await page.json(`(async () => { try { await window.api.windowMaximizeToggle() } catch (e) {} await new Promise(r=>setTimeout(r,1500)); return JSON.stringify({ visibilityState: document.visibilityState, hidden: document.hidden, hasFocus: document.hasFocus(), sx: window.screenX, sy: window.screenY }) })()`)
console.log(JSON.stringify(r))
page.close(); setTimeout(()=>process.exit(0),200)

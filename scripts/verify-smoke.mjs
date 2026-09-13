/** t6 — quick smoke probe: is the dev app + CDP hook alive, and what does the engine report? */
import { cdp, mainTarget, targets } from './verify-lib.mjs'

const list = await targets()
console.log('targets:', list.map((t) => `${t.type} ${t.url}`).join(' | '))
const page = await cdp(mainTarget(list))
const st = await page.json(`JSON.stringify({
  hasHook: !!window.__nebula,
  tracks: window.__nebula ? window.__nebula.library.getState().tracks.length : -1,
  sleepStateKeys: window.__nebula ? Object.keys(window.__nebula.player.getState()).filter((k) => /sleep/i.test(k)) : [],
  engine: window.__nebula ? window.__nebula.engine.diagnose() : null,
  rootChildren: document.getElementById('root') ? document.getElementById('root').children.length : -1,
  chatPanel: !!document.querySelector('.chat'),
  sleepBtn: !!document.querySelector('.sleep-btn')
})`)
console.log(JSON.stringify(st, null, 2))
page.close()
setTimeout(() => process.exit(0), 300)

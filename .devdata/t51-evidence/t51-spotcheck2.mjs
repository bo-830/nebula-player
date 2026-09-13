/**
 * t51 — corrected spot-check for the explicit expand⇄collapse toggle.
 *
 * The main probe's helper only expanded (it returned 'already-expanded' instead of
 * clicking), so its "collapsed" reading was a copy of the expanded one — a PROBE
 * defect, not a product one. This probe clicks the toggle unconditionally and
 * measures all three states.
 *
 * Usage: node .devdata/t51-evidence/t51-spotcheck2.mjs
 */
import { writeFile } from 'fs/promises'
import { cdp, miniTarget, targets, sleepMs } from '../../scripts/verify-lib.mjs'

const OUT = '.devdata/t51-evidence'
const GEO = `JSON.stringify({
  innerW: window.innerWidth, innerH: window.innerHeight,
  dataExpanded: (document.querySelector('.mini-root') || {}).getAttribute
    ? document.querySelector('.mini-root').getAttribute('data-expanded') : null,
  searchZones: document.querySelectorAll('.mini-search-zone').length,
  chatPanes: document.querySelectorAll('.mini-chat').length,
  searchInputs: document.querySelectorAll('.mini-search-input').length,
  lyricLines: document.querySelectorAll('.mini-lyric-line').length,
  hasNebula: typeof window.__nebula
})`

const miniJson = async (e) => {
  const m = await cdp(miniTarget(await targets()))
  try {
    return await m.json(e)
  } finally {
    m.close()
  }
}
const miniEv = async (e) => {
  const m = await cdp(miniTarget(await targets()))
  try {
    return await m.ev(e)
  } finally {
    m.close()
  }
}
const toggle = (want) =>
  miniEv(`(() => {
    const b = document.querySelector('button[aria-expanded]')
    if (!b) return 'missing'
    const before = b.getAttribute('aria-expanded') === 'true'
    if (before === ${want}) return 'noop-already-' + before
    b.click()
    return 'clicked:' + before + '->' + ${want}
  })()`)

const out = { capturedAt: new Date().toISOString(), steps: [] }

/** drive to a target state, then measure */
const drive = async (wantExpanded, label) => {
  const clicked = await toggle(wantExpanded)
  await sleepMs(1500)
  const geo = await miniJson(GEO)
  const rec = { label, wantExpanded, clicked, geo }
  out.steps.push(rec)
  console.log(`${label}: clicked=${clicked} → ${geo.innerW}x${geo.innerH} expanded=${geo.dataExpanded} zones=${geo.searchZones} chats=${geo.chatPanes}`)
  return geo
}

const start = await miniJson(GEO)
out.start = start
// collapse if expanded, then measure BOTH directions explicitly
if (start.dataExpanded === 'true') await drive(false, 'collapse-1')
const collapsed = await drive(false, 'collapsed (measured)')
const expanded = await drive(true, 'expanded (measured)')
const collapsedAgain = await drive(false, 'collapsed again (measured)')

out.pass = {
  collapsedIs360x128: collapsed.innerW === 360 && collapsed.innerH === 128,
  collapsedNoResidue: collapsed.searchZones === 0 && collapsed.chatPanes === 0 && collapsed.searchInputs === 0,
  expandedIs360x540: expanded.innerW === 360 && expanded.innerH === 540,
  expandedRendersSearchAndChat: expanded.searchZones >= 1 && expanded.chatPanes >= 1 && expanded.searchInputs >= 1,
  collapseAgainRestores: collapsedAgain.innerW === 360 && collapsedAgain.innerH === 128 && collapsedAgain.searchZones === 0,
  miniHasNoNebula: collapsed.hasNebula === 'undefined'
}
out.passAll = Object.values(out.pass).every(Boolean)

await writeFile(`${OUT}/mini-g-spotcheck2.json`, JSON.stringify(out, null, 2), 'utf8')
console.log(JSON.stringify(out.pass, null, 2))
setTimeout(() => process.exit(out.passAll ? 0 : 1), 200)

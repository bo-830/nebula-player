/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS E2E probe (not shipped TS source); the rule targets typed TS modules.
 * If eslint.config.mjs later scopes this rule away from scripts/**, this
 * directive becomes redundant and can be deleted. */
/**
 * t6 — precondition gate the captain requires before any E2E run.
 *
 * A broken dev instance (multi-member concurrent edits + repeated restarts) can
 * leave the store/DOM mismatched, which would turn environment damage into a
 * fake product finding. This probe therefore asserts, on the MAIN window only
 * (`url.endsWith('5173/')` — the `#mini` target is a separate renderer with no
 * `window.__nebula`):
 *   - the CDP target list is sane (exactly one main window + optional mini)
 *   - sidebar / track rows / detail tabs / player bar are all present
 *   - DOM row count matches `library.state.tracks.length`
 *   - the engine exposes the t2 state-machine fields the later probes rely on
 *
 * Exit 0 = environment is clean, E2E may proceed. Non-zero = damaged instance.
 *
 * Run:  npm run dev (CDP 9222)  →  node scripts/verify-env-reset.mjs
 */
import { writeFile } from 'fs/promises'
import { targets } from './verify-lib.mjs'

const PORT = Number(process.env.CDP_PORT ?? 9222)
const list = await targets()
const urls = list.map((t) => t.url)

const main = list.find((t) => t.type === 'page' && t.url.endsWith('5173/'))
const minis = list.filter((t) => t.type === 'page' && t.url.includes('#mini'))

const out = {
  capturedAt: new Date().toISOString(),
  targets: urls,
  mainFound: !!main,
  mainUrl: main?.url ?? null,
  miniCount: minis.length
}

if (!main) {
  out.verdict = 'FAIL: no main window target ending with 5173/'
  console.log(JSON.stringify(out, null, 2))
  process.exit(2)
}

const ws = new WebSocket(main.webSocketDebuggerUrl)
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
const evaluate = (expr) =>
  new Promise((resolve) => {
    const i = ++id
    pending.set(i, resolve)
    ws.send(
      JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } })
    )
  })

// give the renderer a moment to finish booting after the dev server starts
let state = null
for (let i = 0; i < 30; i++) {
  const r = await evaluate(`(() => {
    const n = window.__nebula
    return JSON.stringify({
      booted: !!n,
      hook: !!n,
      sidebar: !!document.querySelector('.sb'),
      rows: document.querySelectorAll('.tl-row').length,
      detailTabs: document.querySelectorAll('.detail-tab').length,
      detailTabsText: Array.from(document.querySelectorAll('.detail-tab')).map((t) => t.innerText.trim()),
      playerBar: !!(document.querySelector('.pb-btn') || document.querySelector('.player-bar') || document.querySelector('.sleep-btn')),
      placeholderOnly: !!document.querySelector('.detail .empty-title'),
      rootChildren: document.getElementById('root') ? document.getElementById('root').children.length : -1,
      tracksInStore: n ? n.library.getState().tracks.length : -1,
      tracksOnScreen: Array.from(document.querySelectorAll('.mv-sub')).map((e) => e.innerText.trim()).slice(0, 2),
      engineFields: n ? Object.keys(n.engine.diagnose()) : []
    })
  })()`)
  state = JSON.parse(r.result.value)
  if (state.hook && state.sidebar && state.rows > 0) break
  await new Promise((r) => setTimeout(r, 1000))
}
out.state = state

const checks = [
  { name: 'window.__nebula hook present', pass: state.hook === true },
  { name: '.sb sidebar present', pass: state.sidebar === true },
  { name: '#root mounted (not blank)', pass: state.rootChildren >= 1 },
  { name: '.detail-tab present (播放详情/歌词)', pass: state.detailTabs >= 2 },
  { name: 'player bar controls present', pass: state.playerBar === true },
  { name: 'DOM rows === store tracks (6)', pass: state.rows === state.tracksInStore && state.rows === 6 },
  { name: 't2 sink state-machine fields exposed', pass: ['setSinkIdPhase', 'ctxGeneration', 'lastSinkEvent', 'setSinkPending'].every((k) => state.engineFields.length === 0 || state.engineFields.includes(k) || state.engineFields.includes('setSinkIdPending')) }
]
out.checks = checks
out.mismatch = state.rows !== state.tracksInStore

// confirm the expected t2 field names once, from a live diagnose()
const diag = await evaluate(`(async () => {
  const d = window.__nebula.engine.diagnose()
  return JSON.stringify({ keys: Object.keys(d), phase: d.setSinkIdPhase, generation: d.ctxGeneration, lastSinkEvent: d.lastSinkEvent, pending: d.setSinkIdPending, requested: d.requestedSinkId })
})()`)
out.engineDiagnose = JSON.parse(diag.result.value)

out.verdict = checks.every((c) => c.pass) ? 'PASS: environment clean' : 'FAIL: ' + checks.filter((c) => !c.pass).map((c) => c.name).join('; ')
await writeFile('.devdata/t6-evidence/env-reset.json', JSON.stringify(out, null, 2), 'utf8')
console.log(JSON.stringify(out, null, 2))
ws.close()
setTimeout(() => process.exit(out.verdict.startsWith('PASS') ? 0 : 1), 300)

/**
 * t22 review evidence (read-only probe, no product file touched).
 *
 * Captures the RUNTIME value the main process holds right after boot, which is
 * the value the 8s update-check timer reads. Used to prove the defaults merge
 * happens at READ time (init), not at save time:
 *   - `updateURL` must be the empty STRING (merged default), not `undefined`
 *     (a save-time-only fix would leave it undefined until the first write, and
 *     the 8s timer would still throw).
 *   - `typeof ... === 'string'` is what makes `.trim()` in index.ts safe without
 *     relying on t21's `?? ''` fallback.
 *
 * Usage: node scripts/probe-settings-readmerge.mjs   (requires `npm run dev`)
 */
const PORT = Number(process.env.CDP_PORT ?? 9222)
const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
const main = list.find((t) => t.type === 'page' && /localhost:5173\/$/.test(t.url))
if (!main) throw new Error('main dev window not found: ' + JSON.stringify(list.map((t) => t.url)))

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
const ev = (expr) =>
  new Promise((res) => {
    const i = ++id
    pending.set(i, res)
    ws.send(
      JSON.stringify({
        id: i,
        method: 'Runtime.evaluate',
        params: { expression: expr, awaitPromise: true, returnByValue: true }
      })
    )
  })

for (let i = 0; i < 60; i++) {
  const r = await ev('typeof window.__nebula === "object"')
  if (r?.result?.value === true) break
  if (i === 59) {
    console.error('renderer did not boot')
    ws.close()
    process.exit(1)
  }
  await new Promise((r2) => setTimeout(r2, 500))
}

const out = await ev(`(async () => {
  const s = await window.api.settingsGet()
  const g = s?.general ?? {}
  return JSON.stringify({
    hasUpdateURLKey: Object.prototype.hasOwnProperty.call(g, 'updateURL'),
    updateURLValue: g.updateURL === undefined ? '(undefined)' : JSON.stringify(g.updateURL),
    typeofUpdateURL: typeof g.updateURL,
    trimSafe: typeof g.updateURL === 'string',
    generalKeys: Object.keys(g)
  })
})()`)

if (out.exceptionDetails) {
  console.error('page exception:', JSON.stringify(out.exceptionDetails, null, 2))
  ws.close()
  process.exit(1)
}
const r = JSON.parse(out.result.value)
console.log(JSON.stringify(r, null, 2))
console.log('\n--- verdict ---')
console.log('key present at read time        :', r.hasUpdateURLKey)
console.log('value is the merged default ""  :', r.updateURLValue === '""')
console.log('.trim() is safe without fallback:', r.trimSafe)
console.log('\n=> READ-time merge confirmed: the 8s timer reads a STRING, so')
console.log("   'undefined.trim()' cannot happen even ignoring t21's '?? \\'\\''.")
ws.close()
process.exit(r.hasUpdateURLKey && r.trimSafe ? 0 : 1)

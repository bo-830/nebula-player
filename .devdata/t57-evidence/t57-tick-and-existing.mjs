/**
 * t57 — (a) measure the typewriter's EFFECTIVE tick period in this environment (the H1
 * threshold is the catch-up time, which is 3 ticks for an 8-char segment), and
 * (b) pre-existence check: pull the equivalent chat code out of the INSTALLED 1.0.4 asar.
 *
 * Usage: node .devdata/t57-evidence/t57-tick-and-existing.mjs
 */
import { createRequire } from 'node:module'
import { writeFile, existsSync } from 'node:fs'
import { join } from 'node:path'
import { cdp, mainTarget, targets } from '../../scripts/verify-lib.mjs'

const require = createRequire(import.meta.url)
const OUT = '.devdata/t57-evidence'
const out = { capturedAt: new Date().toISOString() }

// ---- (a) effective interval period in the live renderer
const page = await cdp(mainTarget(await targets()))
out.tick = await page.json(`(async () => {
  const deltas = []
  let last = performance.now()
  await new Promise((res) => {
    let n = 0
    const t = setInterval(() => {
      const now = performance.now()
      deltas.push(Math.round((now - last) * 10) / 10)
      last = now
      if (++n >= 12) { clearInterval(t); res() }
    }, 22)
  })
  const sorted = deltas.slice().sort((a, b) => a - b)
  return JSON.stringify({
    deltas,
    min: sorted[0],
    median: sorted[Math.floor(sorted.length / 2)],
    max: sorted[sorted.length - 1],
    nominal: 22,
    catchUpTicksFor8Chars: 3
  })
})()`)
out.tick.implication = {
  effectiveTickMedianMs: out.tick.median,
  nominalCatchUpMs: 3 * 22,
  measuredCatchUpMs: Math.round(3 * out.tick.median * 10) / 10,
  note: 'catch-up time = ticks needed to reveal the segment (8 chars / 5 per tick = 2, plus the catch-up tick); a delta gap longer than this triggers closeStream() and drops the following deltas'
}
page.close()

// ---- (b) pre-existence: extract the chat bundle from the installed 1.0.4 asar
try {
  const asar = require('@electron/asar')
  const installed = join(process.env.LOCALAPPDATA ?? '', 'Programs', 'nebula-player', 'resources', 'app.asar')
  if (!existsSync(installed)) throw new Error('installed asar not found: ' + installed)
  const entries = asar.listPackage(installed).map((p) => p.replace(/\\/g, '/'))
  const bundles = entries.filter((p) => /^\/out\/renderer\/assets\/.*\.js$/.test(p))
  out.installed = { asar: installed, bundleCount: bundles.length, bundles: bundles.slice(0, 12) }
  const main = bundles.find((p) => /index-.*\.js$/.test(p)) ?? bundles[0]
  if (main) {
    const src = asar.extractFile(installed, main.replace(/^\//, '')).toString('utf8')
    const count = (needle) => src.split(needle).length - 1
    out.installed.extracted = {
      path: main,
      bytes: src.length,
      hits: {
        '（无回复）': count('（无回复）'),
        streamConvId: count('streamConvId'),
        closeStream: count('closeStream'),
        streamRaw: count('streamRaw'),
        streamShown: count('streamShown'),
        setInterval: count('setInterval'),
        clearInterval: count('clearInterval')
      },
      // does a 22 ms interval + a 5-chars-per-tick step exist in the SHIPPED bundle?
      has22msInterval: /setInterval\([^,]{0,20},\s*22\)/.test(src) || src.includes(',22)'),
      plusFiveStep: /\+5\b/.test(src) || /\+ 5\b/.test(src),
      snippetAroundInterval: (() => {
        const i = src.search(/setInterval\(/)
        return i >= 0 ? src.slice(Math.max(0, i - 220), i + 320) : null
      })()
    }
  }
} catch (e) {
  out.installed = { error: String(e && e.message ? e.message : e) }
}

await writeFile(`${OUT}/t57-tick-and-existing.json`, JSON.stringify(out, null, 2), 'utf8')
console.log(JSON.stringify({
  tickMedian: out.tick.median,
  tickMax: out.tick.max,
  impliedCatchUpMs: out.tick.implication.measuredCatchUpMs,
  bundleHits: out.installed?.extracted?.hits ?? null,
  has22ms: out.installed?.extracted?.has22msInterval ?? null
}, null, 2))

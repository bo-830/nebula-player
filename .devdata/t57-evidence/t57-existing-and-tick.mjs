/**
 * t57 — (a) effective tick period, hard-capped so throttling cannot hang the probe, and
 * (b) pre-existence check against the INSTALLED 1.0.4 renderer bundle.
 *
 * Usage: node .devdata/t57-evidence/t57-existing-and-tick.mjs
 */
import { createRequire } from 'node:module'
import { writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { cdp, mainTarget, targets } from '../../scripts/verify-lib.mjs'

const require = createRequire(import.meta.url)
const out = { capturedAt: new Date().toISOString() }

// ---------------- (a) effective interval period, capped at 8s inside the page
try {
  const page = await cdp(mainTarget(await targets()))
  out.tick = await page.json(`(async () => {
    const stamps = []
    const t0 = performance.now()
    let capped = false
    await new Promise((resolve) => {
      let n = 0
      const timer = setInterval(() => { stamps.push(Math.round(performance.now() - t0)); if (++n >= 6) { clearInterval(timer); resolve() } }, 22)
      setTimeout(() => { capped = true; clearInterval(timer); resolve() }, 8000)
    })
    const deltas = stamps.map((s, i) => (i === 0 ? s : s - stamps[i - 1]))
    return JSON.stringify({ stamps, deltas, ticks: stamps.length, cappedAt8s: capped, nominal: 22 })
  })()`)
  page.close()
} catch (e) {
  out.tick = { error: String(e && e.message ? e.message : e) }
}

// ---------------- (b) installed 1.0.4 bundle: is the H1 code already shipped?
try {
  const asar = require('@electron/asar')
  const installed = join(process.env.LOCALAPPDATA ?? '', 'Programs', 'nebula-player', 'resources', 'app.asar')
  if (!existsSync(installed)) throw new Error('installed asar not found')
  const entries = asar.listPackage(installed).map((p) => p.replace(/\\/g, '/'))
  const bundles = entries.filter((p) => /^\/out\/renderer\/assets\/.*\.js$/.test(p))
  const main = bundles.find((p) => /index-.*\.js$/.test(p)) ?? bundles[0]
  const src = main ? asar.extractFile(installed, main.replace(/^\//, '')).toString('utf8') : ''
  const count = (n) => src.split(n).length - 1
  const intervalIdx = src.search(/setInterval\(/)
  const sentinelIdx = src.indexOf('（无回复）')
  out.installed = {
    asar: installed,
    bundleCount: bundles.length,
    bundles: bundles.slice(0, 8),
    extracted: {
      path: main,
      bytes: src.length,
      minified: !/\n\s{2,}/.test(src.slice(0, 4000)),
      hits: {
        sentinelNoReply: count('（无回复）'),
        streamConvId: count('streamConvId'),
        closeStream: count('closeStream'),
        streamRaw: count('streamRaw'),
        streamShown: count('streamShown'),
        setInterval: count('setInterval'),
        clearInterval: count('clearInterval'),
        plusFive: count('+5')
      },
      // the three H1 ingredients as literal text, in whichever mangled form
      intervalSnippet: intervalIdx >= 0 ? src.slice(Math.max(0, intervalIdx - 260), intervalIdx + 380) : null,
      sentinelSnippet: sentinelIdx >= 0 ? src.slice(Math.max(0, sentinelIdx - 200), sentinelIdx + 120) : null
    }
  }
} catch (e) {
  out.installed = { error: String(e && e.message ? e.message : e) }
}

writeFileSync('.devdata/t57-evidence/t57-existing-and-tick.json', JSON.stringify(out, null, 2), 'utf8')
console.log(
  JSON.stringify(
    {
      tick: out.tick,
      bundle: out.installed?.extracted
        ? { path: out.installed.extracted.path, bytes: out.installed.extracted.bytes, hits: out.installed.extracted.hits, minified: out.installed.extracted.minified }
        : out.installed
    },
    null,
    2
  )
)
setTimeout(() => process.exit(0), 300)

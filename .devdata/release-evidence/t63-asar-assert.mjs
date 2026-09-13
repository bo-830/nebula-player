/**
 * t63 — asar assertions for the 1.0.6 release.
 *
 * Carves out/renderer/assets/index-*.js out of the SHIPPED app.asar (header parsing, because
 * @electron/asar's extractFile refused this path in t57) and asserts:
 *   - the OLD H1 shape is absent: the catch-up branch must NOT call closeStream()/clear streamConvId
 *   - the NEW shape is present: stopRevealTimer used on catch-up, with closeStream kept for round end
 *
 * Usage: node .devdata/release-evidence/t63-asar-assert.mjs <path-to-app.asar>
 */
import { openSync, readSync, closeSync, writeFileSync, existsSync } from 'node:fs'

const asarPath = process.argv[2] ?? 'dist/win-unpacked/resources/app.asar'
const report = { asarPath, exists: existsSync(asarPath), capturedAt: new Date().toISOString() }
if (!report.exists) {
  console.log(JSON.stringify(report, null, 2))
  process.exit(1)
}
const fd = openSync(asarPath, 'r')
let src = ''
try {
  const head = Buffer.alloc(16)
  readSync(fd, head, 0, 16, 0)
  const jsonLength = head.readUInt32LE(12)
  const jb = Buffer.alloc(jsonLength)
  readSync(fd, jb, 0, jsonLength, 16)
  const header = JSON.parse(jb.toString('utf8'))
  const contentStart = (16 + jsonLength + 3) & ~3
  const walk = (node, prefix, acc) => {
    for (const [name, e] of Object.entries(node.files ?? {})) {
      const p = prefix ? `${prefix}/${name}` : name
      if (e.files) walk(e, p, acc)
      else acc.push({ path: p, offset: Number(e.offset), size: e.size })
    }
    return acc
  }
  const files = walk(header, '', [])
  const bundles = files.filter((f) => /^out\/renderer\/assets\/.*\.js$/.test(f.path))
  const target = bundles.filter((f) => /index-.*\.js$/.test(f.path))[0] ?? bundles[0]
  const buf = Buffer.alloc(target.size)
  readSync(fd, buf, 0, target.size, contentStart + target.offset)
  src = buf.toString('utf8')
  report.bundle = { path: target.path, bytes: src.length, totalRendererBundles: bundles.length }
} finally {
  closeSync(fd)
}

const count = (n) => src.split(n).length - 1
const closeStreamDef = src.indexOf('function closeStream')
const catchUpIdx = src.indexOf('streamShown>=', closeStreamDef >= 0 ? closeStreamDef : 0)
report.hits = {
  streamConvId: count('streamConvId'),
  closeStream: count('closeStream'),
  stopRevealTimer: count('stopRevealTimer'),
  'closeStream() calls': count('closeStream()'),
  'stopRevealTimer() calls': count('stopRevealTimer()')
}
// windows around the two functions, to prove WHICH one the catch-up branch calls
const aroundCatchUp = catchUpIdx >= 0 ? src.slice(Math.max(0, catchUpIdx - 60), catchUpIdx + 320) : null
const defIdx = src.indexOf('stopRevealTimer')
report.windows = {
  catchUpBranch: aroundCatchUp,
  stopRevealTimerDef: defIdx >= 0 ? src.slice(defIdx, defIdx + 260) : null,
  closeStreamDef: closeStreamDef >= 0 ? src.slice(closeStreamDef, closeStreamDef + 260) : null
}
report.assertions = {
  NEW_stopRevealTimer_present: count('stopRevealTimer') > 0,
  NEW_catchUp_calls_stopRevealTimer: !!aroundCatchUp && aroundCatchUp.includes('stopRevealTimer('),
  OLD_catchUp_does_not_call_closeStream: !!aroundCatchUp && !/streamShown\s*>=\s*s\.?streamRaw\.length\)\s*\{\s*closeStream\(/.test(aroundCatchUp) && !aroundCatchUp.includes('closeStream()'),
  roundEnd_still_closes: count('closeStream') > 0
}
report.pass = Object.values(report.assertions).every(Boolean)
writeFileSync('.devdata/release-evidence/t63-asar-assert.json', JSON.stringify(report, null, 2), 'utf8')
console.log(JSON.stringify({ bundle: report.bundle, hits: report.hits, assertions: report.assertions, pass: report.pass }, null, 2))
process.exit(report.pass ? 0 : 1)

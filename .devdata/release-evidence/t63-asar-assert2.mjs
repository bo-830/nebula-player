/**
 * t63 — asar H1 assertions, v2 (precise): locate the TYPEWRITER interval callback and decide
 * which function the catch-up branch calls.
 *
 * v1's window heuristic used `streamShown>=` (no spaces) and matched nothing in the compiled
 * output, so two assertions read false spuriously. This version slices the setInterval
 * callback itself and judges inside it.
 *
 * Usage: node .devdata/release-evidence/t63-asar-assert2.mjs [path-to-app.asar]
 */
import { openSync, readSync, closeSync, writeFileSync, existsSync } from 'node:fs'

const asarPath = process.argv[2] ?? 'dist/win-unpacked/resources/app.asar'
const out = { asarPath, capturedAt: new Date().toISOString(), exists: existsSync(asarPath) }
if (!out.exists) process.exit(1)

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
  const walk = (n, pre, acc) => {
    for (const [name, e] of Object.entries(n.files ?? {})) {
      const p = pre ? `${pre}/${name}` : name
      if (e.files) walk(e, p, acc)
      else acc.push({ path: p, offset: Number(e.offset), size: e.size })
    }
    return acc
  }
  const files = walk(header, '', [])
  const target =
    files.filter((f) => /^out\/renderer\/assets\/index-.*\.js$/.test(f.path))[0] ??
    files.filter((f) => /^out\/renderer\/assets\/.*\.js$/.test(f.path))[0]
  const buf = Buffer.alloc(target.size)
  readSync(fd, buf, 0, target.size, contentStart + target.offset)
  src = buf.toString('utf8')
  out.bundle = { path: target.path, bytes: src.length }
} finally {
  closeSync(fd)
}

const count = (n) => src.split(n).length - 1

/** the typewriter callback = from `setInterval(` up to its `}, 22)` terminator */
const intervalIdx = src.indexOf('streamTimer = setInterval(')
const intervalEnd = intervalIdx >= 0 ? src.indexOf('}, 22)', intervalIdx) : -1
const intervalBody = intervalIdx >= 0 && intervalEnd > intervalIdx ? src.slice(intervalIdx, intervalEnd) : null

/** the catch-up branch inside that body: `streamShown >= ...` block */
const catchUpIdx = intervalBody ? intervalBody.search(/streamShown\s*>=\s*[^)]*length/) : -1
const catchUpBranch = catchUpIdx >= 0 ? intervalBody.slice(catchUpIdx, Math.min(intervalBody.length, catchUpIdx + 260)) : null

/** round-end teardown must still clear the stream */
const unsubIdx = src.indexOf('closed = true')
const unsubWindow = unsubIdx >= 0 ? src.slice(unsubIdx, unsubIdx + 220) : null

out.hits = {
  streamConvId: count('streamConvId'),
  closeStream: count('closeStream'),
  stopRevealTimer: count('stopRevealTimer'),
  'closeStream()': count('closeStream()'),
  'stopRevealTimer()': count('stopRevealTimer()')
}
out.windows = {
  stopRevealTimerDef: src.indexOf('stopRevealTimer') >= 0 ? src.slice(src.indexOf('stopRevealTimer'), src.indexOf('stopRevealTimer') + 200) : null,
  intervalBody,
  catchUpBranch,
  unsubWindow
}
out.assertions = {
  NEW_stopRevealTimer_defined:
    !!out.windows.stopRevealTimerDef && out.windows.stopRevealTimerDef.includes('stopRevealTimer') && out.windows.stopRevealTimerDef.includes('clearInterval'),
  NEW_stopRevealTimer_does_not_touch_convId: (() => {
    // scope strictly to the function body (the 200-char window spilled into openStream,
    // which legitimately contains `streamConvId = rid`)
    const m = src.match(/stopRevealTimer\(\)\s*\{([\s\S]{0,400}?)\n\s*\}/)
    const body = m ? m[1] : null
    out.windows.stopRevealTimerBody = body
    return !!body && body.includes('clearInterval') && !body.includes('streamConvId')
  })(),
  INTERVAL_FOUND: !!intervalBody,
  NEW_catchUp_calls_stopRevealTimer: !!catchUpBranch && catchUpBranch.includes('stopRevealTimer()'),
  OLD_catchUp_does_not_call_closeStream: !!catchUpBranch && !catchUpBranch.includes('closeStream()'),
  roundEnd_unsub_still_closes:
    !!unsubWindow && unsubWindow.includes('closed = true') && unsubWindow.includes('closeStream')
}
out.pass = Object.values(out.assertions).every(Boolean)
writeFileSync('.devdata/release-evidence/t63-asar-assert2.json', JSON.stringify(out, null, 2), 'utf8')
console.log(JSON.stringify({ bundle: out.bundle, hits: out.hits, catchUpBranch: out.catchUpBranch, assertions: out.assertions, pass: out.pass }, null, 2))
process.exit(out.pass ? 0 : 1)

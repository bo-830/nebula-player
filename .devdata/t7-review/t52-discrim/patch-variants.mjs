/**
 * t52 reviewer discriminator — build the three code variants from the CURRENT source by
 * patching COPIES, with every replacement asserted to match EXACTLY once (regex-anchored
 * where exact text is fragile).
 *
 * Variants (all inside .devdata/t7-review/t52-discrim/, `src/**` untouched):
 *   pre/  = PRE-FIX PRE-IMAGE, semantics taken verbatim from the shipped 1.0.4 renderer bundle
 *           (out/renderer/assets/index-Cdfx1hqQ.js, built 2026-09-12T12:39:22Z, i.e. before t50):
 *             - openStream returns the plain unsubscriber
 *             - runFrom reads the shared store snapshot after the round resolves
 *   cur/  = untouched CURRENT source (t50 fix: StreamHandle.next() + closure buffer)
 *   half/ = drain kept, value still read from the shared snapshot
 *
 * Usage: node .devdata/t7-review/t52-discrim/patch-variants.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const ROOT = '.devdata/t7-review/t52-discrim'
const STORE = (v) => `${ROOT}/${v}/src/renderer/src/stores/chatStore.ts`
const sha1 = (s) => createHash('sha1').update(s).digest('hex')

function applyEdits(label, file, edits) {
  let text = readFileSync(file, 'utf8')
  const before = sha1(text)
  const log = []
  for (const e of edits) {
    const hits = e.find instanceof RegExp ? [...text.matchAll(new RegExp(e.find.source, e.find.flags + 'g'))] : null
    const count = e.find instanceof RegExp ? hits.length : countLiteral(text, e.find)
    if (count !== 1) throw new Error(`${label}: "${e.name}" matched ${count} times (need exactly 1)`)
    text = e.replace(text)
    log.push(e.name)
  }
  writeFileSync(file, text, 'utf8')
  console.log(
    `${label.padEnd(5)} before=${before.slice(0, 12)} after=${sha1(text).slice(0, 12)} bytes=${text.length}\n      edits: ${log.join(' | ')}`
  )
}

function countLiteral(text, needle) {
  let n = 0
  let i = text.indexOf(needle)
  while (i >= 0) {
    n++
    i = text.indexOf(needle, i + 1)
  }
  return n
}

const lit = (find, replace, name) => ({ name, find, replace: (t) => t.replace(find, replace) })
const rx = (find, replace, name) => ({ name, find, replace: (t) => t.replace(find, replace) })

// ---------------- pre: shipped (pre-t50) semantics ----------------
applyEdits('pre', STORE('pre'), [
  lit(
    '  openStream: (seed: string) => StreamHandle',
    '  openStream: (seed: string) => () => void',
    'RunResume.openStream type -> () => void'
  ),
  rx(
    /      resume\.accumulated = await stream\.next\(\)/,
    '      // PRE-FIX PRE-IMAGE (verbatim from the shipped 1.0.4 bundle):\n      //   resume.accumulated = useChatStore.getState().streamRaw\n      resume.accumulated = useChatStore.getState().streamRaw',
    'runFrom read -> store snapshot'
  ),
  rx(
    /  return \{\n    unsub: \(\) => \{\n[\s\S]*?\n    \}\n  \}\n\}/,
    '  // PRE-FIX PRE-IMAGE (shape from the shipped 1.0.4 bundle):\n  //   return () => { if (streamConvId === rid) closeStream(); unsub() }\n  return () => {\n    closed = true\n    unsub()\n    if (streamConvId === rid) closeStream()\n  }\n}',
    'openStream returns plain unsubscriber'
  ),
  lit('  const stream = resume.openStream(resume.accumulated)', '  const unsub = resume.openStream(resume.accumulated)', 'runFrom binding'),
  lit('    stream.unsub()', '    unsub()', 'runFrom finally')
])

// ---------------- half: drain kept, mirror read ----------------
applyEdits('half', STORE('half'), [
  rx(
    /      resume\.accumulated = await stream\.next\(\)/,
    '      // HALF VARIANT (t52 reviewer): drain kept, value still read from the shared mirror\n      await stream.next()\n      resume.accumulated = useChatStore.getState().streamRaw',
    'read -> snapshot (drain kept)'
  )
])

console.log(
  JSON.stringify(
    {
      variantSha1: {
        pre: sha1(readFileSync(STORE('pre'), 'utf8')).slice(0, 12),
        cur: sha1(readFileSync(STORE('cur'), 'utf8')).slice(0, 12),
        half: sha1(readFileSync(STORE('half'), 'utf8')).slice(0, 12)
      },
      currentSourceSha1: sha1(readFileSync('src/renderer/src/stores/chatStore.ts', 'utf8')).slice(0, 12)
    },
    null,
    2
  )
)

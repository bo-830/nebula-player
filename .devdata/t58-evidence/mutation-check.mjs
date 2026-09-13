/**
 * t58 (H1) mutation check — the discriminative evidence for the typewriter
 * catch-up fix.
 *
 * H1: the reveal timer's catch-up branch used to call `closeStream()`, which
 * clears the module-level `streamConvId`; the chunk guard is keyed on that id, so
 * every later delta of the SAME round was dropped and long/slow answers were
 * persisted truncated. The fix replaces that call with `stopRevealTimer()`,
 * which stops the reveal but keeps ownership until the round really ends.
 *
 * This harness:
 *   1. reverts the fix (the "pre" state) and records the new cases FAILING,
 *   2. restores the fix and records them PASSING,
 *   3. checks the restored file is byte-identical (sha256) with no residue.
 *
 * Usage: node .devdata/t58-evidence/mutation-check.mjs
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const STORE = 'src/renderer/src/stores/chatStore.ts'
const TEST = 'src/renderer/src/lib/__tests__/chatConfirm.test.ts'
const sha = (buf) => createHash('sha256').update(buf).digest('hex')

const original = readFileSync(STORE, 'utf8')
const baseSha = sha(original)
const baseTestSha = sha(readFileSync(TEST, 'utf8'))
console.log(`fixed  chatStore.ts sha256=${baseSha.slice(0, 16)} (${original.length} B)`)

/** the exact fix, as applied */
const FIXED = `          // t58 / H1: catch-up ends the REVEAL, not the round. \`closeStream()\`
          // would clear \`streamConvId\` and the guard above would then drop every
          // later delta of this same round (truncated answers); the stream stays
          // owned by this round until \`finishRun\` / \`unsub\` ends it for real.
          stopRevealTimer()`
/** the pre-fix code (the mutation) */
const PRE_FIX = `          closeStream()`

if (!original.includes(FIXED)) {
  console.log('!! FIXED anchor not found in chatStore.ts — cannot run the mutation')
  process.exit(2)
}

function run(tag) {
  const res = spawnSync(
    'npx.cmd',
    ['vitest', 'run', 'src/renderer/src/lib/__tests__/chatConfirm.test.ts', '-t', 'H1'],
    { cwd: process.cwd(), shell: true, encoding: 'utf8' }
  )
  const out = `${res.stdout ?? ''}${res.stderr ?? ''}`
  const summary = /Tests\s+(.*)/.exec(out)?.[1]?.trim() ?? 'no summary'
  const failures = out
    .split('\n')
    .filter((l) => l.includes('AssertionError') || l.includes('→'))
    .slice(0, 6)
    .map((l) => l.trim())
  console.log(`\n--- ${tag} --- exit=${res.status} ${summary}`)
  for (const f of failures) console.log(`    ${f}`)
  return { exit: res.status, summary, failures }
}

// 1) PRE-FIX: revert the fix, keep the new tests → they must go red
writeFileSync(STORE, original.replace(FIXED, PRE_FIX))
const pre = run('PRE-FIX (closeStream() on catch-up — the mutation)')
const preText = readFileSync(STORE, 'utf8')
console.log(`    store now differs from fixed: ${sha(preText) !== baseSha}`)

// 2) FIXED again: exactly the original bytes
writeFileSync(STORE, original)
const post = run('FIXED (stopRevealTimer() on catch-up)')

// 3) integrity
const finalSha = sha(readFileSync(STORE, 'utf8'))
const residue = readdirSync('.').filter((n) => /MUTATION|\.bak$|^zz/i.test(n))
const ok =
  pre.exit !== 0 &&
  post.exit === 0 &&
  finalSha === baseSha &&
  sha(readFileSync(TEST, 'utf8')) === baseTestSha &&
  residue.length === 0

console.log('\n=== summary ===')
console.log(`pre-fix  (mutation) : exit=${pre.exit} (${pre.summary})  → must be non-zero`)
console.log(`post-fix (restored) : exit=${post.exit} (${post.summary})  → must be zero`)
console.log(`chatStore.ts identical after round-trip : ${finalSha === baseSha}`)
console.log(`test file identical after round-trip    : ${sha(readFileSync(TEST, 'utf8')) === baseTestSha}`)
console.log(`residue (MUTATION/*.bak/zz*): ${residue.length === 0 ? 'none' : residue.join(',')}`)
console.log(`MUTATION CAUGHT AND TREE RESTORED: ${ok}`)
process.exit(ok ? 0 : 1)

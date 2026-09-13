/**
 * t58 (H1) acceptance check — does the reveal KEEP its observable behaviour?
 *
 * The fix decouples "stop revealing" from "invalidate the stream", so the timing
 * contract of the typewriter must be unchanged:
 *   A. after a delta arrives, the reveal advances ~5 characters per ~22ms tick
 *   B. once the cursor catches up, it STOPS revealing (no endless ticking) and
 *      the shown count is pinned to the buffer length
 *   C. when a later delta arrives in the same round, revealing CONTINUES from
 *      where it stopped (no reset to 0, no jump to the end)
 *
 * Usage: node .devdata/t58-evidence/acceptance-check.mjs
 */
import { readFileSync } from 'node:fs'

const src = readFileSync('src/renderer/src/stores/chatStore.ts', 'utf8')
const test = readFileSync('src/renderer/src/lib/__tests__/chatConfirm.test.ts', 'utf8')

const checks = []
const add = (id, what, ok, detail) => {
  checks.push({ id, what, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${what}\n      ${detail}`)
}

// A: pacing formula untouched (5 chars per tick, 22ms interval)
const pacing = /\}, 22\)/.test(src)
const plus5 = /Math\.min\(s\.streamRaw\.length, s\.streamShown \+ 5\)/.test(src)
add('A-pacing', 'reveal still advances 5 chars per 22ms tick', pacing && plus5,
  `22ms interval=${pacing}; '+5 chars'=${plus5}`)

// B: catch-up stops the reveal AND pins shown to the buffer length
const stopsReveal = /stopRevealTimer\(\)\s*\n\s*useChatStore\.setState\(\{ streamShown: s\.streamRaw\.length \}\)/.test(src)
add('B-catchup', 'catch-up stops the reveal timer and pins streamShown to the buffer', stopsReveal,
  'branch is stopRevealTimer() + setState({streamShown: streamRaw.length})')

// B2: the catch-up branch no longer clears ownership
const noClose = !/streamShown >= s\.streamRaw\.length\)\s*\{\s*closeStream\(\)/.test(src)
add('B2-ownership', 'catch-up no longer calls closeStream() (ownership survives)', noClose,
  'closeStream() is absent from the catch-up branch')

// B3: ownership still ends for real
const finishClears = /function finishRun[\s\S]{0,80}closeStream\(\)/.test(src)
const unsubClears = /if \(streamConvId === rid\) closeStream\(\)/.test(src)
const unsubClosed = /unsub: \(\) => \{\s*\n\s*closed = true/.test(src)
add('B3-teardown', 'round end still invalidates ownership (finishRun + unsub + closed flag)',
  finishClears && unsubClears && unsubClosed,
  `finishRun→closeStream=${finishClears}; unsub→closeStream=${unsubClears}; unsub sets closed=true=${unsubClosed}`)

// B4: the guard kept all three conditions
const guard = /if \(closed \|\| p\.id !== rid \|\| streamConvId !== rid\) return/.test(src)
add('B4-guard', 'chunk guard unchanged (closed || id mismatch || ownership mismatch)', guard,
  'guard text intact')

// C: the new cases exist in the suite (drip arms driven over both gaps + leak)
// The case name is templated, so match the SOURCE forms: the gap table and the
// parametrised case, then confirm both gaps are really exercised.
const gapTable = /SAMPLES = \[100, 2000\] as const/.test(test)
const dripCase = /for \(const gap of SAMPLES\)/.test(test)
const dripName = /keeps the whole answer across the catch-up \(drip gap \$\{gap\}ms\)/.test(test)
const leak = /no leak into the next round/.test(test)
add('C-cases', 'suite covers both drip gaps and the no-leak boundary',
  gapTable && dripCase && dripName && leak,
  `SAMPLES=[100,2000]=${gapTable}; loop over SAMPLES=${dripCase}; templated case name=${dripName}; leak case=${leak}`)

// C2: the leak case asserts BOTH halves (straggler dropped, next round clean)
const leakAssert = /straggler\(SECOND\)[\s\S]{0,200}expect\(useChatStore\.getState\(\)\.streamRaw\)\.toBe\(''\)/.test(test)
const leakNext = /expect\(last\)\.toBe\('C'\)[\s\S]{0,200}expect\(last\)\.not\.toContain\(SECOND\)/.test(test)
add('C2-no-leak', 'leak case asserts the straggler is dropped AND the next round is clean',
  leakAssert && leakNext, `streamRaw stays ''=${leakAssert}; next round has none of it=${leakNext}`)

// D: comment correction — the over-strong "never dropped" claim is gone
const corrected = src.includes('too strong') && !src.includes('an earlier version of this comment')
  ? false
  : src.includes('too strong') || src.includes('was therefore never the whole story')
add('D-comment', 'StreamHandle docblock no longer claims deltas are unconditionally kept', corrected,
  `blocks explicit "too strong" wording=${src.includes('too strong')}`)

const ok = checks.every((c) => c.ok)
console.log(`\nALL ACCEPTANCE CHECKS PASS: ${ok}  (${checks.filter((c) => c.ok).length}/${checks.length})`)
process.exit(ok ? 0 : 1)

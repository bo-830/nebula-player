/**
 * t41 (R4c) — 忠实复刻 `lyricsOffset.test.ts:299-339` 的守卫，并证明"取反必失败"。
 * **不改写 `src/**`**（遵守 t41 的 outOfScope）：在**副本**上做取反，真实文件零改动。
 *
 * 复刻要点（与用例逐行一致）：
 *   OFFSET_TERM = '((?:[A-Za-z_$0-9.][\\w$.]*\\s*\\+\\s*)*offset)(?![\\w$])'
 *   heads       = [LyricsPanel 'const t\\s*=\\s*', MiniPlayer '(?<![=<>!]\\s?)<=\\s*', '(?<![=<>!]\\s?)>\\s*']
 *   每个 head ⇒ expect toMatch(/\\+\\s*offset$/) ∧ expect toMatch(/[A-Za-z_$0-9.]+\\s*+/) ∧ expect toContain('0.12')
 *   任一 head 为 null ⇒ 走回退分支：要求两个面板都**不再**同时含 'offset' 与 '0.12'（取反后仍同时含 ⇒ 该断言失败）
 *
 * Usage: node .devdata/t13-r2-evidence/tmp-r4c-signflip-demo.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs'

const OUT = '.devdata/t13-r2-evidence/t41-r4c-signflip.json'
const OUT_DIR = '.devdata/t13-r2-evidence/r4c-copies'
mkdirSync(OUT_DIR, { recursive: true })

const readComponent = (name) =>
  readFileSync(new URL(`../../src/renderer/src/components/${name}`, import.meta.url), 'utf8')

const OFFSET_TERM = '((?:[A-Za-z_$0-9.][\\w$.]*\\s*\\+\\s*)*offset)(?![\\w$])'
const witness = (file, head) => {
  const m = file.match(new RegExp(head + OFFSET_TERM))
  return m ? m[1].replace(/\s+/g, ' ').trim() : null
}

/** exactly the guard from the test, returning which expectation would fail (null = all pass) */
function runGuard(lyricsPanel, miniPlayer) {
  const heads = [
    witness(lyricsPanel, 'const t\\s*=\\s*'),
    witness(miniPlayer, '(?<![=<>!]\\s?)<=\\s*'),
    witness(miniPlayer, '(?<![=<>!]\\s?)>\\s*')
  ]
  const detail = { heads }
  if (heads.some((h) => h === null)) {
    const inlineArithmetic = [lyricsPanel, miniPlayer].filter((f) => f.includes('offset') && f.includes('0.12'))
    detail.branch = 'fallback(no-head)'
    detail.inlineArithmeticCount = inlineArithmetic.length
    return { pass: inlineArithmetic.length === 0, failedExpectation: inlineArithmetic.length === 0 ? null : "expect(inlineArithmetic).toHaveLength(0)", detail }
  }
  detail.branch = 'witnessed'
  for (const head of heads) {
    if (!/\+\s*offset$/.test(head)) return { pass: false, failedExpectation: 'toMatch(/\\+\\s*offset$/)', detail }
    if (!/[A-Za-z_$0-9.]+\s*\+/.test(head)) return { pass: false, failedExpectation: 'toMatch(/[A-Za-z_$0-9.]+\\s*+/)', detail }
    if (!head.includes('0.12')) return { pass: false, failedExpectation: "toContain('0.12')", detail }
  }
  return { pass: true, failedExpectation: null, detail }
}

const realLyrics = readComponent('LyricsPanel.tsx')
const realMini = readComponent('MiniPlayer.tsx')

// sign-flipped copies: `+ offset` → `- offset` (keeps the arithmetic + the 0.12 grace)
const flip = (s) => s.replace(/\+\s*offset/g, '- offset')
const flipLyrics = flip(realLyrics)
const flipMini = flip(realMini)
writeFileSync(`${OUT_DIR}/LyricsPanel.tsx`, flipLyrics, 'utf8')
writeFileSync(`${OUT_DIR}/MiniPlayer.tsx`, flipMini, 'utf8')

const out = {
  capturedAt: new Date().toISOString(),
  method: 'faithful replication of lyricsOffset.test.ts:299-339 against copies; src/** untouched',
  real: runGuard(realLyrics, realMini),
  flipped: runGuard(flipLyrics, flipMini),
  flipChangedText: { lyrics: flipLyrics !== realLyrics, mini: flipMini !== realMini },
  copies: [`${OUT_DIR}/LyricsPanel.tsx`, `${OUT_DIR}/MiniPlayer.tsx`]
}
out.verdict = {
  'real panels PASS the F5 guard': out.real.pass === true,
  'sign-flipped copies FAIL the F5 guard': out.flipped.pass === false,
  'the failure lands on the sign assertion (not silently skipped)': out.flipped.failedExpectation !== null
}
out.allPass = Object.values(out.verdict).every(Boolean)
writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8')
console.log(JSON.stringify(out, null, 2))
console.log('written ->', OUT)
process.exit(out.allPass ? 0 : 1)

/**
 * READ-ONLY probe for the t7/r5 adversarial review (question 4).
 *
 * Re-implements the EXACT witness logic of
 *   src/renderer/src/lib/__tests__/lyricsOffset.test.ts:291-339
 * and runs it against the real component sources plus a set of synthetic
 * mutations, WITHOUT touching src/** (files are read into memory only).
 *
 * Reports, per scenario, whether the third sign-convention test would
 * pass or fail.
 */
import { readFileSync } from 'node:fs'

const ROOT = 'C:/博830/vibecoding/nebula-player/src/renderer/src/components/'
const OFFSET_TERM = '((?:[A-Za-z_$0-9.][\\w$.]*\\s*\\+\\s*)*offset)(?![\\w$])'

const witness = (file, head) => {
  const m = file.match(new RegExp(head + OFFSET_TERM))
  return m ? m[1].replace(/\s+/g, ' ').trim() : null
}

/** verbatim body of the third `it(...)` (lines 291-339), parameterised by content */
function runWitnessTest(lyricsPanel, miniPlayer) {
  const heads = [
    witness(lyricsPanel, 'const t\\s*=\\s*'),
    witness(miniPlayer, '(?<![=<>!]\\s?)<=\\s*'),
    witness(miniPlayer, '(?<![=<>!]\\s?)>\\s*')
  ]

  if (heads.some((h) => h === null)) {
    const inlineArithmetic = [lyricsPanel, miniPlayer].filter(
      (f) => f.includes('offset') && f.includes('0.12')
    )
    if (inlineArithmetic.length !== 0) {
      return { verdict: 'FAIL', why: 'null witness + inline arithmetic still present' }
    }
    return { verdict: 'PASS(warn)', why: 'null witness + no 0.12 inline -> console.warn + return' }
  }

  for (const head of heads) {
    if (!/\+\s*offset$/.test(head)) return { verdict: 'FAIL', why: `head lacks + offset: "${head}"` }
    if (!/[A-Za-z_$0-9.]+\s*\+/.test(head)) return { verdict: 'FAIL', why: `no real operand: "${head}"` }
    if (!head.includes('0.12')) return { verdict: 'FAIL', why: `no 0.12: "${head}"` }
  }
  return { verdict: 'PASS', why: `heads = ${JSON.stringify(heads)}` }
}

const realLyrics = readFileSync(ROOT + 'LyricsPanel.tsx', 'utf8')
const realMini = readFileSync(ROOT + 'MiniPlayer.tsx', 'utf8')

console.log('=== component mtimes / sizes (read-only) ===')
for (const [n, c] of [['LyricsPanel.tsx', realLyrics], ['MiniPlayer.tsx', realMini]]) {
  console.log(`  ${n}: ${c.length} chars`)
}

const scenarios = [
  ['BASELINE (real sources, unmodified)', realLyrics, realMini],
  // --- sign flips: must FAIL ---
  ['flip LyricsPanel  + offset -> - offset', realLyrics.replace('+ 0.12 + offset', '+ 0.12 - offset'), realMini],
  [
    'flip MiniPlayer `<=` branch only',
    realLyrics,
    realMini.replace('t <= display + 0.12 + offset', 't <= display + 0.12 - offset')
  ],
  [
    'flip MiniPlayer `>` branch only',
    realLyrics,
    realMini.replace('t > display + 0.12 + offset', 't > display + 0.12 - offset')
  ],
  [
    'flip BOTH MiniPlayer branches',
    realLyrics,
    realMini
      .replace('t <= display + 0.12 + offset', 't <= display + 0.12 - offset')
      .replace('t > display + 0.12 + offset', 't > display + 0.12 - offset')
  ],
  // --- other real mutations that keep the arithmetic inline: must FAIL ---
  [
    'grace 0.12 -> 0.15 in both panels',
    realLyrics.replace('+ 0.12 + offset', '+ 0.15 + offset'),
    realMini.replaceAll('+ 0.12 + offset', '+ 0.15 + offset')
  ],
  [
    'offset term dropped from MiniPlayer (uses bare display)',
    realLyrics,
    realMini.replaceAll('display + 0.12 + offset', 'display + 0.12')
  ],
  // --- escape-hatch scenarios: is the null path silent? ---
  [
    'grace renamed to constant GRACE (no literal 0.12) + FLIPPED sign',
    realLyrics.replace('currentTime + 0.12 + offset', 'currentTime + GRACE - offset'),
    realMini.replaceAll('display + 0.12 + offset', 'display + GRACE - offset')
  ],
  [
    'arithmetic extracted to shared helper (no 0.12, correct sign)',
    realLyrics.replace('const t = currentTime + 0.12 + offset', 'const t = activeLineTime(currentTime, offset)'),
    realMini.replaceAll('display + 0.12 + offset', 'activeLineTime(display, offset)')
  ],
  [
    'arithmetic extracted to shared helper + FLIPPED sign inside helper',
    realLyrics.replace('const t = currentTime + 0.12 + offset', 'const t = helperWithFlippedSign(currentTime, offset)'),
    realMini.replaceAll('display + 0.12 + offset', 'helperWithFlippedSign(display, offset)')
  ],
  [
    'all offset arithmetic deleted from both panels (no `offset` word at all)',
    realLyrics.replace('currentTime + 0.12 + offset', 'currentTime + 0.12'),
    realMini.replaceAll('display + 0.12 + offset', 'display + 0.12')
  ]
]

console.log('\n=== witness-test verdicts ===')
for (const [name, lp, mp] of scenarios) {
  const r = runWitnessTest(lp, mp)
  console.log(`${r.verdict.padEnd(11)} | ${name}`)
  console.log(`${' '.repeat(11)} |   ${r.why}`)
}

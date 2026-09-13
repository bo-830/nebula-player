/**
 * t7-r5 review — lyricsOffset sign-convention shadow harness (scratch only).
 *
 * The real test (`src/renderer/src/lib/__tests__/lyricsOffset.test.ts`) witnesses
 * the two panels by reading their SOURCE TEXT off disk relative to its own
 * `import.meta.url`. So the only way to mutate the panels without touching
 * src/** is to run a BYTE-IDENTICAL COPY of that test in a shadow tree whose
 * `components/` copies are mutated. The copy's sha256 is asserted equal to the
 * real file's, and the test source is left untouched (no string edits at all).
 *
 * The witness regex literals (OFFSET_TERM + the three heads) are extracted from
 * the REAL test file at runtime rather than transcribed, so the printed heads are
 * the ones the real test computes.
 *
 * Cases:
 *   control           – panels unmodified                → expect PASS
 *   flip-panel        – LyricsPanel  `+ offset` → `- offset`  → expect FAIL
 *   flip-mini         – MiniPlayer   `+ offset` → `- offset`  → expect FAIL
 *   flip-both         – both flipped                     → expect FAIL
 *   helper-refactor   – arithmetic moves into a helper (correct sign) → expect ?
 *   helper-wrong-sign – same refactor, helper has the WRONG sign      → expect ?
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..', '..')
const SHADOW = join(HERE, 'shadow')
const SRC = join(SHADOW, 'src', 'renderer', 'src')
const COMP = join(SRC, 'components')
const LIB = join(SRC, 'lib')
const TESTDIR = join(LIB, '__tests__')

const REAL_TEST = join(REPO, 'src/renderer/src/lib/__tests__/lyricsOffset.test.ts')
const REAL_LIB = join(REPO, 'src/renderer/src/lib/lyricsOffset.ts')
const REAL_PANEL = join(REPO, 'src/renderer/src/components/LyricsPanel.tsx')
const REAL_MINI = join(REPO, 'src/renderer/src/components/MiniPlayer.tsx')

const sha = (s) => createHash('sha256').update(s).digest('hex')
const read = (p) => readFileSync(p, 'utf8')

for (const d of [COMP, TESTDIR]) mkdirSync(d, { recursive: true })

const realTestSrc = read(REAL_TEST)
const panelSrc = read(REAL_PANEL)
const miniSrc = read(REAL_MINI)

// ---- extract the real test's witness regexes (no transcription) -------------
const offsetTermLit = /const OFFSET_TERM = ('(?:[^'\\]|\\.)*')/.exec(realTestSrc)
if (!offsetTermLit) throw new Error('OFFSET_TERM literal not found in the real test')
/* eslint-disable no-eval */
const OFFSET_TERM = eval(offsetTermLit[1])
const headLits = [...realTestSrc.matchAll(/witness\((\w+), ('(?:[^'\\]|\\.)*')\)/g)].map((m) => ({
  target: m[1],
  lit: m[2],
  re: eval(m[2])
}))
if (headLits.length !== 3) throw new Error(`expected 3 witness() calls, found ${headLits.length}`)

// ---- the test's own witness helper (verbatim copy, same semantics) ----------
function witness(file, head) {
  const m = file.match(new RegExp(head + OFFSET_TERM))
  return m ? m[1].replace(/\s+/g, ' ').trim() : null
}
const inlineArithmetic = (a, b) => [a, b].filter((f) => f.includes('offset') && f.includes('0.12'))

console.log('OFFSET_TERM (extracted) =', JSON.stringify(OFFSET_TERM))
for (const h of headLits) console.log(`head for ${h.target}  =`, h.lit)

console.log('\n--- witness over the REAL (unmutated) components ---')
const realHeads = [
  witness(panelSrc, headLits[0].re),
  witness(miniSrc, headLits[1].re),
  witness(miniSrc, headLits[2].re)
]
realHeads.forEach((h, i) => console.log(`  head[${i}] = ${JSON.stringify(h)}`))
console.log('  inlineArithmetic files =', inlineArithmetic(panelSrc, miniSrc).length)

// independent extraction of the same expressions, straight from the source lines
const panelLine = /const t = (.+)$/m.exec(panelSrc)[1].trim()
const miniLines = miniSrc
  .split('\n')
  .filter((l) => l.includes('lines[i].t <= display') || l.includes('lines[i].t > display'))
  .map((l) => l.trim())
console.log('  LyricsPanel source RHS        =', JSON.stringify(panelLine))
miniLines.forEach((l) => console.log('  MiniPlayer source comparison  =', JSON.stringify(l)))

// ---- component mutations ----------------------------------------------------
function edit(text, from, to, what) {
  const n = text.split(from).length - 1
  if (n !== 1) throw new Error(`anchor "${what}" matched ${n}x (expected 1)`)
  return text.replace(from, to)
}

const GRACE_LIT = '+ 0.12 + offset'
const variants = {
  control: { panel: panelSrc, mini: miniSrc },
  'flip-panel': {
    panel: edit(panelSrc, `currentTime ${GRACE_LIT}`, 'currentTime + 0.12 - offset', 'panel sign'),
    mini: miniSrc
  },
  'flip-mini': {
    panel: panelSrc,
    mini: miniSrc.split(`display ${GRACE_LIT}`).join('display + 0.12 - offset')
  },
  'flip-both': {},
  'helper-refactor': {
    panel: edit(
      panelSrc,
      `const t = currentTime ${GRACE_LIT}`,
      'const t = activeTime(currentTime, offset)',
      'panel -> helper'
    ),
    mini: miniSrc
      .split(`lines[i].t <= display ${GRACE_LIT}`)
      .join('lines[i].t <= activeTime(display, offset)')
      .split(`lines[i].t > display ${GRACE_LIT}`)
      .join('lines[i].t > activeTime(display, offset)')
  }
}
variants['flip-both'] = variants['flip-panel'].panel && {
  panel: variants['flip-panel'].panel,
  mini: variants['flip-mini'].mini
}
variants['helper-wrong-sign'] = variants['helper-refactor']

const helperCorrect = `/** shadow-only stand-in for the refactored shared helper (WRONG/right sign per case) */\nexport function activeTime(time: number, offset: number): number {\n  return time + 0.12 + offset\n}\n`
const helperWrong = helperCorrect.replace('+ offset', '- offset')

function runCase(name) {
  const v = variants[name]
  writeFileSync(join(COMP, 'LyricsPanel.tsx'), v.panel, 'utf8')
  writeFileSync(join(COMP, 'MiniPlayer.tsx'), v.mini, 'utf8')
  // byte-identical copies of the production lib + test (asserted)
  writeFileSync(join(LIB, 'lyricsOffset.ts'), read(REAL_LIB), 'utf8')
  writeFileSync(join(TESTDIR, 'lyricsOffset.test.ts'), realTestSrc, 'utf8')
  writeFileSync(
    join(LIB, 'lyricsTime.ts'),
    name === 'helper-wrong-sign' ? helperWrong : helperCorrect,
    'utf8'
  )
  const cmp = read(join(TESTDIR, 'lyricsOffset.test.ts'))
  if (sha(cmp) !== sha(read(REAL_TEST))) throw new Error('shadow test copy is not byte-identical')

  const heads = [
    witness(v.panel, headLits[0].re),
    witness(v.mini, headLits[1].re),
    witness(v.mini, headLits[2].re)
  ]
  const inline = inlineArithmetic(v.panel, v.mini).length
  console.log(`\n=================== CASE ${name} ===================`)
  console.log('  heads =', JSON.stringify(heads), ' inlineArithmetic(includes offset && 0.12) =', inline)

  const res = spawnSync(
    process.execPath,
    [
      join(REPO, 'node_modules/vitest/vitest.mjs'),
      'run',
      '--config',
      join(HERE, 'cfg-shadow.config.ts')
    ],
    { cwd: REPO, stdio: 'inherit' }
  )
  console.log(`  >>> ${name}: vitest exit=${res.status} (0=PASS, non-zero=FAIL)`)
  return res.status
}

// positive control first: identical test text + identical component text
const results = {}
for (const name of ['control', 'flip-panel', 'flip-mini', 'flip-both', 'helper-refactor', 'helper-wrong-sign']) {
  results[name] = runCase(name)
}

console.log('\n=================== SUMMARY ===================')
for (const [k, v] of Object.entries(results)) console.log(`  ${k.padEnd(18)} exit=${v}`)

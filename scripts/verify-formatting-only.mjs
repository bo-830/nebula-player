/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS probe (not shipped TS source); the rule targets typed TS modules.
 * If eslint.config.mjs later scopes this rule away from scripts/**, this
 * directive becomes redundant and can be deleted. */
/**
 * t6 — is the formatting-only claim true?
 *
 * Compares a file with what `prettier` would produce and classifies the diff:
 *   - `tokenIdentical` — stripping ALL whitespace leaves the same character
 *     sequence, i.e. the change cannot alter behaviour (whitespace/newlines/
 *     trailing-comma/quote style only).
 *   - otherwise the differing characters are printed so a real edit is visible.
 *
 * Files are read as UTF-8 by Node and prettier output is captured through a
 * temp copy, so nothing is mangled by the console codepage.
 *
 * Usage: node scripts/verify-formatting-only.mjs [file ...]
 */
import { execFile } from 'child_process'
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const DEFAULT_FILES = [
  'src/main/protocol.ts',
  'src/renderer/src/components/NavBar.tsx',
  'src/renderer/src/lib/tools.ts',
  'src/renderer/src/stores/playerStore.ts',
  'src/main/index.ts'
]
const files = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_FILES

const run = (cmd, args, cwd) =>
  new Promise((resolve) => {
    execFile(cmd, args, { cwd, shell: true, windowsHide: true }, (err, stdout) => resolve({ err, stdout }))
  })

const dir = await mkdtemp(join(tmpdir(), 'prettier-check-'))
const report = []

for (const f of files) {
  let original
  try {
    original = await readFile(f, 'utf8')
  } catch (e) {
    report.push({ file: f, error: String(e.message) })
    continue
  }
  const tmp = join(dir, f.replace(/[\\/]/g, '__'))
  await copyFile(f, tmp)
  // the temp copy lives outside the project, so prettier would not pick up
  // .prettierrc.yaml by directory lookup — pass it explicitly
  await run('npx.cmd', ['prettier', '--config', '.prettierrc.yaml', '--write', tmp], process.cwd())
  const formatted = await readFile(tmp, 'utf8')

  const strip = (s) => s.replace(/\s+/g, '')
  const tokenIdentical = strip(original) === strip(formatted)

  // first differing characters (for the honest "what actually changed" report)
  const a = [...original]
  const b = [...formatted]
  let i = 0
  const diffs = []
  while (i < Math.max(a.length, b.length) && diffs.length < 12) {
    if (a[i] !== b[i]) {
      diffs.push({
        at: i,
        original: JSON.stringify((a.slice(i, i + 24).join('') || '').slice(0, 24)),
        formatted: JSON.stringify((b.slice(i, i + 24).join('') || '').slice(0, 24))
      })
      // resync on the next line-ish boundary so we do not report 1000 noise pairs
      let j = i
      while (j < Math.max(a.length, b.length) && a[j] !== '\n') j++
      i = j + 1
      continue
    }
    i++
  }

  report.push({
    file: f,
    sameBytes: original === formatted,
    tokenIdentical,
    originalLen: original.length,
    formattedLen: formatted.length,
    crlfInOriginal: /\r\n/.test(original),
    crlfInFormatted: /\r\n/.test(formatted),
    diffSamples: diffs
  })
}

await rm(dir, { recursive: true, force: true })
const json = JSON.stringify(report, null, 2)
// the report is also written to disk: a Node deprecation warning on stderr makes
// shell redirection of stdout unreliable on this machine
await writeFile('.devdata/t6-evidence/probe-formatting-only.json', json, 'utf8')
console.log(json)

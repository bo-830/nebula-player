/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS probe (not shipped TS source); the rule targets typed TS modules.
 * If eslint.config.mjs later scopes this rule away from scripts/**, this
 * directive becomes redundant and can be deleted. */
/**
 * t6 — classify the prettier difference for ONE file precisely.
 *
 * Reports whether the formatted output is identical
 *   - byte for byte,
 *   - ignoring whitespace only, or
 *   - ignoring whitespace AND commas (prettier's trailing-comma normalisation),
 * plus structural counters (braces / semicolons / selector-ish lines) so an
 * accidental content change cannot hide behind "it's just formatting".
 *
 * Usage: node scripts/verify-format-class.mjs <file>
 */
import { execFile } from 'child_process'
import { copyFile, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const file = process.argv[2]
if (!file) {
  console.error('usage: node scripts/verify-format-class.mjs <file>')
  process.exit(2)
}

// parser must be explicit: the temp copy's extension would otherwise make
// prettier guess (a .txt name is not parsed as css/tsx)
const PARSER_BY_EXT = { '.css': 'css', '.ts': 'typescript', '.tsx': 'typescript', '.mjs': 'babel', '.js': 'babel', '.json': 'json', '.yml': 'yaml', '.md': 'markdown' }
const ext = file.slice(file.lastIndexOf('.'))
const parser = PARSER_BY_EXT[ext]
const tmp = join(tmpdir(), `fmtcheck-${Date.now()}${ext || '.txt'}`)
await copyFile(file, tmp)
await new Promise((resolve) => {
  const args = ['prettier', '--config', '.prettierrc.yaml']
  if (parser) args.push('--parser', parser)
  args.push('--write', tmp)
  execFile('npx.cmd', args, { shell: true, windowsHide: true }, () => resolve())
})
const original = await readFile(file, 'utf8')
const formatted = await readFile(tmp, 'utf8')
await rm(tmp, { force: true })

const stripWS = (s) => s.replace(/\s+/g, '')
const stripWSandComma = (s) => stripWS(s).replace(/,/g, '')
const count = (s, re) => (s.match(re) ?? []).length

const diffRegions = []
{
  const A = [...original]
  const B = [...formatted]
  let i = 0
  while (i < Math.max(A.length, B.length) && diffRegions.length < 8) {
    if (A[i] !== B[i]) {
      diffRegions.push({
        at: i,
        original: JSON.stringify(A.slice(Math.max(0, i - 14), i + 20).join('')),
        formatted: JSON.stringify(B.slice(Math.max(0, i - 14), i + 20).join(''))
      })
      let j = i
      while (j < Math.max(A.length, B.length) && A[j] !== '\n') j++
      i = j + 1
      continue
    }
    i++
  }
}

console.log(
  JSON.stringify(
    {
      file,
      byteIdentical: original === formatted,
      whitespaceOnly: stripWS(original) === stripWS(formatted),
      whitespaceAndCommaOnly: stripWSandComma(original) === stripWSandComma(formatted),
      lengthDelta: formatted.length - original.length,
      structural: {
        braces: [count(original, /[{}]/g), count(formatted, /[{}]/g)],
        semicolons: [count(original, /;/g), count(formatted, /;/g)],
        parens: [count(original, /[()]/g), count(formatted, /[()]/g)],
        colons: [count(original, /:/g), count(formatted, /:/g)]
      },
      diffRegions
    },
    null,
    2
  )
)

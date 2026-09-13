/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS reporting helper (not shipped TS source); the rule targets typed TS modules.
 * If eslint.config.mjs later scopes this rule away from scripts/**, this
 * directive becomes redundant and can be deleted. */
/**
 * t6 — extract the exact ESLint errors (for evidence quoting) from a report.
 *
 * Usage: node scripts/verify-lint-errors.mjs [report.json] [--filter=<substr>]
 */
import { readFile } from 'fs/promises'

const args = process.argv.slice(2)
const file =
  args.find((a) => !a.startsWith('--')) ?? '.devdata/t6-evidence/eslint-json-baseline-r1.log'
const filter = (args.find((a) => a.startsWith('--filter=')) ?? '--filter=').slice(
  '--filter='.length
)
// strip a UTF-8 BOM: writing the report through PowerShell (`>`) prepends one
const report = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
const rel = (p) => {
  const n = p.replace(/\\/g, '/')
  const i = n.indexOf('/nebula-player/')
  return i >= 0 ? n.slice(i + '/nebula-player/'.length) : n
}

const rows = []
for (const f of report) {
  const path = rel(f.filePath)
  if (filter && !path.includes(filter)) continue
  for (const m of f.messages) {
    if (m.severity !== 2) continue
    rows.push({ file: path, line: m.line, col: m.column, rule: m.ruleId, message: m.message })
  }
}
rows.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1))

console.log(`report: ${file}   filter: ${filter || '(none)'}   errors: ${rows.length}`)
const byFile = {}
for (const r of rows) byFile[r.file] = (byFile[r.file] ?? 0) + 1
console.log('files with errors:', Object.keys(byFile).length)
console.log('')
for (const [f, n] of Object.entries(byFile)) console.log(`${String(n).padStart(3)}  ${f}`)
console.log('')
for (const r of rows)
  console.log(`${r.file}:${r.line}:${r.col}  ${r.rule}  ${r.message.slice(0, 140)}`)

// ---------- my t6 probes vs pre-existing scripts ----------
const MINE = /scripts\/(verify-[a-z-]+|mock-llm-confirm)\.mjs$/
const srcRows = rows.filter((r) => r.file.startsWith('src/'))
const myRows = rows.filter((r) => MINE.test(r.file))
const preRows = rows.filter((r) => !r.file.startsWith('src/') && !MINE.test(r.file))
const byDir = (list) => {
  const m = {}
  for (const r of list) m[r.file] = (m[r.file] ?? 0) + 1
  return m
}
console.log('\n================ attribution ================')
console.log(
  `src/**                   : ${srcRows.length} errors in ${Object.keys(byDir(srcRows)).length} files`
)
console.log(
  `scripts/** t6 probes     : ${myRows.length} errors in ${Object.keys(byDir(myRows)).length} files`
)
console.log(
  `scripts/** pre-existing  : ${preRows.length} errors in ${Object.keys(byDir(preRows)).length} files`
)
if (preRows.length) {
  console.log('\npre-existing script errors by file:')
  for (const [f, n] of Object.entries(byDir(preRows)))
    console.log(`  ${String(n).padStart(3)}  ${f}`)
}

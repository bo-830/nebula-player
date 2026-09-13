/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS reporting helper (not shipped TS source); the rule targets typed TS modules.
 * If eslint.config.mjs later scopes this rule away from scripts/**, this
 * directive becomes redundant and can be deleted. */
/**
 * t6 — summarise an ESLint JSON report produced by verify-lint-tests.mjs.
 *
 * Usage: node scripts/verify-lint-report.mjs [.devdata/t6-evidence/eslint-json-<label>.log]
 */
import { readFile } from 'fs/promises'

const file = process.argv[2] ?? '.devdata/t6-evidence/eslint-json-baseline-r1.log'
const report = JSON.parse(await readFile(file, 'utf8'))
const norm = (p) => p.replace(/\\/g, '/')
const rel = (p) => {
  const n = norm(p)
  const i = n.indexOf('/nebula-player/')
  return i >= 0 ? n.slice(i + '/nebula-player/'.length) : n
}

const group = (pred) => {
  const files = report.filter((f) => pred(rel(f.filePath)) && (f.errorCount || f.warningCount))
  return {
    files: files.length,
    errors: files.reduce((n, f) => n + f.errorCount, 0),
    warnings: files.reduce((n, f) => n + f.warningCount, 0),
    byRule: files.reduce((acc, f) => {
      for (const m of f.messages) {
        const k = `${m.severity === 2 ? 'E' : 'W'}:${m.ruleId ?? 'parse'}`
        acc[k] = (acc[k] ?? 0) + 1
      }
      return acc
    }, {}),
    fileList: files.map((f) => `${rel(f.filePath)} e=${f.errorCount} w=${f.warningCount}`)
  }
}

const out = {
  file,
  total: {
    files: report.length,
    errors: report.reduce((n, f) => n + f.errorCount, 0),
    warnings: report.reduce((n, f) => n + f.warningCount, 0)
  },
  src: group((p) => p.startsWith('src/')),
  scripts: group((p) => p.startsWith('scripts/')),
  other: group((p) => !p.startsWith('src/') && !p.startsWith('scripts/')),
  srcDetail: report
    .filter((f) => rel(f.filePath).startsWith('src/') && (f.errorCount || f.warningCount))
    .map((f) => ({
      file: rel(f.filePath),
      errors: f.errorCount,
      warnings: f.warningCount,
      messages: f.messages.map((m) => ({
        line: m.line,
        col: m.column,
        rule: m.ruleId,
        sev: m.severity,
        msg: m.message
      }))
    })),
  nonSrcErrorFiles: report
    .filter((f) => !rel(f.filePath).startsWith('src/') && f.errorCount)
    .map((f) => `${rel(f.filePath)} e=${f.errorCount}`)
}

console.log(JSON.stringify(out, null, 2))

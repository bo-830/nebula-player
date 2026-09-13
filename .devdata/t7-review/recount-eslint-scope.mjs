// t7 reviewer: independently re-derive the ESLint scope accounting the captain asked
// to see stated precisely (files in scope / errors / warnings, per directory bucket).
import { readFileSync, statSync } from 'node:fs'

function bucket(p) {
  const rel = p.replace(/\\/g, '/').replace(/^.*nebula-player\//, '')
  if (rel.startsWith('src/')) return 'src/**'
  if (rel.startsWith('scripts/')) return 'scripts/**'
  if (rel.startsWith('.devdata/')) return '.devdata/**'
  return 'root-config'
}

function summarize(label, file) {
  let json
  try {
    json = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    console.log(`${label}: NOT JSON (${String(e).slice(0, 80)})`)
    return
  }
  const rows = Array.isArray(json) ? json : (json.results ?? [])
  const per = {}
  let errs = 0
  let warns = 0
  for (const r of rows) {
    const b = bucket(r.filePath)
    per[b] = per[b] || { files: 0, errors: 0, warnings: 0 }
    per[b].files++
    per[b].errors += r.errorCount ?? 0
    per[b].warnings += r.warningCount ?? 0
    errs += r.errorCount ?? 0
    warns += r.warningCount ?? 0
  }
  console.log(`\n== ${label} ==`)
  console.log(`total files=${rows.length} errors=${errs} warnings=${warns}`)
  for (const [k, v] of Object.entries(per).sort()) {
    console.log(`   ${k.padEnd(13)} files=${String(v.files).padStart(3)} errors=${String(v.errors).padStart(3)} warnings=${String(v.warnings).padStart(3)}`)
  }
}

console.log('eslint.config.mjs mtime =', statSync('eslint.config.mjs').mtime.toISOString())
summarize('t6 baseline (15:12:44)', '.devdata/t6-evidence/eslint-json-baseline-r1.log')
summarize('t6 final (t6-final)', '.devdata/t6-evidence/eslint-json-t6-final.log')
summarize('t7 reviewer no-cache run (16:11)', '.devdata/t7-review/eslint-nocache.json')

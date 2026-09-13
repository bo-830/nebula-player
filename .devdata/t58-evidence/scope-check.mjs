/**
 * t58 (H1) scope check — proves ONLY the two inScope files were touched.
 *
 * Boundary: the t54 convergence fingerprint instant (2026-09-13T12:48:44.913Z).
 *
 * Usage: node .devdata/t58-evidence/scope-check.mjs
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const TASK_START = Date.parse('2026-09-13T12:48:44.913Z')
const IN_SCOPE = new Set([
  'src/renderer/src/stores/chatStore.ts',
  'src/renderer/src/lib/__tests__/chatConfirm.test.ts'
])
const FORBIDDEN = [
  'src/main',
  'src/preload',
  'src/shared',
  'src/renderer/src/components',
  'src/renderer/src/lib/tools.ts',
  'src/renderer/src/lib/mainWindowBridge.ts'
]

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else out.push(p.split('\\').join('/'))
  }
  return out
}

const files = walk('src')
const touched = []
for (const f of files) if (statSync(f).mtimeMs > TASK_START) touched.push(f)

const unexpected = touched.filter((f) => !IN_SCOPE.has(f))
const missing = [...IN_SCOPE].filter((f) => !touched.includes(f))
const forbidden = touched.filter((f) => FORBIDDEN.some((m) => f === m || f.startsWith(m + '/')))

console.log(`src files scanned          : ${files.length}`)
console.log(`boundary (t54 convergence) : ${new Date(TASK_START).toISOString()}`)
console.log(`files modified since then  : ${touched.length}`)
for (const f of touched) {
  const st = statSync(f)
  const sha1 = createHash('sha1').update(readFileSync(f)).digest('hex')
  console.log(
    `  ${IN_SCOPE.has(f) ? 'IN-SCOPE ' : 'OUT!!    '} ${f}  ${new Date(st.mtimeMs).toISOString()} ${st.size} B sha1=${sha1.slice(0, 12)}`
  )
}
const src = touched.map((f) => readFileSync(f, 'utf8')).join('\n')
console.log(`out-of-scope files touched : ${unexpected.length} ${unexpected.join(', ')}`)
console.log(`in-scope declared but clean: ${missing.length} ${missing.join(', ')}`)
console.log(`forbidden paths touched    : ${forbidden.length} ${forbidden.join(', ')}`)
console.log(`eslint-disable present     : ${/eslint-disable/.test(src) ? 'FOUND' : 'none'}`)

const ok = unexpected.length === 0 && missing.length === 0 && forbidden.length === 0
console.log(`SCOPE CLEAN: ${ok}`)
process.exit(ok ? 0 : 1)

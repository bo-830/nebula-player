/**
 * t54 (J) scope check — proves ONLY the four inScope files were touched.
 *
 * Method: walk every file under src/, and classify by mtime against the instant
 * this task started (t50's post-fix fingerprint, 2026-09-13T12:29:35.427Z — the
 * moment the tree was last known to be unchanged). Anything newer than that
 * must be one of the four inScope paths; everything else must be older.
 *
 * Usage: node .devdata/t54-evidence/scope-check.mjs
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, posix } from 'node:path'

const TASK_START = Date.parse('2026-09-13T12:29:35.427Z')
const IN_SCOPE = new Set([
  'src/renderer/src/lib/tools.ts',
  'src/renderer/src/components/ChatPanel.tsx',
  'src/renderer/src/components/MiniChat.tsx',
  'src/renderer/src/lib/__tests__/chatConfirm.test.ts'
])
const MUST_NOT_BE_TOUCHED = [
  'src/main',
  'src/preload',
  'src/shared',
  'src/renderer/src/components/MiniPlayer.tsx',
  'src/renderer/src/components/MiniSearch.tsx',
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
let newestUntouched = 0
for (const f of files) {
  const st = statSync(f)
  if (st.mtimeMs > TASK_START) touched.push(f)
  else newestUntouched = Math.max(newestUntouched, st.mtimeMs)
}

const unexpected = touched.filter((f) => !IN_SCOPE.has(f))
const missing = [...IN_SCOPE].filter((f) => !touched.includes(f))
const forbidden = touched.filter((f) => MUST_NOT_BE_TOUCHED.some((m) => f === m || f.startsWith(m + '/')))

console.log(`src files scanned            : ${files.length}`)
console.log(`task start (mtime boundary)  : ${new Date(TASK_START).toISOString()}`)
console.log(`files modified since then    : ${touched.length}`)
for (const f of touched) {
  const st = statSync(f)
  const sha1 = createHash('sha1').update(readFileSync(f)).digest('hex')
  console.log(
    `  ${IN_SCOPE.has(f) ? 'IN-SCOPE ' : 'OUT!!    '} ${f}  ${new Date(st.mtimeMs).toISOString()} ${st.size} B sha1=${sha1.slice(0, 12)}`
  )
}
console.log(`newest UNTOUCHED file        : ${new Date(newestUntouched).toISOString()}`)
console.log(`out-of-scope files touched   : ${unexpected.length} ${unexpected.join(', ')}`)
console.log(`in-scope declared but clean  : ${missing.length} ${missing.join(', ')}`)
console.log(`forbidden paths touched      : ${forbidden.length} ${forbidden.join(', ')}`)
console.log(`eslint-disable added         : ${touched.filter((f) => readFileSync(f, 'utf8').includes('eslint-disable')).length === 0 ? 'none' : 'FOUND'}`)

const ok = unexpected.length === 0 && missing.length === 0 && forbidden.length === 0
console.log(`SCOPE CLEAN: ${ok}`)
process.exit(ok ? 0 : 1)

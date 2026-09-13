/**
 * t55 — independent scope audit for t54 (does NOT trust t54's own report).
 *
 * Verifies, from the working tree itself:
 *  - which files under src/** changed after t54's task start,
 *  - the current hash/size of each declared inScope file vs the sha1 prefixes
 *    t54 published,
 *  - that every forbidden path is untouched (mtime before t54's start),
 *  - that no eslint-disable was introduced,
 *  - that THIS task (t55) wrote nothing under src/**.
 */
import { readdirSync, statSync, readFileSync, writeFileSync } from 'fs'
import { createHash } from 'crypto'
import { join } from 'path'

const ROOT = 'src'
const T54_START = Date.parse('2026-09-13T12:29:35.427Z')
const T54_LAST_WRITE = Date.parse('2026-09-13T12:48:33.832Z')
const T55_START = Date.parse('2026-09-13T13:32:00.000Z')

const IN_SCOPE = [
  'src/renderer/src/lib/tools.ts',
  'src/renderer/src/components/ChatPanel.tsx',
  'src/renderer/src/components/MiniChat.tsx',
  'src/renderer/src/lib/__tests__/chatConfirm.test.ts'
]
const CLAIMED = {
  'src/renderer/src/lib/tools.ts': { sha12: 'ee665436ef84', size: 24884 },
  'src/renderer/src/components/ChatPanel.tsx': { sha12: 'fa0f16ec596b', size: 8310 },
  'src/renderer/src/components/MiniChat.tsx': { sha12: '1e2d62e5b60d', size: 7498 },
  'src/renderer/src/lib/__tests__/chatConfirm.test.ts': { sha12: 'e33545d5777d', size: 31884 }
}
const FORBIDDEN = [
  'src/main',
  'src/preload',
  'src/shared',
  'src/renderer/src/components/MiniPlayer.tsx',
  'src/renderer/src/components/MiniSearch.tsx',
  'src/renderer/src/lib/mainWindowBridge.ts',
  'src/renderer/src/stores/chatStore.ts'
]

const walk = (dir, acc = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name).replace(/\\/g, '/')
    if (e.isDirectory()) walk(p, acc)
    else acc.push(p)
  }
  return acc
}
const sha1 = (p) => createHash('sha1').update(readFileSync(p)).digest('hex')
const iso = (ms) => new Date(ms).toISOString().replace('Z', 'Z')

const files = walk(ROOT)
const changedAfterT54Start = []
const changedAfterT55Start = []
const rows = []
for (const f of files) {
  const st = statSync(f)
  const row = { file: f, size: st.size, mtime: iso(st.mtimeMs), sha1: sha1(f) }
  rows.push(row)
  if (st.mtimeMs > T54_START) changedAfterT54Start.push(`${f}  ${st.size} B  ${row.sha1.slice(0, 12)}  ${row.mtime}`)
  if (st.mtimeMs > T55_START) changedAfterT55Start.push(`${f}  ${st.size} B  ${row.mtime}`)
}

const inScopeNow = {}
for (const f of IN_SCOPE) {
  const st = statSync(f)
  const h = sha1(f)
  inScopeNow[f] = {
    size: st.size,
    sha1: h,
    sha12: h.slice(0, 12),
    mtime: iso(st.mtimeMs),
    matchesClaim: h.slice(0, 12) === CLAIMED[f].sha12 && st.size === CLAIMED[f].size
  }
}

const forbidden = FORBIDDEN.map((p) => {
  let target = p
  let files2 = []
  let isDir = false
  try {
    isDir = statSync(p).isDirectory()
  } catch {
    /* missing */
  }
  files2 = isDir ? walk(p) : [p]
  const latest = files2
    .map((f) => ({ f, m: statSync(f).mtimeMs }))
    .sort((a, b) => b.m - a.m)[0]
  return {
    path: p,
    files: files2.length,
    latestMtime: latest ? iso(latest.m) : null,
    latestFile: latest?.f ?? null,
    touchedAfterT54Start: latest ? latest.m > T54_START : false
  }
})

let eslintDisables = 0
for (const f of IN_SCOPE) eslintDisables += (readFileSync(f, 'utf8').match(/eslint-disable/g) ?? []).length

const out = {
  filesScanned: files.length,
  t54Start: iso(T54_START),
  t54LastWrite: iso(T54_LAST_WRITE),
  t55Start: iso(T55_START),
  changedAfterT54Start,
  outOfScopeTouchedCount: changedAfterT54Start.filter(
    (l) => !IN_SCOPE.some((f) => l.startsWith(f.replace(/\\/g, '/')))
  ).length,
  changedAfterT55Start,
  inScopeNow,
  allClaimsMatch: Object.values(inScopeNow).every((v) => v.matchesClaim),
  forbidden,
  forbiddenTouched: forbidden.filter((x) => x.touchedAfterT54Start).map((x) => x.path),
  eslintDisableCountInInScopeFiles: eslintDisables,
  aggregateSha1OfSrc: createHash('sha1')
    .update(rows.map((r) => r.file + ':' + r.sha1).sort().join('\n'))
    .digest('hex'),
  srcFileCount: rows.length
}

writeFileSync('.devdata/t55-evidence/t55-scope-check.json', JSON.stringify(out, null, 2), 'utf8')
console.log(JSON.stringify(out, null, 2))

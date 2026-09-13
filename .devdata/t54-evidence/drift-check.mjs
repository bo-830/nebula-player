import { readFileSync } from 'node:fs'
const before = JSON.parse(readFileSync('.devdata/t13-r2-evidence/t50-postfix-snapshot.json', 'utf8'))
const after = JSON.parse(readFileSync('.devdata/t13-r2-evidence/t54-postfix-snapshot.json', 'utf8'))
const key = (s) => Object.keys(s.keyFiles[0])
console.log('keyFiles shape:', JSON.stringify(key(before)))
const flat = (arr) => {
  const out = {}
  for (const e of arr) {
    if (typeof e === 'string') { const p = e.split(' ')[0]; out[p] = e }
    else { const p = e.path ?? e.file; out[p] = `${p} ${e.mtime ?? ''} ${e.size ?? ''} ${e.sha1 ?? ''}` }
  }
  return out
}
const b = flat(before.keyFiles), a = flat(after.keyFiles)
const drift = []
for (const [p, line] of Object.entries(a)) {
  if (!(p in b)) { drift.push(`${p} (new)`); continue }
  if (b[p] !== line) drift.push(`${p}\n    before: ${b[p]}\n    after : ${line}`)
}
console.log('\nkey-file drift since t50-postfix:', drift.length)
for (const d of drift) console.log('  ' + d)
console.log('\naggregate before:', before.srcAggregateSha1)
console.log('aggregate after :', after.srcAggregateSha1)
console.log('fileCount:', before.srcFileCount, '->', after.srcFileCount)
console.log('newest src mtime:', before.newestSrcMtime, '->', after.newestSrcMtime)

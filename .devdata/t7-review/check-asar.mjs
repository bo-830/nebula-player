// t7 reviewer: independent check of t11's packaging claim.
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const asar = require('@electron/asar')
const ASAR = 'C:\\博830\\vibecoding\\nebula-player\\dist\\win-unpacked\\resources\\app.asar'

const list = asar.listPackage(ASAR)
const devdata = list.filter((f) => /devdata/i.test(f))
const scripts = list.filter((f) => /[\\/]scripts[\\/]/i.test(f) || /^[\\/]?scripts[\\/]/i.test(f))
const tmp = list.filter((f) => /[\\/]tmp-/i.test(f))
const top = {}
for (const f of list) {
  const seg = f.replace(/^[\\/]/, '').split(/[\\/]/)[0]
  top[seg] = (top[seg] || 0) + 1
}
const report = {
  asar: ASAR,
  entries: list.length,
  devdataEntries: devdata.length,
  devdataSamples: devdata.slice(0, 5),
  scriptsEntries: scripts.length,
  tmpEntries: tmp.length,
  topLevel: Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 15)
}
console.log(JSON.stringify(report, null, 2))
writeFileSync('.devdata/t7-review/t11-asar-check.json', JSON.stringify(report, null, 2), 'utf8')

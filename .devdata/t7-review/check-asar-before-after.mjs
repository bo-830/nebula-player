// t7 reviewer: verify t11's "before" numbers against the pre-change installed build.
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const asar = require('@electron/asar')

function scan(p, label) {
  const list = asar.listPackage(p)
  const dev = list.filter((f) => /devdata/i.test(f))
  const scr = list.filter((f) => /[\\/]?scripts[\\/]/i.test(f))
  const r = {
    label,
    path: p,
    entries: list.length,
    devdataEntries: dev.length,
    devdataSample: dev.slice(0, 4),
    scriptsEntries: scr.length,
    scriptsSample: scr.slice(0, 4)
  }
  console.log(JSON.stringify(r, null, 2))
  return r
}

const before = scan(
  'C:\\Users\\34872\\AppData\\Local\\Programs\\nebula-player\\resources\\app.asar',
  'installed-1.0.3 (2026-09-12 12:27, pre-change electron-builder.yml)'
)
const after = scan(
  'C:\\博830\\vibecoding\\nebula-player\\dist\\win-unpacked\\resources\\app.asar',
  'dist (2026-09-12 15:14, post-change electron-builder.yml)'
)
writeFileSync('.devdata/t7-review/t11-asar-before-after.json', JSON.stringify({ before, after }, null, 2), 'utf8')

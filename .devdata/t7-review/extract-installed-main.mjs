// t7 reviewer: pull out/main/index.js of the previously installed 1.0.3 build so the
// pre-t10 protocol/scheme registration can be compared with the current source.
import { createRequire } from 'node:module'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const asar = require('@electron/asar')

const ASAR = 'C:\\Users\\34872\\AppData\\Local\\Programs\\nebula-player\\resources\\app.asar'
const OUT = 'C:\\830placeholder'
const outDir = 'C:\\博830\\vibecoding\\nebula-player\\.devdata\\t7-review'
mkdirSync(outDir, { recursive: true })
void OUT

const list = asar.listPackage(ASAR).filter((f) => /main[\\/]index\.js$/.test(f))
console.log('main bundles:', list)
for (const f of list) {
  const buf = asar.extractFile(ASAR, f.replace(/^[\\/]/, ''))
  writeFileSync(join(outDir, 'installed-main-index.js'), buf)
  console.log('wrote installed-main-index.js', buf.length)
}

// t7 reviewer: extract the previously-installed 1.0.3 renderer bundle from app.asar
// to recover the PRE-t1 implementation of playerStore.next(). Read-only w.r.t. src.
import { createRequire } from 'node:module'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const asar = require('@electron/asar')

const ASAR = 'C:\\Users\\34872\\AppData\\Local\\Programs\\nebula-player\\resources\\app.asar'
const OUT = 'C:\\博830\\vibecoding\\nebula-player\\.devdata\\t7-review'
mkdirSync(OUT, { recursive: true })

const files = asar.listPackage(ASAR).filter((f) => /renderer[\\/]assets[\\/].*\.js$/.test(f))
console.log('renderer bundles in installed asar:', files)
for (const f of files) {
  const buf = asar.extractFile(ASAR, f.replace(/^[\\/]/, ''))
  const target = join(OUT, 'installed-' + f.replace(/[\\/]/g, '_'))
  writeFileSync(target, buf)
  console.log('wrote', target, buf.length)
}
// also record package.json of the installed build for version confirmation
try {
  const pkg = asar.extractFile(ASAR, 'package.json').toString('utf8')
  writeFileSync(join(OUT, 'installed-package.json'), pkg)
  console.log('installed version:', JSON.parse(pkg).version)
} catch (e) {
  console.log('package.json extract failed:', String(e))
}

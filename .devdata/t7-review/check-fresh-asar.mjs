// t42 reviewer: verify the FRESH packaged artifact (rebuilt ~12:39Z) carries the R1 fix.
// Read-only: extracts out/main/index.js from app.asar into .devdata/t7-review/ and greps it.
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
import { statSync } from 'node:fs'

const require = createRequire(import.meta.url)
const asar = require('@electron/asar')
const ASAR = 'C:\\博830\\vibecoding\\nebula-player\\dist\\win-unpacked\\resources\\app.asar'

const st = statSync(ASAR)
console.log(`asar size=${st.size} mtime=${new Date(st.mtimeMs).toISOString()}`)

const buf = asar.extractFile(ASAR, 'out\\main\\index.js')
const text = buf.toString('utf8')
const out = 'C:\\博830\\vibecoding\\nebula-player\\.devdata\\t7-review\\dist-asar-main-index.js'
writeFileSync(out, text)
console.log(`extracted out/main/index.js bytes=${buf.length}`)

const count = (re) => (text.match(re) ?? []).length
const report = {
  rootsLoaded: count(/rootsLoaded/g),
  createMediaRoots: count(/createMediaRoots/g),
  refreshMediaRoots: count(/refreshMediaRoots/g),
  pendingPromiseCache: count(/pending\s*=\s*promise/g),
  isInsideRoots: count(/isInsideRoots/g),
  SERVABLE_EXTS: count(/SERVABLE_EXTS/g),
  corsHeaders: count(/Access-Control-Allow-Origin/g),
  devOrigins: count(/DEV_ORIGINS/g),
  willRedirect: count(/will-redirect/g),
  hasAcceptResponseHelper: count(/acceptLyricsResponse/g),
  callAutoPrefix: count(/call_auto_/g)
}
console.log(JSON.stringify(report, null, 2))
const verdict =
  report.rootsLoaded === 0 &&
  report.createMediaRoots >= 1 &&
  report.refreshMediaRoots >= 1 &&
  report.isInsideRoots >= 1
console.log('PACKAGED-FIX-PRESENT =', verdict)

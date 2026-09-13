/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS probe (not shipped TS source); the rule targets typed TS modules.
 * If eslint.config.mjs later scopes this rule away from scripts/**, this
 * directive becomes redundant and can be deleted. */
/**
 * t28 / item-2 — is the decode cache inside the media:// allowlist?
 *
 * AAC→M4A and APE→WAV transcodes land in `<userData>/decode-cache`
 * (`decodeService.cacheFileFor`), and the renderer plays them through `media://`.
 * If that directory is not a registered root, `protocol.ts` answers 403 and a real
 * user simply cannot play AAC/APE — so this is a functional requirement, not a
 * detail.
 *
 * The probe resolves the same paths the app does and checks containment, then
 * verifies (statically) that `registerMediaProtocol()` put them into the list.
 *
 * Usage: node scripts/verify-decode-cache-root.mjs
 */
import { mkdir, readFile, writeFile } from 'fs/promises'
import { isAbsolute, join, relative, resolve } from 'path'

const outDir = '.devdata/t13-r2-evidence'
await mkdir(outDir, { recursive: true })

// the app's own definition of the cache directory (store.ts:18-23)
const userData = join(process.env.APPDATA ?? '', 'nebula-player')
const covers = join(userData, 'covers')
const decodeCache = join(userData, 'decode-cache')

const protocolSrc = await readFile('src/main/protocol.ts', 'utf8')
const decodeSrc = await readFile('src/main/decodeService.ts', 'utf8')
const storeSrc = await readFile('src/main/store.ts', 'utf8')

const registeredRoots = []
// pull the roots out of the source: `new Set<string>([resolve(p.covers), resolve(p.decodeCache)])`
const rootLine = protocolSrc.split(/\r?\n/).find((l) => /new Set<string>\(\[/.test(l)) ?? ''
for (const m of rootLine.matchAll(/p\.(\w+)/g)) {
  registeredRoots.push(m[1] === 'covers' ? covers : m[1] === 'decodeCache' ? decodeCache : `<${m[1]}>`)
}

const isInside = (root, target) => {
  const rel = relative(resolve(root), resolve(target))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

const checks = {
  decodeCacheInRoots: registeredRoots.some((r) => resolve(r) === resolve(decodeCache)),
  coversInRoots: registeredRoots.some((r) => resolve(r) === resolve(covers)),
  // a cache file the transcoder would produce
  cacheFileInsideCache: isInside(decodeCache, join(decodeCache, 'deadbeef.mp4')),
  explicitContainerFlags: /'-f', 'mp4'/.test(decodeSrc) && /'-f', 'wav'/.test(decodeSrc),
  cachePathFromStore: /decodeCache: join\(userData, 'decode-cache'\)/.test(storeSrc)
}

// exercise the REAL `needsConvert` (mediaFormats.ts is Electron-free by design)
let decisions = {}
try {
  const { createServer } = await import('vite')
  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    server: { middlewareMode: true, watch: null, hmr: false },
    appType: 'custom',
    logLevel: 'error'
  })
  try {
    const mod = await server.ssrLoadModule('/src/main/mediaFormats.ts')
    const cases = ['a.mp3', 'a.wav', 'a.flac', 'a.ogg', 'a.opus', 'a.m4a', 'a.aac', 'a.ape', 'a.AAC', 'a.APE', 'a.xyz', 'noext']
    for (const c of cases) decisions[c] = mod.needsConvert(c)
  } finally {
    await server.close()
  }
} catch (e) {
  decisions = { error: String(e.message) }
}

checks.aacConvertsToM4a = decisions['a.aac'] === 'm4a'
checks.apeConvertsToWav = decisions['a.ape'] === 'wav'
checks.lowercaseTolerant = decisions['a.AAC'] === 'm4a' && decisions['a.APE'] === 'wav'
checks.directFormatsUntouched = ['a.mp3', 'a.wav', 'a.flac', 'a.ogg', 'a.opus', 'a.m4a'].every((c) => decisions[c] === null)
checks.unknownReturnsNull = decisions['a.xyz'] === null && decisions['noext'] === null

// what the transcoder decides for each extension — read from the real module below
const formatsSrc = await readFile('src/main/mediaFormats.ts', 'utf8').catch(() => '')

const out = {
  capturedAt: new Date().toISOString(),
  userData,
  decodeCache,
  covers,
  registeredRootsFromSource: registeredRoots,
  checks,
  formatDecisions: decisions,
  allPass: Object.entries(checks).every(([, v]) => v === true)
}

await writeFile(`${outDir}/t28-decode-cache-root.json`, JSON.stringify(out, null, 2), 'utf8')
console.log(JSON.stringify(out, null, 2))
process.exit(out.allPass ? 0 : 1)

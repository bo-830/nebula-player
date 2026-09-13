/* Read-only: does the PACKAGED app.asar already contain the fixed R1 media-roots
 * implementation (t33/t40), or is it the old boolean latch the reviewer feared?
 *
 * Usage: node .devdata/t13-r2-evidence/check-packed-r1.mjs
 * Writes nothing; uses @electron/asar's extractFile (returns a Buffer).
 */
import { createRequire } from 'module'
import { createHash } from 'crypto'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const require = createRequire(import.meta.url)
const asar = require('@electron/asar')

const sha1 = (buf) => createHash('sha1').update(buf).digest('hex').toUpperCase()
const count = (buf, needle) => buf.toString('utf8').split(needle).length - 1

/** NOTE: the pre-fix latch signature. `rootsLoaded` must NOT appear anywhere. */
const LATCH = 'rootsLoaded'
const FIXED = ['refreshMediaRoots', 'createMediaRoots']

const inspect = (label, buf) => ({
  label,
  size: buf.length,
  sha1: sha1(buf),
  rootsLoaded_occurrences: count(buf, LATCH),
  refreshMediaRoots_occurrences: count(buf, 'refreshMediaRoots'),
  createMediaRoots_occurrences: count(buf, 'createMediaRoots'),
  oldLatchLiteral_present: buf.toString('utf8').includes('let rootsLoaded = false'),
  ensureRoots_occurrences: count(buf, 'ensureRoots')
})

const targets = []

// 1) the build output currently on disk (post-t43 workspace state)
if (existsSync('out/main/index.js')) {
  targets.push(inspect('out/main/index.js (workspace)', readFileSync('out/main/index.js')))
}

/** Enumerate the real main-bundle path inside an archive (no hardcoded guess). */
const mainEntryIn = (archive) => {
  const listed = asar.listPackage(archive).map((p) => p.replace(/\\/g, '/'))
  return (
    listed.find((p) => p === '/out/main/index.js') ??
    listed.find((p) => /^\/out\/main\/.*\.(js|cjs|mjs)$/.test(p)) ??
    null
  )
}

const inspectArchive = (label, archive) => {
  const entry = mainEntryIn(archive)
  if (!entry) return { label, error: 'no out/main/*.js entry found', outEntries: [] }
  const buf = asar.extractFile(archive, entry.replace(/^\//, ''))
  return {
    ...inspect(`${label} :: ${entry}`, buf),
    mainEntryPath: entry,
    outEntries: asar.listPackage(archive).filter((p) => /^\\?out/i.test(p.replace(/^\//, '')))
  }
}

// 2) inside the packaged asar (the artifact that actually ships)
const distAsar = 'dist/win-unpacked/resources/app.asar'
if (existsSync(distAsar)) targets.push(inspectArchive('packed: dist/win-unpacked/resources/app.asar', distAsar))

// 3) inside the INSTALLED asar (what landed on the user machine)
const installedAsar = join(process.env.LOCALAPPDATA ?? '', 'Programs', 'nebula-player', 'resources', 'app.asar')
if (existsSync(installedAsar)) targets.push(inspectArchive('packed: installed app.asar', installedAsar))

const verdict = targets
  .filter((t) => t.label.startsWith('packed:'))
  .map((t) => ({
    label: t.label,
    PASS_A1__no_latch: t.rootsLoaded_occurrences === 0 && t.oldLatchLiteral_present === false,
    PASS_A1__has_fix: FIXED.every((n) => t[n + '_occurrences'] > 0)
  }))

console.log(JSON.stringify({ targets, verdict }, null, 2))

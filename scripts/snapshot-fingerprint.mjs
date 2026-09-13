/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS probe (not shipped TS source); the rule targets typed TS modules.
 * If eslint.config.mjs later scopes this rule away from scripts/**, this
 * directive becomes redundant and can be deleted. */
/**
 * t15 / t9 — mandatory snapshot fingerprint (captain's rule B).
 *
 * Every verdict must state which tree it was taken on: the repo has no version
 * control, so this prints mtime + size + sha1 for the files a conclusion depends
 * on, plus a single aggregate hash so two runs can be compared at a glance.
 *
 * Usage:
 *   node scripts/snapshot-fingerprint.mjs                  # default set + whole src/**
 *   node scripts/snapshot-fingerprint.mjs --label t15      # writes .devdata/<label>-snapshot.json
 *   node scripts/snapshot-fingerprint.mjs --files a.ts b.ts
 */
import { createHash } from 'crypto'
import { mkdir, readFile, readdir, stat, writeFile } from 'fs/promises'
import { join } from 'path'

const args = process.argv.slice(2)
const label = args.includes('--label') ? args[args.indexOf('--label') + 1] : 'snapshot'
const explicit = args.includes('--files') ? args.slice(args.indexOf('--files') + 1).filter((a) => !a.startsWith('--')) : null

/** files a t15/t9 verdict typically leans on */
const KEY_FILES = [
  'src/main/index.ts',
  'src/main/protocol.ts',
  'src/main/store.ts',
  'src/main/settings.ts',
  'src/main/window.ts',
  'src/main/mediaFormats.ts',
  'src/main/decodeService.ts',
  'src/renderer/src/lib/audioEngine.ts',
  'src/renderer/src/lib/sleepTimer.ts',
  'src/renderer/src/lib/tools.ts',
  'src/renderer/src/lib/lyricsOffset.ts',
  'src/renderer/src/stores/playerStore.ts',
  'src/renderer/src/stores/chatStore.ts',
  'src/renderer/src/components/LyricsPanel.tsx',
  'src/renderer/src/components/MiniPlayer.tsx',
  'src/renderer/src/components/TrackList.tsx',
  'src/renderer/src/components/MainView.tsx',
  'src/renderer/index.html',
  'package.json',
  'electron-builder.yml',
  'eslint.config.mjs'
]

async function sha1Of(file) {
  return createHash('sha1').update(await readFile(file)).digest('hex')
}

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) await walk(p, out)
    else out.push(p.replace(/\\/g, '/'))
  }
  return out
}

const targets = explicit ?? KEY_FILES
const rows = []
for (const f of targets) {
  try {
    const s = await stat(f)
    rows.push({ file: f, mtime: new Date(s.mtimeMs).toISOString(), size: s.size, sha1: (await sha1Of(f)).slice(0, 12) })
  } catch (e) {
    rows.push({ file: f, error: String(e.message) })
  }
}

// every tracked source file, so "src/** unchanged since t13" can be asserted
const srcFiles = (await walk('src')).filter((f) => /\.(ts|tsx|css|html)$/.test(f)).sort()
const srcRows = []
for (const f of srcFiles) {
  const s = await stat(f)
  srcRows.push({ file: f, mtimeMs: s.mtimeMs, sha1: (await sha1Of(f)).slice(0, 12) })
}
const aggregate = createHash('sha1')
  .update(srcRows.map((r) => `${r.file}:${r.sha1}`).join('\n'))
  .digest('hex')

const report = {
  label,
  capturedAt: new Date().toISOString(),
  keyFiles: rows,
  srcFileCount: srcRows.length,
  srcAggregateSha1: aggregate,
  newestSrcMtime: new Date(Math.max(...srcRows.map((r) => r.mtimeMs))).toISOString(),
  srcFiles: srcRows.map((r) => ({ file: r.file, sha1: r.sha1 }))
}

await mkdir('.devdata/t13-r2-evidence', { recursive: true })
const outPath = `.devdata/t13-r2-evidence/${label}-snapshot.json`
await writeFile(outPath, JSON.stringify(report, null, 2), 'utf8')

console.log(
  JSON.stringify(
    {
      label,
      capturedAt: report.capturedAt,
      srcAggregateSha1: aggregate,
      srcFileCount: srcRows.length,
      newestSrcMtime: report.newestSrcMtime,
      keyFiles: rows.map((r) => `${r.file} ${r.mtime ?? r.error} ${r.size ?? ''} ${r.sha1 ?? ''}`.trim()),
      out: outPath
    },
    null,
    2
  )
)

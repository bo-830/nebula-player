/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS probe (not shipped TS source); the rule targets typed TS modules.
 * If eslint.config.mjs later scopes this rule away from scripts/**, this
 * directive becomes redundant and can be deleted. */
/**
 * t6 — verify the packaged app.asar contains no dev-only assets (t11's claim).
 *
 * The asar header is a pickle-framed JSON blob at the start of the file:
 *   [u32 headerSize][u32 ...][u32 jsonLength][json bytes]
 * This parses it directly, so no asar CLI is needed, and reports:
 *   - top-level entries
 *   - any path matching scripts/ (the t11 exclusion) or .devdata/
 *   - the total file count
 *
 * Usage: node scripts/verify-asar.mjs [path-to-app.asar]
 */
import { open } from 'fs/promises'

const file = process.argv[2] ?? 'dist/win-unpacked/resources/app.asar'
const fh = await open(file, 'r')
try {
  const head = Buffer.alloc(16)
  await fh.read(head, 0, 16, 0)
  const headerSize = head.readUInt32LE(0)
  const jsonLength = head.readUInt32LE(12)
  const jsonStart = 16
  const buf = Buffer.alloc(jsonLength)
  await fh.read(buf, 0, jsonLength, jsonStart)
  const header = JSON.parse(buf.toString('utf8'))

  const paths = []
  const walk = (node, prefix) => {
    for (const [name, entry] of Object.entries(node.files ?? {})) {
      const p = prefix ? `${prefix}/${name}` : name
      if (entry.files) walk(entry, p)
      else paths.push({ path: p, size: entry.size ?? 0 })
    }
  }
  walk(header, '')

  const match = (re) => paths.filter((p) => re.test(p.path))
  const byTop = {}
  for (const p of paths) {
    const top = p.path.split('/')[0]
    byTop[top] = (byTop[top] ?? 0) + 1
  }
  const report = {
    file,
    headerSize,
    totalEntries: paths.length,
    topLevel: Object.entries(byTop)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name, count]) => ({ name, count })),
    scriptsEntries: match(/^scripts\//i).length,
    devdataEntries: match(/^\.devdata\//i).length,
    srcEntries: match(/^src\//i).length,
    testFiles: match(/\.test\.(ts|tsx|js|mjs)$/i).length,
    scriptSamples: match(/^scripts\//i).slice(0, 10).map((p) => p.path),
    devdataSamples: match(/^\.devdata\//i).slice(0, 10).map((p) => p.path)
  }
  console.log(JSON.stringify(report, null, 2))
} finally {
  await fh.close()
}

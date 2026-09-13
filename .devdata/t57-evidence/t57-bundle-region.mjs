/**
 * t57 — pull the H1 code region out of the INSTALLED 1.0.4 bundle and compare it with the
 * current source, to establish whether the defect is pre-existing rather than wave-introduced.
 *
 * Usage: node .devdata/t57-evidence/t57-bundle-region.mjs
 */
import { openSync, readSync, closeSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const asarPath = join(process.env.LOCALAPPDATA ?? '', 'Programs', 'nebula-player', 'resources', 'app.asar')
const fd = openSync(asarPath, 'r')
let src = ''
try {
  const head = Buffer.alloc(16)
  readSync(fd, head, 0, 16, 0)
  const jsonLength = head.readUInt32LE(12)
  const jsonBuf = Buffer.alloc(jsonLength)
  readSync(fd, jsonBuf, 0, jsonLength, 16)
  const header = JSON.parse(jsonBuf.toString('utf8'))
  const contentStart = (16 + jsonLength + 3) & ~3
  const walk = (node, prefix, acc) => {
    for (const [name, entry] of Object.entries(node.files ?? {})) {
      const p = prefix ? `${prefix}/${name}` : name
      if (entry.files) walk(entry, p, acc)
      else acc.push({ path: p, offset: Number(entry.offset), size: entry.size })
    }
    return acc
  }
  const files = walk(header, '', [])
  const target =
    files.filter((f) => /^out\/renderer\/assets\/index-.*\.js$/.test(f.path))[0] ??
    files.filter((f) => /^out\/renderer\/assets\/.*\.js$/.test(f.path))[0]
  const buf = Buffer.alloc(target.size)
  readSync(fd, buf, 0, target.size, contentStart + target.offset)
  src = buf.toString('utf8')
} finally {
  closeSync(fd)
}

const regions = []
const push = (label, idx, before = 260, after = 420) => {
  regions.push({ label, at: idx, text: idx >= 0 ? src.slice(Math.max(0, idx - before), idx + after) : null })
}

// 1) the typewriter interval: find a `,22)` whose surroundings mention streamShown
const ids22 = [...src.matchAll(/,\s*22\s*\)/g)].map((m) => m.index)
const typewriter = ids22.find((i) => {
  const win = src.slice(Math.max(0, i - 700), i + 200)
  return win.includes('streamShown')
})
// fallback: locate streamShown and walk back to the enclosing setInterval
const twFallback = (() => {
  const i = src.indexOf('streamShown')
  if (i < 0) return -1
  const back = src.lastIndexOf('setInterval', i)
  return back >= 0 && i - back < 1200 ? back : -1
})()
push('typewriter setInterval(...,22)', typewriter ?? twFallback, 700, 260)

// 2) the chunk guard (streamConvId comparison)
const guardIdx = src.search(/streamConvId\s*!==|streamConvId\s*===|!==\s*[A-Za-z_$]{1,3}\s*\|\|\s*streamConvId/)
push('chunk guard', guardIdx, 320, 300)

// 3) closeStream body + its call sites
const closeIdx = src.search(/function closeStream|closeStream\s*=\s*function|closeStream\(\)\s*\{/)
push('closeStream definition', closeIdx, 200, 400)
const catchUp = src.indexOf('streamShown>=', src.indexOf('closeStream'))
push('catch-up branch', catchUp, 300, 320)

// ---- compare with the current source (type-annotation-free, structural)
const cur = readFileSync('src/renderer/src/stores/chatStore.ts', 'utf8')
const norm = (t) =>
  t
    .replace(/\s+/g, ' ')
    .replace(/:\s*(void|number|string|boolean)\b/g, '')
    .replace(/new Promise<void>/g, 'new Promise')
    .trim()

const curClose = cur.slice(cur.indexOf('function closeStream'), cur.indexOf('function openStream'))
const curTick = cur.slice(cur.indexOf('streamTimer = setInterval'), cur.indexOf('return {'))

const checks = {
  bundle_has_closeStream_body: /streamTimer/.test(regions[2].text ?? '') && /clearInterval/.test(regions[2].text ?? ''),
  bundle_clears_streamConvId: /streamConvId\s*=\s*""|streamConvId\s*=\s*''/.test(src),
  bundle_guard_uses_streamConvId: /streamConvId/.test(regions[1].text ?? ''),
  bundle_has_22ms_typewriter: !!typewriter,
  bundle_catchup_calls_closeStream: /closeStream\(\)/.test(regions[3].text ?? ''),
  bundle_has_plus5_step: /streamShown\+5|streamShown \+ 5/.test(src),
  source_clears_streamConvId: /streamConvId = ''/.test(cur),
  source_guard_uses_streamConvId: /streamConvId !== rid/.test(cur),
  source_catchup_calls_closeStream: /if \(s\.streamShown >= s\.streamRaw\.length\) \{\s*closeStream\(\)/.test(cur),
  source_tick_is_22ms: /setInterval\(\(\) => \{[\s\S]*?\}, 22\)/.test(cur)
}

const report = {
  bundle: { asarPath, bytes: src.length },
  hits: {
    streamConvId: src.split('streamConvId').length - 1,
    closeStream: src.split('closeStream').length - 1,
    '22ms intervals': ids22.length,
    'closeStream() calls': src.split('closeStream()').length - 1
  },
  regions,
  currentSource: { closeStreamBody: norm(curClose), typewriter: norm(curTick) },
  checks,
  verdict:
    checks.bundle_clears_streamConvId &&
    checks.bundle_guard_uses_streamConvId &&
    checks.bundle_has_22ms_typewriter &&
    checks.bundle_catchup_calls_closeStream &&
    checks.source_catchup_calls_closeStream
      ? 'PRE-EXISTING: the shipped 1.0.4 bundle contains the same closeStream/guard/22ms-typewriter logic as the current source ⇒ H1 is not wave-introduced'
      : 'INCONCLUSIVE — inspect the regions above'
}
writeFileSync('.devdata/t57-evidence/t57-bundle-region.json', JSON.stringify(report, null, 2), 'utf8')
console.log(JSON.stringify({ hits: report.hits, checks: report.checks, verdict: report.verdict }, null, 2))
console.log('--- bundle typewriter region ---')
console.log(regions[0].text)
console.log('--- bundle guard region ---')
console.log(regions[1].text)

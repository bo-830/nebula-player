/**
 * t57 — pre-existence check without @electron/asar's extractFile (it refused the path):
 * parse the asar header directly, locate the renderer bundle, read its bytes by offset.
 *
 * Usage: node .devdata/t57-evidence/t57-installed-bundle.mjs
 */
import { openSync, readSync, closeSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const asarPath = join(process.env.LOCALAPPDATA ?? '', 'Programs', 'nebula-player', 'resources', 'app.asar')
const out = { asarPath }
const fd = openSync(asarPath, 'r')
try {
  const head = Buffer.alloc(16)
  readSync(fd, head, 0, 16, 0)
  const headerSize = head.readUInt32LE(0)
  const jsonLength = head.readUInt32LE(12)
  const jsonBuf = Buffer.alloc(jsonLength)
  readSync(fd, jsonBuf, 0, jsonLength, 16)
  const header = JSON.parse(jsonBuf.toString('utf8'))
  out.headerSize = headerSize
  out.jsonLength = jsonLength

  const walk = (node, prefix, acc) => {
    for (const [name, entry] of Object.entries(node.files ?? {})) {
      const p = prefix ? `${prefix}/${name}` : name
      if (entry.files) walk(entry, p, acc)
      else acc.push({ path: p, offset: Number(entry.offset), size: entry.size })
    }
    return acc
  }
  const files = walk(header, '', [])
  out.totalEntries = files.length
  const bundles = files.filter((f) => /^out\/renderer\/assets\/.*\.js$/.test(f.path))
  out.bundleCount = bundles.length
  const target = bundles.find((f) => /index-.*\.js$/.test(f.path)) ?? bundles[0]
  out.target = target

  // content area starts after the header pickle; validate with a known text entry
  const candidates = [8 + headerSize, 16 + jsonLength, (16 + jsonLength + 3) & ~3]
  const pkg = files.find((f) => f.path === 'package.json')
  let contentStart = null
  out.contentStartCandidates = []
  for (const c of candidates) {
    const probe = Buffer.alloc(1)
    readSync(fd, probe, 0, 1, c + pkg.offset)
    const ok = probe.toString('utf8') === '{'
    out.contentStartCandidates.push({ candidate: c, firstByte: probe.toString('utf8'), looksLikeJson: ok })
    if (ok && contentStart === null) contentStart = c
  }
  out.contentStart = contentStart

  if (contentStart !== null && target) {
    const buf = Buffer.alloc(target.size)
    readSync(fd, buf, 0, target.size, contentStart + target.offset)
    const src = buf.toString('utf8')
    const count = (n) => src.split(n).length - 1
    const intervalIdx = src.search(/setInterval\(/)
    const sentinelIdx = src.indexOf('（无回复）')
    out.bundle = {
      path: target.path,
      bytes: src.length,
      head: src.slice(0, 120),
      hits: {
        sentinelNoReply: count('（无回复）'),
        streamConvId: count('streamConvId'),
        closeStream: count('closeStream'),
        streamRaw: count('streamRaw'),
        streamShown: count('streamShown'),
        setInterval: count('setInterval'),
        clearInterval: count('clearInterval')
      },
      intervalSnippet: intervalIdx >= 0 ? src.slice(Math.max(0, intervalIdx - 300), intervalIdx + 420) : null,
      sentinelSnippet: sentinelIdx >= 0 ? src.slice(Math.max(0, sentinelIdx - 260), sentinelIdx + 140) : null
    }
  }
} finally {
  closeSync(fd)
}
writeFileSync('.devdata/t57-evidence/t57-installed-bundle.json', JSON.stringify(out, null, 2), 'utf8')
console.log(
  JSON.stringify(
    {
      contentStart: out.contentStart,
      candidates: out.contentStartCandidates,
      target: out.target,
      hits: out.bundle?.hits ?? null,
      hasInterval: !!out.bundle?.intervalSnippet,
      intervalSnippet: out.bundle?.intervalSnippet ?? null
    },
    null,
    2
  )
)

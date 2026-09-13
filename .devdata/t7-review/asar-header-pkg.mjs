// Reviewer §20 probe: read app.asar's package.json straight out of the asar header table.
// Deliberately does NOT use `@electron/asar extract-file` (it writes into CWD — that is the t43 incident).
// Everything is read-only; the extracted bytes are written to %TEMP%.
import { writeFileSync, openSync, readSync, closeSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, basename } from 'node:path'
import { tmpdir } from 'node:os'

const asar = process.argv[2]
if (!asar) throw new Error('usage: node asar-header-pkg.mjs <path/to/app.asar>')
const st = statSync(asar)

function readAt(fd, offset, length) {
  const b = Buffer.alloc(length)
  const n = readSync(fd, b, 0, length, offset)
  if (n !== length) throw new Error(`short read at ${offset}: ${n}/${length}`)
  return b
}

/** brace-matching scan for the end of a top-level JSON object (string-aware) */
function jsonObjectEnd(buf, start) {
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < buf.length; i++) {
    const c = buf[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === 0x5c) esc = true
      else if (c === 0x22) inStr = false
      continue
    }
    if (c === 0x22) inStr = true
    else if (c === 0x7b) depth++
    else if (c === 0x7d) {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return -1
}

const fd = openSync(asar, 'r')
try {
  const pre = readAt(fd, 0, 32)
  const u0 = pre.readUInt32LE(0)
  const u4 = pre.readUInt32LE(4)
  const u8 = pre.readUInt32LE(8)
  const u12 = pre.readUInt32LE(12)

  const jsonStart = 16 // asar: [u32][u32 headerPickleSize][u32][u32 headerStringSize] then JSON
  const probe = readAt(fd, jsonStart, Math.min(u12, 64 * 1024 * 1024))
  const end = jsonObjectEnd(probe, 0)
  if (end < 0) throw new Error('header JSON: could not find matching closing brace')
  const header = JSON.parse(probe.subarray(0, end).toString('utf8'))
  const headerBytes = end

  const entry = header.files && header.files['package.json']
  if (!entry) throw new Error('package.json entry missing from asar header')

  // data offsets are relative to 8 + headerPickleSize; headerPickleSize declared at u4
  const base = 8 + u4
  const at = base + Number(entry.offset)
  if (at + entry.size > st.size) throw new Error(`entry out of bounds: ${at}+${entry.size} > ${st.size}`)
  const content = readAt(fd, at, entry.size)
  const parsed = JSON.parse(content.toString('utf8'))

  const dest = join(tmpdir(), `nebula-asar-${basename(asar).replace(/[^a-z0-9.]/gi, '_')}-package.json`)
  writeFileSync(dest, content)

  console.log(
    JSON.stringify(
      {
        asar,
        asarSize: st.size,
        asarMtimeUtc: st.mtime.toISOString(),
        asarCtimeUtc: st.ctime.toISOString(),
        headerFields: { u0, u4, u8, u12 },
        headerJsonBytes: headerBytes,
        baseOffsetUsed: base,
        entryOffset: entry.offset,
        entrySize: entry.size,
        entryFlags: entry.flags ?? null,
        entryUnpacked: entry.unpacked ?? false,
        asarHeaderEntryCount: Object.keys(header.files).length,
        hasIntegrity: Boolean(header.integrity),
        extractedPath: dest,
        sha1: createHash('sha1').update(content).digest('hex'),
        size: content.length,
        hasBom: content[0] === 0xef && content[1] === 0xbb && content[2] === 0xbf,
        trailingNewline: content[content.length - 1] === 0x0a,
        name: parsed.name,
        version: parsed.version,
        description: parsed.description ?? null,
        main: parsed.main,
        author: parsed.author,
        homepage: parsed.homepage,
        topLevelKeys: Object.keys(parsed),
        scriptKeys: parsed.scripts ? Object.keys(parsed.scripts) : null,
        dependencyKeys: parsed.dependencies ? Object.keys(parsed.dependencies).sort() : null,
        devDependencyKeys: parsed.devDependencies ? Object.keys(parsed.devDependencies).sort() : null
      },
      null,
      2
    )
  )
} finally {
  closeSync(fd)
}

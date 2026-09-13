// Reviewer §20 probe: byte-exact "1.0.4 -> 1.0.3" variant of package.json, computed in %TEMP%.
// READ-ONLY with respect to the repository: only reads the workspace file, writes into os.tmpdir().
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const src = process.argv[2]
const buf = readFileSync(src)
const sha1 = (b) => createHash('sha1').update(b).digest('hex')

const needle = Buffer.from('"version": "1.0.4"', 'utf8')
const idx = buf.indexOf(needle)
if (idx < 0) throw new Error('needle not found')
if (buf.indexOf(needle, idx + 1) >= 0) throw new Error('needle not unique')

// replace only the '1.0.4' bytes inside the needle -> guarantees every other byte is identical
const verRel = needle.indexOf(Buffer.from('1.0.4', 'utf8'))
const start = idx + verRel
const out = Buffer.concat([buf.subarray(0, start), Buffer.from('1.0.3', 'utf8'), buf.subarray(start + 5)])

// self-check: the variant must differ from the source in exactly 1 byte position
let diffPositions = 0
let firstDiff = -1
for (let i = 0; i < buf.length; i++) {
  if (buf[i] !== out[i]) {
    diffPositions++
    if (firstDiff < 0) firstDiff = i
  }
}
const dest = join(tmpdir(), 'nebula-pkg-1.0.3-variant.json')
writeFileSync(dest, out)

console.log(
  JSON.stringify(
    {
      source: src,
      variantPath: dest,
      sourceSize: buf.length,
      variantSize: out.length,
      sourceSha1: sha1(buf),
      variantSha1: sha1(out),
      differingBytePositions: diffPositions,
      firstDifferingOffset: firstDiff,
      hasBom: buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf,
      trailingNewline: buf[buf.length - 1] === 0x0a,
      versionLineRaw: buf.subarray(idx, idx + needle.length).toString('utf8')
    },
    null,
    2
  )
)

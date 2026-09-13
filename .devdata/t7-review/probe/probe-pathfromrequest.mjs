/**
 * t7-review probe (READ-ONLY on src/**): runs the REAL `pathFromRequest` /
 * `mediaUrlFor` source text extracted from src/main/protocol.ts.
 *
 * protocol.ts cannot be imported in plain Node (it pulls in `electron` and
 * `./store` at module scope), so the exact source lines are sliced out of the
 * file at run time and compiled with `new Function`. Whatever this probe
 * observes is therefore the shipped decoder, not a paraphrase.
 *
 * Run: node .devdata/t7-review/probe/probe-pathfromrequest.mjs
 */
import { readFileSync } from 'node:fs'

const protocolPath = new URL('../../../src/main/protocol.ts', import.meta.url)
const text = readFileSync(protocolPath, 'utf8')

const pathFnSrc = text.match(/function pathFromRequest\(url: string\): string \{[\s\S]*?\n\}/)
const urlFnSrc = text.match(/export function mediaUrlFor\(filePath: string\): string \{[\s\S]*?\n\}/)
if (!pathFnSrc || !urlFnSrc) {
  console.error('EXTRACTION FAILED — protocol.ts changed shape; probe is invalid')
  process.exit(2)
}

const js =
  pathFnSrc[0].replace('(url: string): string', '(url)') +
  '\n' +
  urlFnSrc[0]
    .replace('export function mediaUrlFor(filePath: string): string', 'function mediaUrlFor(filePath)')
    .replace('Buffer.from(filePath, ', 'Buffer.from(filePath, ')
  + '\nreturn { pathFromRequest, mediaUrlFor }'

const { pathFromRequest, mediaUrlFor } = new Function('Buffer', js)(Buffer)

console.log('=== extracted source (verbatim from src/main/protocol.ts) ===')
console.log(pathFnSrc[0])
console.log(urlFnSrc[0])
console.log('')

const target = 'C:\\博830\\vibecoding\\nebula-player\\.devdata\\test-music\\track 1.mp3'
const plain = mediaUrlFor(target)
const nonce = plain + '?n=1729333187'
const nonce2 = plain + '?n=1729333187&x=1#frag'

console.log('target path      :', JSON.stringify(target))
console.log('plain media URL  :', plain)
console.log('nonce media URL  :', nonce)
console.log('nonce+frag URL   :', nonce2)
console.log('')

const decoded = {
  plain: pathFromRequest(plain),
  nonce: pathFromRequest(nonce),
  nonce2: pathFromRequest(nonce2)
}
console.log('decoded(plain)   :', JSON.stringify(decoded.plain))
console.log('decoded(?n=...)  :', JSON.stringify(decoded.nonce))
console.log('decoded(+#frag)  :', JSON.stringify(decoded.nonce2))
console.log(
  'QUERY IS IGNORED SERVER-SIDE:',
  decoded.plain === target && decoded.nonce === target && decoded.nonce2 === target
)
console.log('')

// What a URL-keyed cache (Chromium HTTP cache: primary key = method + target
// URI, RFC 9111 §4) sees: the nonce is a DIFFERENT key, while the handler sees
// the SAME path. Demonstrated on the request URL itself, not on a paraphrase.
const reqPlain = new Request(plain).url
const reqNonce = new Request(nonce).url
console.log('Request(plain).url:', reqPlain)
console.log('Request(nonce).url:', reqNonce)
console.log('CACHE-KEY DIFFERS:', reqPlain !== reqNonce)
console.log('HANDLER-VISIBLE PATH IDENTICAL:', pathFromRequest(reqPlain) === pathFromRequest(reqNonce))
console.log('')

// Control / correction: the intuitive worry "a query would corrupt the payload"
// is ALSO false, because Buffer's base64url decoding is lenient and stops at the
// first non-alphabet character. Both properties are reported so the reasoning
// does not rest on the wrong mechanism.
const lenient = Buffer.from('QUJD?n=1', 'base64url').toString('utf-8')
console.log('Buffer.from("QUJD?n=1","base64url") ->', JSON.stringify(lenient), '(lenient: stops at "?")')
console.log('length of plain vs nonce payload decoded from pathname:',
  pathFromRequest(plain).length, pathFromRequest(nonce).length)

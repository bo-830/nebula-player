/**
 * t52 / H1 follow-up — build the two CONTROL variants used to prove that the drip-feed case
 * bites the H1 mechanism and nothing else.
 *
 *   noclose = cur, but the typewriter's catch-up branch stops only the reveal; it no longer
 *             calls closeStream() (so streamConvId survives)          -> H1 control #1
 *   noguard = cur, but the chunk guard is no longer keyed on streamConvId -> H1 control #2
 *
 * Both are full copies of `cur/` with exactly one patched region; every replacement is
 * asserted to match exactly once. `src/**` is never touched.
 *
 * Usage: node .devdata/t7-review/t52-discrim/patch-h1-variants.mjs
 */
import { cpSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'

const ROOT = '.devdata/t7-review/t52-discrim'
const store = (v) => `${ROOT}/${v}/src/renderer/src/stores/chatStore.ts`
const sha1 = (s) => createHash('sha1').update(s).digest('hex')

const CATCHUP_OLD = `        if (s.streamShown >= s.streamRaw.length) {
          closeStream()
          useChatStore.setState({ streamShown: s.streamRaw.length })
          return
        }`
const CATCHUP_NEW = `        if (s.streamShown >= s.streamRaw.length) {
          // H1 CONTROL #1: stop only the reveal — do NOT tear the stream down
          if (streamTimer) {
            clearInterval(streamTimer)
            streamTimer = null
          }
          useChatStore.setState({ streamShown: s.streamRaw.length })
          return
        }`

const GUARD_OLD = `    if (closed || p.id !== rid || streamConvId !== rid) return`
const GUARD_NEW = `    // H1 CONTROL #2: accept chunks regardless of the stream-teardown flag
    if (closed || p.id !== rid) return`

for (const [variant, oldText, newText, name] of [
  ['noclose', CATCHUP_OLD, CATCHUP_NEW, 'catch-up branch -> reveal-only stop'],
  ['noguard', GUARD_OLD, GUARD_NEW, 'chunk guard -> not keyed on streamConvId']
]) {
  const dir = `${ROOT}/${variant}`
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  cpSync(`${ROOT}/cur`, dir, { recursive: true })
  const file = store(variant)
  const text = readFileSync(file, 'utf8')
  const hits = text.split(oldText).length - 1
  if (hits !== 1) throw new Error(`${variant}: "${name}" matched ${hits} times (need exactly 1)`)
  writeFileSync(file, text.replace(oldText, newText), 'utf8')
  console.log(
    `${variant.padEnd(8)} edits: ${name}\n           store sha1 cur=${sha1(readFileSync(store('cur'), 'utf8')).slice(0, 12)} -> ${variant}=${sha1(readFileSync(file, 'utf8')).slice(0, 12)}`
  )
}

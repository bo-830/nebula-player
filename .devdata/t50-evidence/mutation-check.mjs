/**
 * t50 mutation harness: prove both halves of the fix are load-bearing.
 *  A) drop the settle yield inside stream.next()
 *  B) sample the shared store snapshot instead of the stream buffer
 * Restores the file byte-for-byte after each mutation and verifies no residue.
 */
import { readFileSync, writeFileSync } from 'fs'
import { spawnSync } from 'child_process'
import { createHash } from 'crypto'

const FILE = 'src/renderer/src/stores/chatStore.ts'
const SUITE = 'src/renderer/src/lib/__tests__/chatConfirm.test.ts'

const original = readFileSync(FILE, 'utf8')
const baselineSha = createHash('sha256').update(original).digest('hex')
console.log('baseline sha256:', baselineSha)

const YIELD = '      await new Promise<void>((resolve) => setTimeout(resolve, 0))\n'
const SAMPLE = '      resume.accumulated = await stream.next()'

const mutations = [
  { name: 'A: drop the settle yield', from: YIELD, to: '      // MUTATION A: no settle\n' },
  {
    name: 'B: read the store snapshot',
    from: SAMPLE,
    to: '      resume.accumulated = useChatStore.getState().streamRaw // MUTATION B'
  }
]

let allCaught = true
for (const m of mutations) {
  if (!original.includes(m.from)) {
    console.log(`!! mutation ${m.name}: target not found — SKIPPED`)
    allCaught = false
    continue
  }
  writeFileSync(FILE, original.replace(m.from, m.to))
  const r = spawnSync('npx.cmd', ['vitest', 'run', SUITE, '--reporter=dot'], {
    shell: true,
    encoding: 'utf8',
    windowsHide: true
  })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  const failed = /(\d+) failed/.exec(out)
  const testsLine = /Tests\s+.*/.exec(out.replace(/\u001b\[[0-9;]*m/g, ''))
  const caught = r.status !== 0
  if (!caught) allCaught = false
  console.log(
    `\n--- mutation ${m.name}: exit=${r.status} ${caught ? 'CAUGHT (suite failed ✓)' : 'NOT CAUGHT ✗'} ` +
      `| failed=${failed ? failed[1] : '0'} | ${testsLine ? testsLine[0].trim() : ''}`
  )
  // restore immediately, then confirm the bytes came back exactly
  writeFileSync(FILE, original)
  const nowSha = createHash('sha256').update(readFileSync(FILE)).digest('hex')
  console.log(`    restored identical: ${nowSha === baselineSha}`)
  if (nowSha !== baselineSha) allCaught = false
}

const finalSha = createHash('sha256').update(readFileSync(FILE)).digest('hex')
console.log(`\nresidue MUTATION: ${readFileSync(FILE, 'utf8').includes('MUTATION')}`)
console.log(`final sha matches baseline: ${finalSha === baselineSha}`)
console.log(`BOTH HALVES LOAD-BEARING: ${allCaught}`)
process.exit(allCaught ? 0 : 1)

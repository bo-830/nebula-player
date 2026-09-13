/**
 * READ-ONLY-on-src mutation probe for the t7/r5 adversarial review.
 *
 * Copies `src/` into .devdata/t7-review/mutants/<name>/ and mutates ONLY the
 * copies, then runs vitest against each copy. src/** is never written.
 *
 * Experiment A (control) : unmutated copy                    -> expect 141 pass
 * Experiment B           : MiniPlayer.tsx WIRING broken       -> how many fail?
 * Experiment C           : miniLyricsDedup claimLyricsRequest -> how many fail?
 * Experiment D           : miniLyricsDedup acceptLyricsResponse -> how many fail?
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const REPO = 'C:/博830/vibecoding/nebula-player'
const OUT = join(REPO, '.devdata/t7-review/mutants')

const CONFIG = `import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { include: ['src/**/*.test.ts'], environment: 'node' } })
`

function build(name) {
  const dir = join(OUT, name)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  cpSync(join(REPO, 'src'), join(dir, 'src'), { recursive: true })
  writeFileSync(join(dir, 'vitest.config.ts'), CONFIG)
  return dir
}

function run(dir) {
  try {
    const out = execFileSync(
      'node',
      [join(REPO, 'node_modules/vitest/vitest.mjs'), 'run', '--root', dir, '--reporter=basic'],
      { encoding: 'utf8', cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] }
    )
    return { code: 0, out }
  } catch (e) {
    return { code: e.status ?? -1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

function summarise(res) {
  const m = /Tests\s+(.+)/.exec(res.out)
  const f = /Test Files\s+(.+)/.exec(res.out)
  return `exit=${res.code} | ${f ? f[1].trim() : '?'} | ${m ? m[1].trim() : '?'}`
}

const cases = []

// --- A: control -------------------------------------------------------------
{
  const dir = build('A-control')
  cases.push(['A control (unmutated copy)', summarise(run(dir))])
}

// --- B: break MiniPlayer's WIRING (keeps every rule function intact) --------
{
  const dir = build('B-miniplayer-wiring')
  const p = join(dir, 'src/renderer/src/components/MiniPlayer.tsx')
  const src = readFileSync(p, 'utf8')
  // drop the `wanted` bookkeeping + the claim gate = the pre-fix behaviour
  const mutated = src
    .replace('      trackLyricsPush(wanted, id)\n      if (!claimLyricsRequest(claimed, id)) return\n', '')
    .replace('if (acceptLyricsResponse(wanted, id)) setLines(r.lines)', 'setLines(r.lines)')
  if (mutated === src) throw new Error('B: mutation did not apply')
  writeFileSync(p, mutated)
  cases.push(['B MiniPlayer wiring reverted to pre-fix (mirrors old bug)', summarise(run(dir))])
}

// --- C: break the RULE the new suite claims to drive ------------------------
{
  const dir = build('C-always-claim')
  const p = join(dir, 'src/renderer/src/lib/miniLyricsDedup.ts')
  const src = readFileSync(p, 'utf8')
  const mutated = src.replace(
    'export function claimLyricsRequest(claimed: LyricIdHolder, id: string): boolean {\n  if (claimed.current === id) return false\n  claimed.current = id\n  return true\n}',
    'export function claimLyricsRequest(claimed: LyricIdHolder, id: string): boolean {\n  claimed.current = id\n  return true\n}'
  )
  if (mutated === src) throw new Error('C: mutation did not apply')
  writeFileSync(p, mutated)
  cases.push(['C claimLyricsRequest -> always claim (pre-fix rule)', summarise(run(dir))])
}

// --- D: break the newest-wins rule -----------------------------------------
{
  const dir = build('D-accept-always')
  const p = join(dir, 'src/renderer/src/lib/miniLyricsDedup.ts')
  const src = readFileSync(p, 'utf8')
  const mutated = src.replace(
    'export function acceptLyricsResponse(wanted: LyricIdHolder, id: string): boolean {\n  return wanted.current === id\n}',
    'export function acceptLyricsResponse(wanted: LyricIdHolder, id: string): boolean {\n  void wanted\n  void id\n  return true\n}'
  )
  if (mutated === src) throw new Error('D: mutation did not apply')
  writeFileSync(p, mutated)
  cases.push(['D acceptLyricsResponse -> always accept (stale flash)', summarise(run(dir))])
}

console.log('=== mutation experiments (copies under .devdata/t7-review/mutants) ===')
for (const [name, res] of cases) console.log(`${name}\n    ${res}`)
if (!existsSync(OUT)) console.log('!! mutants dir missing')

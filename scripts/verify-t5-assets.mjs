/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS probe (not shipped TS source); the rule targets typed TS modules.
 * If eslint.config.mjs later scopes this rule away from scripts/**, this
 * directive becomes redundant and can be deleted. */
/**
 * t6 — close out the three evidence requirements the captain added for t5:
 *   (1) formatting churn vs real edits → run `eslint --fix` a second time and
 *       `prettier --check`; idempotent ⇒ nothing but formatting changed
 *   (2) the 7 filed test assets → verify existence + per-file test counts from the
 *       runner itself (`vitest --reporter=json`), and reconcile the total
 *   (3) protocol.ts:90 → confirm the whole repo is at 0 errors and record who
 *       changed that line
 *
 * Real exit codes come from spawning the npm shims directly (see T6-FINAL.md §8).
 *
 * Usage: node scripts/verify-t5-assets.mjs
 */
import { execFile } from 'child_process'
import { createHash } from 'crypto'
import { mkdir, readFile, stat, writeFile } from 'fs/promises'

const outDir = '.devdata/t6-evidence'
await mkdir(outDir, { recursive: true })

const runCapture = (command, timeout = 900000) =>
  new Promise((resolve) => {
    const chunks = []
    execFile(
      command,
      [],
      { timeout, windowsHide: true, maxBuffer: 64 * 1024 * 1024, cwd: process.cwd(), shell: true },
      (err, stdout, stderr) => {
        if (stdout) chunks.push(stdout)
        if (stderr) chunks.push(stderr)
        resolve({ exitCode: err ? (typeof err.code === 'number' ? err.code : -1) : 0, log: chunks.join('\n') })
      }
    )
  })

const report = { capturedAt: new Date().toISOString() }

// ---------- (1) formatting idempotency ----------
const SUSPECTS = [
  'src/main/index.ts',
  'src/main/protocol.ts',
  'src/main/ipc.ts',
  'src/renderer/src/components/MainView.tsx',
  'src/renderer/src/stores/playerStore.ts'
]
const hashOf = async (f) => createHash('sha1').update(await readFile(f)).digest('hex').slice(0, 12)

const before = {}
for (const f of SUSPECTS) before[f] = await hashOf(f)

const fix = await runCapture(`npx.cmd eslint --fix ${SUSPECTS.join(' ')}`)
const after = {}
for (const f of SUSPECTS) after[f] = await hashOf(f)

const prettierCheck = await runCapture(`npx.cmd prettier --check ${SUSPECTS.join(' ')}`, 180000)

report.idempotency = {
  command: `npx.cmd eslint --fix ${SUSPECTS.join(' ')}`,
  exitCode: fix.exitCode,
  files: SUSPECTS.map((f) => ({ file: f, sha1Before: before[f], sha1After: after[f], unchanged: before[f] === after[f] })),
  allUnchanged: SUSPECTS.every((f) => before[f] === after[f]),
  eslintFixOutputTail: fix.log.split(/\r?\n/).slice(-8).join('\n'),
  prettierCheck: {
    command: `npx.cmd prettier --check ${SUSPECTS.join(' ')}`,
    exitCode: prettierCheck.exitCode,
    output: prettierCheck.log.split(/\r?\n/).filter(Boolean).slice(-8).join('\n')
  }
}

// ---------- (2) the 7 filed test assets ----------
const ASSETS = [
  { file: 'src/main/__tests__/lrc.test.ts', declared: 9 },
  { file: 'src/main/__tests__/mediaFormats.test.ts', declared: 6 },
  { file: 'src/main/__tests__/scanner.test.ts', declared: 12 },
  { file: 'src/renderer/src/lib/__tests__/queue.test.ts', declared: 9 },
  { file: 'src/renderer/src/lib/__tests__/chatConfirm.test.ts', declared: 9 },
  { file: 'src/renderer/src/lib/__tests__/sleepTimer.test.ts', declared: 20 },
  { file: 'src/renderer/src/lib/__tests__/playerStoreSleep.test.ts', declared: 8 }
]

const assets = []
for (const a of ASSETS) {
  let exists = true
  let size = 0
  let mtime = null
  try {
    const s = await stat(a.file)
    size = s.size
    mtime = new Date(s.mtimeMs).toISOString()
  } catch {
    exists = false
  }
  assets.push({ ...a, exists, size, mtime, declaredTotal: a.declared })
}

// the runner's own view of every file + case
const jsonRun = await runCapture('npx.cmd vitest run --reporter=json --outputFile=.devdata/t6-evidence/vitest-report.json')
let runnerFiles = []
let runnerTotals = null
try {
  const raw = await readFile(`${outDir}/vitest-report.json`, 'utf8')
  const parsed = JSON.parse(raw.replace(/^\uFEFF/, ''))
  runnerFiles = parsed.testResults.map((t) => ({
    file: t.name.replace(process.cwd(), '').replace(/\\/g, '/').replace(/^\//, ''),
    tests: t.assertionResults.length
  }))
  runnerTotals = { numTotalTests: parsed.numTotalTests, numPassedTests: parsed.numPassedTests, numFailedTests: parsed.numFailedTests, numTotalTestSuites: parsed.numTotalTestSuites }
} catch (e) {
  runnerTotals = { error: String(e.message) }
}

for (const a of assets) {
  const hit = runnerFiles.find((r) => r.file.endsWith(a.file))
  a.actualTests = hit ? hit.tests : null
  a.matchesDeclaration = hit ? hit.tests === a.declared : false
}

const declaredSum = ASSETS.reduce((n, a) => n + a.declared, 0)

report.testAssets = {
  command: jsonRun.command ?? 'npx.cmd vitest run --reporter=json',
  exitCode: jsonRun.exitCode,
  assets,
  declaredSum,
  allExist: assets.every((a) => a.exists),
  allMatchDeclaration: assets.every((a) => a.matchesDeclaration),
  runnerTotals,
  runnerFiles: runnerFiles.sort((a, b) => a.file.localeCompare(b.file))
}

// ---------- (3) protocol.ts:90 attribution + repo-wide lint ----------
report.protocolLine90 = { line: (await readFile('src/main/protocol.ts', 'utf8')).split(/\r?\n/)[89]?.trim() ?? null }
report.protocolNeighbours = (await readFile('src/main/protocol.ts', 'utf8'))
  .split(/\r?\n/)
  .slice(86, 94)
  .map((l, i) => `${87 + i}: ${l.trim()}`)

const lintJson = await runCapture('npx.cmd eslint . --no-cache --format json', 600000)
try {
  const parsed = JSON.parse(lintJson.log.replace(/^\uFEFF/, ''))
  report.lint = {
    exitCode: lintJson.exitCode,
    errors: parsed.reduce((n, f) => n + f.errorCount, 0),
    warnings: parsed.reduce((n, f) => n + f.warningCount, 0),
    filesWithErrors: parsed.filter((f) => f.errorCount).map((f) => `${f.filePath.replace(process.cwd(), '')} e=${f.errorCount}`),
    warningRules: [...new Set(parsed.flatMap((f) => f.messages.filter((m) => m.severity === 1).map((m) => m.ruleId)))],
    protocolErrors: parsed
      .filter((f) => f.filePath.includes('protocol.ts'))
      .flatMap((f) => f.messages.filter((m) => m.severity === 2).map((m) => `line ${m.line} ${m.ruleId}`))
  }
} catch (e) {
  report.lint = { exitCode: lintJson.exitCode, parseError: String(e.message), tail: lintJson.log.slice(-400) }
}

await writeFile(`${outDir}/t5-assets.json`, JSON.stringify(report, null, 2), 'utf8')
console.log(JSON.stringify(report, null, 2))

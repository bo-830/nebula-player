/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS probe (not shipped TS source); the rule targets typed TS modules.
 * If eslint.config.mjs later scopes this rule away from scripts/**, this
 * directive becomes redundant and can be deleted. */
/**
 * t6 — root-cause confirmation for the playerStoreSleep flake (captain: ui-features
 * established that the 8th test hit the REAL audioEngine.setVolume → lazily created
 * <audio> → `ReferenceError: Audio is not defined` in node).
 *
 * This probe does three things on the FINAL snapshot:
 *   1. records the snapshot fingerprint (mtime/size/sha1) of every relevant file,
 *      since the repo has no git history to pin the revision;
 *   2. statically shows the engine stubs are installed for EVERY test and used by
 *      the 8th test — i.e. the defect is fixed in this snapshot, not merely absent;
 *   3. empirically runs that single test in isolation and reports the real exit code.
 *
 * Usage: node scripts/verify-flake-rootcause.mjs
 */
import { createHash } from 'crypto'
import { execFile } from 'child_process'
import { mkdir, readFile, stat, writeFile } from 'fs/promises'

const outDir = '.devdata/t6-evidence'
await mkdir(outDir, { recursive: true })

const FILES = [
  'src/renderer/src/lib/__tests__/playerStoreSleep.test.ts',
  'src/renderer/src/stores/playerStore.ts',
  'src/renderer/src/lib/audioEngine.ts',
  'src/renderer/src/stores/uiStore.ts'
]

const runCapture = (command, timeout = 300000) =>
  new Promise((resolve) => {
    const chunks = []
    execFile(
      command,
      [],
      { timeout, windowsHide: true, maxBuffer: 32 * 1024 * 1024, cwd: process.cwd(), shell: true },
      (err, stdout, stderr) => {
        if (stdout) chunks.push(stdout)
        if (stderr) chunks.push('\n--- stderr ---\n' + stderr)
        resolve({ exitCode: err ? (typeof err.code === 'number' ? err.code : -1) : 0, log: chunks.join('') })
      }
    )
  })

// ---------- 1. snapshot fingerprint ----------
const snapshot = []
for (const f of FILES) {
  const s = await stat(f)
  const buf = await readFile(f)
  snapshot.push({
    file: f,
    mtime: new Date(s.mtimeMs).toISOString(),
    size: s.size,
    sha1: createHash('sha1').update(buf).digest('hex').slice(0, 12)
  })
}
const capturedAt = new Date().toISOString()

// ---------- 2. static: stubs installed for every test + used by the 8th ----------
const testSrc = await readFile(FILES[0], 'utf8')
const statics = {
  definesVolumeSpy: /const volumeSpy\s*=/.test(testSrc) || /function volumeSpy\s*\(/.test(testSrc),
  callsVolumeSpyInBeforeEach: /beforeEach\s*\([\s\S]*?volumeSpy\(\)[\s\S]*?\}\)/.test(testSrc),
  callsPauseSpyInBeforeEach: /beforeEach\s*\([\s\S]*?pauseSpy\(\)[\s\S]*?\}\)/.test(testSrc),
  beforeEachBlock: (testSrc.match(/beforeEach\(\(\) => \{[\s\S]*?\n\}\)/) ?? [''])[0].slice(0, 900),
  eighthTestUsesSetVolume: /setVolume\(0\.5\)/.test(testSrc),
  assertionOnWrittenKeys: /toEqual\(\['mode', 'volume'\]\)/.test(testSrc),
  usesMockedPause: /vi\.mocked\(audioEngine\.pause\)/.test(testSrc),
  localStorageStubHasFullShape: /Symbol\.toStringTag|getItem|setItem|removeItem|clear/.test(testSrc)
}

// does the 8th test run against the real element()? show the stub line numbers
const lines = testSrc.split(/\r?\n/)
statics.stubLineNumbers = lines
  .map((l, i) => ({ n: i + 1, l: l.trim() }))
  .filter((x) => /volumeSpy|pauseSpy|it\(/.test(x.l))
  .map((x) => `${x.n}: ${x.l.slice(0, 90)}`)

// ---------- 3. empirical: the single test, real exit code ----------
const single = await runCapture(
  `npx.cmd vitest run "${FILES[0]}" --reporter=verbose -t "never persists the timer"`
)
const wholeFile = await runCapture(`npx.cmd vitest run "${FILES[0]}" --reporter=verbose`)

const report = {
  capturedAt,
  snapshot,
  statics,
  singleTest: {
    exitCode: single.exitCode,
    testsLine: single.log.match(/Tests\s+.*$/m)?.[0]?.trim() ?? null,
    ranLine: single.log.match(/Test Files\s+.*$/m)?.[0]?.trim() ?? null,
    failureLines: [...single.log.matchAll(/.*(ReferenceError|Audio is not defined|FAIL|×).*/g)].map((m) => m[0].trim()).slice(0, 8)
  },
  wholeFile: {
    exitCode: wholeFile.exitCode,
    testsLine: wholeFile.log.match(/Tests\s+.*$/m)?.[0]?.trim() ?? null,
    failureLines: [...wholeFile.log.matchAll(/.*(ReferenceError|Audio is not defined|×).*/g)].map((m) => m[0].trim()).slice(0, 8)
  }
}

await writeFile(`${outDir}/flake-rootcause.json`, JSON.stringify(report, null, 2), 'utf8')
await writeFile(`${outDir}/flake-single-test.log`, single.log, 'utf8')
console.log(JSON.stringify(report, null, 2))

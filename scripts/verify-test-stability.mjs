/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS probe (not shipped TS source); the rule targets typed TS modules.
 * If eslint.config.mjs later scopes this rule away from scripts/**, this
 * directive becomes redundant and can be deleted. */
/**
 * t6 — stability evidence: run the whole test suite several times and stress the
 * file that was reported flaky (playerStoreSleep.test.ts), recording the REAL
 * exit code each time.
 *
 * Exit codes come from spawning npm.cmd/npx.cmd directly (Node reports the child
 * code via error.code); the logs are written by Node, so no PowerShell pipeline
 * can pollute them. `cmd.exe /c "… > file"` is unusable here: this project path
 * contains CJK characters and cmd.exe cannot resolve its own cwd.
 *
 * Usage: node scripts/verify-test-stability.mjs [--full=3] [--stress=10]
 */
import { execFile } from 'child_process'
import { mkdir, writeFile } from 'fs/promises'

const args = process.argv.slice(2)
const argOf = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit ? Number(hit.split('=')[1]) : dflt
}
const FULL_RUNS = argOf('full', 3)
const STRESS_RUNS = argOf('stress', 10)
const outDir = '.devdata/t6-evidence'
await mkdir(outDir, { recursive: true })

async function runCapture(command, logName, timeout = 900000) {
  const logFile = `${outDir}/${logName}`
  const started = Date.now()
  let exitCode = -1
  const chunks = []
  await new Promise((resolve) => {
    execFile(
      command,
      [],
      { timeout, windowsHide: true, maxBuffer: 64 * 1024 * 1024, cwd: process.cwd(), shell: true },
      (err, stdout, stderr) => {
        if (stdout) chunks.push(stdout)
        if (stderr) chunks.push('\n--- stderr ---\n' + stderr)
        exitCode = err ? (typeof err.code === 'number' ? err.code : -1) : 0
        resolve()
      }
    )
  })
  const log = chunks.join('')
  await writeFile(logFile, log, 'utf8')
  return { command, exitCode, logFile, ms: Date.now() - started, log }
}

const parse = (log) => ({
  filesLine: log.match(/Test Files\s+.*$/m)?.[0]?.trim() ?? null,
  testsLine: log.match(/Tests\s+.*$/m)?.[0]?.trim() ?? null,
  durationLine: log.match(/Duration\s+.*$/m)?.[0]?.trim() ?? null,
  failed: [...log.matchAll(/[×✗]\s+(.+?)\s+(\d+)\s*m?s\)/g)].map((m) => m[1].trim()),
  passedCount: Number(log.match(/Tests\s+(\d+)\s+passed/)?.[1] ?? 0),
  failedCount: Number(log.match(/Tests\s+(\d+)\s+failed/)?.[1] ?? 0),
  errorLines: [...log.matchAll(/^(FAIL|Error:|\s+at .*playerStore.*)$/gm)].map((m) => m[0].trim()).slice(0, 12)
})

const report = { fullRuns: [], stressRuns: [], startedAt: new Date().toISOString() }

// ---------- A) whole suite, several times ----------
for (let i = 1; i <= FULL_RUNS; i++) {
  const r = await runCapture('npx.cmd vitest run --reporter=verbose', `test-full-run${i}.log`)
  report.fullRuns.push({ run: i, exitCode: r.exitCode, ms: r.ms, logFile: r.logFile, ...parse(r.log) })
}

// ---------- B) the file that was reported flaky, in isolation ----------
const STRESS_FILE = 'src/renderer/src/lib/__tests__/playerStoreSleep.test.ts'
for (let i = 1; i <= STRESS_RUNS; i++) {
  const r = await runCapture(`npx.cmd vitest run "${STRESS_FILE}" --reporter=verbose`, `test-stress-playerStoreSleep-${i}.log`, 300000)
  report.stressRuns.push({ run: i, exitCode: r.exitCode, ms: r.ms, ...parse(r.log) })
}

// ---------- C) the chatConfirm assertions the captain called out ----------
{
  const r = await runCapture('npx.cmd vitest run src/renderer/src/lib/__tests__/chatConfirm.test.ts --reporter=verbose', 'test-chatConfirm.log', 300000)
  const named = [...r.log.matchAll(/[✓√]\s+(.+?)\s+(\d+)\s*m?s\)/g)].map((m) => m[1].trim())
  report.chatConfirm = { exitCode: r.exitCode, ...parse(r.log), testNames: named, logFile: r.logFile }
}

await writeFile(`${outDir}/test-stability.json`, JSON.stringify(report, null, 2), 'utf8')

const firstFail = report.fullRuns.find((r) => r.exitCode !== 0) ?? null
console.log(
  JSON.stringify(
    {
      fullRuns: report.fullRuns.map((r) => ({ run: r.run, exitCode: r.exitCode, ms: r.ms, tests: r.testsLine, files: r.filesLine, failed: r.failed })),
      stressRuns: report.stressRuns.map((r) => ({ run: r.run, exitCode: r.exitCode, tests: r.testsLine, failed: r.failed })),
      stressFailures: report.stressRuns.filter((r) => r.exitCode !== 0).length,
      fullFailures: report.fullRuns.filter((r) => r.exitCode !== 0).length,
      firstFail,
      chatConfirm: { exitCode: report.chatConfirm.exitCode, tests: report.chatConfirm.testsLine, testNames: report.chatConfirm.testNames }
    },
    null,
    2
  )
)

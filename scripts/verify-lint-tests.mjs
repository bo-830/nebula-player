/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS E2E probe (not shipped TS source); the rule targets typed TS modules.
 * If eslint.config.mjs later scopes this rule away from scripts/**, this
 * directive becomes redundant and can be deleted. */
/**
 * t6 — collect lint / typecheck / unit-test evidence into .devdata/t6-evidence/.
 *
 * Authoritative exit codes on this machine (Windows + PowerShell execution
 * policy): `npm.ps1` is blocked and `npm.cmd test 2>&1 | Out-String` inside
 * PowerShell pollutes $LASTEXITCODE because stderr merges into the pipeline.
 *
 * Approach used here — direct spawn of the .cmd shim (no shell, no redirection
 * string): execFile('npm.cmd', [...]) reports the child's REAL exit code via
 * `error.code`, and Node writes the captured stdout+stderr to a log file
 * itself. A `cmd.exe /c "… > file"` wrapper was tried first and rejected
 * because this project path contains CJK characters (C:\博830\…): cmd.exe can
 * not resolve its own working directory then (the path is garbled through the
 * OEM codepage) and every redirection fails with “系统找不到指定的路径”.
 *
 * Every command is recorded as {command, exitCode, logFile} so a reviewer can
 * re-run it verbatim.
 *
 * Usage: node scripts/verify-lint-tests.mjs [--label r1]
 */
import { execFile } from 'child_process'
import { mkdir, writeFile } from 'fs/promises'

const label = process.argv.includes('--label')
  ? process.argv[process.argv.indexOf('--label') + 1]
  : 'run'
const outDir = '.devdata/t6-evidence'
await mkdir(outDir, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** spawn a Windows .cmd shim and return its real exit code.
 *  `shell: true` is required: Node >=24 refuses to spawn .cmd/.bat without a
 *  shell (EINVAL). The exit code still comes from the shim's child through
 *  cmd.exe, and stdout/stderr are captured by Node itself — no PowerShell
 *  pipeline is involved, so nothing can pollute the code. */
async function runCapture(file, args, logName, timeout = 900000) {
  const logFile = `${outDir}/${logName}`
  const started = Date.now()
  const parts = [
    /\s/.test(file) ? `"${file}"` : file,
    ...args.map((a) => (/\s/.test(a) ? `"${a}"` : a))
  ]
  const quoted = parts.join(' ')
  let exitCode = -1
  let spawnError = null
  const chunks = []
  await new Promise((resolve) => {
    execFile(
      quoted,
      [],
      { timeout, windowsHide: true, maxBuffer: 64 * 1024 * 1024, cwd: process.cwd(), shell: true },
      (err, stdout, stderr) => {
        if (stdout) chunks.push(stdout)
        if (stderr) chunks.push('\n--- stderr ---\n' + stderr)
        if (err) {
          exitCode = typeof err.code === 'number' ? err.code : -1
          spawnError = typeof err.code === 'number' ? null : err.message
        } else {
          exitCode = 0
        }
        resolve()
      }
    )
  })
  const log = chunks.join('')
  await writeFile(logFile, log, 'utf8')
  return { command: quoted, exitCode, logFile, ms: Date.now() - started, spawnError, log }
}

const evidence = {
  label,
  stamp: new Date().toISOString(),
  method: 'direct execFile of npm.cmd/npx.cmd shims',
  lint: null,
  lintJson: null,
  typecheck: null,
  tests: null
}

// (no synthetic exit-code sentinel: on this machine Node 24 rejects both
//  `cmd.exe /c exit 7` and `node -e …` through execFile with EINVAL. The
//  capture path is instead validated by the two independent signals below —
//  `npm run lint` reporting exit 1 while `eslint --format json` counts 0
//  errors would be a contradiction, and both are recorded in the summary.)

// ---------- 1. npm run lint ----------
{
  const r = await runCapture('npm.cmd', ['run', 'lint'], `lint-${label}.log`)
  evidence.lint = {
    command: r.command,
    exitCode: r.exitCode,
    logFile: r.logFile,
    ms: r.ms,
    tail: r.log.slice(-4000),
    spawnError: r.spawnError
  }
  await sleep(200)
}

// ---------- 2. eslint JSON detail (per-file / per-rule) ----------
{
  const r = await runCapture(
    'npx.cmd',
    ['eslint', '.', '--no-cache', '--format', 'json'],
    `eslint-json-${label}.log`
  )
  let report = []
  try {
    report = JSON.parse(r.log)
  } catch {
    /* keep raw */
  }
  const rules = {}
  const files = []
  for (const f of report) {
    if (!f.errorCount && !f.warningCount) continue
    files.push({
      file: f.filePath.replace(process.cwd() + '\\', '').replace(/\\/g, '/'),
      errors: f.errorCount,
      warnings: f.warningCount,
      messages: f.messages.map((m) => ({
        line: m.line,
        column: m.column,
        rule: m.ruleId,
        severity: m.severity,
        message: m.message
      }))
    })
    for (const m of f.messages) {
      const k = `${m.severity === 2 ? 'error' : 'warning'}:${m.ruleId ?? 'parse'}`
      rules[k] = (rules[k] ?? 0) + 1
    }
  }
  evidence.lintJson = {
    command: r.command,
    exitCode: r.exitCode,
    parsed: report.length > 0,
    totalErrors: report.reduce((n, f) => n + f.errorCount, 0),
    totalWarnings: report.reduce((n, f) => n + f.warningCount, 0),
    filesWithErrors: files.filter((f) => f.errors > 0),
    rulesSummary: rules
  }
  await sleep(200)
}

// ---------- 3. typecheck ----------
{
  const node = await runCapture('npm.cmd', ['run', 'typecheck:node'], `typecheck-node-${label}.log`)
  const web = await runCapture('npm.cmd', ['run', 'typecheck:web'], `typecheck-web-${label}.log`)
  evidence.typecheck = {
    node: {
      command: node.command,
      exitCode: node.exitCode,
      logFile: node.logFile,
      tail: node.log.slice(-2500)
    },
    web: {
      command: web.command,
      exitCode: web.exitCode,
      logFile: web.logFile,
      tail: web.log.slice(-2500)
    }
  }
  await sleep(200)
}

// ---------- 4. npm test ----------
{
  const r = await runCapture('npm.cmd', ['test', '--', '--reporter=verbose'], `tests-${label}.log`)
  const out = r.log
  const testsLine = out.match(/Tests\s+.*$/m)?.[0] ?? null
  const filesLine = out.match(/Test Files\s+.*$/m)?.[0] ?? null
  const passedTestNames = [...out.matchAll(/[✓√]\s+(.+?)\s+(\d+)\s*m?s\)/g)].map((m) => m[1].trim())
  const failedTestNames = [...out.matchAll(/[×✗]\s+(.+?)\s+(\d+)\s*m?s\)/g)].map((m) => m[1].trim())
  const testFilesSeen = [...new Set([...out.matchAll(/([\w./\\-]+\.test\.ts)/g)].map((m) => m[1]))]
  evidence.tests = {
    command: r.command,
    exitCode: r.exitCode,
    logFile: r.logFile,
    testsLine,
    filesLine,
    passedTestCount: Number(out.match(/Tests\s+(\d+)\s+passed/)?.[1] ?? 0),
    failedTestCount: Number(out.match(/Tests\s+(\d+)\s+failed/)?.[1] ?? 0),
    passedTestNames,
    failedTestNames,
    testFilesSeen,
    tail: out.slice(-8000)
  }
}

await writeFile(`${outDir}/summary-${label}.json`, JSON.stringify(evidence, null, 2), 'utf8')

console.log(
  JSON.stringify(
    {
      label,
      method: evidence.method,
      lint: {
        command: evidence.lint.command,
        exitCode: evidence.lint.exitCode,
        log: evidence.lint.logFile,
        errors: evidence.lintJson.totalErrors,
        warnings: evidence.lintJson.totalWarnings,
        parsed: evidence.lintJson.parsed,
        rules: evidence.lintJson.rulesSummary
      },
      lintErrorFiles: evidence.lintJson.filesWithErrors.map(
        (f) => `${f.file} e=${f.errors} w=${f.warnings}`
      ),
      typecheck: { node: evidence.typecheck.node.exitCode, web: evidence.typecheck.web.exitCode },
      tests: {
        command: evidence.tests.command,
        exitCode: evidence.tests.exitCode,
        log: evidence.tests.logFile,
        filesLine: evidence.tests.filesLine,
        testsLine: evidence.tests.testsLine,
        passed: evidence.tests.passedTestCount,
        failed: evidence.tests.failedTestCount,
        testFiles: evidence.tests.testFilesSeen
      }
    },
    null,
    2
  )
)

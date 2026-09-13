/**
 * t24 — deterministic before/after proof of the transcode defect.
 *
 * Isolates the root cause at the ffmpeg level, independently of the app:
 * the SAME input file is transcoded twice, with the pre-fix command line
 * (`<sha1>.m4a.tmp` output, no `-f`) and with the fixed one (`-f mp4`).
 * Everything else — binary, input, `-c copy -movflags +faststart` — is identical,
 * so any difference in the outcome is attributable to `-f` alone.
 *
 * Usage: node scripts/probe-transcode-repro.mjs [input.aac]
 */
import { spawn } from 'child_process'
import { existsSync, mkdirSync, rmSync, statSync } from 'fs'
import { join } from 'path'
import ffmpegPath from 'ffmpeg-static'

const BIN = ffmpegPath
const input = process.argv[2] ?? '.devdata/transcode-fixtures/tone.aac'
const outDir = '.devdata/transcode-fixtures'

if (!BIN || !existsSync(BIN)) {
  console.error('ffmpeg-static binary not found:', BIN)
  process.exit(2)
}
if (!existsSync(input)) {
  console.error('input fixture not found:', input)
  process.exit(2)
}
mkdirSync(outDir, { recursive: true })

function runFfmpeg(args) {
  return new Promise((resolve) => {
    const child = spawn(BIN, args, { windowsHide: true })
    let stderr = ''
    child.stderr.on('data', (d) => {
      stderr += String(d)
      if (stderr.length > 8192) stderr = stderr.slice(-4096)
    })
    child.on('error', (err) => resolve({ code: -1, stderr: String(err.message) }))
    child.on('close', (code) => resolve({ code, stderr }))
  })
}

/** ffmpeg's own last meaningful stderr line, the way decodeService reports it */
const lastLine = (s) => s.split('\n').filter(Boolean).pop() ?? '(no output)'

const results = {}

// ---- BEFORE (pre-fix): output ends in `.tmp`, no `-f` ----------------------
{
  const out = join(outDir, 'repro-before.m4a.tmp')
  rmSync(out, { force: true })
  const args = ['-y', '-i', input, '-c', 'copy', '-movflags', '+faststart', out]
  const r = await runFfmpeg(args)
  results.before = {
    args: args.join(' '),
    exitCode: r.code,
    bytes: existsSync(out) ? statSync(out).size : 0,
    lastStderrLine: lastLine(r.stderr)
  }
  rmSync(out, { force: true })
}

// ---- AFTER (fixed): same output path, explicit `-f mp4` --------------------
{
  const out = join(outDir, 'repro-after.m4a.tmp')
  rmSync(out, { force: true })
  const args = ['-y', '-i', input, '-c', 'copy', '-movflags', '+faststart', '-f', 'mp4', out]
  const r = await runFfmpeg(args)
  results.after = {
    args: args.join(' '),
    exitCode: r.code,
    bytes: existsSync(out) ? statSync(out).size : 0,
    lastStderrLine: lastLine(r.stderr)
  }
  rmSync(out, { force: true })
}

// ---- control: real extension instead of `.tmp` (why renaming also "works") --
{
  const out = join(outDir, 'repro-control.m4a')
  rmSync(out, { force: true })
  const args = ['-y', '-i', input, '-c', 'copy', '-movflags', '+faststart', out]
  const r = await runFfmpeg(args)
  results.controlRealExt = {
    args: args.join(' '),
    exitCode: r.code,
    bytes: existsSync(out) ? statSync(out).size : 0
  }
  rmSync(out, { force: true })
}

console.log(JSON.stringify({ input, ffmpeg: BIN, ...results }, null, 2))
console.log('\n--- verdict ---')
console.log('BEFORE fails on `.tmp` output :', results.before.exitCode !== 0)
console.log('  ->', results.before.lastStderrLine.slice(0, 120))
console.log('AFTER succeeds with -f mp4    :', results.after.exitCode === 0 && results.after.bytes > 0)
console.log('control (real .m4a ext) works :', results.controlRealExt.exitCode === 0)
console.log(
  '\nroot cause confirmed: the container extension is the only difference;',
  '\n`-f` supplies what the `.tmp` suffix cannot.'
)
process.exit(results.before.exitCode !== 0 && results.after.exitCode === 0 ? 0 : 1)

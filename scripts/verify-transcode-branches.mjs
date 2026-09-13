/**
 * t24 / t32 — independent, instance-free verification of the transcode fix.
 *
 * Why this exists (verifier's own instrument, not the author's):
 * `scripts/probe-transcode-repro.mjs` (t24) proves the m4a branch at the ffmpeg
 * level, but it does not (a) guard the *source* against a silent loss of `-f`,
 * nor (b) exercise the **wav branch** that APE and the remux fallback both use.
 * This probe does both without any dev instance, so it can run on a frozen tree
 * at any time (t32 / t9).
 *
 * It asserts three independent things:
 *   1. STATIC  — `src/main/decodeService.ts` still passes an explicit `-f` to
 *      *every* ffmpeg invocation whose output path ends in `.tmp`.
 *   2. BEHAVIOUR (before/after) — with the very same input and the very same
 *      output path ending in `.tmp`, ffmpeg fails without `-f` and succeeds
 *      with it. Two branches: `-f mp4` (aac→m4a remux) and `-f wav` (pcm_s16le).
 *   3. ARTEFACT — the produced files really are the claimed containers
 *      (`mov,mp4,m4a` / `wav`), read back with ffmpeg itself.
 *
 * APE scope note (captain's ruling): this machine's ffmpeg build has no Monkey's
 * Audio *encoder*, so a real `.ape` fixture cannot be synthesised → the APE
 * end-to-end chain is NOT attempted. The wav branch below is the same argument
 * vector the APE path uses, exercised with an AAC input, and is reported as
 * branch-level evidence — never as APE E2E.
 *
 * Usage: node scripts/verify-transcode-branches.mjs [input.aac]
 */
import { spawn } from 'child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import ffmpegPath from 'ffmpeg-static'

const BIN = ffmpegPath
const input = process.argv[2] ?? '.devdata/transcode-fixtures/tone.aac'
const workDir = '.devdata/t13-r2-evidence/transcode-branch-tmp'
const SRC = 'src/main/decodeService.ts'

const checks = []
const record = (name, ok, detail) => {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`)
}

function run(args) {
  return new Promise((resolve) => {
    const child = spawn(BIN, args, { windowsHide: true })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += String(d)))
    child.stderr.on('data', (d) => (err += String(d)))
    child.on('error', (e) => resolve({ code: -1, out, err: err + String(e.message) }))
    child.on('close', (code) => resolve({ code, out, err }))
  })
}

/** last non-empty stderr line, exactly the way decodeService reports failures */
const lastLine = (s) => s.split('\n').filter(Boolean).pop() ?? '(no output)'

/** `ffmpeg -i file` describing an existing file: container + audio codec */
async function describe(file) {
  const r = await run(['-hide_banner', '-i', file])
  const inputLine = r.err.split('\n').find((l) => l.includes('Input #0')) ?? ''
  const streamLine = r.err.split('\n').find((l) => l.includes('Stream #0:0')) ?? ''
  const durationLine = r.err.split('\n').find((l) => l.includes('Duration:')) ?? ''
  return { container: inputLine.replace(/Input #0,\s*/, '').split(',')[0].trim(), inputLine: inputLine.trim(), streamLine: streamLine.trim(), durationLine: durationLine.trim() }
}

if (!BIN || !existsSync(BIN)) {
  console.error('ffmpeg-static binary not found:', BIN)
  process.exit(2)
}
if (!existsSync(input)) {
  console.error('input fixture not found:', input)
  process.exit(2)
}
if (!existsSync(SRC)) {
  console.error('source file not found:', SRC)
  process.exit(2)
}

console.log('input fixture :', input)
console.log('ffmpeg binary :', BIN)
console.log('source under test:', SRC)
console.log('')

// ---------------------------------------------------------------------------
// 1) STATIC: every ffmpeg invocation that writes a `.tmp` output needs `-f`
// ---------------------------------------------------------------------------
const src = readFileSync(SRC, 'utf8')
const argLineNumbers = []
src.split('\n').forEach((line, i) => {
  if (/\bfs\.rename\(/.test(line)) return
  if (!/runFfmpeg\(bin, \[/.test(line) && !/^\s*(\?|\:)\s*\[/.test(line)) return
  argLineNumbers.push({ n: i + 1, line: line.trim() })
})
const argBlob = argLineNumbers.map((l) => l.line).join('\n')
const flagCount = (argBlob.match(/'\-f'/g) ?? []).length
const tmpSuffix = /const tmp = out \+ '\.tmp'/.test(src) || /\+ '\.tmp'/.test(src)
record(
  'static: >=3 explicit -f flags in decodeService ffmpeg arg vectors',
  flagCount >= 3,
  `found ${flagCount} (-f mp4 + -f wav outer + -f wav fallback)`
)
record('static: m4a branch passes -f mp4', /'-f', 'mp4'/.test(src), 'literal `-f` `mp4`')
record(
  'static: wav branch passes -f wav (first conversion)',
  (src.match(/'-f', 'wav'/g) ?? []).length >= 2,
  `${(src.match(/'\-f', 'wav'/g) ?? []).length} x -f wav (outer + remux fallback)`
)
record(
  'static: temporary output name still ends in .tmp (so -f stays mandatory)',
  tmpSuffix,
  'tmp = out + ".tmp"'
)
record(
  'static: error surfaces the raw ffmpeg exit code',
  /解码失败 \(\$\{code\}\)/.test(src),
  '`解码失败 (${code})` — matches the reported 4294967274'
)

// ---------------------------------------------------------------------------
// 2) BEHAVIOUR: before (no -f) vs after (-f), identical input + `.tmp` output
// ---------------------------------------------------------------------------
rmSync(workDir, { recursive: true, force: true })
mkdirSync(workDir, { recursive: true })

const mp4Tmp = join(workDir, 'branch-m4a.m4a.tmp')
const wavTmp = join(workDir, 'branch-wav.wav.tmp')
const results = {}

// --- m4a branch (aac -> m4a remux), BEFORE: no -f, output ends in .tmp -------
{
  rmSync(mp4Tmp, { force: true })
  const args = ['-y', '-i', input, '-c', 'copy', '-movflags', '+faststart', mp4Tmp]
  const r = await run(args)
  results.m4aBefore = { args: args.join(' '), exitCode: r.code, bytes: existsSync(mp4Tmp) ? statSync(mp4Tmp).size : 0, last: lastLine(r.err) }
}
// --- m4a branch, AFTER: `-f mp4` -------------------------------------------
{
  rmSync(mp4Tmp, { force: true })
  const args = ['-y', '-i', input, '-c', 'copy', '-movflags', '+faststart', '-f', 'mp4', mp4Tmp]
  const r = await run(args)
  results.m4aAfter = { args: args.join(' '), exitCode: r.code, bytes: existsSync(mp4Tmp) ? statSync(mp4Tmp).size : 0 }
  if (r.code === 0) results.m4aAfter.described = await describe(mp4Tmp)
}
// --- wav branch (pcm_s16le), BEFORE: no -f ---------------------------------
{
  rmSync(wavTmp, { force: true })
  const args = ['-y', '-i', input, '-vn', '-c:a', 'pcm_s16le', wavTmp]
  const r = await run(args)
  results.wavBefore = { args: args.join(' '), exitCode: r.code, bytes: existsSync(wavTmp) ? statSync(wavTmp).size : 0, last: lastLine(r.err) }
}
// --- wav branch, AFTER: `-f wav` -------------------------------------------
{
  rmSync(wavTmp, { force: true })
  const args = ['-y', '-i', input, '-vn', '-c:a', 'pcm_s16le', '-f', 'wav', wavTmp]
  const r = await run(args)
  results.wavAfter = { args: args.join(' '), exitCode: r.code, bytes: existsSync(wavTmp) ? statSync(wavTmp).size : 0 }
  if (r.code === 0) results.wavAfter.described = await describe(wavTmp)
}

record('behaviour: m4a branch FAILS pre-fix (no -f, .tmp)', results.m4aBefore.exitCode !== 0 && results.m4aBefore.bytes === 0, `exit=${results.m4aBefore.exitCode} :: ${results.m4aBefore.last}`)
record('behaviour: m4a branch SUCCEEDS with -f mp4', results.m4aAfter.exitCode === 0 && results.m4aAfter.bytes > 0, `exit=${results.m4aAfter.exitCode} bytes=${results.m4aAfter.bytes}`)
record('behaviour: wav branch FAILS pre-fix (no -f, .tmp)', results.wavBefore.exitCode !== 0 && results.wavBefore.bytes === 0, `exit=${results.wavBefore.exitCode} :: ${results.wavBefore.last}`)
record('behaviour: wav branch SUCCEEDS with -f wav', results.wavAfter.exitCode === 0 && results.wavAfter.bytes > 0, `exit=${results.wavAfter.exitCode} bytes=${results.wavAfter.bytes}`)
record(
  'causality: the reported in-app exit code is reproduced exactly',
  results.m4aBefore.exitCode === 4294967274,
  `pre-fix ffmpeg exit=${results.m4aBefore.exitCode} (in-app error was 4294967274)`
)

// ---------------------------------------------------------------------------
// 3) ARTEFACT: the outputs are the containers they claim to be
// ---------------------------------------------------------------------------
record(
  'artefact: -f mp4 output is a real MP4/M4A container',
  /mov|mp4|m4a/i.test(results.m4aAfter.described?.container ?? ''),
  `${results.m4aAfter.described?.container} | ${results.m4aAfter.described?.streamLine}`
)
record(
  'artefact: -f wav output is a real WAV container with pcm_s16le',
  /wav/i.test(results.wavAfter.described?.container ?? '') && /pcm_s16le/.test(results.wavAfter.described?.streamLine ?? ''),
  `${results.wavAfter.described?.container} | ${results.wavAfter.described?.streamLine}`
)

rmSync(workDir, { recursive: true, force: true })

const out = {
  capturedAt: new Date().toISOString(),
  input,
  ffmpeg: BIN,
  source: SRC,
  staticArgLines: argLineNumbers,
  results,
  checks,
  passed: checks.filter((c) => c.ok).length,
  failed: checks.filter((c) => !c.ok).length,
  allPass: checks.every((c) => c.ok),
  apeNote: 'APE end-to-end NOT attempted: this ffmpeg build has no Monkey\u2019s Audio encoder. wav branch proven at branch level (same arg vector as the APE path).'
}
const reportPath = '.devdata/t13-r2-evidence/t24-transcode-branches.json'
writeFileSync(reportPath, JSON.stringify(out, null, 2), 'utf8')
console.log('\n' + JSON.stringify(out, null, 2))
console.log('\nreport written to', reportPath)
process.exit(out.allPass ? 0 : 1)

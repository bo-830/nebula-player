/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS probe (not shipped TS source); the rule targets typed TS modules.
 * If eslint.config.mjs later scopes this rule away from scripts/**, this
 * directive becomes redundant and can be deleted. */
/**
 * t6 — capture the dev process's OWN output when the app dies.
 *
 * Earlier crash analysis was limited because the app log only records what the
 * main process logs itself, and my background-job wrapper swallowed the child's
 * native output. This runs `electron-vite dev` with stdout+stderr written
 * straight to a file (Node's own redirection, no shell pipeline), polls the CDP
 * endpoint, and reports:
 *   - how many seconds the window target stayed alive
 *   - the exact tail of the dev output (native/Chromium messages included)
 *   - the app's own log tail
 *
 * Usage: node scripts/verify-crash-capture.mjs [seconds]
 */
import { spawn } from 'child_process'
import { createWriteStream } from 'fs'
import { mkdir, readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

const LIMIT = Number(process.argv[2] ?? 60)
const outDir = '.devdata/t6-evidence'
await mkdir(outDir, { recursive: true })
const logPath = `${outDir}/dev-capture.log`

const stream = createWriteStream(logPath, { flags: 'w' })
const child = spawn('npm.cmd', ['run', 'dev'], {
  cwd: process.cwd(),
  env: { ...process.env, ELECTRON_CACHE: 'C:\\博830\\vibecoding\\.electron-cache', ELECTRON_MIRROR: 'https://cdn.npmmirror.com/binaries/electron/' },
  shell: true,
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe']
})
child.stdout.pipe(stream, { end: false })
child.stderr.pipe(stream, { end: false })
let exited = null
child.on('exit', (code, signal) => {
  exited = { code, signal, at: new Date().toISOString() }
})

const started = Date.now()
const samples = []
let diedAt = null
let everAlive = false
while ((Date.now() - started) / 1000 < LIMIT) {
  let alive = false
  try {
    const res = await fetch('http://127.0.0.1:9222/json')
    const list = await res.json()
    alive = list.some((t) => t.url.endsWith('5173/'))
  } catch {
    alive = false
  }
  const t = Math.round(((Date.now() - started) / 1000) * 10) / 10
  samples.push({ t, alive })
  if (alive) everAlive = true
  if (everAlive && !alive) {
    diedAt = t
    break
  }
  await new Promise((r) => setTimeout(r, 1000))
}

try {
  child.kill()
} catch {
  /* ignore */
}
await new Promise((r) => setTimeout(r, 500))
stream.end()

const devLog = await readFile(logPath, 'utf8').catch(() => '')
let appLogTail = ''
try {
  const d = join(homedir(), 'AppData', 'Roaming', 'nebula-player', 'logs')
  const { readdir } = await import('fs/promises')
  const files = (await readdir(d)).filter((f) => f.endsWith('.log')).sort()
  const last = files[files.length - 1]
  if (last) appLogTail = (await readFile(join(d, last), 'utf8')).split(/\r?\n/).slice(-12).join('\n')
} catch (e) {
  appLogTail = 'log read failed: ' + String(e.message)
}

const out = {
  startedAt: new Date(started).toISOString(),
  diedAtSeconds: diedAt,
  survivedSeconds: diedAt === null ? Math.round((Date.now() - started) / 1000) : null,
  everAlive,
  childExit: exited,
  devLogTail: devLog.split(/\r?\n/).filter(Boolean).slice(-40).join('\n'),
  appLogTail,
  samplesTail: samples.slice(-6)
}
console.log(JSON.stringify(out, null, 2))
process.exit(0)

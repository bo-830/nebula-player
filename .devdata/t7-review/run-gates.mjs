// t7 reviewer: run quality gates with authoritative exit codes.
// Node spawn (shell:true) -> real error.code, no PowerShell pipeline involvement.
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const ROOT = 'C:\\博830\\vibecoding\\nebula-player'
const OUT = join(ROOT, '.devdata', 't7-review')
mkdirSync(OUT, { recursive: true })

const label = process.argv[2] || 'gate'
const cmds = [
  'npm.cmd run lint',
  'npm.cmd run typecheck:node',
  'npm.cmd run typecheck:web',
  'npm.cmd test -- --reporter=dot'
]

function run(cmd) {
  return new Promise((resolve) => {
    const child = spawn(cmd, {
      cwd: ROOT,
      shell: true,
      windowsHide: true,
      env: { ...process.env, CI: '1', NO_COLOR: '1', FORCE_COLOR: '0' }
    })
    let out = ''
    child.stdout.on('data', (d) => (out += d.toString()))
    child.stderr.on('data', (d) => (out += d.toString()))
    child.on('close', (code, signal) => resolve({ cmd, code, signal, out }))
    child.on('error', (err) => resolve({ cmd, code: 'SPAWN_ERROR', signal: String(err.code), out: String(err.message) }))
  })
}

const results = []
for (const c of cmds) {
  const r = await run(c)
  const file = join(OUT, `${label}-${c.replace(/[^a-z0-9]+/gi, '_')}.log`)
  writeFileSync(file, `$ ${c}\nEXIT=${r.code} SIGNAL=${r.signal}\n\n${r.out}`, 'utf8')
  results.push({ cmd: c, exit: r.code, log: file, tail: r.out.slice(-1200) })
  console.log(`\n=== ${c} -> EXIT ${r.code} (log: ${file})`)
}

writeFileSync(join(OUT, `${label}-summary.json`), JSON.stringify(results, null, 2), 'utf8')
console.log('\nSUMMARY:', results.map((r) => `${r.cmd}=${r.exit}`).join(' | '))

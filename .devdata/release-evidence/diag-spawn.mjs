/** t43 诊断：复现 verify-lint-tests.mjs 的 runCapture 调用形态，暴露被吞掉的 spawn 错误。 */
import { execFile } from 'child_process'

const run = (quoted) =>
  new Promise((resolve) => {
    execFile(
      quoted,
      [],
      { timeout: 300000, windowsHide: true, maxBuffer: 64 * 1024 * 1024, cwd: process.cwd(), shell: true },
      (err, stdout, stderr) => {
        resolve({
          quoted,
          errCode: err ? err.code : null,
          errMessage: err ? String(err.message).slice(0, 200) : null,
          errno: err ? err.errno : null,
          syscall: err ? err.syscall : null,
          stdoutLen: stdout ? stdout.length : 0,
          stderrHead: stderr ? String(stderr).slice(0, 300) : ''
        })
      }
    )
  })

console.log('cwd =', process.cwd())
console.log('ComSpec =', process.env.ComSpec)
console.log('shell =', process.env.SHELL ?? '(n/a)')
console.log(JSON.stringify(await run('npm.cmd --version'), null, 2))
console.log(JSON.stringify(await run('npm.cmd run lint'), null, 2))

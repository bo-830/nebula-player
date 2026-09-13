import { appendFileSync, mkdirSync, renameSync, statSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { paths } from './store'

let currentFile = ''

function fileName(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return join(
    paths().logs,
    `nebula-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.log`
  )
}

function ensureFile(): string {
  if (currentFile) return currentFile
  mkdirSync(paths().logs, { recursive: true })
  currentFile = fileName()
  try {
    // rotate if > 2MB
    const st = statSync(currentFile)
    if (st.size > 2 * 1024 * 1024) renameSync(currentFile, currentFile + '.old')
  } catch {
    // new file
  }
  return currentFile
}

export function log(level: 'info' | 'warn' | 'error', msg: string): void {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`
  try {
    appendFileSync(ensureFile(), line)
  } catch {
    // logging is best-effort
  }
  if (level === 'error' || level === 'warn') console.log(`[app:${level}] ${msg}`)
}

export function logDir(): string {
  return paths().logs
}

export function initLogging(): void {
  process.on('uncaughtException', (err) => {
    log('error', 'uncaughtException: ' + ((err && err.stack) || String(err)))
  })
  process.on('unhandledRejection', (reason) => {
    log(
      'error',
      'unhandledRejection: ' +
        (reason instanceof Error ? (reason.stack ?? reason.message) : String(reason))
    )
  })
  log('info', `--- NEBULA Player boot v${app.getVersion()} ${process.platform} ${process.arch} ---`)
}

import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateStatus } from '../shared/types'

let current: UpdateStatus = { state: 'idle' }
let emit: (s: UpdateStatus) => void = () => {}
let wired = false

function setState(s: UpdateStatus): void {
  current = s
  emit(s)
}

function ensureWired(previewOnly: boolean): void {
  if (wired) return
  wired = true
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false
  if (!app.isPackaged) {
    // dev: read dev-app-update.yml / feed URL (never auto-checks)
    autoUpdater.forceDevUpdateConfig = true
  }
  if (previewOnly) return
  autoUpdater.on('update-available', (info) => {
    setState({ state: 'available', version: info.version })
  })
  autoUpdater.on('update-not-available', () => {
    setState({ state: 'none' })
  })
  autoUpdater.on('download-progress', (p) => {
    setState({ state: 'downloading', percent: Math.max(0, Math.min(100, Math.round(p.percent))) })
  })
  autoUpdater.on('update-downloaded', (info) => {
    setState({ state: 'downloaded', version: info.version })
  })
  autoUpdater.on('error', (err) => {
    setState({ state: 'error', message: err?.message ?? String(err) })
  })
}

function feedFor(url: string): { provider: 'generic'; url: string } {
  return { provider: 'generic', url: url.endsWith('/') ? url : url + '/' }
}

/** manual check; returns the resulting status (events are emitted too). */
export async function checkUpdate(feedURL: string): Promise<UpdateStatus> {
  setState({ state: 'checking' })
  const url = feedURL?.trim()
  if (!url) {
    setState({ state: 'not-configured' })
    return current
  }
  ensureWired(false)
  try {
    if (!app.isPackaged) {
      autoUpdater.setFeedURL(feedFor(url))
    } else {
      // packaged: app-update.yml is baked at build; override with the user feed
      try {
        autoUpdater.setFeedURL(feedFor(url))
      } catch {
        // keep baked config
      }
    }
    await autoUpdater.checkForUpdates()
  } catch (err) {
    if (current.state !== 'available' && current.state !== 'none') {
      setState({ state: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }
  return current
}

export async function downloadUpdate(): Promise<UpdateStatus> {
  ensureWired(false)
  try {
    await autoUpdater.downloadUpdate()
  } catch (err) {
    setState({ state: 'error', message: err instanceof Error ? err.message : String(err) })
  }
  return current
}

export function installUpdate(): void {
  ensureWired(false)
  autoUpdater.quitAndInstall()
}

export function registerUpdateEmitter(fn: (s: UpdateStatus) => void): UpdateStatus {
  emit = fn
  ensureWired(false)
  return current
}

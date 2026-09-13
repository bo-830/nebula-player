import { app, BrowserWindow, ipcMain, Menu, protocol, shell, type WebContents } from 'electron'
import { join, sep } from 'path'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { LibraryService } from './libraryStore'
import { SettingsService } from './settings'
import { JsonStore } from './store'
import { registerIpc, registerMediaKeys } from './ipc'
import { createTray, destroyTray } from './tray'
import { registerMediaProtocol } from './protocol'
import { cleanupCache } from './decodeService'
import { createMainWindow, setQuitting, isQuitting, type WindowHandle } from './window'
import { checkUpdate, registerUpdateEmitter } from './updateService'
import { initLogging, log } from './logging'
import type { ChatMessage, Playlist, PlayerCommand, UpdateStatus } from '../shared/types'

// dev data lives inside the project — must be set BEFORE the single-instance
// lock so dev instances can coexist with the installed app (different lock)
if (is.dev) {
  app.setPath('userData', join(process.cwd(), '.devdata', 'user'))
}

// ---------------------------------------------------------------------------
// Process-level fail-safe.
//
// Node's default reaction to an unhandled rejection / uncaught exception is to
// print it and terminate. In a packaged desktop app that reaches the user as
// "the window vanished a few seconds after launch", with no dialog, no log and
// no trace — the worst possible failure mode to debug. Registering a listener
// suppresses that default exit, so the fault is recorded in the app log and the
// process keeps running.
//
// Installed at module load — i.e. before `app.whenReady()` and before anything
// else in this file can reject — because startup is precisely the window where
// nothing else has run yet. `initLogging()` (called from bootstrap) installs
// its own equivalent handlers; this earlier pair is what covers startup.
// ---------------------------------------------------------------------------

/** Render any thrown value as a log line, preserving stack traces. */
function describeFault(value: unknown): string {
  if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

process.on('unhandledRejection', (reason) => {
  log('error', 'unhandledRejection: ' + describeFault(reason))
})
process.on('uncaughtException', (err) => {
  log('error', 'uncaughtException: ' + describeFault(err))
})

// media:// must be a privileged scheme BEFORE app ready (Electron only accepts
// this call at that point, and only once). `corsEnabled` is what lets a
// <audio> element routed through MediaElementAudioSourceNode read real samples
// instead of outputting zeroes — without it the app sees no CORS headers on the
// media:// responses and the live spectrum goes silent. `stream` keeps Range
// streaming (seek) working, `supportFetchAPI` allows fetch/media-API access.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      stream: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
])

// ---------------------------------------------------------------------------
// Navigation hardening (review finding F3 — navigation surface)
//
// `media://` is a privileged scheme with `corsEnabled: true` and an `ACAO: *`
// response header. Both are load-bearing and must stay: `corsEnabled` is what
// lets the <audio> element feed real samples to MediaElementAudioSourceNode
// (see above), and the wildcard is what keeps covers loadable. Neither may be
// tightened without silencing the spectrum again.
//
// The price of that combination is that ANY document which ends up inside a
// renderer inherits the app's local-file access — it could simply fetch
// `media://local/...` for arbitrary paths. So a renderer must never be
// navigated to, nor open a window onto, anything but the app's own pages:
//
//   dev      → only the electron-vite dev server. 5174 is included because
//              electron-vite falls back to that port when 5173 is taken.
//   packaged → only files inside the app's own bundled renderer directory
//              (the main window and the `#mini` window share its entry file).
//
// Everything else is refused outright, and genuine http/https links are handed
// to the OS browser instead of being embedded here.
// ---------------------------------------------------------------------------

/** Dev-server origins we trust; the 5174 pair is electron-vite's fallback. */
const DEV_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174'
])

/** `file:` URL prefix of the bundled renderer directory (packaged builds). */
const RENDERER_URL_PREFIX = pathToFileURL(join(__dirname, '..', 'renderer') + sep).pathname

/** True only for the app's own pages — the only navigation target we accept. */
function isAppPage(rawUrl: string): boolean {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    // unparsable / relative → never trusted
    return false
  }
  if (is.dev) return DEV_ORIGINS.has(url.origin)
  return url.protocol === 'file:' && url.pathname.startsWith(RENDERER_URL_PREFIX)
}

/** http(s) link we are willing to hand to the OS browser; null means refuse. */
function externalLinkTarget(rawUrl: string): string | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }
  if (isAppPage(rawUrl)) return null
  return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
}

/**
 * Deny every attempt to spawn a renderer. Only an http/https URL is ever passed
 * to `shell.openExternal`, so a `file:` / `media://` / custom-scheme target can
 * never be launched by the OS on the user's behalf.
 */
function guardWindowOpen(contents: WebContents): void {
  contents.setWindowOpenHandler(({ url }) => {
    const external = externalLinkTarget(url)
    if (external) {
      // `shell.openExternal` returns a promise — settle it, otherwise a failed
      // hand-off would surface as a process-level unhandled rejection.
      void shell.openExternal(external).catch((err) => {
        log('warn', 'shell.openExternal failed: ' + describeFault(err))
      })
    }
    return { action: 'deny' }
  })
}

/** Refuse foreign navigations; the app's own pages are left alone. */
function guardNavigation(contents: WebContents): void {
  const guard = (event: { preventDefault: () => void }, url: string): void => {
    if (isAppPage(url)) return
    event.preventDefault()
    log('warn', `[security] blocked navigation to ${url}`)
  }
  contents.on('will-navigate', guard)
  // `will-navigate` is main-frame scope and does NOT fire for redirects, so a
  // 302 from an otherwise trusted origin — e.g. a dev port that some other
  // process took over — could still pull a foreign page into a renderer that
  // runs with `sandbox:false` and the full `window.api` surface. `will-redirect`
  // closes that hop. The allow-list is deliberately the same one.
  contents.on('will-redirect', guard)
}

function hardenNavigation(contents: WebContents): void {
  guardNavigation(contents)
  guardWindowOpen(contents)
}

// Single source of truth for the navigation / window-open policy: this hook
// covers every renderer — the main window, the `#mini` window and anything
// created later. No window installs a handler of its own; a per-window
// `setWindowOpenHandler` would silently replace this one (single-slot setter).
app.on('web-contents-created', (_event, contents) => {
  hardenNavigation(contents)
})

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

let winHandle: WindowHandle | null = null
const library = new LibraryService()
const settings = new SettingsService()
const playlists = new JsonStore<{ playlists: Playlist[] }>('playlists.json', { playlists: [] })
const chat = new JsonStore<{ messages: ChatMessage[] }>('chat.json', { messages: [] })

// dev-only CDP endpoint for E2E drive scripts (scripts/e2e.mjs)
if (is.dev) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222')
}
// explicit autoplay policy — the app controls audio start itself
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

function sendPlayerCommand(cmd: PlayerCommand): void {
  winHandle?.send('player:command', cmd)
}

async function bootstrap(): Promise<void> {
  electronApp.setAppUserModelId('com.nebula.player')
  initLogging()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  await Promise.all([
    settings.init(),
    library.init(),
    playlists.init(),
    chat.init(),
    cleanupCache()
  ])
  log(
    'info',
    'services initialized; update feed=' + (settings.getPublic().general.updateURL || '(none)')
  )

  registerMediaProtocol()

  // audio diagnostics (dev)
  if (is.dev) {
    console.log('[main] argv:', process.argv.filter((a) => a.startsWith('--')).join(' '))
    console.log('[main] mute-audio switch:', app.commandLine.hasSwitch('mute-audio'))
    console.log('[main] disable-audio-output:', app.commandLine.hasSwitch('disable-audio-output'))
  }

  winHandle = createMainWindow({
    alwaysOnTop: settings.getPublic().general.alwaysOnTop,
    closeToTray: () => settings.getPublic().general.closeToTray
  })

  registerIpc({
    library,
    settings,
    playlists,
    chat,
    win: () => winHandle,
    onPlayerCommand: (cmd) => sendPlayerCommand(cmd)
  })

  // forward renderer diagnostics to stdout (dev smoke-testing)
  if (is.dev) {
    winHandle.win.webContents.on('console-message', (event) => {
      const { level, message } = event as unknown as { level: number; message: string }
      if (level >= 1) console.log(`[renderer:${level}] ${message}`)
    })
    winHandle.win.webContents.on('render-process-gone', (_e, details) => {
      console.log(`[main] renderer gone: ${details.reason}`)
    })
    winHandle.win.webContents.on('did-finish-load', () => {
      console.log('[main] window loaded')
      setTimeout(() => {
        void winHandle?.win.webContents
          .executeJavaScript(
            `JSON.stringify({
              root: document.getElementById('root')?.childElementCount ?? -1,
              hasApi: typeof window.api === 'object',
              hasApiMethods: typeof window.api?.libraryGet === 'function',
              text: document.body.innerText.slice(0, 120)
            })`
          )
          .then((r) => console.log('[main] probe:', r))
          .catch((e) => console.log('[main] probe failed:', String(e)))
      }, 2500)
    })

    // dev-only: dump chrome://media-internals for audio debugging
    ipcMain.handle('dev:media-internals', async () => {
      const b = new BrowserWindow({ show: false, width: 800, height: 600 })
      await b.loadURL('chrome://media-internals/')
      await new Promise((r) => setTimeout(r, 2500))
      const text = await b.webContents.executeJavaScript(
        `(async () => {
          const sleep = (ms) => new Promise(r => setTimeout(r, ms))
          const rows = document.querySelectorAll('tr')
          for (const row of rows) {
            if ((row.innerText || '').includes('media://')) { row.click(); break }
          }
          await sleep(1500)
          return document.body.innerText.slice(0, 14000)
        })()`
      )
      b.destroy()
      return text
    })
  }

  // global media keys (default off, toggleable in settings)
  registerMediaKeys(settings.getPublic().general.mediaKeys, sendPlayerCommand)

  createTray(sendPlayerCommand)

  // ------ auto update ------
  const feedSender = (s: UpdateStatus): void => {
    winHandle?.send('update:status', s)
  }
  const updSvc = registerUpdateEmitter(feedSender)
  if (updSvc.state !== 'idle') feedSender(updSvc)
  // silent check a few seconds after launch when an update feed is configured.
  //
  // Everything here is defensive on purpose. A settings file written by an
  // earlier release has no `updateURL` at all: `store.ts` merges only the top
  // level, so the stored `general` object replaces the default one wholesale
  // and the key goes missing — which made `undefined.trim()` throw ~8s after
  // launch (logged as `uncaughtException`, update check dead). Every user
  // upgrading in place hits that path, so neither the read nor the check may be
  // allowed to disturb startup. The URL and check semantics are unchanged.
  setTimeout(() => {
    try {
      const feed = settings.getPublic().general.updateURL ?? ''
      if (feed.trim()) {
        void checkUpdate(feed).catch((err) => {
          log('warn', 'startup update check failed: ' + describeFault(err))
        })
      }
    } catch (err) {
      log('warn', 'startup update check callback failed: ' + describeFault(err))
    }
  }, 8000)

  // macOS: keep standard app menu (copy/paste etc.)
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }])
    )
  } else {
    Menu.setApplicationMenu(null)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && winHandle) {
      winHandle.show()
    }
  })
}

app.whenReady().then(() => {
  // a rejected bootstrap must be recorded in the log, not left as an
  // unhandled rejection that kills the process with no trace
  void bootstrap().catch((err) => {
    log('error', 'bootstrap failed: ' + describeFault(err))
  })

  app.on('before-quit', () => {
    setQuitting()
  })

  // quit even with windows hidden in tray
  app.on('window-all-closed', () => {
    if (
      process.platform !== 'darwin' &&
      !isQuitting() &&
      !settings.getPublic().general.closeToTray
    ) {
      app.quit()
    }
  })
})

app.on('second-instance', () => {
  winHandle?.show()
})

app.on('will-quit', () => {
  destroyTray()
})

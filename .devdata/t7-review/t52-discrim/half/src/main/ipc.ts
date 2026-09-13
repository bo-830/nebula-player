import { app, BrowserWindow, dialog, globalShortcut, ipcMain, shell } from 'electron'
import type {
  ApiTestResult,
  ChatDonePayload,
  ChatMessage,
  ChatProxyCmd,
  ChatProxySnapshot,
  ChatStartPayload,
  MiniPlayPayload,
  PlayerCommand,
  PlayerState,
  Playlist,
  ScanProgress,
  ScanResult,
  Track
} from '../shared/types'
import { LibraryService } from './libraryStore'
import { SettingsService } from './settings'
import { ensurePlayable } from './decodeService'
import { refreshMediaRoots } from './protocol'
import { getWaveform } from './waveformService'
import { getLyrics } from './lyricsService'
import { downloadUpdate, installUpdate, checkUpdate } from './updateService'
import { chatComplete } from './llmClient'
import { log, logDir } from './logging'
import { closeMiniWindow, forwardToMini, setMiniExpanded, toggleMiniWindow } from './mini'
import { JsonStore } from './store'
import { updateTrayTitle } from './tray'
import type { WindowHandle } from './window'

export interface Services {
  library: LibraryService
  settings: SettingsService
  playlists: JsonStore<{ playlists: Playlist[] }>
  chat: JsonStore<{ messages: ChatMessage[] }>
  win: () => WindowHandle | null
  onPlayerCommand: (cmd: PlayerCommand) => void
}

const aborters = new Map<string, AbortController>()
let scanCancelled = { flag: false }

export function registerIpc(svc: Services): void {
  const win = (): BrowserWindow | null => svc.win()?.win ?? null

  // ---------- window ----------
  ipcMain.on('window:minimize', () => win()?.minimize())
  ipcMain.handle('window:maximize-toggle', () => svc.win()?.toggleMaximize() ?? false)
  ipcMain.handle('window:is-maximized', () => svc.win()?.isMaximized() ?? false)
  ipcMain.on('window:close', () => svc.win()?.close())
  ipcMain.handle('window:always-on-top', (_e, v: boolean) => {
    svc.win()?.setAlwaysOnTop(v)
    svc.settings.update({ alwaysOnTop: v })
    return v
  })

  // ---------- app ----------
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    userDataPath: app.getPath('userData')
  }))
  ipcMain.on('app:quit', () => {
    app.quit()
  })

  // ---------- dialogs ----------
  ipcMain.handle('dialog:select-folders', async () => {
    const w = win()
    const opts: Electron.OpenDialogOptions = {
      title: '选择音乐文件夹',
      properties: ['openDirectory', 'multiSelections']
    }
    const res = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts)
    return res.canceled ? [] : res.filePaths
  })
  ipcMain.handle('dialog:select-files', async () => {
    const w = win()
    const opts: Electron.OpenDialogOptions = {
      title: '选择音频文件',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: '音频文件',
          extensions: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ape', 'ogg', 'opus']
        },
        { name: '所有文件', extensions: ['*'] }
      ]
    }
    const res = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts)
    return res.canceled ? [] : res.filePaths
  })

  // ---------- library ----------
  ipcMain.handle('library:get', () => ({
    tracks: svc.library.all(),
    stats: svc.library.stats()
  }))
  ipcMain.handle('library:scan', async (e, roots: string[]): Promise<ScanResult> => {
    scanCancelled = { flag: false }
    const sender = e.sender
    const result = await svc.library.scanRoots(
      roots,
      (p: ScanProgress) => {
        if (!sender.isDestroyed()) sender.send('library:scan-progress', p)
      },
      scanCancelled
    )
    // Files added by THIS scan must be servable immediately. The media:// roots
    // are derived from library.json when the first request comes in, so without
    // a refresh a newly scanned directory answers 403 (「无法播放」) for every
    // directly-playable format until the app is restarted.
    //
    // The library persists on a 400 ms debounce, so flush FIRST: refreshing
    // before the write lands would re-read a library.json that does not yet
    // contain the tracks we just scanned, and the refresh would be a no-op.
    await svc.library.flush()
    await refreshMediaRoots()
    // the mini window mirrors the library (search suggestions, counts)
    forwardToMini('library:changed', null)
    return result
  })
  ipcMain.on('library:scan-cancel', () => {
    scanCancelled.flag = true
  })
  ipcMain.handle('library:remove', (_e, ids: string[]) => {
    svc.library.remove(ids)
    // the mini window mirrors the library (search suggestions, counts)
    forwardToMini('library:changed', null)
    return ids.length
  })
  ipcMain.handle('library:drop-missing', async () => svc.library.dropMissing())
  ipcMain.handle('library:get-track', (_e, id: string): Track | undefined => svc.library.get(id))
  ipcMain.handle('shell:show-item', (_e, path: string) => {
    shell.showItemInFolder(path)
    return true
  })

  // ---------- decode ----------
  ipcMain.handle('decode:ensure', (_e, path: string) => ensurePlayable(path))

  // ---------- logging ----------
  ipcMain.on('log:renderer', (_e, p: { level: string; msg: string }) => {
    log(
      p?.level === 'error' ? 'error' : p?.level === 'warn' ? 'warn' : 'info',
      '[renderer] ' + (p?.msg ?? '')
    )
  })
  ipcMain.handle('app:open-log-dir', () => shell.openPath(logDir()))

  // ---------- waveform ----------
  ipcMain.handle(
    'waveform:get',
    (_e, input: { path: string; mtime: number; size: number; duration: number }) =>
      getWaveform(input)
  )

  // ---------- settings ----------
  ipcMain.handle('settings:get', () => svc.settings.getPublic())
  ipcMain.handle('settings:update-general', (_e, partial) => svc.settings.update(partial))
  ipcMain.handle('settings:set-api', (_e, input) => svc.settings.setApi(input))
  ipcMain.handle('settings:test-api', (): Promise<ApiTestResult> => svc.settings.test())

  // ---------- playlists ----------
  ipcMain.handle('playlist:load', () => svc.playlists.get())
  ipcMain.handle('playlist:save', async (_e, playlists: Playlist[]) => {
    svc.playlists.set({ playlists })
    await svc.playlists.flush()
    return true
  })

  // ---------- chat history ----------
  ipcMain.handle('chat:load', () => svc.chat.get())
  ipcMain.handle('chat:save', async (_e, messages: ChatMessage[]) => {
    svc.chat.set({ messages })
    await svc.chat.flush()
    return true
  })

  // ---------- AI completion (streaming) ----------
  ipcMain.handle(
    'chat:complete',
    async (e, payload: ChatStartPayload): Promise<ChatDonePayload> => {
      const cfg = svc.settings.getApiConfig()
      if (!cfg.baseURL.trim())
        throw new Error('尚未配置 AI 接口地址，请先在「设置 → AI 配置」中填写')
      if (!cfg.model.trim()) throw new Error('尚未配置模型名称，请先在「设置 → AI 配置」中填写')
      if (!cfg.apiKey) throw new Error('尚未配置 API Key，请先在「设置 → AI 配置」中填写')

      const abort = new AbortController()
      aborters.set(payload.id, abort)
      try {
        const completed = await chatComplete(
          cfg,
          payload.messages,
          payload.tools,
          (delta) => {
            if (!e.sender.isDestroyed()) e.sender.send('chat:chunk', { id: payload.id, delta })
          },
          abort.signal
        )
        return {
          id: payload.id,
          finishReason: completed.finishReason,
          toolCalls: completed.toolCalls
        }
      } finally {
        aborters.delete(payload.id)
      }
    }
  )
  ipcMain.on('chat:abort', (_e, id: string) => {
    aborters.get(id)?.abort()
    aborters.delete(id)
  })

  // ---------- lyrics ----------
  ipcMain.handle('lyrics:get', (_e, input: { path: string; mtime: number; size: number }) =>
    getLyrics(input)
  )

  // ---------- player state ----------
  ipcMain.on('player:state', (_e, state: PlayerState) => {
    const label =
      state.isPlaying && state.title
        ? `正在播放: ${state.title} — ${state.artist}`
        : 'NEBULA Player'
    updateTrayTitle(label)
    // Windows taskbar progress
    const w = svc.win()?.win
    if (w) {
      try {
        if (
          state.duration > 0 &&
          state.currentTime >= 0 &&
          (state.isPlaying || state.currentTime > 0)
        ) {
          const frac = Math.min(1, Math.max(0, state.currentTime / state.duration))
          w.setProgressBar(frac, { mode: state.isPlaying ? 'normal' : 'paused' })
        } else {
          w.setProgressBar(-1) // remove
        }
      } catch {
        // taskbar progress is best-effort
      }
    }
    // floating lyric window state
    forwardToMini('mini:state', { state, track: svc.library.get(state.trackId ?? '') ?? null })
  })

  // ---------- mini window ----------
  ipcMain.handle('mini:toggle', () => toggleMiniWindow())
  ipcMain.on('mini:close', () => closeMiniWindow())
  ipcMain.on('mini:cmd', (_e, cmd: PlayerCommand) => svc.onPlayerCommand(cmd))
  // The mini window is a separate renderer: it asks the main process to resize
  // it, and *proxies* play / chat intents to the main window, which owns the
  // player store and the chat run. Nothing here duplicates that state.
  ipcMain.handle('mini:expand', (_e, v: boolean) => setMiniExpanded(!!v))
  ipcMain.on('mini:play', (_e, p: MiniPlayPayload) => svc.win()?.send('mini:play', p))
  ipcMain.on('chat:proxy:cmd', (_e, p: ChatProxyCmd) => svc.win()?.send('chat:proxy:cmd', p))
  ipcMain.on('chat:proxy:state', (_e, s: ChatProxySnapshot) => forwardToMini('chat:proxy:state', s))

  // ---------- media keys ----------
  ipcMain.handle('settings:media-keys', (_e, enabled: boolean) => {
    registerMediaKeys(enabled, svc.onPlayerCommand)
    return enabled
  })

  // ---------- auto update ----------
  ipcMain.handle('update:check', () => checkUpdate(svc.settings.getPublic().general.updateURL))
  ipcMain.handle('update:download', () => downloadUpdate())
  ipcMain.on('update:install', () => installUpdate())
}

export function registerMediaKeys(enabled: boolean, onCommand: (cmd: PlayerCommand) => void): void {
  globalShortcut.unregisterAll()
  if (!enabled) return
  globalShortcut.register('MediaPlayPause', () => onCommand('toggle'))
  globalShortcut.register('MediaNextTrack', () => onCommand('next'))
  globalShortcut.register('MediaPreviousTrack', () => onCommand('prev'))
  globalShortcut.register('MediaStop', () => onCommand('stop'))
}

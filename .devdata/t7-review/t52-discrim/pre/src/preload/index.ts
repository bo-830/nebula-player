import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  ApiTestResult,
  AppInfo,
  ChatChunkPayload,
  ChatDonePayload,
  ChatMessage,
  ChatProxyCmd,
  ChatProxySnapshot,
  ChatStartPayload,
  LibraryStats,
  MiniPlayPayload,
  PlayerCommand,
  PlayerState,
  Playlist,
  ScanProgress,
  ScanResult,
  Settings,
  Track,
  UpdateStatus
} from '../shared/types'

function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  // window
  windowMinimize: (): void => ipcRenderer.send('window:minimize'),
  windowMaximizeToggle: (): Promise<boolean> => ipcRenderer.invoke('window:maximize-toggle'),
  windowIsMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
  windowClose: (): void => ipcRenderer.send('window:close'),
  windowSetAlwaysOnTop: (v: boolean): Promise<boolean> =>
    ipcRenderer.invoke('window:always-on-top', v),
  onWindowMaximizeChange: (cb: (max: boolean) => void): (() => void) =>
    on('window:maximize-change', cb),

  // app
  appInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:info'),
  appQuit: (): void => ipcRenderer.send('app:quit'),

  // dialogs
  selectFolders: (): Promise<string[]> => ipcRenderer.invoke('dialog:select-folders'),
  selectFiles: (): Promise<string[]> => ipcRenderer.invoke('dialog:select-files'),
  /** resolve the filesystem path of a dropped File (drag & drop) */
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),

  // library
  libraryGet: (): Promise<{ tracks: Track[]; stats: LibraryStats }> =>
    ipcRenderer.invoke('library:get'),
  libraryScan: (roots: string[]): Promise<ScanResult> => ipcRenderer.invoke('library:scan', roots),
  libraryScanCancel: (): void => ipcRenderer.send('library:scan-cancel'),
  libraryRemove: (ids: string[]): Promise<number> => ipcRenderer.invoke('library:remove', ids),
  libraryDropMissing: (): Promise<number> => ipcRenderer.invoke('library:drop-missing'),
  libraryGetTrack: (id: string): Promise<Track | undefined> =>
    ipcRenderer.invoke('library:get-track', id),
  showItemInFolder: (path: string): Promise<boolean> => ipcRenderer.invoke('shell:show-item', path),
  onLibraryScanProgress: (cb: (p: ScanProgress) => void): (() => void) =>
    on('library:scan-progress', cb),

  // decode
  decodeEnsure: (path: string): Promise<string> => ipcRenderer.invoke('decode:ensure', path),
  waveformGet: (input: {
    path: string
    mtime: number
    size: number
    duration: number
  }): Promise<number[]> => ipcRenderer.invoke('waveform:get', input),
  lyricsGet: (input: {
    path: string
    mtime: number
    size: number
  }): Promise<{
    lines: Array<{ t: number; text: string }>
    source: 'lrc' | 'embedded' | 'none'
  }> => ipcRenderer.invoke('lyrics:get', input),

  // logging
  rendererLog: (level: 'info' | 'warn' | 'error', msg: string): void =>
    ipcRenderer.send('log:renderer', { level, msg }),
  openLogDir: (): Promise<string> => ipcRenderer.invoke('app:open-log-dir'),

  // settings
  settingsGet: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  settingsUpdateGeneral: (partial: Partial<Settings['general']>): Promise<Settings> =>
    ipcRenderer.invoke('settings:update-general', partial),
  settingsSetApi: (input: {
    baseURL?: string
    model?: string
    apiKey?: string
  }): Promise<Settings> => ipcRenderer.invoke('settings:set-api', input),
  settingsTestApi: (): Promise<ApiTestResult> => ipcRenderer.invoke('settings:test-api'),
  settingsMediaKeys: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke('settings:media-keys', enabled),

  // auto update
  updateCheck: (): Promise<UpdateStatus> => ipcRenderer.invoke('update:check'),
  updateDownload: (): Promise<UpdateStatus> => ipcRenderer.invoke('update:download'),
  updateInstall: (): void => ipcRenderer.send('update:install'),
  onUpdateStatus: (cb: (s: UpdateStatus) => void): (() => void) => on('update:status', cb),

  // playlists
  playlistLoad: (): Promise<{ playlists: Playlist[] }> => ipcRenderer.invoke('playlist:load'),
  playlistSave: (playlists: Playlist[]): Promise<boolean> =>
    ipcRenderer.invoke('playlist:save', playlists),

  // chat history
  chatLoad: (): Promise<{ messages: ChatMessage[] }> => ipcRenderer.invoke('chat:load'),
  chatSave: (messages: ChatMessage[]): Promise<boolean> =>
    ipcRenderer.invoke('chat:save', messages),

  // AI completion
  chatComplete: (payload: ChatStartPayload): Promise<ChatDonePayload> =>
    ipcRenderer.invoke('chat:complete', payload),
  chatAbort: (id: string): void => ipcRenderer.send('chat:abort', id),
  onChatChunk: (cb: (p: ChatChunkPayload) => void): (() => void) => on('chat:chunk', cb),

  // player
  playerPushState: (state: PlayerState): void => ipcRenderer.send('player:state', state),
  onPlayerCommand: (cb: (cmd: PlayerCommand) => void): (() => void) => on('player:command', cb),

  // mini floating-lyric window
  miniToggle: (): Promise<boolean> => ipcRenderer.invoke('mini:toggle'),
  miniClose: (): void => ipcRenderer.send('mini:close'),
  miniCommand: (cmd: PlayerCommand): void => ipcRenderer.send('mini:cmd', cmd),
  onMiniState: (cb: (p: { state: PlayerState; track: Track | null }) => void): (() => void) =>
    on('mini:state', cb),
  /** ask the main process to resize the floating bar; returns the applied size */
  miniSetExpanded: (v: boolean): Promise<{ width: number; height: number }> =>
    ipcRenderer.invoke('mini:expand', v),
  /** proxy a play intent to the main window, which owns the player store */
  miniPlay: (p: MiniPlayPayload): void => ipcRenderer.send('mini:play', p),
  /** proxy a chat command to the main window, which owns the chat run */
  chatProxyCmd: (c: ChatProxyCmd): void => ipcRenderer.send('chat:proxy:cmd', c),
  /** publish the chat run snapshot for the mini window to mirror */
  chatProxyState: (s: ChatProxySnapshot): void => ipcRenderer.send('chat:proxy:state', s),
  onChatProxyState: (cb: (s: ChatProxySnapshot) => void): (() => void) =>
    on('chat:proxy:state', cb),
  onChatProxyCmd: (cb: (c: ChatProxyCmd) => void): (() => void) => on('chat:proxy:cmd', cb),
  onMiniPlay: (cb: (p: MiniPlayPayload) => void): (() => void) => on('mini:play', cb),
  onLibraryChanged: (cb: () => void): (() => void) => on('library:changed', cb),
  onMiniExpanded: (cb: (v: boolean) => void): (() => void) => on('mini:expanded', cb),

  /** dev-only: dump chrome://media-internals (audio debugging) */
  mediaInternals: (): Promise<string> => ipcRenderer.invoke('dev:media-internals')
}

export type Api = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
}

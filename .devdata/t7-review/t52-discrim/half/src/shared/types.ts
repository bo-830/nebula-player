/**
 * Shared types used across main / preload / renderer.
 */

export type TrackMap = Record<string, Track>

export interface Track {
  /** sha1 of absolute path */
  id: string
  /** absolute file path */
  path: string
  ext: string
  title: string
  artist: string
  album: string
  /** duration in seconds */
  duration: number
  /** absolute path of extracted cover image, or null */
  coverPath: string | null
  genre: string
  year: number | null
  trackNo: number | null
  /** absolute path of the scanned root folder this track belongs to */
  folderId: string
  /** display name of the scanned root folder */
  folderName: string
  size: number
  mtime: number
  missing?: boolean
  /** first-import timestamp (ms) — used by 最近添加 */
  addedAt?: number
}

export interface ScanProgress {
  current: number
  total: number
  file: string
}

export interface ScanResult {
  added: number
  updated: number
  skipped: number
  missing: number
  cancelled: boolean
}

export interface Playlist {
  id: string
  name: string
  builtin?: 'favorites'
  trackIds: string[]
  order: number
  updatedAt: number
  createdAt: number
}

export type PlayMode = 'list' | 'one' | 'shuffle'

export interface PlayerState {
  trackId: string | null
  isPlaying: boolean
  volume: number
  mode: PlayMode
  currentTime: number
  duration: number
  title: string
  artist: string
}

export interface ApiConfig {
  /** OpenAI compatible base url, e.g. https://api.openai.com/v1 */
  baseURL: string
  model: string
  /** plaintext only in memory; encrypted at rest through safeStorage */
  apiKey: string
}

export interface Settings {
  api: {
    baseURL: string
    model: string
    /** 'enc' — encrypted blob stored; 'plain' — fallback plaintext; '' — not set */
    keyMode: 'enc' | 'plain' | ''
    hasKey: boolean
  }
  general: {
    closeToTray: boolean
    alwaysOnTop: boolean
    resumeOnLaunch: boolean
    mediaKeys: boolean
    scanFolders: string[]
    /** generic HTTP update feed URL (hosts latest.yml + installers) */
    updateURL: string
  }
}

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'not-configured' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'none' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string }

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** chip shown for tool execution results */
  chips?: string[]
  ts: number
}

export interface ChatSettings {
  messages: ChatMessage[]
}

/** A single tool-call result produced by the renderer tool registry. */
export interface ToolResult {
  /** text fed back to the model */
  content: string
  /** short chip shown in the UI, optional */
  chip?: string
  ok: boolean
  /**
   * destructive tool paused by the confirmation guard — the UI must ask the
   * user before anything is executed
   */
  needsConfirm?: boolean
  /** human-readable summary of the pending operation (shown in the confirm bar) */
  confirmSummary?: string
  /** token required to execute this exact call once the user approves it */
  confirmToken?: string
}

/** OpenAI wire-format tool call (used both for tool_calls and assistant replay). */
export interface LLMToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

/** legacy flat alias used by the tool registry (name/arguments at top level) */
export interface ToolCall {
  id: string
  name: string
  arguments: string
}

export interface LLMTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_call_id?: string
  tool_calls?: LLMToolCall[]
}

export interface ChatStartPayload {
  /** unique conversation id, events are routed by it */
  id: string
  messages: LLMMessage[]
  tools: LLMTool[]
}

export interface ChatDonePayload {
  id: string
  finishReason: string | null
  toolCalls: LLMToolCall[]
}

export interface ChatErrorPayload {
  id: string
  message: string
}

export interface ChatChunkPayload {
  id: string
  delta: string
}

/**
 * A play request raised from the mini window (clicking a search result there).
 * The mini window is a separate renderer, so it names the tracks by id and lets
 * the main window — which owns the player store — resolve and start them.
 */
export interface MiniPlayPayload {
  ids: string[]
  index: number
}

/**
 * Commands the mini window's chat pane proxies to the main window's chat store.
 * Declared as a discriminated union so both sides switch exhaustively.
 */
export type ChatProxyCmd =
  | { kind: 'send'; text: string }
  | { kind: 'confirm' }
  | { kind: 'cancel' }
  | { kind: 'abort' }
  | { kind: 'clear' }

/**
 * Read-only mirror of the chat run, pushed from the main window into the mini
 * window so the floating pane can render it without owning any chat state.
 */
export interface ChatProxySnapshot {
  bubbles: ChatMessage[]
  chips: string[]
  streamRaw: string
  streamShown: number
  busy: boolean
  pendingConfirm: { summary: string } | null
}

export interface ApiTestResult {
  ok: boolean
  message: string
  /** available model ids advertised by the endpoint (when discoverable) */
  models?: string[]
}

export interface LibraryStats {
  total: number
  artists: number
  albums: number
  folders: number
  totalDuration: number
}

export type PlayerCommand = 'toggle' | 'next' | 'prev' | 'stop'

export interface AppInfo {
  version: string
  platform: NodeJS.Platform
  userDataPath: string
}

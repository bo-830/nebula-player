export type {
  ApiConfig,
  ApiTestResult,
  AppInfo,
  ChatMessage,
  LibraryStats,
  PlayerCommand,
  PlayerState,
  Playlist,
  PlayMode,
  ScanProgress,
  ScanResult,
  Settings,
  Track,
  TrackMap
} from '../../shared/types'

export type View =
  | { type: 'all' }
  | { type: 'search'; text?: string; artist?: string; album?: string; genre?: string }
  | { type: 'artists' }
  | { type: 'albums' }
  | { type: 'folders' }
  | { type: 'artist'; artist: string }
  | { type: 'album'; key: string }
  | { type: 'folder'; folderId: string }
  | { type: 'playlist'; id: string }
  | { type: 'recent-added' }
  | { type: 'recently-played' }
  | { type: 'most-played' }
  | { type: 'for-you' }

export function sameView(a: View, b: View): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

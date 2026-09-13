import { useMemo, useState } from 'react'
import { FolderPlus, Play, RefreshCw, X, Pencil, Trash2, Rss } from 'lucide-react'
import { useUiStore } from '../stores/uiStore'
import { useLibraryStore } from '../stores/libraryStore'
import { usePlaylistStore } from '../stores/playlistStore'
import { usePlayerStore } from '../stores/playerStore'
import { getPlayStats } from '../lib/playStats'
import { recommendTracks } from '../lib/recommend'
import {
  groupAlbums,
  groupArtists,
  groupFolders,
  searchTracks,
  sortTracks,
  type SortKey
} from '../lib/search'
import { formatDuration } from '../lib/format'
import { TrackList } from './TrackList'
import { NowPlaying } from './NowPlaying'
import { Cover } from './Cover'
import type { Track, View } from '../types'

export function MainView(): React.JSX.Element {
  const view = useUiStore((s) => s.view)
  const tracks = useLibraryStore((s) => s.tracks)
  const scanning = useLibraryStore((s) => s.scanning)
  const scanProgress = useLibraryStore((s) => s.scanProgress)

  const sortKey = useUiStore((s) => s.sortKey)
  const shown = useMemo(
    () => sortTracks(resolveTracks(view, tracks), sortKey),
    [view, tracks, sortKey]
  )
  const reasons = useMemo(() => {
    if (view.type !== 'for-you') return null
    const map: Record<string, string> = {}
    for (const r of recommendTracks(tracks, getPlayStats(), 30)) map[r.track.id] = r.reason
    return map
  }, [view, tracks])

  const title =
    view.type === 'all'
      ? '全部歌曲'
      : view.type === 'search'
        ? '搜索结果'
        : view.type === 'artists'
          ? '歌手'
          : view.type === 'albums'
            ? '专辑'
            : view.type === 'folders'
              ? '本地文件夹'
              : view.type === 'artist'
                ? view.artist
                : view.type === 'album'
                  ? (view.key.split('\u0000')[1] ?? '专辑')
                  : view.type === 'folder'
                    ? (view.folderId.split(/[\\/]/).pop() ?? '文件夹')
                    : view.type === 'recent-added'
                      ? '最近添加'
                      : view.type === 'recently-played'
                        ? '最近播放'
                        : view.type === 'most-played'
                          ? '常听'
                          : view.type === 'for-you'
                            ? '为你推荐'
                            : '歌单'

  const sub =
    view.type === 'all' || view.type === 'search'
      ? [
          view.type === 'search' && view.artist ? `歌手：${view.artist}` : '',
          view.type === 'search' && view.album ? `专辑：${view.album}` : '',
          view.type === 'search' && view.genre ? `曲风：${view.genre}` : ''
        ]
          .filter(Boolean)
          .concat(
            `${shown.length} 首 · ${formatDuration(shown.reduce((s, t) => s + t.duration, 0))}`
          )
          .join(' · ')
      : view.type === 'playlist'
        ? `${shown.length} 首`
        : view.type === 'artist'
          ? `${shown.length} 首歌曲`
          : view.type === 'album'
            ? `${shown.length} 首歌曲`
            : view.type === 'folder'
              ? `${shown.length} 首歌曲`
              : view.type === 'recent-added'
                ? '按导入时间 · 最近 50 首'
                : view.type === 'recently-played'
                  ? '按播放时间 · 最近 30 首'
                  : view.type === 'most-played'
                    ? '按播放次数 · 最多 30 首'
                    : view.type === 'for-you'
                      ? '基于你的常听歌手与曲风 · 本地计算，离线可用'
                      : ''

  return (
    <div className="mv">
      <div className="mv-list">
        <div className="mv-header">
          <div>
            <div className="mv-title">{title}</div>
            {sub && <div className="mv-sub">{sub}</div>}
          </div>
          <div className="mv-actions">
            {view.type === 'all' && <ScanButton />}
            {isTrackView(view) && (
              <select
                className="sort-select"
                value={sortKey}
                onChange={(e) => useUiStore.getState().setSortKey(e.target.value as SortKey)}
              >
                <option value="default">默认排序</option>
                <option value="title">按歌名</option>
                <option value="artist">按歌手</option>
                <option value="album">按专辑</option>
                <option value="duration">按时长</option>
                <option value="addedAt">按添加时间</option>
              </select>
            )}
            {shown.length > 0 && (
              <button
                className="btn"
                onClick={() => void usePlayerStore.getState().playTracks(shown, 0)}
              >
                <Play size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
                全部播放
              </button>
            )}
            {view.type === 'playlist' && <PlaylistActions view={view} shown={shown} />}
            {scanning && (
              <span className="mv-sub">
                <RefreshCw size={12} className="muted-spin" style={{ verticalAlign: '-2px' }} />
                扫描中 {scanProgress ? `${scanProgress.current}/${scanProgress.total}` : ''}
              </span>
            )}
          </div>
        </div>

        {view.type === 'artists' ? (
          <ArtistGrid tracks={tracks} />
        ) : view.type === 'albums' ? (
          <AlbumGrid tracks={tracks} />
        ) : view.type === 'folders' ? (
          <FolderGrid tracks={tracks} />
        ) : (
          <TrackList
            tracks={shown}
            reasonFor={reasons ? (t) => reasons[t.id] : undefined}
            emptyTitle={
              view.type === 'search'
                ? '没有匹配的歌曲'
                : view.type === 'playlist'
                  ? '歌单还是空的'
                  : tracks.length > 0
                    ? '没有匹配的歌曲'
                    : '曲库还是空的'
            }
            emptySub={
              view.type === 'playlist'
                ? '右键歌曲 →「添加到歌单」，或把歌曲直接拖到左侧歌单'
                : tracks.length > 0
                  ? '换个关键词试试，或扫描更多文件夹'
                  : '选择本地音乐文件夹，开始构建你的曲库'
            }
            emptyAction={
              tracks.length === 0 && view.type !== 'playlist' ? <ScanButton big /> : undefined
            }
          />
        )}
      </div>
      <NowPlaying />
    </div>
  )
}

function resolveTracks(view: View, tracks: Track[]): Track[] {
  switch (view.type) {
    case 'all':
      return tracks
    case 'search':
      return searchTracks(tracks, {
        text: view.text ?? useUiStore.getState().globalSearch,
        artist: view.artist,
        album: view.album,
        genre: view.genre
      })
    case 'artist':
      return tracks.filter((t) => t.artist.toLowerCase() === view.artist.toLowerCase())
    case 'album': {
      const [artist, album] = view.key.split('\u0000')
      return tracks.filter(
        (t) => t.artist.toLowerCase() === artist && t.album.toLowerCase() === album
      )
    }
    case 'folder':
      return tracks.filter((t) => t.folderId === view.folderId)
    case 'playlist': {
      const p = usePlaylistStore.getState().playlists.find((x) => x.id === view.id)
      if (!p) return []
      const map = useLibraryStore.getState().map
      return p.trackIds.map((id) => map[id]).filter((t): t is Track => Boolean(t))
    }
    case 'recent-added':
      return [...tracks]
        .filter((t) => !t.missing)
        .sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
        .slice(0, 50)
    case 'recently-played':
    case 'most-played': {
      const stats = getPlayStats()
      const played = tracks
        .filter((t) => !t.missing && stats[t.id])
        .map((t) => ({ t, stat: stats[t.id] }))
      played.sort((a, b) =>
        view.type === 'recently-played' ? b.stat.last - a.stat.last : b.stat.count - a.stat.count
      )
      return played.slice(0, 30).map((x) => x.t)
    }
    case 'for-you':
      return recommendTracks(tracks, getPlayStats(), 30).map((r) => r.track)
    default:
      return []
  }
}

function isTrackView(view: View): boolean {
  return [
    'all',
    'search',
    'artist',
    'album',
    'folder',
    'playlist',
    'recent-added',
    'recently-played',
    'most-played'
  ].includes(view.type)
}

function ScanButton({ big }: { big?: boolean }): React.JSX.Element {
  const scanning = useLibraryStore((s) => s.scanning)
  const scanProgress = useLibraryStore((s) => s.scanProgress)

  const start = async (): Promise<void> => {
    const folders = await window.api.selectFolders()
    if (folders.length === 0) return
    await useLibraryStore.getState().scan(folders)
  }

  return (
    <button
      className={big ? 'btn primary' : 'btn'}
      onClick={() => void start()}
      disabled={scanning}
    >
      <FolderPlus size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
      {scanning
        ? `扫描中 ${scanProgress ? Math.round((scanProgress.current / Math.max(1, scanProgress.total)) * 100) : 0}%`
        : big
          ? '扫描音乐文件夹'
          : '添加音乐'}
    </button>
  )
}

function ArtistGrid({ tracks }: { tracks: Track[] }): React.JSX.Element {
  const navTo = useUiStore((s) => s.navTo)
  const artists = groupArtists(tracks)
  return (
    <div className="grid">
      <div className="card-grid">
        {artists.map((a) => (
          <div
            key={a.name}
            className="card"
            onClick={() => navTo({ type: 'artist', artist: a.name })}
          >
            <div className="card-cover artist-main">
              <Cover src={a.covers[0] ?? null} alt={a.name} />
              {a.covers.length > 1 && (
                <div className="artist-badges">
                  {a.covers.slice(1, 3).map((c, i) => (
                    <span key={`${c}-${i}`} className="artist-mini">
                      <Cover src={c} alt={`${a.name} ${i + 2}`} />
                    </span>
                  ))}
                  {a.covers.length > 3 && (
                    <span className="artist-more">+{a.covers.length - 3}</span>
                  )}
                </div>
              )}
            </div>
            <div className="card-body">
              <div className="card-title">{a.name}</div>
              <div className="card-sub">{a.count} 首歌曲</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AlbumGrid({ tracks }: { tracks: Track[] }): React.JSX.Element {
  const navTo = useUiStore((s) => s.navTo)
  const albums = groupAlbums(tracks)
  return (
    <div className="grid">
      <div className="card-grid">
        {albums.map((a) => (
          <div key={a.key} className="card" onClick={() => navTo({ type: 'album', key: a.key })}>
            <div className="card-cover">
              <Cover src={a.cover} alt={a.album} />
            </div>
            <div className="card-body">
              <div className="card-title">{a.album}</div>
              <div className="card-sub">
                {a.artist} · {a.count} 首
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FolderGrid({ tracks }: { tracks: Track[] }): React.JSX.Element {
  const navTo = useUiStore((s) => s.navTo)
  const folders = groupFolders(tracks)
  if (folders.length === 0) {
    return (
      <div className="empty">
        <div className="empty-inner">
          <div className="empty-icon">
            <Rss size={26} />
          </div>
          <div className="empty-title">还没有导入任何文件夹</div>
          <div className="empty-sub">点击右上角「添加音乐」扫描本地文件夹</div>
        </div>
      </div>
    )
  }
  return (
    <div className="grid">
      <div className="card-grid">
        {folders.map((f) => (
          <div
            key={f.folderId}
            className="card"
            onClick={() => navTo({ type: 'folder', folderId: f.folderId })}
          >
            <div className="card-cover">
              <Cover src={null} alt={f.folderName} />
            </div>
            <div className="card-body">
              <div className="card-title">{f.folderName}</div>
              <div className="card-sub">{f.count} 首歌曲</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PlaylistActions({
  view,
  shown
}: {
  view: Extract<View, { type: 'playlist' }>
  shown: Track[]
}): React.JSX.Element | null {
  const playlists = usePlaylistStore((s) => s.playlists)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  // Every hook must be called unconditionally before the early return below:
  // when the playlist disappears this component renders `null`, and a hook
  // called after that return changes hook order between renders.
  const toast = useUiStore((s) => s.toast)
  const p = playlists.find((x) => x.id === view.id)
  if (!p) return null

  if (p.builtin) {
    return (
      <button
        className="btn"
        onClick={() => {
          usePlaylistStore.getState().removeTracks(p.id, p.trackIds)
          toast('已清空收藏', 'info')
        }}
      >
        <X size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
        清空
      </button>
    )
  }

  return (
    <>
      {renaming && (
        <div className="overlay" onClick={() => setRenaming(false)}>
          <div className="modal" style={{ width: 360 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">重命名歌单</div>
            </div>
            <div className="modal-body">
              <input
                className="form-input"
                value={renameValue}
                autoFocus
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    usePlaylistStore.getState().rename(p.id, renameValue)
                    setRenaming(false)
                    toast('歌单已重命名', 'success')
                  }
                  if (e.key === 'Escape') setRenaming(false)
                }}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
                <button className="btn" onClick={() => setRenaming(false)}>
                  取消
                </button>
                <button
                  className="btn primary"
                  onClick={() => {
                    usePlaylistStore.getState().rename(p.id, renameValue)
                    setRenaming(false)
                    toast('歌单已重命名', 'success')
                  }}
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <button
        className="btn"
        onClick={() => {
          setRenameValue(p.name)
          setRenaming(true)
        }}
      >
        <Pencil size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
        重命名
      </button>
      <button
        className="btn danger"
        onClick={() => {
          usePlaylistStore.getState().remove(p.id)
          useUiStore.getState().navTo({ type: 'all' })
          toast(`歌单「${p.name}」已删除`, 'info')
        }}
      >
        <Trash2 size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
        删除歌单
      </button>
      {shown.length > 0 && (
        <button className="btn" onClick={() => void usePlayerStore.getState().playTracks(shown, 0)}>
          <Play size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
          播放
        </button>
      )}
    </>
  )
}

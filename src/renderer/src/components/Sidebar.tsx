import { useRef, useState } from 'react'
import {
  ListMusic,
  Library,
  Users,
  Disc3,
  FolderOpen,
  Heart,
  Plus,
  Link2,
  Clock,
  History,
  Flame,
  Sparkles
} from 'lucide-react'
import { useUiStore } from '../stores/uiStore'
import { useLibraryStore } from '../stores/libraryStore'
import { usePlaylistStore } from '../stores/playlistStore'
import type { View } from '../types'

export function Sidebar(): React.JSX.Element {
  const view = useUiStore((s) => s.view)
  const navTo = useUiStore((s) => s.navTo)
  const tracks = useLibraryStore((s) => s.tracks)
  const playlists = usePlaylistStore((s) => s.playlists)
  const [naming, setNaming] = useState(false)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const namingCancel = useRef(false)

  const is = (v: View): boolean => JSON.stringify(view) === JSON.stringify(v)

  const commitName = (name: string): void => {
    setNaming(false)
    const trimmed = name.trim()
    if (trimmed) {
      const p = usePlaylistStore.getState().create(trimmed)
      navTo({ type: 'playlist', id: p.id })
    }
  }

  /** drop target for track rows dragged from the list */
  const dropHandlers = (playlistId: string): React.HTMLAttributes<HTMLButtonElement> => ({
    onDragOver: (e) => {
      if (e.dataTransfer.types.includes('text/plain')) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setDropTarget(playlistId)
      }
    },
    onDragLeave: () => setDropTarget(null),
    onDrop: (e) => {
      e.preventDefault()
      setDropTarget(null)
      const raw = e.dataTransfer.getData('text/plain')
      let ids: string[] = []
      try {
        ids = JSON.parse(raw)
      } catch {
        ids = raw ? [raw] : []
      }
      if (ids.length === 0) return
      const pl = usePlaylistStore.getState()
      const added = pl.addTracks(playlistId, ids)
      const name = pl.playlists.find((p) => p.id === playlistId)?.name ?? '歌单'
      useUiStore
        .getState()
        .toast(
          added > 0 ? `已添加 ${added} 首到「${name}」` : '歌曲已在歌单中',
          added > 0 ? 'success' : 'info'
        )
    }
  })

  const fav = playlists.find((p) => p.builtin === 'favorites')
  const regular = playlists.filter((p) => !p.builtin)

  return (
    <aside className="sb">
      <div className="sb-group-label">音乐库</div>
      <button
        className={`sb-item ${is({ type: 'all' }) ? 'active' : ''}`}
        onClick={() => navTo({ type: 'all' })}
      >
        <Library size={15} />
        全部歌曲
        <span className="count">{tracks.length || ''}</span>
      </button>
      <button
        className={`sb-item ${is({ type: 'artists' }) ? 'active' : ''}`}
        onClick={() => navTo({ type: 'artists' })}
      >
        <Users size={15} />
        歌手
      </button>
      <button
        className={`sb-item ${is({ type: 'albums' }) ? 'active' : ''}`}
        onClick={() => navTo({ type: 'albums' })}
      >
        <Disc3 size={15} />
        专辑
      </button>
      <button
        className={`sb-item ${is({ type: 'folders' }) ? 'active' : ''}`}
        onClick={() => navTo({ type: 'folders' })}
      >
        <FolderOpen size={15} />
        本地文件夹
      </button>

      <div className="sb-group-label">智能列表</div>
      <button
        className={`sb-item ${is({ type: 'for-you' }) ? 'active' : ''}`}
        onClick={() => navTo({ type: 'for-you' })}
        title="根据你的常听歌手与曲风推荐"
      >
        <Sparkles size={15} style={{ color: 'var(--accent)' }} />
        为你推荐
      </button>
      <button
        className={`sb-item ${is({ type: 'recent-added' }) ? 'active' : ''}`}
        onClick={() => navTo({ type: 'recent-added' })}
      >
        <Clock size={15} />
        最近添加
      </button>
      <button
        className={`sb-item ${is({ type: 'recently-played' }) ? 'active' : ''}`}
        onClick={() => navTo({ type: 'recently-played' })}
      >
        <History size={15} />
        最近播放
      </button>
      <button
        className={`sb-item ${is({ type: 'most-played' }) ? 'active' : ''}`}
        onClick={() => navTo({ type: 'most-played' })}
      >
        <Flame size={15} style={{ color: '#ffb347' }} />
        常听
      </button>

      <div className="sb-group-label">我的歌单</div>
      {fav && (
        <button
          className={`sb-item ${is({ type: 'playlist', id: fav.id }) ? 'active' : ''} ${
            dropTarget === fav.id ? 'drop-target' : ''
          }`}
          onClick={() => navTo({ type: 'playlist', id: fav.id })}
          {...dropHandlers(fav.id)}
        >
          <Heart size={15} style={{ color: '#ff5f8a' }} />
          收藏
          <span className="count">{fav.trackIds.length || ''}</span>
        </button>
      )}
      {regular.map((p) => (
        <button
          key={p.id}
          className={`sb-item ${is({ type: 'playlist', id: p.id }) ? 'active' : ''} ${
            dropTarget === p.id ? 'drop-target' : ''
          }`}
          onClick={() => navTo({ type: 'playlist', id: p.id })}
          {...dropHandlers(p.id)}
        >
          <ListMusic size={15} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {p.name}
          </span>
          <span className="count">{p.trackIds.length || ''}</span>
        </button>
      ))}
      {naming ? (
        <input
          className="form-input"
          style={{ margin: '6px 10px 2px', fontSize: 12.5 }}
          placeholder="输入歌单名称，回车确认"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              namingCancel.current = true
              setNaming(false)
            }
          }}
          onBlur={(e) => {
            if (namingCancel.current) {
              namingCancel.current = false
              return
            }
            commitName(e.currentTarget.value)
          }}
        />
      ) : (
        <button className="sb-new" onClick={() => setNaming(true)}>
          <Plus size={13} />
          新建歌单
        </button>
      )}

      <div className="sb-group-label">快捷</div>
      <div
        className="sb-item"
        style={{ cursor: 'default' }}
        title="拖拽音频文件/文件夹到窗口导入；将歌曲拖到左侧歌单即可加入"
      >
        <Link2 size={15} />
        拖拽导入 / 加歌
        <span className="count">mp3 flac ape …</span>
      </div>
    </aside>
  )
}

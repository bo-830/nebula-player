import { useEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Heart, Play, Plus, Trash2, FolderOpen, ListPlus } from 'lucide-react'
import type { Track } from '../types'
import { formatTime } from '../lib/format'
import { Cover } from './Cover'
import { usePlayerStore } from '../stores/playerStore'
import { usePlaylistStore } from '../stores/playlistStore'
import { useLibraryStore } from '../stores/libraryStore'
import { useUiStore } from '../stores/uiStore'

interface TrackListProps {
  tracks: Track[]
  emptyTitle?: string
  emptySub?: string
  emptyAction?: React.JSX.Element
  /** optional per-track annotation (e.g. recommendation reason) */
  reasonFor?: (t: Track) => string | undefined
}

interface MenuState {
  x: number
  y: number
  trackId: string
}

export function TrackList({
  tracks,
  emptyTitle,
  emptySub,
  emptyAction,
  reasonFor
}: TrackListProps): React.JSX.Element {
  const parentRef = useRef<HTMLDivElement>(null)
  const currentId = usePlayerStore((s) => s.current?.id ?? null)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [picker, setPicker] = useState<{ ids: string[] } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null)

  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 14
  })

  // clear selection when the underlying list changes
  useEffect(() => {
    setSelected(new Set())
    setAnchorIndex(null)
  }, [tracks])

  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
    }
  }, [menu])

  const onRowClick = (e: React.MouseEvent, index: number, id: string): void => {
    if (e.shiftKey && anchorIndex !== null) {
      const a = Math.min(anchorIndex, index)
      const b = Math.max(anchorIndex, index)
      const s = new Set<string>()
      for (let i = a; i <= b; i++) s.add(tracks[i].id)
      setSelected(s)
    } else if (e.ctrlKey || e.metaKey) {
      setSelected((prev) => {
        const s = new Set(prev)
        if (s.has(id)) s.delete(id)
        else s.add(id)
        return s
      })
    } else {
      setSelected(new Set([id]))
    }
    setAnchorIndex(index)
  }

  const selectedArr = [...selected]
  const selectedTracks = tracks.filter((t) => selected.has(t.id))

  if (tracks.length === 0) {
    return (
      <div className="empty">
        <div className="empty-inner">
          <div className="empty-icon">
            <Play size={26} />
          </div>
          <div className="empty-title">{emptyTitle ?? '曲库还是空的'}</div>
          <div className="empty-sub">
            {emptySub ?? '扫描本地文件夹，或直接拖拽音频文件到窗口来导入' + ''}
          </div>
          {emptyAction}
        </div>
      </div>
    )
  }

  const menuTrack = menu ? tracks.find((t) => t.id === menu.trackId) : null

  return (
    <div className="tl">
      <div className="tl-header">
        <span>#</span>
        <span>标题</span>
        <span>歌手</span>
        <span>专辑</span>
        <span style={{ textAlign: 'right' }}>时长</span>
        <span />
      </div>
      {selected.size > 0 && (
        <div className="tl-selection-toolbar">
          <span className="tl-selected-count">已选 {selected.size} 首</span>
          <button
            className="btn"
            onClick={() => void usePlayerStore.getState().playTracks(selectedTracks, 0)}
          >
            <Play size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
            播放选中
          </button>
          <button className="btn" onClick={() => setPicker({ ids: selectedArr })}>
            <ListPlus size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
            加入歌单
          </button>
          <button
            className="btn"
            onClick={() => {
              const pl = usePlaylistStore.getState()
              for (const id of selectedArr) {
                if (!pl.isFavorite(id)) pl.toggleFavorite(id)
              }
              useUiStore.getState().toast(`已收藏 ${selected.size} 首`, 'success')
              setSelected(new Set())
            }}
          >
            <Heart size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
            收藏
          </button>
          <button className="btn" onClick={() => setSelected(new Set())}>
            清空选择
          </button>
        </div>
      )}
      <div className="tl-rows" ref={parentRef}>
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((v) => {
            const t = tracks[v.index]
            const isCurrent = t.id === currentId
            const isSelected = selected.has(t.id)
            return (
              <div
                key={t.id}
                className={`tl-row ${isCurrent ? 'current' : ''} ${t.missing ? 'missing' : ''} ${
                  isSelected ? 'selected' : ''
                }`}
                draggable={!t.missing}
                onDragStart={(e) => {
                  // drag carries the whole selection if this row is in it
                  const ids = isSelected && selected.size > 1 ? selectedArr : [t.id]
                  e.dataTransfer.setData('text/plain', JSON.stringify(ids))
                  e.dataTransfer.effectAllowed = 'copy'
                }}
                onClick={(e) => onRowClick(e, v.index, t.id)}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: v.size,
                  transform: `translateY(${v.start}px)`
                }}
                onDoubleClick={() => void usePlayerStore.getState().playTracks(tracks, v.index)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setMenu({ x: e.clientX, y: e.clientY, trackId: t.id })
                }}
              >
                <div className="tl-idx">
                  {isCurrent && isPlaying ? (
                    <span className="eq">
                      <span />
                      <span />
                      <span />
                    </span>
                  ) : (
                    v.index + 1
                  )}
                </div>
                <div className="tl-title-cell">
                  <div className="tl-cover">
                    <Cover src={t.coverPath} alt={t.title} />
                  </div>
                  <span className="tl-name">{t.title}</span>
                </div>
                <span className="tl-artist">{t.artist}</span>
                {reasonFor ? (
                  <span className="tl-reason">{reasonFor(t) ?? t.album}</span>
                ) : (
                  <span className="tl-album">{t.album}</span>
                )}
                <span className="tl-dur">{formatTime(t.duration)}</span>
                <FavoriteHeart trackId={t.id} />
              </div>
            )
          })}
        </div>
      </div>

      {menu && menuTrack && (
        <div className="ctx-menu" style={{ left: menu.x, top: menu.y }}>
          <button
            className="ctx-item"
            onClick={() => {
              // if the clicked row is in a multi-selection, play the selection
              const list = selected.has(menuTrack.id) && selected.size > 1 ? selectedTracks : tracks
              const idx = list.indexOf(menuTrack)
              void usePlayerStore.getState().playTracks(list, idx < 0 ? 0 : idx)
              setMenu(null)
            }}
          >
            <Play size={13} /> 播放
          </button>
          <button
            className="ctx-item"
            onClick={() => {
              const ids =
                selected.has(menuTrack.id) && selected.size > 1 ? selectedArr : [menuTrack.id]
              setPicker({ ids })
              setMenu(null)
            }}
          >
            <ListPlus size={13} />{' '}
            {selected.has(menuTrack.id) && selected.size > 1
              ? `添加到歌单（${selected.size} 首）`
              : '添加到歌单'}
          </button>
          <button
            className="ctx-item"
            onClick={() => {
              const pl = usePlaylistStore.getState()
              if (selected.has(menuTrack.id) && selected.size > 1) {
                for (const id of selectedArr) if (!pl.isFavorite(id)) pl.toggleFavorite(id)
              } else {
                pl.toggleFavorite(menuTrack.id)
              }
              setMenu(null)
            }}
          >
            <Heart size={13} /> 收藏 / 取消收藏
          </button>
          <button
            className="ctx-item"
            onClick={() => {
              void window.api.showItemInFolder(menuTrack.path)
              setMenu(null)
            }}
          >
            <FolderOpen size={13} /> 打开所在文件夹
          </button>
          <button
            className="ctx-item danger"
            onClick={() => {
              if (selected.has(menuTrack.id) && selected.size > 1) {
                void useLibraryStore.getState().remove(selectedArr)
                useUiStore
                  .getState()
                  .toast(`已从曲库移除 ${selected.size} 首（不删除源文件）`, 'info')
              } else {
                void useLibraryStore.getState().remove([menuTrack.id])
                useUiStore
                  .getState()
                  .toast(`已从曲库移除「${menuTrack.title}」（不删除源文件）`, 'info')
              }
              setSelected(new Set())
              setMenu(null)
            }}
          >
            <Trash2 size={13} /> 从曲库移除
          </button>
        </div>
      )}

      {picker && <PlaylistPicker ids={picker.ids} onClose={() => setPicker(null)} />}
    </div>
  )
}

function FavoriteHeart({ trackId }: { trackId: string }): React.JSX.Element {
  const fav = usePlaylistStore((s) =>
    s.playlists.find((p) => p.builtin === 'favorites')?.trackIds.includes(trackId)
  )
  return (
    <button
      className={`tl-heart ${fav ? 'on' : ''}`}
      title={fav ? '取消收藏' : '收藏'}
      onClick={(e) => {
        e.stopPropagation()
        usePlaylistStore.getState().toggleFavorite(trackId)
      }}
    >
      <Heart size={14} fill={fav ? 'currentColor' : 'none'} />
    </button>
  )
}

function PlaylistPicker({
  ids,
  onClose
}: {
  ids: string[]
  onClose: () => void
}): React.JSX.Element {
  const playlists = usePlaylistStore((s) => s.playlists)
  const [newName, setNewName] = useState('')
  const toast = useUiStore((s) => s.toast)

  const addTo = (playlistId: string): void => {
    const added = usePlaylistStore.getState().addTracks(playlistId, ids)
    const name = usePlaylistStore.getState().playlists.find((p) => p.id === playlistId)?.name
    toast(
      added > 0 ? `已添加 ${added} 首到「${name}」` : '歌曲已在歌单中',
      added > 0 ? 'success' : 'info'
    )
    onClose()
  }

  const createAndAdd = (): void => {
    const n = newName.trim()
    if (!n) return
    const p = usePlaylistStore.getState().create(n)
    usePlaylistStore.getState().addTracks(p.id, ids)
    toast(`已创建歌单「${n}」并添加 ${ids.length} 首`, 'success')
    onClose()
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ width: 380 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">添加到歌单</div>
        </div>
        <div className="modal-body" style={{ maxHeight: 320, overflowY: 'auto' }}>
          {playlists.map((p) => (
            <button
              key={p.id}
              className="ctx-item"
              style={{ padding: '9px 10px' }}
              onClick={() => addTo(p.id)}
            >
              {p.builtin ? (
                <Heart size={14} style={{ color: '#ff5f8a' }} />
              ) : (
                <ListPlus size={14} />
              )}
              <span style={{ flex: 1, textAlign: 'left' }}>{p.name}</span>
              <span className="count">{p.trackIds.length}</span>
            </button>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input
              className="form-input"
              placeholder="新建歌单并添加…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createAndAdd()}
              autoFocus
            />
            <button className="btn primary" onClick={createAndAdd}>
              <Plus size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

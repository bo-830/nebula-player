import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Search,
  X,
  Settings,
  Library,
  ListMusic,
  Pin,
  PinOff,
  Music2,
  Users,
  Disc3,
  Tag
} from 'lucide-react'
import { useUiStore, type SearchCriteria } from '../stores/uiStore'
import { useSettingsStore } from '../stores/settingsStore'
import { usePlaylistStore } from '../stores/playlistStore'
import { useLibraryStore } from '../stores/libraryStore'
import { groupAlbums, groupArtists, searchTracks } from '../lib/search'

interface Suggestion {
  kind: 'all' | 'song' | 'artist' | 'album' | 'genre'
  label: string
  sub?: string
  criteria: SearchCriteria
}

function buildSuggestions(
  tracks: ReturnType<typeof useLibraryStore.getState>['tracks'],
  q: string
): Suggestion[] {
  const query = q.trim()
  if (!query) return []
  const lower = query.toLowerCase()
  const out: Suggestion[] = []
  out.push({
    kind: 'all',
    label: query,
    sub: '搜索全部结果',
    criteria: { text: query }
  })
  const songs = searchTracks(tracks, { text: query }).slice(0, 6)
  for (const t of songs) {
    out.push({ kind: 'song', label: t.title, sub: t.artist, criteria: { text: t.title } })
  }
  const artists = groupArtists(tracks)
    .filter((a) => a.name.toLowerCase().includes(lower))
    .slice(0, 3)
  for (const a of artists) {
    out.push({
      kind: 'artist',
      label: a.name,
      sub: `歌手 · ${a.count} 首`,
      criteria: { artist: a.name }
    })
  }
  const albums = groupAlbums(tracks)
    .filter((a) => a.album.toLowerCase().includes(lower))
    .slice(0, 3)
  for (const a of albums) {
    out.push({
      kind: 'album',
      label: a.album,
      sub: `专辑 · ${a.artist}`,
      criteria: { album: a.album }
    })
  }
  const genres = [
    ...new Set(
      tracks
        .map((t) => t.genre)
        .filter(Boolean)
        .join('/')
        .split('/')
        .map((g) => g.trim())
        .filter(Boolean)
    )
  ]
    .filter((g) => g.toLowerCase().includes(lower))
    .slice(0, 3)
  for (const g of genres) {
    out.push({ kind: 'genre', label: g, sub: '曲风', criteria: { genre: g } })
  }
  return out
}

const ICONS: Record<Suggestion['kind'], React.JSX.Element> = {
  all: <Search size={14} />,
  song: <Music2 size={14} />,
  artist: <Users size={14} />,
  album: <Disc3 size={14} />,
  genre: <Tag size={14} />
}

export function NavBar(): React.JSX.Element {
  const view = useUiStore((s) => s.view)
  const globalSearch = useUiStore((s) => s.globalSearch)
  const searchActive = useUiStore((s) => s.searchActive)
  const navTo = useUiStore((s) => s.navTo)
  const setGlobalSearch = useUiStore((s) => s.setGlobalSearch)
  const setSearchActive = useUiStore((s) => s.setSearchActive)
  const executeSearch = useUiStore((s) => s.executeSearch)
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen)
  const settings = useSettingsStore((s) => s.data)
  const playlists = usePlaylistStore((s) => s.playlists)
  const tracks = useLibraryStore((s) => s.tracks)

  const wrapRef = useRef<HTMLDivElement>(null)
  // The highlighted suggestion belongs to the query it was picked for, so a new
  // query starts at index 0 by derivation — no setState reset inside an effect.
  const [activeSel, setActiveSel] = useState<{ query: string; index: number }>({
    query: globalSearch,
    index: 0
  })
  const activeIdx = activeSel.query === globalSearch ? activeSel.index : 0
  const playlistView = view.type === 'playlist'

  const suggestions = useMemo(() => buildSuggestions(tracks, globalSearch), [tracks, globalSearch])

  // close dropdown on outside click
  useEffect(() => {
    if (!searchActive) return
    const h = (e: PointerEvent): void => {
      if (!wrapRef.current?.contains(e.target as Node)) setSearchActive(false)
    }
    document.addEventListener('pointerdown', h)
    return () => document.removeEventListener('pointerdown', h)
  }, [searchActive, setSearchActive])

  const commit = (s: Suggestion): void => executeSearch(s.criteria)

  const onInputChange = (q: string): void => {
    setGlobalSearch(q)
    setSearchActive(q.trim().length > 0)
  }

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      if (searchActive && suggestions.length > 0) {
        commit(suggestions[Math.min(activeIdx, suggestions.length - 1)])
      }
    } else if (e.key === 'Escape') {
      setGlobalSearch('')
      setSearchActive(false)
      ;(e.target as HTMLInputElement).blur()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (searchActive && suggestions.length > 0)
        setActiveSel({ query: globalSearch, index: (activeIdx + 1) % suggestions.length })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (searchActive && suggestions.length > 0)
        setActiveSel({
          query: globalSearch,
          index: (activeIdx - 1 + suggestions.length) % suggestions.length
        })
    }
  }

  const togglePin = async (): Promise<void> => {
    if (!settings) return
    await useSettingsStore.getState().updateGeneral({ alwaysOnTop: !settings.general.alwaysOnTop })
    await window.api.windowSetAlwaysOnTop(!settings.general.alwaysOnTop)
  }

  return (
    <nav className="nb">
      <div className="nb-tabs">
        <button
          className={`nb-tab ${view.type === 'all' ? 'active' : ''}`}
          onClick={() => navTo({ type: 'all' })}
        >
          <Library size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
          音乐库
        </button>
        <button
          className={`nb-tab ${playlistView ? 'active' : ''}`}
          onClick={() =>
            navTo({
              type: 'playlist',
              id: playlists.find((p) => p.builtin === 'favorites')?.id ?? 'favorites'
            })
          }
        >
          <ListMusic size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
          歌单
        </button>
      </div>

      <div className="nb-search-wrap no-drag" ref={wrapRef}>
        <div className={`nb-search ${searchActive ? 'focus' : ''}`}>
          <Search size={14} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
          <input
            placeholder="搜索本地曲库 — 歌名 / 歌手 / 专辑 / 曲风"
            value={globalSearch}
            onChange={(e) => onInputChange(e.target.value)}
            onFocus={() => {
              if (globalSearch.trim()) setSearchActive(true)
            }}
            onKeyDown={onInputKeyDown}
          />
          {globalSearch && (
            <button
              className="search-clear"
              title="清空"
              onClick={() => {
                setGlobalSearch('')
                setSearchActive(false)
              }}
            >
              <X size={12} />
            </button>
          )}
        </div>

        {searchActive && suggestions.length > 0 && (
          <div className="search-drop">
            {suggestions.map((s, i) => (
              <button
                key={`${s.kind}-${s.label}-${i}`}
                className={`search-item ${i === activeIdx ? 'active' : ''}`}
                onMouseEnter={() => setActiveSel({ query: globalSearch, index: i })}
                onClick={() => commit(s)}
              >
                <span className="search-item-icon">{ICONS[s.kind]}</span>
                <span className="search-item-label">
                  {s.label}
                  {s.sub && <span className="search-item-sub"> {s.sub}</span>}
                </span>
                {s.kind === 'all' && (
                  <span className="search-item-enter" title="回车">
                    ↵
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="nb-right no-drag">
        <button
          className="nb-tab"
          title={settings?.general.alwaysOnTop ? '取消窗口置顶' : '窗口置顶'}
          onClick={() => void togglePin()}
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
        >
          {settings?.general.alwaysOnTop ? (
            <Pin size={13} style={{ color: 'var(--accent)' }} />
          ) : (
            <PinOff size={13} />
          )}
        </button>
        <button
          className="nb-tab"
          onClick={() => setSettingsOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
        >
          <Settings size={13} />
          设置
        </button>
      </div>
    </nav>
  )
}

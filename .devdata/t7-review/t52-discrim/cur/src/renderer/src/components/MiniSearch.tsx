import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import type { Track } from '../types'
import { searchTracks } from '../lib/search'

/** how many result rows fit above the player info without pushing it off-screen */
const MAX_ROWS = 6
/** per-row time shown on the right */
function dur(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return ''
  const s = Math.floor(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Search pane of the expanded mini window.
 *
 * The mini window is a separate renderer, so it does NOT play anything itself:
 * fetching the library is read-only (`libraryGet`) and the click is proxied to
 * the main window (`miniPlay`), which owns the player store and starts the same
 * "this list is the queue, start at this row" playback the main window uses.
 *
 * Mounted only while the floating bar is expanded, so "first expand fetches the
 * library" falls out of the mount, and a new expand re-fetches (cache by
 * construction, never a stale snapshot across hides).
 */
export interface MiniSearchProps {
  /** true while a non-empty query is active — the parent hides the lyric area */
  onQueryChange?: (searching: boolean) => void
}

export function MiniSearch({ onQueryChange }: MiniSearchProps = {}): React.JSX.Element {
  const [cache, setCache] = useState<Track[]>([])
  const [query, setQuery] = useState('')
  const [loaded, setLoaded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const searching = query.trim().length > 0

  // report the active state up: with a query the results need the room, so the
  // lyric block yields entirely instead of overflowing the 540px window
  useEffect(() => {
    onQueryChange?.(searching)
  }, [searching, onQueryChange])

  useEffect(() => {
    let disposed = false
    const take = async (markLoaded: boolean): Promise<void> => {
      try {
        const r = await window.api.libraryGet()
        if (disposed) return
        if (markLoaded) {
          setCache(r.tracks ?? [])
          setLoaded(true)
        } else {
          // a library change must never wipe a pending fetch's "loaded" flag
          setCache(r.tracks ?? [])
        }
      } catch {
        if (!disposed && markLoaded) {
          setCache([])
          setLoaded(true)
        }
      }
    }
    void take(true)
    const off = window.api.onLibraryChanged(() => void take(false))
    return () => {
      disposed = true
      off()
    }
  }, [])

  const q = query.trim()
  const results = q ? searchTracks(cache, { text: q, limit: 40 }) : []
  const rows = results.slice(0, MAX_ROWS)

  const playRow = (index: number): void => {
    // the whole result list becomes the queue, in the shown order
    window.api.miniPlay({ ids: results.map((t) => t.id), index })
  }

  return (
    <div className="mini-search no-drag">
      <div className="mini-search-bar">
        <Search size={13} />
        <input
          ref={inputRef}
          className="mini-search-input"
          placeholder="搜索曲库"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setQuery('')
          }}
        />
        {query && (
          <button
            className="mini-search-clear"
            title="清空"
            onClick={() => {
              setQuery('')
              inputRef.current?.focus()
            }}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {q ? (
        <div className="mini-search-results">
          {rows.length === 0 ? (
            <div className="mini-search-row empty">
              {!loaded
                ? '正在读取曲库…'
                : cache.length === 0
                  ? '曲库为空，先在主窗口添加音乐'
                  : '没有匹配的歌曲'}
            </div>
          ) : (
            rows.map((t, i) => (
              <button
                key={t.id}
                className="mini-search-row"
                title={`${t.title} — ${t.artist}`}
                onClick={() => playRow(i)}
              >
                <span className="mini-search-row-title">{t.title}</span>
                <span className="mini-search-row-artist">{t.artist}</span>
                <span className="mini-search-row-dur">{dur(t.duration)}</span>
              </button>
            ))
          )}
        </div>
      ) : (
        loaded &&
        cache.length === 0 && <div className="mini-search-hint">曲库为空，先在主窗口添加音乐</div>
      )}
    </div>
  )
}

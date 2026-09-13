import { create } from 'zustand'
import type { Playlist } from '../types'
import { uid } from '../lib/format'

const FAVORITES_ID = 'favorites'

function favoritesPlaylist(): Playlist {
  return {
    id: FAVORITES_ID,
    name: '收藏',
    builtin: 'favorites',
    trackIds: [],
    order: 0,
    createdAt: 0,
    updatedAt: 0
  }
}

interface PlaylistState {
  playlists: Playlist[]
  loaded: boolean
  load: () => Promise<void>
  create: (name: string) => Playlist
  rename: (id: string, name: string) => void
  remove: (id: string) => void
  addTracks: (id: string, trackIds: string[]) => number
  removeTracks: (id: string, trackIds: string[]) => void
  toggleFavorite: (trackId: string) => boolean
  isFavorite: (trackId: string) => boolean
  favorites: () => Playlist
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

function persist(get: () => PlaylistState): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const { playlists } = get()
    void window.api.playlistSave(JSON.parse(JSON.stringify(playlists)))
  }, 400)
}

export const usePlaylistStore = create<PlaylistState>((set, get) => ({
  playlists: [],
  loaded: false,

  load: async () => {
    const res = await window.api.playlistLoad()
    let list = res.playlists ?? []
    if (!list.some((p) => p.id === FAVORITES_ID)) {
      list = [favoritesPlaylist(), ...list]
    }
    set({ playlists: list.sort((a, b) => a.order - b.order), loaded: true })
  },

  create: (name) => {
    const p: Playlist = {
      id: uid(),
      name: name.trim().slice(0, 60) || '新建歌单',
      trackIds: [],
      order: get().playlists.length,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    set({ playlists: [...get().playlists, p] })
    persist(get)
    return p
  },

  rename: (id, name) => {
    set({
      playlists: get().playlists.map((p) =>
        p.id === id && !p.builtin
          ? { ...p, name: name.trim().slice(0, 60) || p.name, updatedAt: Date.now() }
          : p
      )
    })
    persist(get)
  },

  remove: (id) => {
    if (id === FAVORITES_ID) return
    set({ playlists: get().playlists.filter((p) => p.id !== id) })
    persist(get)
  },

  addTracks: (id, trackIds) => {
    let added = 0
    set({
      playlists: get().playlists.map((p) => {
        if (p.id !== id) return p
        const setNow = new Set(p.trackIds)
        const fresh = trackIds.filter((t) => !setNow.has(t))
        added = fresh.length
        return fresh.length
          ? { ...p, trackIds: [...p.trackIds, ...fresh], updatedAt: Date.now() }
          : p
      })
    })
    persist(get)
    return added
  },

  removeTracks: (id, trackIds) => {
    const rm = new Set(trackIds)
    set({
      playlists: get().playlists.map((p) =>
        p.id === id
          ? { ...p, trackIds: p.trackIds.filter((t) => !rm.has(t)), updatedAt: Date.now() }
          : p
      )
    })
    persist(get)
  },

  toggleFavorite: (trackId) => {
    const fav = get().playlists.find((p) => p.id === FAVORITES_ID)
    if (!fav) return false
    const exists = fav.trackIds.includes(trackId)
    const next = exists ? fav.trackIds.filter((t) => t !== trackId) : [...fav.trackIds, trackId]
    set({
      playlists: get().playlists.map((p) =>
        p.id === FAVORITES_ID ? { ...p, trackIds: next, updatedAt: Date.now() } : p
      )
    })
    persist(get)
    return !exists
  },

  isFavorite: (trackId) => {
    const fav = get().playlists.find((p) => p.id === FAVORITES_ID)
    return fav ? fav.trackIds.includes(trackId) : false
  },

  favorites: () => get().playlists.find((p) => p.id === FAVORITES_ID) ?? favoritesPlaylist()
}))

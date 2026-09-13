import { create } from 'zustand'
import type { LibraryStats, ScanProgress, ScanResult, Track } from '../types'
import { useUiStore } from './uiStore'

interface LibraryState {
  tracks: Track[]
  map: Record<string, Track>
  stats: LibraryStats
  loaded: boolean
  scanning: boolean
  scanProgress: ScanProgress | null
  load: () => Promise<void>
  scan: (roots: string[]) => Promise<ScanResult>
  cancelScan: () => void
  remove: (ids: string[]) => Promise<void>
  dropMissing: () => Promise<number>
  refresh: () => Promise<void>
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  tracks: [],
  map: {},
  stats: { total: 0, artists: 0, albums: 0, folders: 0, totalDuration: 0 },
  loaded: false,
  scanning: false,
  scanProgress: null,

  refresh: async () => {
    const { tracks, stats } = await window.api.libraryGet()
    const map: Record<string, Track> = {}
    for (const t of tracks) map[t.id] = t
    set({ tracks, map, stats })
  },

  load: async () => {
    await get().refresh()
    set({ loaded: true })
  },

  scan: async (roots: string[]) => {
    if (get().scanning) {
      useUiStore.getState().toast('已有扫描任务进行中', 'info')
      return { added: 0, updated: 0, skipped: 0, missing: 0, cancelled: true }
    }
    set({ scanning: true, scanProgress: null })
    const unsub = window.api.onLibraryScanProgress((p) => {
      set({ scanProgress: p })
    })
    try {
      const res = await window.api.libraryScan(roots)
      await get().refresh()
      const toast = useUiStore.getState().toast
      if (res.cancelled) {
        toast('扫描已取消', 'info')
      } else {
        const parts = [`新增 ${res.added}`, `更新 ${res.updated}`, `缺失 ${res.missing}`]
        toast(`扫描完成 — ${parts.join(' · ')}`, res.missing > 0 ? 'info' : 'success')
      }
      return res
    } catch (err) {
      useUiStore
        .getState()
        .toast('扫描失败: ' + (err instanceof Error ? err.message : String(err)), 'error')
      throw err
    } finally {
      unsub()
      set({ scanning: false, scanProgress: null })
    }
  },

  cancelScan: () => window.api.libraryScanCancel(),

  remove: async (ids: string[]) => {
    await window.api.libraryRemove(ids)
    await get().refresh()
  },

  dropMissing: async () => {
    const n = await window.api.libraryDropMissing()
    await get().refresh()
    return n
  }
}))

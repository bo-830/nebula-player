import { create } from 'zustand'
import type { View } from '../types'
import type { SortKey } from '../lib/search'
import { uid } from '../lib/format'

export interface Toast {
  id: string
  text: string
  type: 'info' | 'success' | 'error'
}

export interface SearchCriteria {
  text?: string
  artist?: string
  album?: string
  genre?: string
}

interface UiState {
  view: View
  prevView: View
  navTo: (view: View) => void
  /** text currently typed in the global search box */
  globalSearch: string
  setGlobalSearch: (q: string) => void
  /** whether the suggestion dropdown under the search box is open */
  searchActive: boolean
  setSearchActive: (v: boolean) => void
  /** commit a search → show results in the main list (typing alone never changes the list) */
  executeSearch: (criteria: SearchCriteria) => void
  /** list sort key for track views */
  sortKey: SortKey
  setSortKey: (k: SortKey) => void
  settingsOpen: boolean
  setSettingsOpen: (v: boolean) => void
  toasts: Toast[]
  toast: (text: string, type?: Toast['type']) => void
  dismissToast: (id: string) => void
}

export const useUiStore = create<UiState>((set, get) => ({
  view: { type: 'all' },
  prevView: { type: 'all' },
  navTo: (view) => {
    const cur = get().view
    const prev = cur.type === 'search' ? get().prevView : cur
    set({ view, globalSearch: '', searchActive: false, prevView: prev })
  },
  globalSearch: '',
  setGlobalSearch: (q) => set({ globalSearch: q }),
  searchActive: false,
  setSearchActive: (v) => set({ searchActive: v }),
  executeSearch: (criteria) => {
    const cur = get().view
    const prev = cur.type === 'search' ? get().prevView : cur
    set({
      view: { type: 'search', ...criteria },
      prevView: prev,
      globalSearch: criteria.text ?? get().globalSearch,
      searchActive: false
    })
  },
  sortKey: 'default',
  setSortKey: (k) => set({ sortKey: k }),
  settingsOpen: false,
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  toasts: [],
  toast: (text, type = 'info') => {
    const id = uid()
    set({ toasts: [...get().toasts, { id, text, type }] })
    setTimeout(() => get().dismissToast(id), 3600)
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) })
}))

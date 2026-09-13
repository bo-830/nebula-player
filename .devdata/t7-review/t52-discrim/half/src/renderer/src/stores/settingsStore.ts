import { create } from 'zustand'
import type { ApiTestResult, Settings } from '../types'

interface SettingsState {
  data: Settings | null
  loaded: boolean
  load: () => Promise<void>
  updateGeneral: (partial: Partial<Settings['general']>) => Promise<void>
  setApi: (input: { baseURL?: string; model?: string; apiKey?: string }) => Promise<void>
  testApi: () => Promise<ApiTestResult>
}

export const useSettingsStore = create<SettingsState>((set) => ({
  data: null,
  loaded: false,
  load: async () => {
    const data = await window.api.settingsGet()
    set({ data, loaded: true })
  },
  updateGeneral: async (partial) => {
    const data = await window.api.settingsUpdateGeneral(partial)
    set({ data })
  },
  setApi: async (input) => {
    const data = await window.api.settingsSetApi(input)
    set({ data })
  },
  testApi: () => window.api.settingsTestApi()
}))

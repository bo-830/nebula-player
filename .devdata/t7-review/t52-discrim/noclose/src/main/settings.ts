import { safeStorage } from 'electron'
import type { ApiConfig, ApiTestResult, Settings } from '../shared/types'
import { JsonStore } from './store'
import { testApi } from './llmClient'

/** shape stored on disk — includes the encrypted key blob */
interface DiskSettings {
  api: {
    baseURL: string
    model: string
    keyMode: 'enc' | 'plain' | ''
    hasKey: boolean
    /** base64 of safeStorage-encrypted key (or base64 of plaintext in fallback mode) */
    keyEnc: string
  }
  general: Settings['general']
}

const DEFAULTS: DiskSettings = {
  api: { baseURL: '', model: '', keyMode: '', hasKey: false, keyEnc: '' },
  general: {
    closeToTray: true,
    alwaysOnTop: false,
    resumeOnLaunch: true,
    mediaKeys: false,
    scanFolders: [],
    updateURL: ''
  }
}

export class SettingsService {
  private store: JsonStore<DiskSettings>

  constructor() {
    this.store = new JsonStore('settings.json', DEFAULTS)
  }

  async init(): Promise<void> {
    await this.store.init()
  }

  async flush(): Promise<void> {
    await this.store.flush()
  }

  /** settings safe to hand to the renderer (never contains the key) */
  getPublic(): Settings {
    const s = this.store.get()
    return {
      api: {
        baseURL: s.api.baseURL,
        model: s.api.model,
        keyMode: s.api.keyMode,
        hasKey: s.api.hasKey
      },
      general: s.general
    }
  }

  /** update general settings only */
  update(partial: Partial<Settings['general']>): Settings {
    const cur = this.store.get()
    this.store.set({ general: { ...cur.general, ...partial } })
    return this.getPublic()
  }

  hasFolders(): boolean {
    return this.store.get().general.scanFolders.length > 0
  }

  /**
   * Configure the AI endpoint. An empty apiKey keeps the stored key;
   * pass a non-empty string to rotate. Keys are encrypted with
   * safeStorage (DPAPI/Keychain) at rest.
   */
  setApi(input: { baseURL?: string; model?: string; apiKey?: string }): Settings {
    const cur = this.store.get()
    const api = { ...cur.api }
    if (input.baseURL !== undefined) api.baseURL = input.baseURL
    if (input.model !== undefined) api.model = input.model
    if (input.apiKey !== undefined) {
      if (input.apiKey === '') {
        api.keyEnc = ''
        api.keyMode = ''
        api.hasKey = false
      } else {
        if (safeStorage.isEncryptionAvailable()) {
          api.keyEnc = safeStorage.encryptString(input.apiKey).toString('base64')
          api.keyMode = 'enc'
        } else {
          api.keyEnc = Buffer.from(input.apiKey, 'utf-8').toString('base64')
          api.keyMode = 'plain'
        }
        api.hasKey = true
      }
    }
    this.store.set({ api })
    return this.getPublic()
  }

  /** decrypted API config for main-process calls only */
  getApiConfig(): ApiConfig {
    const { api } = this.store.get()
    let key = ''
    if (api.hasKey && api.keyEnc) {
      try {
        key =
          api.keyMode === 'enc'
            ? safeStorage.decryptString(Buffer.from(api.keyEnc, 'base64'))
            : Buffer.from(api.keyEnc, 'base64').toString('utf-8')
      } catch {
        key = ''
      }
    }
    return { baseURL: api.baseURL, model: api.model, apiKey: key }
  }

  async test(): Promise<ApiTestResult> {
    return testApi(this.getApiConfig())
  }
}

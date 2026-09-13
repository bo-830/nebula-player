import { useEffect, useState } from 'react'
import { Particles } from './components/Particles'
import { TitleBar } from './components/TitleBar'
import { NavBar } from './components/NavBar'
import { Sidebar } from './components/Sidebar'
import { MainView } from './components/MainView'
import { PlayerBar } from './components/PlayerBar'
import { ChatPanel } from './components/ChatPanel'
import { SettingsModal } from './components/SettingsModal'
import { Toasts } from './components/Toasts'
import { MiniPlayer } from './components/MiniPlayer'
import { useUiStore } from './stores/uiStore'
import { useSettingsStore } from './stores/settingsStore'
import { useLibraryStore } from './stores/libraryStore'
import { usePlaylistStore } from './stores/playlistStore'
import { useChatStore } from './stores/chatStore'
import { usePlayerStore } from './stores/playerStore'
import { audioEngine } from './lib/audioEngine'
import { installMainWindowBridge } from './lib/mainWindowBridge'

const IS_MINI = typeof location !== 'undefined' && location.hash.includes('mini')

export default function App(): React.JSX.Element {
  if (IS_MINI) {
    return <MiniPlayer />
  }
  return <FullApp />
}

function FullApp(): React.JSX.Element {
  const booted = useBoot()
  const settingsOpen = useUiStore((s) => s.settingsOpen)
  const chatCollapsed = useChatStore((s) => s.collapsed)

  if (!booted) {
    return (
      <div className="app-root">
        <Particles />
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            height: '100%',
            display: 'grid',
            placeItems: 'center'
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, letterSpacing: 6 }} className="gradient-text">
              NEBULA
            </div>
            <div
              style={{ marginTop: 10, fontSize: 11, color: 'var(--text-faint)', letterSpacing: 2 }}
            >
              LOADING…
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-root">
      <Particles />
      <div
        className="shell"
        style={
          { '--bottom-h': chatCollapsed ? '128px' : 'min(342px, 33vh)' } as React.CSSProperties
        }
      >
        <TitleBar />
        <NavBar />
        <div className="middle">
          <Sidebar />
          <MainView />
        </div>
        <div className="bottom">
          <PlayerBar />
          <ChatPanel />
        </div>
      </div>
      <Toasts />
      {settingsOpen && <SettingsModal />}
    </div>
  )
}

function useBoot(): boolean {
  const [booted, setBooted] = useState(false)

  useEffect(() => {
    let disposed = false

    usePlayerStore.getState().initEngine()

    // forward renderer errors/warnings to the main-process log file
    const origError = console.error.bind(console)
    console.error = (...args: unknown[]): void => {
      origError(...args)
      try {
        window.api.rendererLog(
          'error',
          args.map((a) => (a instanceof Error ? (a.stack ?? a.message) : String(a))).join(' ')
        )
      } catch {
        // ignore
      }
    }
    const onRej = (e: PromiseRejectionEvent): void => {
      try {
        window.api.rendererLog('error', 'unhandledrejection: ' + String(e.reason))
      } catch {
        // ignore
      }
    }
    window.addEventListener('unhandledrejection', onRej)

    // tray / media-key commands → player
    const offCmd = window.api.onPlayerCommand((cmd) => {
      const p = usePlayerStore.getState()
      if (cmd === 'toggle') p.toggle()
      else if (cmd === 'next') p.next()
      else if (cmd === 'prev') p.prev()
      else if (cmd === 'stop') p.stop()
    })

    // mini window proxies: playback intents + chat commands + snapshot mirror.
    // The floating window is a separate renderer that owns no player/chat state,
    // so this window answers for it (see lib/mainWindowBridge.ts).
    const offMiniBridge = installMainWindowBridge()

    // auto-update notifications (silent check runs in main when configured)
    const offUpd = window.api.onUpdateStatus((s) => {
      if (s.state === 'available') {
        useUiStore.getState().toast(`发现新版本 v${s.version}，设置 → 关于 可下载安装`, 'info')
      }
    })

    // drag & drop import (files or folders)
    const onDrop = (e: DragEvent): void => {
      e.preventDefault()
      if (!e.dataTransfer) return
      const paths: string[] = []
      for (const f of Array.from(e.dataTransfer.files)) {
        try {
          const p = window.api.getPathForFile(f)
          if (p) paths.push(p)
        } catch {
          // skip unreadable
        }
      }
      if (paths.length > 0) {
        void useLibraryStore.getState().scan(paths)
        useUiStore.getState().toast(`正在导入 ${paths.length} 项…`, 'info')
      }
    }
    const onDragOver = (e: DragEvent): void => e.preventDefault()
    window.addEventListener('drop', onDrop)
    window.addEventListener('dragover', onDragOver)

    void (async () => {
      await Promise.all([
        useSettingsStore.getState().load(),
        useLibraryStore.getState().load(),
        usePlaylistStore.getState().load(),
        useChatStore.getState().load()
      ])

      const settings = useSettingsStore.getState().data
      if (settings?.general.resumeOnLaunch) {
        await usePlayerStore.getState().resumeIfSaved()
      }
      if (!disposed) {
        setBooted(true)
        console.log('NEBULA boot complete — tracks:', useLibraryStore.getState().tracks.length)
        // dev-only automation hook for E2E smoke tests via webContents.executeJavaScript
        if (import.meta.env.DEV) {
          ;(window as unknown as Record<string, unknown>).__nebula = {
            player: usePlayerStore,
            library: useLibraryStore,
            playlists: usePlaylistStore,
            chat: useChatStore,
            ui: useUiStore,
            engine: audioEngine
          }
        }
      }
    })()

    return () => {
      disposed = true
      offCmd()
      offUpd()
      offMiniBridge()
      window.removeEventListener('unhandledrejection', onRej)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('dragover', onDragOver)
    }
  }, [])

  return booted
}

import { BrowserWindow } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

export interface WindowHandle {
  win: BrowserWindow
  show: () => void
  hide: () => void
  toggleMaximize: () => boolean
  isMaximized: () => boolean
  setAlwaysOnTop: (v: boolean) => void
  close: () => void
  send: (channel: string, ...args: unknown[]) => void
}

let quitting = false

export function setQuitting(): void {
  quitting = true
}

export function isQuitting(): boolean {
  return quitting
}

export function createMainWindow(opts: {
  alwaysOnTop: boolean
  closeToTray: () => boolean
}): WindowHandle {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    frame: false,
    backgroundColor: '#050508',
    alwaysOnTop: opts.alwaysOnTop,
    autoHideMenuBar: true,
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      // media/WebAudio never blocked by autoplay policy in this app
      autoplayPolicy: 'no-user-gesture-required'
    }
  })

  win.on('ready-to-show', () => win.show())

  // Navigation / window-open policy lives in exactly one place: `index.ts`
  // applies it to every renderer through `app.on('web-contents-created')`.
  // This window used to install its own `setWindowOpenHandler` here, which both
  // duplicated the policy and silently replaced that global guard (the setter
  // holds a single slot). It is deliberately gone — do not reintroduce one.

  // close → hide to tray (unless really quitting or the setting is off)
  win.on('close', (e) => {
    if (!quitting && opts.closeToTray()) {
      e.preventDefault()
      win.hide()
    }
  })

  win.on('maximize', () => win.webContents.send('window:maximize-change', true))
  win.on('unmaximize', () => win.webContents.send('window:maximize-change', false))

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return {
    win,
    show: () => {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    },
    hide: () => win.hide(),
    toggleMaximize: () => {
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
      return win.isMaximized()
    },
    isMaximized: () => win.isMaximized(),
    setAlwaysOnTop: (v: boolean) => win.setAlwaysOnTop(v, 'screen-saver'),
    close: () => win.close(),
    send: (channel, ...args) => win.webContents.send(channel, ...args)
  }
}

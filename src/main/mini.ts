import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { MINI_COLLAPSED, MINI_EXPANDED, computeMiniBounds, type Size } from './miniBounds'

let mini: BrowserWindow | null = null
/** the floating bar is only ever *shown* in its collapsed form */
let miniExpanded = false

/** Always-on-top floating lyric mini-window (display-only renderer). */
export function ensureMiniWindow(): BrowserWindow {
  if (mini && !mini.isDestroyed()) return mini
  mini = new BrowserWindow({
    width: MINI_COLLAPSED.width,
    height: MINI_COLLAPSED.height,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#0a0e1c',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  mini.setAlwaysOnTop(true, 'screen-saver')
  mini.on('closed', () => {
    mini = null
    miniExpanded = false
  })
  // `closeMiniWindow()` hides rather than destroys, so hiding is the "closed"
  // the user sees: the next show must come back collapsed
  mini.on('hide', () => {
    miniExpanded = false
  })
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mini.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#mini')
  } else {
    void mini.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'mini' })
  }
  return mini
}

export function getMiniWindow(): BrowserWindow | null {
  return mini && !mini.isDestroyed() ? mini : null
}

/** whether the mini window is currently in its expanded form */
export function isMiniExpanded(): boolean {
  return miniExpanded
}

/**
 * Resize the mini window between its collapsed and expanded forms.
 *
 * Returns the size that was actually applied — on a display too short for the
 * expanded height this is the clipped height, not `MINI_EXPANDED.height`, so
 * callers always learn the real geometry. When no window exists yet the state
 * is only recorded and the nominal size is reported (the window is created
 * collapsed, so the first `setMiniExpanded(true)` acts on a fresh window).
 */
export function setMiniExpanded(expanded: boolean): Size {
  miniExpanded = expanded
  const nominal = expanded ? MINI_EXPANDED : MINI_COLLAPSED
  const w = getMiniWindow()
  if (!w) return { ...nominal }

  const current = w.getBounds()
  const workArea = screen.getDisplayMatching(current).workArea
  const next = computeMiniBounds(current, expanded, workArea)
  w.setBounds(next)
  return { width: next.width, height: next.height }
}

/** force the collapsed geometry and tell the renderer it is collapsed again */
function collapseMini(): void {
  setMiniExpanded(false)
  forwardToMini('mini:expanded', false)
}

/** returns true when visible after the toggle */
export function toggleMiniWindow(): boolean {
  const existing = getMiniWindow()
  if (existing) {
    if (existing.isVisible()) {
      existing.hide() // the 'hide' listener clears the expanded state
    } else {
      // always reappear collapsed, whatever state it was left in
      collapseMini()
      existing.showInactive()
      existing.focus()
    }
  } else {
    const w = ensureMiniWindow()
    collapseMini()
    w.showInactive()
    w.focus()
  }
  return getMiniWindow()?.isVisible() ?? false
}

export function closeMiniWindow(): void {
  getMiniWindow()?.hide()
}

export function forwardToMini(channel: string, payload: unknown): void {
  getMiniWindow()?.webContents.send(channel, payload)
}

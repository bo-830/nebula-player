import { Tray, Menu, BrowserWindow, nativeImage, app } from 'electron'
import iconPath from '../../resources/icon.png?asset'

let tray: Tray | null = null
let title = 'NEBULA Player'

export function createTray(onCommand: (cmd: 'toggle' | 'next' | 'prev' | 'stop') => void): Tray {
  let image = nativeImage.createFromPath(iconPath)
  if (process.platform === 'win32') {
    image = image.resize({ width: 16, height: 16 })
  }
  tray = new Tray(image)
  tray.setToolTip(title)

  const menu = Menu.buildFromTemplate([
    { label: '显示主界面', click: () => showMainWindow() },
    { type: 'separator' },
    { label: '播放 / 暂停', click: () => onCommand('toggle') },
    { label: '上一曲', click: () => onCommand('prev') },
    { label: '下一曲', click: () => onCommand('next') },
    { type: 'separator' },
    { label: '退出', click: () => quitApp() }
  ])
  tray.setContextMenu(menu)
  tray.on('click', () => showMainWindow())
  return tray
}

export function updateTrayTitle(text: string): void {
  title = text || 'NEBULA Player'
  tray?.setToolTip(title)
}

function showMainWindow(): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function quitApp(): void {
  app.quit()
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}

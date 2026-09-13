/**
 * Geometry for the floating mini window.
 *
 * Deliberately Electron-free so it can be unit tested in a plain Node
 * environment — the same extraction trick `lrc.ts` / `mediaFormats.ts` /
 * `mediaRoots.ts` use.
 *
 * The window only ever changes HEIGHT: the expanded form adds the search box
 * and the AI chat pane underneath the lyric line, and keeping the width fixed
 * means nothing reflows horizontally when it opens.
 */

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

/** collapsed: lyric line + transport controls only */
export const MINI_COLLAPSED: Size = { width: 360, height: 128 }
/** expanded: lyric line + search box + AI chat pane */
export const MINI_EXPANDED: Size = { width: 360, height: 540 }

/**
 * Place the mini window at the requested size without letting it leave the
 * display's work area.
 *
 * - width is the constant above in both states (only the height changes)
 * - x/y stay where they are as long as the window still fits
 * - a window that would stick out of an edge is pulled back inside, so a
 *   bottom-anchored bar grows upwards instead of off-screen
 * - when it cannot fit at all the size is clipped to the work area: a short
 *   display yields a shorter expanded window rather than one partly off-screen
 */
export function computeMiniBounds(current: Bounds, expanded: boolean, workArea: Bounds): Bounds {
  const target = expanded ? MINI_EXPANDED : MINI_COLLAPSED

  const width = Math.min(target.width, workArea.width)
  const height = Math.min(target.height, workArea.height)

  // keeping the requested corner, but never outside the work area
  const maxX = workArea.x + workArea.width - width
  const maxY = workArea.y + workArea.height - height

  return {
    x: Math.min(Math.max(current.x, workArea.x), maxX),
    y: Math.min(Math.max(current.y, workArea.y), maxY),
    width,
    height
  }
}

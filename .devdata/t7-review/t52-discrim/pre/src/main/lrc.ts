/**
 * LRC (synchronized lyrics) parsing.
 *
 * Kept free of Electron/Node-only imports so the parser can be unit tested in a
 * plain Node environment. `lyricsService` re-exports `LyricLine`, so the public
 * API of that module is unchanged.
 */

export interface LyricLine {
  /** time in seconds; -1 marks an unsynced line */
  t: number
  text: string
}

const LRC_TIME = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g

/**
 * Parse LRC text into time-sorted lines.
 * - `[mm:ss]`, `[mm:ss.xx]`, `[mm:ss:xx]` timestamps are all accepted.
 * - Several timestamps may share one text (the line is repeated per stamp).
 * - Metadata tags such as `[ti:]` / `[ar:]` carry no `mm:ss` and are skipped.
 */
export function parseLrc(text: string): LyricLine[] {
  const out: LyricLine[] = []
  for (const raw of text.split(/\r?\n/)) {
    const matches = [...raw.matchAll(LRC_TIME)]
    const content = raw.replace(LRC_TIME, '').trim()
    if (matches.length === 0) continue
    for (const m of matches) {
      const min = parseInt(m[1], 10)
      const sec = parseInt(m[2], 10)
      const fracRaw = m[3] ?? '0'
      const frac = parseInt(fracRaw, 10) / Math.pow(10, fracRaw.length)
      out.push({ t: min * 60 + sec + frac, text: content })
    }
  }
  return out.sort((a, b) => a.t - b.t)
}

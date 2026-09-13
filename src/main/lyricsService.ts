import { promises as fs } from 'fs'
import { basename, dirname, join } from 'path'
import { parseFile } from 'music-metadata'
import { parseLrc, type LyricLine } from './lrc'

// `LyricLine` now lives in ./lrc; re-exported so existing importers of this
// module keep compiling unchanged.
export type { LyricLine }

export interface LyricsResult {
  lines: LyricLine[]
  source: 'lrc' | 'embedded' | 'none'
}

const cache = new Map<string, LyricsResult>()

function extOf(path: string): string {
  const i = path.lastIndexOf('.')
  return i >= 0 ? path.slice(i).toLowerCase() : ''
}

/**
 * Resolve lyrics for a track:
 *   1) external `<basename>.lrc` next to the audio file
 *   2) embedded synchronized lyrics (LRC) in the tags
 *   3) embedded plain lyrics (shown static, no sync)
 * Cached per path+mtime+size.
 */
export async function getLyrics(input: {
  path: string
  mtime: number
  size: number
}): Promise<LyricsResult> {
  const key = `${input.path.toLowerCase()}|${input.mtime}|${input.size}`
  const cached = cache.get(key)
  if (cached) return cached

  // 1) external .lrc
  try {
    const lrcPath = join(dirname(input.path), basename(input.path, extOf(input.path)) + '.lrc')
    const text = await fs.readFile(lrcPath, 'utf-8')
    const lines = parseLrc(text)
    if (lines.length > 0) {
      const r: LyricsResult = { lines, source: 'lrc' }
      cache.set(key, r)
      return r
    }
  } catch {
    // no external lrc
  }

  // 2/3) embedded lyrics
  try {
    const meta = await parseFile(input.path, { duration: false })
    const lyrics = meta.common.lyrics as unknown as
      Array<{ syncText?: Array<{ timestamp?: number; text?: string }>; text?: string }> | undefined
    if (Array.isArray(lyrics)) {
      for (const lyr of lyrics) {
        const st = lyr?.syncText
        if (Array.isArray(st) && st.length > 0) {
          const lines = st
            .map((s) => ({ t: Number(s.timestamp ?? 0) / 1000, text: String(s.text ?? '').trim() }))
            .filter((x) => x.text)
            .sort((a, b) => a.t - b.t)
          if (lines.length > 0) {
            const r: LyricsResult = { lines, source: 'embedded' }
            cache.set(key, r)
            return r
          }
        }
      }
      const plain = lyrics
        .map((l) => l?.text)
        .filter((x): x is string => Boolean(x && x.trim()))
        .join('\n')
      if (plain) {
        const lines = plain
          .split('\n')
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 80)
          .map((t): LyricLine => ({ t: -1, text: t }))
        const r: LyricsResult = { lines, source: 'embedded' }
        cache.set(key, r)
        return r
      }
    }
  } catch {
    // ignore parse failure
  }

  const r: LyricsResult = { lines: [], source: 'none' }
  // empty results are NOT cached so a .lrc added later is picked up
  return r
}

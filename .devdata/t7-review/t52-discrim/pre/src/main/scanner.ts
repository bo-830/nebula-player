import { promises as fs } from 'fs'
import { basename, extname, join } from 'path'

const SUPPORTED_EXTS = new Set(['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ape', '.ogg', '.opus'])

const SKIP_DIRS = new Set(['node_modules', '.git'])

export interface AudioFileEntry {
  path: string
  size: number
  mtime: number
}

/**
 * Recursively collect audio files under a root directory (or a single file).
 * Hidden directories and common tool directories are skipped.
 */
export async function collectAudioFiles(
  root: string,
  signal: { cancelled: boolean }
): Promise<AudioFileEntry[]> {
  // single file import
  try {
    const st = await fs.stat(root)
    if (st.isFile()) {
      const ext = extname(root).toLowerCase()
      if (SUPPORTED_EXTS.has(ext)) {
        return [{ path: root, size: st.size, mtime: Math.round(st.mtimeMs) }]
      }
      return []
    }
  } catch {
    return []
  }

  const out: AudioFileEntry[] = []
  const stack = [root]
  while (stack.length > 0 && !signal.cancelled) {
    const dir = stack.pop() as string
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      continue // unreadable directory
    }
    for (const entry of entries) {
      if (signal.cancelled) return out
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
        stack.push(full)
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        const ext = extname(entry.name).toLowerCase()
        if (SUPPORTED_EXTS.has(ext)) {
          try {
            const stat = await fs.stat(full)
            if (stat.isFile()) {
              out.push({ path: full, size: stat.size, mtime: Math.round(stat.mtimeMs) })
            }
          } catch {
            // file vanished while scanning
          }
        }
      }
    }
  }
  return out
}

/** Simple concurrency-limited map that preserves input order. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return results
}

export function extOf(path: string): string {
  return extname(path).toLowerCase().slice(1)
}

export function displayFolderName(root: string): string {
  return basename(root) || root
}

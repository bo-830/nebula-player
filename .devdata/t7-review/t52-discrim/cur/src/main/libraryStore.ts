import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import { dirname, join } from 'path'
import { parseFile } from 'music-metadata'
import type { ScanProgress, ScanResult, Track } from '../shared/types'
import { paths } from './store'
import {
  collectAudioFiles,
  displayFolderName,
  extOf,
  mapLimit,
  type AudioFileEntry
} from './scanner'

const COVER_EXTS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
}

export function trackIdOf(path: string): string {
  return createHash('sha1').update(path.toLowerCase()).digest('hex').slice(0, 20)
}

const UNKNOWN = '未知'

/**
 * In-memory track database persisted as JSON. Tracks are keyed by id
 * (sha1 of lowercase path). All mutations are debounced-persisted.
 */
export class LibraryService {
  private tracks = new Map<string, Track>()
  private file = join(paths().userData, 'library.json')
  private saveTimer: NodeJS.Timeout | null = null

  async init(): Promise<void> {
    try {
      const raw = await fs.readFile(this.file, 'utf-8')
      const arr = JSON.parse(raw) as Track[]
      for (const t of arr) this.tracks.set(t.id, t)
    } catch {
      // first run
    }
  }

  private persist(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => void this.flush(), 400)
  }

  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    const arr = Array.from(this.tracks.values())
    await fs.mkdir(paths().userData, { recursive: true })
    const tmp = this.file + '.tmp'
    await fs.writeFile(tmp, JSON.stringify(arr), 'utf-8')
    await fs.rename(tmp, this.file)
  }

  all(): Track[] {
    return Array.from(this.tracks.values())
  }

  get(id: string): Track | undefined {
    return this.tracks.get(id)
  }

  byPaths(pathsSet: Set<string>): Track[] {
    return this.all().filter((t) => pathsSet.has(t.path.toLowerCase()))
  }

  stats(): {
    total: number
    artists: number
    albums: number
    folders: number
    totalDuration: number
  } {
    const tracks = this.all()
    return {
      total: tracks.length,
      artists: new Set(tracks.map((t) => t.artist.toLowerCase())).size,
      albums: new Set(tracks.map((t) => `${t.artist.toLowerCase()}\u0000${t.album.toLowerCase()}`))
        .size,
      folders: new Set(tracks.map((t) => t.folderId)).size,
      totalDuration: tracks.reduce((s, t) => s + (t.duration || 0), 0)
    }
  }

  remove(ids: string[]): void {
    for (const id of ids) this.tracks.delete(id)
    this.persist()
  }

  /** remove tracks whose file no longer exists */
  async dropMissing(): Promise<number> {
    const ids: string[] = []
    for (const t of this.tracks.values()) {
      if (t.missing) ids.push(t.id)
    }
    this.remove(ids)
    return ids.length
  }

  /**
   * Scan the given roots. Returns counts; emits progress through callback.
   */
  async scanRoots(
    roots: string[],
    onProgress: (p: ScanProgress) => void,
    cancelled: { flag: boolean }
  ): Promise<ScanResult> {
    const result: ScanResult = { added: 0, updated: 0, skipped: 0, missing: 0, cancelled: false }
    const existing = new Map<string, Track>()
    for (const t of this.tracks.values()) existing.set(t.path.toLowerCase(), t)

    for (const root of roots) {
      if (cancelled.flag) {
        result.cancelled = true
        return result
      }

      // 1) collect files on disk (root may be a folder or a single file)
      let isFile = false
      try {
        isFile = (await fs.stat(root)).isFile()
      } catch {
        isFile = false
      }
      const files = await collectAudioFiles(root, {
        get cancelled() {
          return cancelled.flag
        }
      })
      if (cancelled.flag) {
        result.cancelled = true
        return result
      }

      const folderId = isFile ? dirname(root) : root
      const folderName = displayFolderName(folderId)
      const found = new Set<string>()
      let i = 0
      let lastEmit = 0

      // 2) parse metadata with bounded concurrency
      await mapLimit(files, 4, async (file: AudioFileEntry) => {
        if (cancelled.flag) return
        const key = file.path.toLowerCase()
        found.add(key)
        const prev = existing.get(key)
        if (prev && prev.size === file.size && prev.mtime === file.mtime && !prev.missing) {
          result.skipped++
        } else {
          try {
            const track = await this.parseOne(file, folderId, folderName)
            if (track) {
              // preserve the original import time for existing tracks
              track.addedAt = prev?.addedAt ?? Date.now()
              const changed = prev
                ? JSON.stringify(this.publicOf(prev)) !== JSON.stringify(this.publicOf(track))
                : true
              this.tracks.set(track.id, track)
              existing.set(key, track)
              if (prev) result.updated += changed ? 1 : 0
              else result.added++
            }
          } catch {
            // unparseable/corrupt file — skip silently
            result.skipped++
          }
        }
        i++
        const now = Date.now()
        if (now - lastEmit > 120 || i === files.length) {
          lastEmit = now
          onProgress({ current: i, total: files.length, file: file.path })
        }
      })

      // 3) mark tracks under this root that vanished (folder scans only —
      //    importing single files must never flag other tracks as missing)
      if (!isFile) {
        let missingCount = 0
        for (const t of this.tracks.values()) {
          if (t.folderId !== folderId) continue
          if (found.has(t.path.toLowerCase())) {
            if (t.missing) {
              t.missing = false
              missingCount--
            }
          } else if (!t.missing) {
            t.missing = true
            missingCount++
          }
        }
        result.missing += Math.max(0, missingCount)
      }
    }

    this.persist()
    return result
  }

  private publicOf(t: Track): { id: string; path: string; size: number; mtime: number } {
    return { id: t.id, path: t.path, size: t.size, mtime: t.mtime }
  }

  private async parseOne(
    file: AudioFileEntry,
    folderId: string,
    folderName: string
  ): Promise<Track | null> {
    const meta = await parseFile(file.path, { duration: true })
    const c = meta.common
    const id = trackIdOf(file.path)
    let coverPath: string | null = null
    const pic = c.picture && c.picture[0]
    if (pic && pic.data && pic.data.length > 0) {
      const ext = COVER_EXTS[String(pic.format).toLowerCase()] ?? 'jpg'
      coverPath = join(paths().covers, `${id}.${ext}`)
      try {
        await fs.mkdir(paths().covers, { recursive: true })
        await fs.writeFile(coverPath, Buffer.from(pic.data))
      } catch {
        coverPath = null
      }
    } else {
      // remove stale cover if a re-scan surfaced an un-tagged file
      const stale = join(paths().covers, `${id}.jpg`)
      await fs.rm(stale, { force: true }).catch(() => {})
    }
    return {
      id,
      path: file.path,
      ext: extOf(file.path),
      title: (c.title ?? '').trim() || fallbackName(file.path),
      artist: (c.artist ?? c.albumartist ?? '').trim() || UNKNOWN,
      album: (c.album ?? '').trim() || UNKNOWN,
      duration: Number.isFinite(meta.format.duration) ? Math.round(meta.format.duration ?? 0) : 0,
      coverPath,
      genre: (c.genre ?? []).join(' / '),
      year: c.year ?? null,
      trackNo: c.track?.no ?? null,
      folderId,
      folderName,
      size: file.size,
      mtime: file.mtime
    }
  }
}

function fallbackName(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path
  return base.replace(/\.[^.]+$/, '')
}

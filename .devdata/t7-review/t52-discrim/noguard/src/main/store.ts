import { promises as fs } from 'fs'
import { dirname, join } from 'path'
import { is } from '@electron-toolkit/utils'
import { app } from 'electron'

/**
 * Resolve the userData directory.
 * In development it lives inside the project (.devdata/user) so the sandboxed
 * environment can always write to it; in production the OS default is used.
 */
export function resolveUserData(): string {
  if (is.dev) {
    return join(process.cwd(), '.devdata', 'user')
  }
  return app.getPath('userData')
}

export function paths(): { userData: string; covers: string; decodeCache: string; logs: string } {
  const userData = resolveUserData()
  return {
    userData,
    covers: join(userData, 'covers'),
    decodeCache: join(userData, 'decode-cache'),
    logs: join(userData, 'logs')
  }
}

/**
 * Plain-object check. Arrays and `null` count as leaf values on purpose.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Overlay `stored` onto `defaults`, recursing into plain objects so a config
 * written by an older release can never drop a key this release expects.
 *
 * The shallow spread that used to live in `init()` was the actual defect: a
 * stored `general` object replaced the default one *wholesale*, so an install
 * upgraded from an older version had no `updateURL` and the 8s update check
 * threw `undefined.trim()` (logged as `uncaughtException`).
 *
 * Rules:
 *  - leaf default (string/number/boolean/array/null): an explicitly stored
 *    value wins, so user settings survive
 *  - object default + object stored: merged key by key, recursively
 *  - object default + non-object/missing stored: defaults win (type integrity)
 *  - keys present only in `stored` are preserved — never dropped, never renamed
 *
 * `added.any` is set when a key had to be filled in, which is what makes the
 * repair worth persisting.
 */
function mergeWithDefaults<T>(defaults: T, stored: unknown, added: { any: boolean }): T {
  if (!isPlainObject(defaults)) {
    if (stored === undefined) {
      added.any = true
      return defaults
    }
    return ((stored as T) ?? defaults) as T
  }
  if (!isPlainObject(stored)) {
    added.any = true
    return defaults
  }
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(defaults)) {
    if (!(key in stored)) added.any = true
    out[key] = mergeWithDefaults((defaults as Record<string, unknown>)[key], stored[key], added)
  }
  for (const key of Object.keys(stored)) {
    if (!(key in out)) out[key] = stored[key]
  }
  return out as T
}

/**
 * Tiny JSON document store with debounced atomic writes (tmp + rename).
 * Kept dependency-free on purpose: no native modules, no build issues.
 */
export class JsonStore<T extends object> {
  private file: string
  private data: T
  private defaults: T
  private timer: NodeJS.Timeout | null = null
  private writing = Promise.resolve()

  constructor(fileName: string, defaults: T) {
    this.file = join(paths().userData, fileName)
    this.defaults = JSON.parse(JSON.stringify(defaults)) as T
    this.data = this.cloneDefaults()
  }

  private cloneDefaults(): T {
    return JSON.parse(JSON.stringify(this.defaults)) as T
  }

  async init(): Promise<void> {
    try {
      const raw = await fs.readFile(this.file, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<T>
      const added = { any: false }
      const merged = mergeWithDefaults(this.cloneDefaults(), parsed, added)
      this.data = merged
      // Repair the file when the merge had to fill in keys the stored config was
      // missing — i.e. it came from an older release. A config that is already
      // complete is never rewritten.
      if (added.any) await this.flush()
    } catch {
      // first run or corrupt file — fall back to defaults
    }
  }

  get(): T {
    return this.data
  }

  /** merge partial and persist (debounced 250ms) */
  set(partial: Partial<T>): T {
    this.data = { ...this.data, ...partial }
    this.persist()
    return this.data
  }

  /** replace whole store */
  replace(next: T): T {
    this.data = next
    this.persist()
    return this.data
  }

  persist(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      void this.flush()
    }, 250)
  }

  /** force write immediately */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    const snapshot = JSON.stringify(this.data, null, 2)
    this.writing = this.writing.then(async () => {
      await fs.mkdir(dirname(this.file), { recursive: true })
      const tmp = this.file + '.tmp'
      await fs.writeFile(tmp, snapshot, 'utf-8')
      await fs.rename(tmp, this.file)
    })
    await this.writing
  }
}

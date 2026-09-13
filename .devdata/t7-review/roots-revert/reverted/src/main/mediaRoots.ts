// ===========================================================================
// [t7-review COPY-LEVEL REVERT — this is NOT the repository file]
// Byte-identical copy of src/main/mediaRoots.ts with the pre-r3 semantics
// re-introduced, purely to discriminate the unit tests. No file under src/**
// was modified. See the accompanying unified diff for the exact patch.
// ===========================================================================
import { dirname, resolve } from 'path'

/**
 * Servable-root state machine for the `media://` protocol.
 *
 * Deliberately free of Electron imports. `protocol.ts` pulls in `electron` and
 * `store.ts` at module scope, so it cannot be imported under vitest's
 * `environment: 'node'` — extracting the state machine (the same trick `lrc.ts`
 * and `mediaFormats.ts` use) is what makes the two regressions below permanently
 * testable instead of only observable through a runtime probe:
 *
 *   1. A boolean latch set BEFORE the first `await` let a concurrent cold-start
 *      request run its containment check against an EMPTY root set, so every
 *      request after the first got a 403. Caching the *promise* means all
 *      concurrent callers await the same population.
 *   2. A write-once root set stayed pinned to the startup snapshot, so a folder
 *      scanned later kept returning 403 for every directly-playable file inside
 *      it until the app restarted. `refresh()` re-derives the set.
 */

export interface MediaRootsOptions {
  /**
   * Directories that are always servable (the cover and decode caches).
   * A FUNCTION on purpose: it must be evaluated when the roots are populated,
   * NOT at module load, because `app.setPath('userData', …)` runs after this
   * module's body in dev — resolving early would point at the wrong userData.
   */
  staticRoots: () => Array<string | null | undefined>
  /** Reads + parses the library document; may reject when there is none yet. */
  readLibrary: () => Promise<unknown>
}

export interface MediaRoots {
  /** Roots servable right now — the synchronous view used by containment. */
  current: () => string[]
  /** Populate once on first use, then hand the cached result to every caller. */
  get: () => Promise<string[]>
  /** Replace the roots outright. */
  set: (roots: Array<string | null | undefined>) => void
  /** Re-derive the roots from the library and cache the result. */
  refresh: () => Promise<string[]>
}

function toAbsolute(roots: Array<string | null | undefined>): string[] {
  return roots
    .filter((r): r is string => typeof r === 'string' && r.length > 0)
    .map((r) => resolve(r))
}

export function createMediaRoots(options: MediaRootsOptions): MediaRoots {
  let allowed: string[] = []
  // [REVERT] the pre-r3 latch: set BEFORE the awaits, so a concurrent
  // cold-start request observes the still-empty `allowed`.
  let rootsLoaded = false

  /**
   * Derive the roots from the scanned library plus the app's own cache
   * directories. Deliberately NOT the whole userData dir: `settings.json` (API
   * key) lives there and must never be servable. A library entry's own directory
   * and its cover directory are added, so covers work even when they were
   * extracted next to the audio rather than into `<userData>/covers`.
   */
  const populate = async (): Promise<string[]> => {
    const roots = new Set<string>(toAbsolute(options.staticRoots()))
    try {
      const parsed = await options.readLibrary()
      const tracks = parsed as Array<{ path?: unknown; coverPath?: unknown }>
      for (const t of tracks) {
        if (typeof t.path === 'string' && t.path) roots.add(resolve(dirname(t.path)))
        if (typeof t.coverPath === 'string' && t.coverPath) roots.add(resolve(dirname(t.coverPath)))
      }
    } catch {
      // no library yet → only the static roots are servable (nothing to stream)
    }
    return Array.from(roots)
  }

  // [REVERT] write-once latch; the populate result lands after the await
  const get = async (): Promise<string[]> => {
    if (!rootsLoaded) {
      rootsLoaded = true
      allowed = await populate()
    }
    return allowed
  }

  const set = (roots: Array<string | null | undefined>): void => {
    allowed = toAbsolute(roots)
  }

  // [REVERT] the pre-r3 behaviour: there was no working refresh path at all.
  const refresh = async (): Promise<string[]> => allowed

  return { current: () => allowed, get, set, refresh }
}

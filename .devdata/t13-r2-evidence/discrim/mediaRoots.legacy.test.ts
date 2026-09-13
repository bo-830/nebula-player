import { describe, expect, it } from 'vitest'
import { dirname, resolve } from 'path'
import { createMediaRoots } from './legacy-mediaRoots'

/** the directory a library entry contributes as a root */
const dirOf = (p: string): string => resolve(dirname(p))

/**
 * These two groups pin the regressions that shipped in protocol.ts and were only
 * caught by a runtime probe. Both must keep failing if the state machine
 * degenerates back to (1) a latch or (2) a write-once set.
 */
describe('createMediaRoots — cold-start concurrency (regression 1)', () => {
  it('resolves EVERY concurrent first call to the fully populated set', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    const roots = createMediaRoots({
      staticRoots: () => ['/cache/covers'],
      readLibrary: async () => {
        await gate
        return [{ path: '/music/song.mp3' }]
      }
    })

    // four requests arrive while the first populate is still in flight
    const inFlight = [roots.get(), roots.get(), roots.get(), roots.get()]
    release()
    const results = await Promise.all(inFlight)

    for (const r of results) {
      expect(r.length).toBeGreaterThan(0) // a latch would hand out []
      expect(r).toContain(dirOf('/music/song.mp3'))
      expect(r).toContain(resolve('/cache/covers'))
    }
    // every caller observes the very same array instance
    expect(new Set(results).size).toBe(1)
  })

  it('reads the library only once across concurrent and later callers', async () => {
    let reads = 0
    const roots = createMediaRoots({
      staticRoots: () => [],
      readLibrary: async () => {
        reads += 1
        return [{ path: '/music/a.mp3' }]
      }
    })

    await Promise.all([roots.get(), roots.get()])
    await roots.get()
    expect(reads).toBe(1)
  })

  it('falls back to the static roots when the library cannot be read', async () => {
    const roots = createMediaRoots({
      staticRoots: () => ['/cache/covers'],
      readLibrary: async () => {
        throw new Error('ENOENT')
      }
    })
    expect(await roots.get()).toEqual([resolve('/cache/covers')])
  })

  it('evaluates staticRoots lazily, at populate time', async () => {
    // mirrors `app.setPath('userData', …)` running after module load: resolving
    // at import time would pin the wrong userData
    let userData = '/before-setPath'
    const roots = createMediaRoots({
      staticRoots: () => [userData],
      readLibrary: async () => []
    })
    userData = '/after-setPath'
    expect(await roots.get()).toEqual([resolve('/after-setPath')])
  })
})

describe('createMediaRoots — refresh (regression 2)', () => {
  it('applies a folder that only appeared after the first population', async () => {
    let tracks: Array<{ path: string }> = [{ path: '/music/a.mp3' }]
    const roots = createMediaRoots({ staticRoots: () => [], readLibrary: async () => tracks })

    await roots.get()
    expect(roots.current()).toContain(dirOf('/music/a.mp3'))
    expect(roots.current()).not.toContain(dirOf('/newdir/b.flac'))

    // user scans a new folder; library.json gains a track inside it
    tracks = [...tracks, { path: '/newdir/b.flac' }]
    await roots.refresh()
    expect(roots.current()).toContain(dirOf('/newdir/b.flac'))
  })

  it('can be replaced again and drops directories that are gone', async () => {
    let tracks: Array<{ path: string }> = [{ path: '/newdir/b.flac' }]
    const roots = createMediaRoots({ staticRoots: () => [], readLibrary: async () => tracks })

    await roots.get()
    await roots.refresh()
    expect(roots.current()).toContain(dirOf('/newdir/b.flac'))

    tracks = [{ path: '/third/c.mp3' }]
    await roots.refresh()
    expect(roots.current()).toContain(dirOf('/third/c.mp3'))
    expect(roots.current()).not.toContain(dirOf('/newdir/b.flac'))
  })

  it('set() replaces the set and is visible to later get() calls', async () => {
    const roots = createMediaRoots({
      staticRoots: () => [],
      readLibrary: async () => [{ path: '/music/a.mp3' }]
    })
    await roots.get()
    roots.set(['/manual'])
    expect(roots.current()).toEqual([resolve('/manual')])
    expect(await roots.get()).toEqual([resolve('/manual')])
  })

  it('a set() during an in-flight populate wins over that populate', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    const roots = createMediaRoots({
      staticRoots: () => [],
      readLibrary: async () => {
        await gate
        return [{ path: '/slow/a.mp3' }]
      }
    })

    const inFlight = roots.get()
    roots.set(['/manual']) // e.g. a scan completes first
    release()
    await inFlight

    expect(roots.current()).toContain(resolve('/manual'))
    expect(roots.current()).not.toContain(dirOf('/slow/a.mp3'))
  })

  it('refresh() records the library even when nothing was served yet', async () => {
    let tracks: Array<{ path: string }> = [{ path: '/music/a.mp3' }]
    const roots = createMediaRoots({ staticRoots: () => [], readLibrary: async () => tracks })

    // refresh before any get() — the state must still be populated
    tracks = [{ path: '/scanned/d.mp3' }]
    await roots.refresh()
    expect(roots.current()).toContain(dirOf('/scanned/d.mp3'))
    expect(await roots.get()).toContain(dirOf('/scanned/d.mp3'))
  })
})

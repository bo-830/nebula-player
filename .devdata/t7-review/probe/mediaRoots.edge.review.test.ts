/**
 * t7 adversarial-review edge probe. Imports the REAL src/main/mediaRoots.ts
 * READ-ONLY (it is Electron-free by design, see the module header) and tries to
 * break the two invariants the r3 fix claims:
 *
 *   (1) no caller ever observes an empty/partial root set,
 *   (2) refresh() always re-derives the current roots.
 *
 * Every expectation below states the behaviour *predicted by reading the code*;
 * a failure therefore means the reading was wrong, which is reported as such.
 * Nothing under src/** or scripts/** is written by this file.
 *
 * Run: npx.cmd vitest run --config .devdata/t7-review/probe/vitest.probe.config.ts --reporter=verbose
 */
import { describe, expect, it } from 'vitest'
import { dirname, resolve } from 'path'
import { createMediaRoots } from '../../../src/main/mediaRoots'

const dirOf = (p: string): string => resolve(dirname(p))

describe('mediaRoots edge probe — cold-start concurrency, adversarial', () => {
  it('P1: 64 concurrent first callers all get the same fully populated array', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    let reads = 0
    const roots = createMediaRoots({
      staticRoots: () => ['/cache/covers'],
      readLibrary: async () => {
        reads += 1
        await gate
        return [{ path: '/music/a.mp3' }, { path: '/music2/b.flac' }]
      }
    })

    const callers = Array.from({ length: 64 }, () => roots.get())
    release()
    const results = await Promise.all(callers)

    expect(reads).toBe(1)
    expect(new Set(results).size).toBe(1)
    for (const r of results) {
      expect(r).toContain(dirOf('/music/a.mp3'))
      expect(r).toContain(dirOf('/music2/b.flac'))
      expect(r).toContain(resolve('/cache/covers'))
    }
  })

  it('P2: the only empty-set window is current() BEFORE the promise resolves (protocol.ts awaits first)', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    const roots = createMediaRoots({
      staticRoots: () => ['/cache/covers'],
      readLibrary: async () => {
        await gate
        return [{ path: '/music/a.mp3' }]
      }
    })

    const inFlight = roots.get()
    // synchronous view is still empty while the population is in flight …
    expect(roots.current()).toEqual([])
    let settled = false
    void inFlight.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    release()
    await inFlight
    // … and non-empty afterwards. protocol.ts:145 awaits get() before
    // isInsideRoots() reads current(), so the request path never sees the [].
    expect(roots.current()).toContain(dirOf('/music/a.mp3'))
  })
})

describe('mediaRoots edge probe — resolution failure', () => {
  it('P3: a throw OUTSIDE the inner try poisons pending permanently (only refresh() repairs it)', async () => {
    let boom = true
    const roots = createMediaRoots({
      staticRoots: () => {
        if (boom) throw new Error('boom: staticRoots unavailable')
        return ['/cache/covers']
      },
      readLibrary: async () => []
    })

    let first: unknown = null
    let second: unknown = null
    try {
      await roots.get()
    } catch (e) {
      first = e
    }
    expect(String(first)).toContain('boom')

    // the transient cause is gone, but the same rejected promise is replayed
    boom = false
    try {
      await roots.get()
    } catch (e) {
      second = e
    }
    expect(second).not.toBeNull() // PREDICTED DEFECT: no self-healing on get()
    expect(roots.current()).toEqual([])

    // refresh() is the only recovery, and it happens only after a scan
    await roots.refresh()
    expect(roots.current()).toEqual([resolve('/cache/covers')])
  })

  it('P4: a NUL-containing path does NOT throw (hypothesis falsified) and a non-iterable document collapses the set', async () => {
    // Adversarial hypothesis that FAILED: a NUL byte inside a track path would
    // make resolve() throw mid-loop and leak a partial set. Empirically it does
    // not throw in this Node build, and every other step in the loop is pure
    // string work, so nothing inside the try can abort it halfway.
    const nulThrows = (() => {
      try {
        resolve('/b\u0000/y.mp3')
        return false
      } catch {
        return true
      }
    })()
    expect(nulThrows).toBe(false)

    // What IS reachable: a library document that is not an array throws at the
    // `for (const t of tracks)` head, the bare `catch {}` swallows it, and the
    // whole track contribution is dropped with no log line.
    const roots = createMediaRoots({
      staticRoots: () => ['/cache/covers'],
      readLibrary: async () => ({ tracks: [{ path: '/a/x.mp3' }] }) as unknown
    })
    const r = await roots.get()

    expect(r).toEqual([resolve('/cache/covers')]) // /a silently missing
  })

  it('P5: refresh() replaces outright, so a failed library read temporarily empties every library root', async () => {
    let broken = false
    const roots = createMediaRoots({
      staticRoots: () => ['/cache/covers'],
      readLibrary: async () => {
        if (broken) throw new Error('ENOENT: library.json')
        return [{ path: '/music/a.mp3' }]
      }
    })

    await roots.get()
    expect(roots.current()).toContain(dirOf('/music/a.mp3'))

    broken = true // e.g. library.json unreadable / not valid JSON at that instant
    await roots.refresh()
    expect(roots.current()).toEqual([resolve('/cache/covers')]) // /music silently gone

    broken = false
    await roots.refresh()
    expect(roots.current()).toContain(dirOf('/music/a.mp3'))
  })
})

describe('mediaRoots edge probe — refresh semantics', () => {
  it('P6: refresh() re-evaluates staticRoots() every time and drops what is gone', async () => {
    let staticDir = '/s1'
    const roots = createMediaRoots({ staticRoots: () => [staticDir], readLibrary: async () => [] })

    await roots.get()
    expect(roots.current()).toEqual([resolve('/s1')])
    staticDir = '/s2'
    await roots.refresh()
    expect(roots.current()).toEqual([resolve('/s2')])
  })

  it('P7: a SYNCHRONOUS re-entrant get() from inside readLibrary() escapes the cache and can see []', async () => {
    let nested: Promise<string[]> | null = null
    let calls = 0
    const roots = createMediaRoots({
      staticRoots: () => ['/cache/covers'],
      readLibrary: () => {
        calls += 1
        if (calls === 1) nested = roots.get() // re-enters BEFORE `pending = promise` runs
        return Promise.resolve([{ path: '/music/a.mp3' }])
      }
    })

    const first = roots.get()
    const [a, b] = await Promise.all([first, nested as unknown as Promise<string[]>])

    expect(calls).toBe(2) // the window is real …
    expect(a).toContain(dirOf('/music/a.mp3'))
    // … and the re-entrant caller is handed the still-empty set. NOT reachable
    // through protocol.ts's callbacks (staticRoots() is a pure paths() read and
    // readLibrary()'s body is `JSON.parse(await fs.readFile(...))`), so this is
    // recorded as a latent hazard, not a live defect.
    expect(b).toEqual([])
  })
})

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { collectAudioFiles, displayFolderName, extOf, mapLimit } from '../scanner'

describe('extOf', () => {
  it('returns the lowercase extension without the dot', () => {
    expect(extOf('/music/song.mp3')).toBe('mp3')
    expect(extOf('C:\\music\\SONG.FLAC')).toBe('flac')
    expect(extOf('/music/song.2024.ape')).toBe('ape')
  })

  it('returns an empty string when there is no extension', () => {
    expect(extOf('/music/noext')).toBe('')
    expect(extOf('')).toBe('')
  })
})

describe('displayFolderName', () => {
  it('uses the last path segment', () => {
    expect(displayFolderName(join('a', 'b', 'Music'))).toBe('Music')
    expect(displayFolderName('C:\\Users\\x\\Music')).toBe('Music')
  })
})

describe('mapLimit', () => {
  it('preserves input order even when tasks resolve out of order', async () => {
    const out = await mapLimit([30, 5, 15, 0], 4, async (delay, i) => {
      await new Promise((r) => setTimeout(r, delay))
      return `item-${i}`
    })
    expect(out).toEqual(['item-0', 'item-1', 'item-2', 'item-3'])
  })

  it('never runs more than `limit` tasks at once', async () => {
    let active = 0
    let peak = 0
    const out = await mapLimit([...Array(10).keys()], 3, async (n) => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((r) => setTimeout(r, 4))
      active -= 1
      return n * 2
    })
    expect(peak).toBeLessThanOrEqual(3)
    expect(peak).toBeGreaterThan(1)
    expect(out).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18])
  })

  it('handles empty input and a limit larger than the item count', async () => {
    expect(await mapLimit([], 5, async (n: number) => n)).toEqual([])
    expect(await mapLimit([1, 2], 50, async (n) => n + 1)).toEqual([2, 3])
  })

  it('receives the index alongside each item', async () => {
    const seen = await mapLimit(['a', 'b', 'c'], 2, async (item, i) => `${i}:${item}`)
    expect(seen).toEqual(['0:a', '1:b', '2:c'])
  })
})

describe('collectAudioFiles', () => {
  let root = ''

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'nebula-scan-'))
    await writeFile(join(root, 'song.mp3'), 'a')
    await writeFile(join(root, 'track.FLAC'), 'b')
    await writeFile(join(root, 'notes.txt'), 'c')
    await writeFile(join(root, 'movie.mp4'), 'd')
    await mkdir(join(root, 'sub'))
    await writeFile(join(root, 'sub', 'child.wav'), 'e')
    await mkdir(join(root, '.hidden'))
    await writeFile(join(root, '.hidden', 'hidden.mp3'), 'f')
    await mkdir(join(root, 'node_modules'))
    await writeFile(join(root, 'node_modules', 'nm.mp3'), 'g')
    await mkdir(join(root, '.git'))
    await writeFile(join(root, '.git', 'git.mp3'), 'h')
  })

  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true })
  })

  it('collects supported audio recursively and skips hidden/tool dirs', async () => {
    const found = await collectAudioFiles(root, { cancelled: false })
    const names = found.map((f) => f.path.slice(root.length + 1)).sort()
    expect(names).toEqual(['song.mp3', join('sub', 'child.wav'), 'track.FLAC'])
    expect(found.every((f) => f.size > 0)).toBe(true)
    expect(found.every((f) => Number.isFinite(f.mtime) && f.mtime > 0)).toBe(true)
  })

  it('does not descend into .hidden, node_modules or .git', async () => {
    const found = await collectAudioFiles(root, { cancelled: false })
    const joined = found.map((f) => f.path)
    expect(joined.some((p) => p.includes('.hidden'))).toBe(false)
    expect(joined.some((p) => p.includes('node_modules'))).toBe(false)
    expect(joined.some((p) => p.includes(join(root, '.git')))).toBe(false)
  })

  it('imports a single supported file directly', async () => {
    const found = await collectAudioFiles(join(root, 'song.mp3'), { cancelled: false })
    expect(found).toHaveLength(1)
    expect(found[0].path).toBe(join(root, 'song.mp3'))
    expect(found[0].size).toBe(1)
  })

  it('returns nothing for an unsupported single file or a missing path', async () => {
    expect(await collectAudioFiles(join(root, 'notes.txt'), { cancelled: false })).toEqual([])
    expect(await collectAudioFiles(join(root, 'does-not-exist'), { cancelled: false })).toEqual([])
  })

  it('stops immediately when the signal is already cancelled', async () => {
    expect(await collectAudioFiles(root, { cancelled: true })).toEqual([])
  })
})

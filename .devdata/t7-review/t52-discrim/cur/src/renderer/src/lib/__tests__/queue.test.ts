import { describe, expect, it } from 'vitest'
import { withQueueContext } from '../queue'

interface T {
  id: string
  artist: string
  album: string
}

const t = (id: string, artist: string, album: string): T => ({ id, artist, album })

describe('withQueueContext', () => {
  it('expands a single request to the same album first', () => {
    const first = t('a1', 'Artist A', 'Album A')
    const all = [
      first,
      t('a2', 'Artist A', 'Album A'),
      t('a3', 'Artist A', 'Album A'),
      t('b1', 'Artist B', 'Album B')
    ]
    const out = withQueueContext([first], all)
    expect(out[0]).toBe(first)
    expect(out.slice(0, 3).map((x) => x.id)).toEqual(['a1', 'a2', 'a3'])
  })

  it('falls back to the same artist when the album is too small', () => {
    const first = t('a1', 'Artist A', 'Album A')
    const all = [
      first,
      t('b1', 'Artist B', 'Album B'),
      t('a2', 'Artist A', 'Album C'),
      t('a3', 'Artist A', 'Album D')
    ]
    const out = withQueueContext([first], all)
    expect(out.map((x) => x.id)).toEqual(['a1', 'a2', 'a3', 'b1'])
    expect(out.every((x) => x.artist === 'Artist A' || x.id === 'b1')).toBe(true)
  })

  it('fills from the whole library when the artist has too few tracks', () => {
    const first = t('a1', 'Artist A', 'Album A')
    const all = [first, t('b1', 'Artist B', 'Album B'), t('c1', 'Artist C', 'Album C')]
    const out = withQueueContext([first], all)
    expect(out).toHaveLength(3)
    expect(new Set(out.map((x) => x.id)).size).toBe(3)
    expect(out[0].id).toBe('a1')
  })

  it('never duplicates the requested track and drops missing ids', () => {
    const first = t('a1', 'Artist A', 'Album A')
    const all = [first, first, t('a2', 'Artist A', 'Album A'), t('a2', 'Artist A', 'Album A')]
    const out = withQueueContext([first], all)
    expect(out.map((x) => x.id)).toEqual(['a1', 'a2'])
  })

  it('respects the 50-track cap', () => {
    const first = t('t0', 'Artist A', 'Album A')
    const all = [
      first,
      ...Array.from({ length: 200 }, (_, i) => t(`t${i + 1}`, 'Artist A', 'Album A'))
    ]
    const out = withQueueContext([first], all)
    expect(out).toHaveLength(50)
    expect(out[0].id).toBe('t0')
  })

  it('honours a custom cap', () => {
    const first = t('t0', 'Artist A', 'Album A')
    const all = [
      first,
      ...Array.from({ length: 20 }, (_, i) => t(`t${i + 1}`, 'Artist A', 'Album A'))
    ]
    expect(withQueueContext([first], all, 5)).toHaveLength(5)
  })

  it('returns multi-track requests untouched', () => {
    const requested = [t('a1', 'Artist A', 'Album A'), t('b1', 'Artist B', 'Album B')]
    const all = [...requested, t('c1', 'Artist C', 'Album C')]
    const out = withQueueContext(requested, all)
    expect(out).toBe(requested)
  })

  it('returns the request untouched when the library has a single track', () => {
    const requested = [t('a1', 'Artist A', 'Album A')]
    expect(withQueueContext(requested, requested)).toBe(requested)
    expect(withQueueContext(requested, [])).toBe(requested)
  })

  it('keeps library order within each fill stage', () => {
    const first = t('a1', 'Artist A', 'Album A')
    const all = [
      first,
      t('z1', 'Artist Z', 'Album Z'),
      t('a2', 'Artist A', 'Album A'),
      t('y1', 'Artist Y', 'Album Y')
    ]
    const out = withQueueContext([first], all)
    expect(out.map((x) => x.id)).toEqual(['a1', 'a2', 'z1', 'y1'])
  })
})

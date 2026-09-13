import { describe, expect, it } from 'vitest'
import { parseLrc } from '../lrc'

describe('parseLrc', () => {
  it('parses standard [mm:ss.xx] timestamps', () => {
    const lines = parseLrc('[00:01.50]first\n[01:02.25]second')
    expect(lines).toEqual([
      { t: 1.5, text: 'first' },
      { t: 62.25, text: 'second' }
    ])
  })

  it('accepts [mm:ss] without a fraction and the [mm:ss:xx] colon form', () => {
    const lines = parseLrc('[00:05]no-fraction\n[00:07:25]colon-fraction')
    expect(lines).toEqual([
      { t: 5, text: 'no-fraction' },
      { t: 7.25, text: 'colon-fraction' }
    ])
  })

  it('treats .5 / .50 / .500 identically (fraction scaled by digit count)', () => {
    const lines = parseLrc('[00:01.5]a\n[00:02.50]b\n[00:03.500]c')
    expect(lines.map((l) => l.t)).toEqual([1.5, 2.5, 3.5])
  })

  it('expands one line carrying several timestamps into several entries', () => {
    const lines = parseLrc('[00:01.00][00:05.00]chorus')
    expect(lines).toEqual([
      { t: 1, text: 'chorus' },
      { t: 5, text: 'chorus' }
    ])
  })

  it('ignores metadata tags such as [ti:] and [ar:]', () => {
    const lines = parseLrc('[ti:Song]\n[ar:Artist]\n[al:Album]\n[00:03.00]real line')
    expect(lines).toEqual([{ t: 3, text: 'real line' }])
  })

  it('sorts out-of-order timestamps ascending', () => {
    const lines = parseLrc('[00:30.00]late\n[00:01.00]early\n[00:10.00]middle')
    expect(lines.map((l) => l.text)).toEqual(['early', 'middle', 'late'])
    expect(lines.map((l) => l.t)).toEqual([1, 10, 30])
  })

  it('returns nothing for empty text or lines without a timestamp', () => {
    expect(parseLrc('')).toEqual([])
    expect(parseLrc('\n\n   \n')).toEqual([])
    expect(parseLrc('just a plain sentence\nanother one')).toEqual([])
  })

  it('keeps an empty text for a timestamp-only line and handles CRLF', () => {
    const lines = parseLrc('[00:02.00]\r\n[00:04.00]words\r\n')
    expect(lines).toEqual([
      { t: 2, text: '' },
      { t: 4, text: 'words' }
    ])
  })

  it('supports 3-digit minutes (long tracks) and 1-digit seconds', () => {
    const lines = parseLrc('[100:05.00]long')
    expect(lines).toEqual([{ t: 6005, text: 'long' }])
  })
})

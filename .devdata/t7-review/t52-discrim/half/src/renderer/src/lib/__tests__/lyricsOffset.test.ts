import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { beforeEach, describe, expect, it } from 'vitest'
import {
  OFFSET_STEP,
  STORAGE_KEY,
  adjustOffset,
  clearOffset,
  formatOffset,
  getOffset,
  getOffsetSnapshot,
  hasOffset,
  setOffset,
  subscribeOffsets
} from '../lyricsOffset'

const backing = new Map<string, string>()

const fakeStorage = {
  getItem: (k: string): string | null => backing.get(k) ?? null,
  setItem: (k: string, v: string): void => void backing.set(k, v),
  removeItem: (k: string): void => void backing.delete(k),
  clear: (): void => backing.clear(),
  key: (i: number): string | null => Array.from(backing.keys())[i] ?? null,
  get length(): number {
    return backing.size
  }
}

/** Install a fake `window` — the module only reaches for localStorage at call time. */
function installWindow(localStorage: unknown): void {
  Object.defineProperty(globalThis, 'window', {
    value: {
      localStorage,
      addEventListener: (): void => {},
      removeEventListener: (): void => {}
    },
    writable: true,
    configurable: true
  })
}

beforeEach(() => {
  backing.clear()
  installWindow(fakeStorage)
})

describe('lyricsOffset — stepping', () => {
  it('adjusts by the ±0.5s step', () => {
    expect(OFFSET_STEP).toBe(0.5)
    expect(adjustOffset('t1')).toBe(0.5)
    expect(adjustOffset('t1')).toBe(1)
    expect(adjustOffset('t1', -OFFSET_STEP)).toBe(0.5)
    expect(adjustOffset('t1', -1)).toBe(-0.5)
  })

  it('clamps to ±30s in both directions', () => {
    expect(setOffset('t1', 100)).toBe(30)
    expect(getOffset('t1')).toBe(30)
    expect(setOffset('t1', -100)).toBe(-30)
    expect(getOffset('t1')).toBe(-30)
  })

  it('rounds to 0.1s precision', () => {
    expect(setOffset('t1', 0.44)).toBe(0.4)
    expect(setOffset('t1', 0.46)).toBe(0.5)
    expect(setOffset('t1', -1.24)).toBe(-1.2)
  })

  it('treats non-finite input as zero rather than NaN', () => {
    expect(setOffset('t1', Number.NaN)).toBe(0)
    expect(setOffset('t2', Number.POSITIVE_INFINITY)).toBe(0)
    expect(getOffset('t2')).toBe(0)
  })
})

describe('lyricsOffset — storage', () => {
  it('stores per track and keeps trackIds isolated', () => {
    setOffset('a', 0.5)
    setOffset('b', -1)
    expect(getOffset('a')).toBe(0.5)
    expect(getOffset('b')).toBe(-1)
    expect(getOffset('c')).toBe(0)
  })

  it('removes the entry (and the key) when the offset becomes 0', () => {
    setOffset('a', 0.5)
    expect(backing.has(STORAGE_KEY)).toBe(true)
    setOffset('a', 0)
    expect(getOffset('a')).toBe(0)
    expect(backing.has(STORAGE_KEY)).toBe(false)
  })

  it('clearOffset forgets a single track only', () => {
    setOffset('a', 1)
    setOffset('b', 2)
    clearOffset('a')
    expect(getOffset('a')).toBe(0)
    expect(getOffset('b')).toBe(2)
  })

  it('ignores a null/undefined/empty trackId without writing', () => {
    expect(getOffset(null)).toBe(0)
    expect(getOffset(undefined)).toBe(0)
    expect(getOffset('')).toBe(0)
    expect(setOffset(null, 5)).toBe(0)
    expect(adjustOffset(undefined)).toBe(0)
    expect(backing.size).toBe(0)
  })

  it('survives corrupt JSON and drops non-numeric entries', () => {
    backing.set(STORAGE_KEY, '{not json')
    expect(() => getOffset('a')).not.toThrow()
    expect(getOffset('a')).toBe(0)

    backing.set(STORAGE_KEY, JSON.stringify({ good: 1.5, bad: 'x', nil: null, big: 99 }))
    expect(getOffset('good')).toBe(1.5)
    expect(getOffset('bad')).toBe(0)
    expect(getOffset('nil')).toBe(0)
    expect(getOffset('big')).toBe(30)
  })

  it('does not throw when localStorage is unavailable or missing', () => {
    installWindow(undefined)
    expect(() => setOffset('a', 1)).not.toThrow()
    expect(getOffset('a')).toBe(0)

    installWindow({
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
      removeItem: () => {
        throw new Error('denied')
      }
    })
    expect(() => setOffset('a', 1)).not.toThrow()
    expect(() => clearOffset('a')).not.toThrow()
    expect(getOffset('a')).toBe(0)
  })
})

describe('lyricsOffset — display + external store', () => {
  it('formatOffset renders signed tenths and clamps first', () => {
    expect(formatOffset(0)).toBe('0.0s')
    expect(formatOffset(0.5)).toBe('+0.5s')
    expect(formatOffset(-1)).toBe('-1.0s')
    expect(formatOffset(2.25)).toBe('+2.3s')
    expect(formatOffset(1000)).toBe('+30.0s')
    expect(formatOffset(Number.NaN)).toBe('0.0s')
  })

  it('hasOffset is false for zero and for values that round to zero', () => {
    expect(hasOffset(0)).toBe(false)
    expect(hasOffset(0.04)).toBe(false)
    expect(hasOffset(0.5)).toBe(true)
    expect(hasOffset(-0.5)).toBe(true)
  })

  it('notifies subscribers on write and stops after unsubscribing', () => {
    let calls = 0
    const unsubscribe = subscribeOffsets(() => {
      calls += 1
    })
    setOffset('a', 0.5)
    expect(calls).toBe(1)
    adjustOffset('a')
    expect(calls).toBe(2)

    unsubscribe()
    setOffset('a', 1)
    expect(calls).toBe(2)
  })

  it('getOffsetSnapshot returns a live getter for useSyncExternalStore', () => {
    const snap = getOffsetSnapshot('a')
    expect(snap()).toBe(0)
    setOffset('a', 1.5)
    expect(snap()).toBe(1.5)
    expect(getOffsetSnapshot(null)()).toBe(0)
  })
})

/**
 * R4(c) — pin the sign convention of the lyric offset (r2 review).
 *
 * The convention (documented in `lyricsOffset.ts`): a POSITIVE offset means the
 * lyrics are shown LATER, i.e. a line stamped `t` becomes active at
 * `t - GRACE - offset`, so raising the offset moves the highlighted line
 * FORWARD (earlier). Both consumer panels evaluate exactly
 *
 *     active = last line whose t <= currentTime + GRACE + offset
 *
 * (LyricsPanel: `const t = currentTime + 0.12 + offset`;
 *  MiniPlayer:  `lines[i].t <= display + 0.12 + offset`).
 * Before this case NOTHING pinned that direction: flipping either `+ offset`
 * to `- offset` left the whole suite green (t14 §R4(c)).
 *
 * The cases below guard it in two layers:
 *  1. numerically, through the local `activeIndexAt` mirror; and
 *  2. against the real call sites: the last case reads `LyricsPanel.tsx` and
 *     `MiniPlayer.tsx` off disk and witnesses their actual offset arithmetic, so
 *     a sign flip in a panel now fails a test. A mirror-only assertion left the
 *     panels unguarded — that was an r3 review finding (R4(c)).
 */
const GRACE = 0.12

/** mirrors the two panels' expression, so the assertion below can be discriminated */
function activeIndexAt(lines: number[], currentTime: number, offset: number): number {
  const t = currentTime + GRACE + offset
  let idx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] <= t) idx = i
    else break
  }
  return idx
}

/** the instant `t` first becomes active: t = currentTime + GRACE + offset */
function activationInstant(t: number, offset: number): number {
  return t - GRACE - offset
}

describe('lyricsOffset — sign convention (positive offset = highlight moves forward)', () => {
  // 10s-stamped line at index 1, activated when currentTime + GRACE + offset >= 10
  const LINES = [0, 10, 20]

  it('a line activates EARLIER with a positive offset and LATER with a negative one', () => {
    const ct = 9.4 // + GRACE = 9.52 → below 10, the boundary is the offset

    // exact activation point: 10 - GRACE - offset
    expect(activeIndexAt(LINES, 10 - GRACE - 0, 0)).toBe(1) // exactly on the line
    expect(activeIndexAt(LINES, 10 - GRACE - 1, 1)).toBe(1) // +1s activates 1s earlier
    expect(activeIndexAt(LINES, 10 - GRACE + 1, -1)).toBe(1) // -1s activates 1s later

    expect(activeIndexAt(LINES, ct, 0)).toBe(0) // 9.52 < 10 → not yet
    expect(activeIndexAt(LINES, ct, 0.5)).toBe(1) // 10.02 ≥ 10 → the positive offset's shift
    expect(activeIndexAt(LINES, ct, -0.5)).toBe(0) // 9.02 < 10 → negative delays it

    // The t14 §R4(c) recommended discriminative points, asserted literally:
    // a POSITIVE offset advances the highlight, so the t=10 line is already active
    // at currentTime ≈ 9.4 …
    expect(activeIndexAt(LINES, 9.4, OFFSET_STEP)).toBe(1)
    // … whereas with −0.5 it only activates at ≈ 10.4, so 9.4 is (still) before it.
    expect(activeIndexAt(LINES, 9.4, -OFFSET_STEP)).toBe(0)
    expect(activeIndexAt(LINES, 10.4, -OFFSET_STEP)).toBe(1)

    // Exact boundaries, derived from the implementation formula (`t - GRACE - offset`):
    // +0.5 activates at 10 − 0.12 − 0.5 = 9.38, −0.5 at 10 − 0.12 + 0.5 = 10.38.
    for (const offset of [OFFSET_STEP, -OFFSET_STEP]) {
      const instant = activationInstant(10, offset)
      expect(activeIndexAt(LINES, instant, offset)).toBe(1) // exactly on it
      expect(activeIndexAt(LINES, instant - 0.01, offset)).toBe(0) // one hundredth early
    }
  })

  it('the ±0.5 step moves the activation instant by exactly the opposite sign', () => {
    const t = 10
    const base = activationInstant(t, 0)
    // positive offset ⇒ activation happens 0.5s EARLIER (smaller instant)
    expect(base - activationInstant(t, OFFSET_STEP)).toBeCloseTo(OFFSET_STEP, 10)
    // negative offset ⇒ activation happens 0.5s LATER (larger instant)
    expect(activationInstant(t, -OFFSET_STEP) - base).toBeCloseTo(OFFSET_STEP, 10)
    // the direction holds across the whole range the UI can reach
    expect(activationInstant(t, 2)).toBeLessThan(activationInstant(t, 1))
    expect(activationInstant(t, 1)).toBeLessThan(base)
    expect(activationInstant(t, -1)).toBeGreaterThan(base)

    // Exact activation boundary: currentTime + GRACE + offset === 10 hits the line
    // and one hundredth less does not. With the sign flipped the first of these two
    // flips to "not active", so the case is discriminative.
    expect(activeIndexAt(LINES, 10 - GRACE - OFFSET_STEP, OFFSET_STEP)).toBe(1)
    expect(activeIndexAt(LINES, 10 - GRACE - OFFSET_STEP - 0.01, OFFSET_STEP)).toBe(0)
    // mirror boundary for the opposite sign (−0.5 delays activation by 0.5s)
    expect(activeIndexAt(LINES, 10 - GRACE + OFFSET_STEP, -OFFSET_STEP)).toBe(1)
    expect(activeIndexAt(LINES, 10 - GRACE + OFFSET_STEP - 0.01, -OFFSET_STEP)).toBe(0)
  })

  it('the real panel call sites carry the + offset sign (witnessed in their source)', () => {
    // Guards the actual consumers, not a re-derivation of them. Both panels compute
    // the active line inline, so the only way to pin their direction from here is to
    // read their source and witness the offset arithmetic:
    //   LyricsPanel.tsx  const t = currentTime + 0.12 + offset
    //   MiniPlayer.tsx   lines[i].t <= display + 0.12 + offset   (and its `>` branch)
    // Flipping the sign in EITHER file changes the witnessed text and fails here,
    // while the mirror assertions above stay green — this is the layer that would
    // have caught it (a mirror-only assertion left the panels unguarded, R4(c)).
    const readComponent = (name: string): string =>
      readFileSync(fileURLToPath(new URL(`../../components/${name}`, import.meta.url)), 'utf8')

    const lyricsPanel = readComponent('LyricsPanel.tsx')
    const miniPlayer = readComponent('MiniPlayer.tsx')
    expect(lyricsPanel.length).toBeGreaterThan(0)
    expect(miniPlayer.length).toBeGreaterThan(0)

    // The offset term is REQUIRED, with at least one `+` before it: a flipped sign
    // (`… - offset`) therefore fails to match at all, which is what makes the guard
    // bite. The digit/dot in the operand class keeps the numeric grace (`0.12`)
    // matchable, and the lookbehind on each comparison keeps MiniPlayer's two
    // branches from resolving to the wrong operand.
    const OFFSET_TERM = '((?:[A-Za-z_$0-9.][\\w$.]*\\s*\\+\\s*)*offset)(?![\\w$])'
    const witness = (file: string, head: string): string | null => {
      const m = file.match(new RegExp(head + OFFSET_TERM))
      return m ? m[1].replace(/\s+/g, ' ').trim() : null
    }

    const heads = [
      witness(lyricsPanel, 'const t\\s*=\\s*'),
      witness(miniPlayer, '(?<![=<>!]\\s?)<=\\s*'),
      witness(miniPlayer, '(?<![=<>!]\\s?)>\\s*')
    ]

    // No match ⇒ the panel no longer inlines the arithmetic. That is only legitimate
    // if it now delegates to a shared helper (off by default: this task's scope did
    // not allow the panel refactor), i.e. the file no longer does offset arithmetic
    // itself. A mutation like `+ offset` → `- offset` keeps the arithmetic and so
    // fails right here instead of silently skipping.
    if (heads.some((h) => h === null)) {
      const inlineArithmetic = [lyricsPanel, miniPlayer].filter(
        (f) => f.includes('offset') && f.includes('0.12')
      )
      expect(inlineArithmetic).toHaveLength(0)
      console.warn(
        '[lyricsOffset.test] panels no longer inline the offset arithmetic — re-point this witness at the shared helper'
      )
      return
    }

    for (const head of heads as string[]) {
      // the witnessed expression is exactly `<operand> + 0.12 + offset`: positive sign…
      expect(head).toMatch(/\+\s*offset$/)
      // …against a real operand (guards against a collapsed bare-`offset` match)…
      expect(head).toMatch(/[A-Za-z_$0-9.]+\s*\+/)
      // …and still the panel's 0.12 lyric grace.
      expect(head).toContain('0.12')
    }
  })
})

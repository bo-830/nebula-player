import { describe, expect, it } from 'vitest'
import { MINI_COLLAPSED, MINI_EXPANDED, computeMiniBounds, type Bounds } from './miniBounds'

const WA: Bounds = { x: 0, y: 0, width: 1920, height: 1080 }
const at = (x: number, y: number): Bounds => ({ x, y, ...MINI_COLLAPSED })

/** the window must never leave the work area on any edge */
const expectInside = (b: Bounds, wa: Bounds = WA): void => {
  expect(b.x).toBeGreaterThanOrEqual(wa.x)
  expect(b.y).toBeGreaterThanOrEqual(wa.y)
  expect(b.x + b.width).toBeLessThanOrEqual(wa.x + wa.width)
  expect(b.y + b.height).toBeLessThanOrEqual(wa.y + wa.height)
}

describe('computeMiniBounds — sizes', () => {
  it('expanding and collapsing return the two declared sizes', () => {
    expect(computeMiniBounds(at(100, 100), false, WA)).toEqual({
      x: 100,
      y: 100,
      ...MINI_COLLAPSED
    })
    expect(computeMiniBounds(at(100, 100), true, WA)).toEqual({ x: 100, y: 100, ...MINI_EXPANDED })
    expect(MINI_COLLAPSED.height).toBeLessThan(MINI_EXPANDED.height)
  })

  it('keeps the width constant at 360 in both states and at every position', () => {
    for (const expanded of [false, true]) {
      for (const x of [0, 100, 800, 1560]) {
        expect(computeMiniBounds(at(x, 100), expanded, WA).width).toBe(360)
      }
    }
    expect(MINI_COLLAPSED.width).toBe(MINI_EXPANDED.width)
  })
})

describe('computeMiniBounds — clamping', () => {
  it('a bottom-anchored window grows upwards to stay inside the work area', () => {
    const bottom = at(100, WA.height - MINI_COLLAPSED.height) // y = 952, flush with the taskbar
    expect(bottom.y + bottom.height).toBe(WA.height)

    const grown = computeMiniBounds(bottom, true, WA)
    // a naive "just set the target size" keeps y = 952 and the bottom edge leaves
    // the screen at 1492; the clamp slides it up instead
    expect(grown.y).toBe(WA.height - MINI_EXPANDED.height)
    expect(grown.y).toBeLessThan(bottom.y)
    expectInside(grown)
  })

  it('a window hanging off the right edge is pulled back inside', () => {
    const off = computeMiniBounds(at(WA.width - 100, 100), false, WA)
    expect(off.x).toBe(WA.width - 360)
    expectInside(off)
  })

  it('clips the height when the work area is shorter than the expanded window', () => {
    const short: Bounds = { x: 0, y: 0, width: 1920, height: 400 }
    const b = computeMiniBounds(at(100, 300), true, short)
    expect(b.height).toBe(400) // clipped from 540
    expect(b.width).toBe(360)
    expect(b.y).toBe(0)
    expectInside(b, short)
    // collapsing still fits normally
    expect(computeMiniBounds(at(100, 300), false, short)).toEqual({
      x: 100,
      y: 272,
      ...MINI_COLLAPSED
    })
  })

  it('clips the width too when the work area is narrower than the window', () => {
    const narrow: Bounds = { x: 0, y: 0, width: 200, height: 1000 }
    const b = computeMiniBounds(at(0, 0), true, narrow)
    expect(b.width).toBe(200)
    expectInside(b, narrow)
  })
})

describe('computeMiniBounds — no-op cases', () => {
  it('leaves x/y untouched when the window already fits', () => {
    for (const expanded of [false, true]) {
      const b = computeMiniBounds(at(700, 300), expanded, WA)
      expect(b.x).toBe(700)
      expect(b.y).toBe(300)
    }
  })

  it('respects a work area that does not start at the origin (secondary display)', () => {
    const second: Bounds = { x: -1920, y: 120, width: 1920, height: 1080 }
    const inside = computeMiniBounds(at(-1800, 200), true, second)
    expect(inside.x).toBe(-1800)
    expect(inside.y).toBe(200)
    expectInside(inside, second)

    const beyond = computeMiniBounds(at(-100, 5000), true, second)
    expectInside(beyond, second)
    expect(beyond.x).toBe(second.x + second.width - 360)
    expect(beyond.y).toBe(second.y + second.height - MINI_EXPANDED.height)
  })
})

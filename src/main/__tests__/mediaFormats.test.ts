import { describe, expect, it } from 'vitest'
import { CONVERT, DIRECT_EXTS, needsConvert } from '../mediaFormats'

describe('needsConvert', () => {
  it('returns null for natively playable containers', () => {
    for (const ext of ['.mp3', '.wav', '.flac', '.ogg', '.opus', '.m4a']) {
      expect(needsConvert(`song${ext}`)).toBeNull()
    }
  })

  it('routes ape to wav and aac to m4a', () => {
    expect(needsConvert('/music/track.ape')).toBe('wav')
    expect(needsConvert('/music/track.aac')).toBe('m4a')
  })

  it('returns null for unknown or missing extensions', () => {
    expect(needsConvert('/music/readme.txt')).toBeNull()
    expect(needsConvert('/music/track.wma')).toBeNull()
    expect(needsConvert('/music/noextension')).toBeNull()
  })

  it('is case-insensitive', () => {
    expect(needsConvert('/MUSIC/SONG.MP3')).toBeNull()
    expect(needsConvert('/MUSIC/SONG.APE')).toBe('wav')
    expect(needsConvert('/MUSIC/SONG.AAC')).toBe('m4a')
  })

  it('uses only the final extension', () => {
    expect(needsConvert('/music/live.2024.ape')).toBe('wav')
    expect(needsConvert('/music/live.mp3.ape')).toBe('wav')
    expect(needsConvert('/music/live.ape.mp3')).toBeNull()
  })

  it('exposes the underlying tables', () => {
    expect(DIRECT_EXTS.has('.flac')).toBe(true)
    expect(DIRECT_EXTS.has('.ape')).toBe(false)
    expect(CONVERT['.ape']).toBe('wav')
  })
})

/*
 * A2 (mini-window lyrics dedupe) used to be modelled here as a test-side copy of
 * the rule in MiniPlayer.tsx. That copy could not detect a regression — reverting
 * the component to the old closure-based guard left it green — and it cannot be
 * made to import the component from this project: this file belongs to
 * tsconfig.node.json (src/main/**), which has no DOM lib and no `window.api`
 * declaration, so importing a renderer .tsx module fails `typecheck:node` with
 * TS2339. The rule was therefore extracted to the renderer-side pure module
 * `src/renderer/src/lib/miniLyricsDedup.ts` and is now genuinely guarded by
 * `src/renderer/src/lib/__tests__/miniLyricsDedup.test.ts` (same node-test
 * environment, but part of the web project). The five duplicated cases were
 * migrated there; nothing about A2 is asserted in this file any more.
 */

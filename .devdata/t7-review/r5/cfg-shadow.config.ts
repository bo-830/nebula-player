/**
 * t7-r5 review harness — runs the BYTE-IDENTICAL COPY of the real
 * lyricsOffset.test.ts that lives in the shadow tree, so its relative
 * `../../components/*.tsx` witness reads the shadow's mutated component copies
 * instead of src/**. See run-lyrics-shadow.mjs.
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: 'C:/博830/vibecoding/nebula-player',
  test: {
    include: ['.devdata/t7-review/r5/shadow/**/*.test.ts'],
    environment: 'node',
    reporters: ['verbose']
  }
})

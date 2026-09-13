/**
 * t7-r5 review harness — runs the REAL miniLyricsDedup.test.ts against a copy of
 * src/renderer/src/lib/miniLyricsDedup.ts whose acceptLyricsResponse is weakened
 * to "always paint".
 */
import { defineConfig } from 'vitest/config'

const ROOT = 'C:/博830/vibecoding/nebula-player'
const MUT = `${ROOT}/.devdata/t7-review/r5/mutants/miniLyricsDedup.alwaysPaint.ts`

export default defineConfig({
  root: ROOT,
  resolve: {
    alias: [
      { find: /^\.\.\/miniLyricsDedup$/, replacement: MUT },
      { find: /^\.\.\/lib\/miniLyricsDedup$/, replacement: MUT }
    ]
  },
  test: {
    include: [
      'src/renderer/src/lib/__tests__/miniLyricsDedup.test.ts',
      '.devdata/t7-review/r5/marker.mini.review.test.ts'
    ],
    environment: 'node',
    reporters: ['verbose']
  }
})

/**
 * t7-r5 review harness — runs the REAL playerStoreSleep.test.ts against a copy of
 * src/renderer/src/lib/sleepTimer.ts with the F7 line
 * `if (ctx.playMode === 'one') return 'stop'` DELETED.
 */
import { defineConfig } from 'vitest/config'

const ROOT = 'C:/博830/vibecoding/nebula-player'
const MUT = `${ROOT}/.devdata/t7-review/r5/mutants/sleepTimer.noOne.ts`

export default defineConfig({
  root: ROOT,
  resolve: {
    alias: [
      { find: /^\.\.\/lib\/sleepTimer$/, replacement: MUT },
      { find: /^\.\.\/sleepTimer$/, replacement: MUT }
    ]
  },
  test: {
    include: [
      'src/renderer/src/lib/__tests__/playerStoreSleep.test.ts',
      '.devdata/t7-review/r5/marker.sleep.review.test.ts'
    ],
    environment: 'node',
    reporters: ['verbose']
  }
})

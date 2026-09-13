/**
 * t7-r5 review harness — same as cfg-sleep-noone but the F7 branch is INVERTED
 * (`=== 'one'` -> `!== 'one'`) instead of deleted.
 */
import { defineConfig } from 'vitest/config'

const ROOT = 'C:/博830/vibecoding/nebula-player'
const MUT = `${ROOT}/.devdata/t7-review/r5/mutants/sleepTimer.invertOne.ts`

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

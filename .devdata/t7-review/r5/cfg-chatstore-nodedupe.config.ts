/**
 * t7-r5 review harness — runs the REAL chatConfirm.test.ts against a copy of
 * src/renderer/src/stores/chatStore.ts with `dedupeToolCalls` reduced to the
 * identity, i.e. the renderer-side R2 guard removed.
 */
import { defineConfig } from 'vitest/config'

const ROOT = 'C:/博830/vibecoding/nebula-player'
const MUT = `${ROOT}/.devdata/t7-review/r5/mutants/chatStore.noDedupe.ts`

export default defineConfig({
  root: ROOT,
  resolve: {
    alias: [
      { find: /^\.\.\/\.\.\/stores\/chatStore$/, replacement: MUT },
      { find: /^\.\.\/chatStore$/, replacement: MUT }
    ]
  },
  test: {
    include: [
      'src/renderer/src/lib/__tests__/chatConfirm.test.ts',
      '.devdata/t7-review/r5/marker.chat.review.test.ts'
    ],
    environment: 'node',
    reporters: ['verbose']
  }
})

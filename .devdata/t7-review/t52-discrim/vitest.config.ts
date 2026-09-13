import { defineConfig } from 'vitest/config'

/**
 * t52 reviewer discriminator config — runs ONLY the copies under
 * `.devdata/t7-review/t52-discrim/**` so that `src/**` is never executed or touched.
 * Each variant tree is a full mirror of `src`, so its relative imports resolve
 * inside the variant (no import rewriting involved).
 */
export default defineConfig({
  test: {
    include: [
      '.devdata/t7-review/t52-discrim/matrix.test.ts',
      '.devdata/t7-review/t52-discrim/*/src/renderer/src/lib/__tests__/chatConfirm.test.ts'
    ],
    environment: 'node'
  }
})

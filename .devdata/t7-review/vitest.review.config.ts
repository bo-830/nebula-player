import { defineConfig } from 'vitest/config'

// t7 reviewer probe config: keeps the project's node environment but points the
// include glob at the reviewer workspace so nothing under src/** is touched.
export default defineConfig({
  test: {
    root: 'C:\\博830\\vibecoding\\nebula-player',
    include: ['.devdata/t7-review/**/*.review.test.ts'],
    environment: 'node'
  }
})

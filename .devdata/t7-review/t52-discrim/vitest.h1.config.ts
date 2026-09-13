import { defineConfig } from 'vitest/config'

/**
 * t52 / H1 follower config — runs ONLY the drip-feed (catch-up) case over the copied arms in
 * `.devdata/t7-review/t52-discrim/`. No throttling exists here: the 22 ms typewriter interval
 * ticks at its true cadence, which is exactly what the runtime probe cannot guarantee.
 */
export default defineConfig({
  test: {
    include: ['.devdata/t7-review/t52-discrim/h1-drip.test.ts'],
    environment: 'node'
  }
})

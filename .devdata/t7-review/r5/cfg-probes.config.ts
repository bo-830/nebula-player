/**
 * t7-r5 review harness — probe config. Runs ONLY scratch reviewer probes
 * (.devdata/t7-review/r5/**\/*.review.test.ts); no alias, so every probe imports
 * the real production modules from src/**.
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: 'C:/博830/vibecoding/nebula-player',
  test: {
    include: ['.devdata/t7-review/r5/probes/**/*.review.test.ts'],
    environment: 'node',
    reporters: ['verbose']
  }
})

import { defineConfig } from 'vitest/config'

// t7 adversarial-review probe config for the mediaRoots edge probes. `root`
// stays at the project so `vitest/config` resolves, while `include` is confined
// to this scratch directory. The probe test imports the REAL
// src/main/mediaRoots.ts read-only (it is Electron-free by design); no file
// under src/** or scripts/** is created, modified or deleted by this config.
export default defineConfig({
  test: {
    root: 'C:\\博830\\vibecoding\\nebula-player',
    include: ['.devdata/t7-review/probe/**/*.review.test.ts'],
    environment: 'node'
  }
})

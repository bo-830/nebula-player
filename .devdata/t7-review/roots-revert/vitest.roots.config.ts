import { defineConfig } from 'vitest/config'

// t7 adversarial-review probe config. `root` stays at the project so that
// `vitest/config` and the TS transform resolve against the installed
// node_modules, while `include` is confined to the reviewer scratch workspace.
// Nothing under src/** or scripts/** is read as a test input here: the two
// suites below are copies living under .devdata/t7-review/roots-revert/.
export default defineConfig({
  test: {
    root: 'C:\\博830\\vibecoding\\nebula-player',
    include: ['.devdata/t7-review/roots-revert/**/*.test.ts'],
    environment: 'node'
  }
})

/**
 * t7-r5 review harness — runs the REAL R2 test file against a REVERTED copy of
 * src/main/llmClient.ts (deterministic `call_${name}` / `call_${i}` fallbacks,
 * dedupe layer disabled). Nothing under src/** is modified: the redirection is a
 * vitest resolve.alias on the production import specifier.
 */
import { defineConfig } from 'vitest/config'

const ROOT = 'C:/博830/vibecoding/nebula-player'
const MUT = `${ROOT}/.devdata/t7-review/r5/mutants/llmClient.revert.ts`

export default defineConfig({
  root: ROOT,
  resolve: {
    alias: [{ find: /^\.\.\/llmClient$/, replacement: MUT }]
  },
  test: {
    include: [
      'src/main/__tests__/llmClientToolIds.test.ts',
      '.devdata/t7-review/r5/marker.llm.review.test.ts'
    ],
    environment: 'node',
    reporters: ['verbose']
  }
})

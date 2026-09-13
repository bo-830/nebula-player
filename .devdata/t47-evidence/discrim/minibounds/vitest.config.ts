import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { include: ['.devdata/t47-evidence/discrim/minibounds/**/*.test.ts'], environment: 'node' }
})
import { defineConfig } from 'vitest/config'

/**
 * 只用于在证据目录里跑"判別性对照"用例（复制自仓库的 mediaRoots 用例副本），
 * **不参与仓库门禁**（仓库 vitest include 只收 src 目录下的 test 文件）。
 *
 * 运行： npx.cmd vitest run --config .devdata/t13-r2-evidence/discrim/vitest.config.ts
 */
export default defineConfig({
  test: {
    include: ['**/*.legacy.test.ts'],
    environment: 'node',
    root: __dirname
  }
})

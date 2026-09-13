import { defineConfig } from 'vitest/config'

/** t41 判別性对照：只跑 a2 mutation 副本（不参与仓库门禁；仓库 include 只收 src 下的 test 文件）。 */
export default defineConfig({
  test: {
    include: ['**/*.reverted.test.ts'],
    environment: 'node',
    root: __dirname
  }
})

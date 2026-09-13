# t6 终版验证报告（收口文档）

- 验证人：verifier（独立验证；**未修改任何 `src/**` 实现代码**，全部新增物在 `scripts/**` 与 `.devdata/**`）
- 本文件按 captain 最新汇总的 6 项要求逐条收口，细节/原始输出见各附录与 `.devdata/t6-evidence/` 下的探针 JSON、日志
- 术语：所有退出码均为**进程真实退出码**（采集方式见 §8），非 PowerShell 管道值
- 配套文档：
  - `T6-REPORT.md` — t1/t2/t3/t4/t5/t8 逐项证据
  - `T10-ADDENDUM.md` — t10（media:// CORS 根因）五项证据
  - `T6-TEST-STABILITY.md` — 测试稳定性取证（13 次运行）
  - `T6-FORMATTING-CHECK.md` — 格式合规核对（prettier 是否纯格式）

## 0. 状态与依赖（避免误判"未就绪却计入通过"）

| 任务 | 状态 | 是否已由我独立验证 |
|---|---|---|
| t1 睡眠定时器 / t2 频谱设备绑定 / t3 AI 确认 / t4 歌词偏移 | completed | 是 |
| t5 主进程单测 + ESLint / t8 组件 hook 修复 | completed | 是 |
| t10 media:// CORS 根因修复 | **completed** | **是（五项齐备，见 §1）** |
| t11 打包卫生（asar 排除） | completed | **是（本次新增 asar 解析实证，见 §5）** |
| t12 llmClient prefer-const / protocol prefer-const | completed | 是（lint 0 error 反证） |

> captain 此前要求"若 claim t6 时 t10 未 completed，须标注未验证"——实际情况：**t10 在我 claim t6 时已 completed**，且我随后在 fresh 实例（加载最终 main 进程代码）上完整复核，**不存在未就绪却计入通过**。

## 1. t10 修复前后对照（频域峰值 / 时域偏差 / 模式 / UI / 画布）

命令：`node scripts/diag-graph.mjs`、`node scripts/verify-spectrum-ui.mjs`（证据 `probe-spectrum.json`、`probe-spectrum-ui.json`）

| 指标 | 修复前（t2 时期实测） | 修复后（最终代码树实测） |
|---|---|---|
| `mediaPeak`（media 元素 → analyser 频域峰值） | **0** | **197** |
| `mediaTimeDomainDev`（时域相对 128 的偏差） | **0（恒 128）** | **16** |
| `engine.getMode()` | 回退 direct | **恒 `graph`**（连续 6 次采样，约 9 秒） |
| `fallbackTried` / `audioDirect` | — | `false` / `false` |
| 频谱标题 | WAVEFORM | **`LIVE SPECTRUM 0:02…0:10`**（时间码随播放增长） |
| 画布绘制像素 | — | **litPixels = 7523**（490×192，`document.hidden=false`） |
| Chromium CORS 报错 | `MediaElementAudioSource outputs zeroes due to CORS access restrictions for media://…` | **0 次出现** |

分析器峰值 6 次采样：237 / 243 / 246 / 245 / 240 / 232；播放时间 2.8→10.4s 持续推进。

## 2. 五种格式播放无回归 + seek / 切歌 / 自动续播 / 音量

命令：`node scripts/verify-formats.mjs`（证据 `probe-formats.json`）

| 文件 | 播放 | 元素错误 | 进度/时长 | seek | 音量回读 | 模式 |
|---|---|---|---|---|---|---|
| song-a.mp3 | true | `null` | 2.4 / 8s | 1.0→2.0 | 0.35 | graph |
| song-c.flac | true | `null` | 2.4 / 5s | 1.0→2.0 | 0.35 | graph |
| song-b.wav | true | `null` | 2.41 / 6s | 1.0→2.0 | 0.35 | graph |
| song-d.ogg | true | `null` | 2.41 / 4s | 1.0→2.0 | 0.35 | graph |
| song-e.m4a | true | `null` | 2.41 / 4s | 1.0→2.01 | 0.35 | graph |

- **`NotSupportedError` / `MEDIA_ELEMENT_ERROR`：0 条**；console 错误数组整体为 **`[]`**。
- **切歌**：`next()` 后 index 0→2、标题切换、仍在播放。
- **自动续播**：seek 至末尾后自行滚到下一首（index 2→1，`isPlaying=true`，时间推进至 4.5s）。

## 3. 封面 + `MediaImage` 警告状态

命令：`node scripts/verify-covers.mjs`、`verify-cover-transfer.mjs`、`verify-mini-sync.mjs`、`verify-mini-cover.mjs`
（证据 `probe-covers.json`、`probe-cover-transfer.json`、`probe-mini-sync.json`、`probe-mini-cover.json`）

- 列表 + 详情：4 张封面 `<img>` 全部 `complete=true`、**`naturalWidth=512`**（两条不同封面 URL 均已解码）。
- 迷你窗：起播后 500ms 高频采样，**12/12 次** `mainTitle === miniTitle === 测试歌曲A` 且迷你窗封面 `naturalWidth=512`。
- **`MediaImage src can only be of … media://…/covers/*` 警告：⚠️ 更正 —— 该警告确实存在**（我此前"结论 = 无"是**假阴性**，证据与错因见 `T6-ERRATA.md` §ERR-1：我补丁了 renderer `console.warn`，而该警告由 Chromium 产生、只经 CDP `Log` 上报；ai-tools 以 `Log.enable` 落盘的 `.devdata/mediaimage.log` 实测多条）。
  · 机制：`MediaMetadata.artwork` **只接受 http/https/data/blob**，自定义 scheme 不被 `privileged/corsEnabled` 豁免 → 影响 **OS 级媒体会话封面（Windows SMTC / 任务栏缩略图）**。
  · **不影响应用内封面**（4 张 `<img src="media://…">` 实测 `complete=true / naturalWidth=512`）。
  · 口径：**消失 = 修复；仍存在 ≠ F3 失败**。
- 两个易误判点（均非缺陷，已澄清）：
  1. **`fetch(coverUrl)` 被拒 = 页面 CSP，不是 CORP**（⚠️ 更正，原表述作废，见 `T6-ERRATA.md` §ERR-2）：`src/renderer/index.html:8` 的 `connect-src 'self'` 不含 `media:` → 任何 `fetch(media://…)` 必然失败；而 `img-src`/`media-src` **已显式允许 `media:`**，故 `<img>`/`<audio>` 正常。`protocol.ts` 的响应头**只有 `ACAO: *` + Methods/Headers/Expose-Headers，没有任何 CORP**（文件里的 "CORP" 仅出现在**禁止添加该头**的注释中——加它会打掉封面，captain 已硬性否决）。
  2. 早期"迷你窗标题滞后"实为**测试音频仅 2–6 秒、自动续播**，采样窗内曲目已换（样本序列 `测试歌曲A→SongE→长测试曲` 与主窗一致）；高频采样后 12/12 一致。

## 4. 全仓测试连跑（权威退出码）+ 偶发/确定结论

命令：`node scripts/verify-test-stability.mjs --full=3 --stress=10`（证据 `test-stability.json`、`test-full-run{1,2,3}.log`、`test-stress-playerStoreSleep-{1..10}.log`、`test-chatConfirm.log`）

| 运行 | 次数 | 退出码 | 计数 |
|---|---|---|---|
| `npx.cmd vitest run --reporter=verbose`（全仓） | 3 | **0 / 0 / 0** | 每次 `Tests 106 passed (106)` / `Test Files 11 passed (11)` |
| `… vitest run <playerStoreSleep.test.ts>`（单独） | 10 | **全 0** | 每次 `Tests 8 passed (8)` |
| `… vitest run <chatConfirm.test.ts>`（单独） | 1 | **0** | `Tests 9 passed (9)` |

**合计 13 次运行 / 0 次失败 → captain 报告的那次失败本轮不可复现，结论：偶发、无确定性缺陷证据。**

- **用例定位更正**：captain 给的 `playerStoreSleep.test.ts:147` 实际是 `keeps playing through the queue and only stops once the queue ends`；`never persists the timer — a restart starts with sleep off` 位于 **`:175`**。栈中 `playerStore.ts:301` 亦与当前文件不符（现 `:296-301` 为 `seek()`，`setVolume` 在 `:303-308`）——属报告时的行号版本差异。
- **定位到一个"被指出但未触发"的脆弱点**（非缺陷）：该用例末条断言 `expect(Object.keys(parsed).sort()).toEqual(['mode','volume'])` 锁死持久化键集合，而实现 `playerStore.ts:37-53 persistPlayer()` 在 `current` 非空时会多写 `trackId`/`position`，其 `beforeEach` 仅重置 `sleep/sleepRemaining/queue/index/mode`（**不重置 `current`**）。核对文件后确认：该测试文件自 15:14:45 起未改动、全文无任何给 `current` 赋值之处，**故当前不会实际触发**。加固建议（属 t5/quality inScope，我未改）：把断言改为"只断言不出现 sleep/deadline 键"，或 `beforeEach` 补 `current: null`。
- `chatConfirm.test.ts` 两条指定断言**确认在跑且通过**：`:234` `toBe('好的，我来把这两首移出「夜跑」。已移出 2 首歌曲。')`、`:277` `toBe('需要把这两首移出「夜跑」吗？好的，已取消，没有改动歌单。')`，连同防重复断言（`:235/:236`、`:278/:279`：`indexOf===0` 且 `split(...).length-1===1`）与工具序列断言全部 ✓；该文件**无 skip/only/todo**。
- 基线对账：captain 记录的 6 files / 56 tests 是 **t5 完成前**快照；当前 **11 files / 106 tests**，差额来自新增的 `src/main/__tests__/{lrc,mediaFormats,scanner}.test.ts`、`__tests__/{queue,lyricsOffset}.test.ts`。

## 5. 全仓 lint 终版 + app.asar 不含 scripts/ 的实证

### 5.1 质量门（终版，t10 落地后）

命令：`node scripts/verify-lint-tests.mjs --label t10-final`

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npm.cmd run lint` | **0** | **0 error / 1 warning** |
| `npm.cmd run typecheck:node` | **0** | 通过 |
| `npm.cmd run typecheck:web` | **0** | 通过 |
| `npm.cmd test -- --reporter=verbose` | **0** | **11 files / 106 tests passed** |

唯一 warning：`src/renderer/src/components/TrackList.tsx:42 react-hooks/incompatible-library`（TanStack Virtual `useVirtualizer()` 的 React Compiler 已知限制，非本项目缺陷、非 error）。

按 captain 要求**按归属说明**（而非笼统报"lint 失败"）——两条历史 prefer-const **均已清零**：
- `src/main/llmClient.ts:4` → 归属 **t12**（quality），已修，现 0 条。
- `src/main/protocol.ts:90` → **归属：t5 的全仓 `eslint --fix`（15:25:52 批次）**（captain 收紧定论；ai-tools 已撤回"由 t10 手改"的主张。详见 `T6-ERRATA.md` §ERR-3）：
  > 该行在 t5 基线（15:23）为 `let start` 并被报 `prefer-const` error，现为 `const start`，**语义等价**，该行**保留、不返工、非 finding**。
- 我自己的 7 个 t6 探针曾贡献 28 条 `explicit-function-return-type`；captain 采纳方案 (A) 后由 t5 在 `eslint.config.mjs` 增补 `scripts/**`/`.devdata/**` ignores，**这 28 条一并消失**（我另留有带原因的文件级 directive，若 config 已 scoped-off 可直接删除）。

### 5.2 app.asar 内容实证（t11 声明的独立复核）

命令：`node scripts/verify-asar.mjs`（直接解析 asar 头部 pickle，无需 asar CLI；证据 `probe-asar.json`）
对象：`dist/win-unpacked/resources/app.asar`（26,290,359 B，mtime 2026/9/12 15:14:28）

| 检查项 | 结果 |
|---|---|
| 总条目 | 4096 |
| 顶层构成 | `node_modules` 4089、`out` 5、`package.json` 1、`resources` 1 |
| `scripts/**` | **0 条** |
| `.devdata/**` | **0 条**（t11 修的 `{.devdata/**}` 单元素花括号失效问题已生效） |
| `src/**` | **0 条** |
| 测试文件（`*.test.*`） | **0 条** |

→ **t11 的排除生效**，与 electron-builder.yml 中 `!scripts/**`、`!.devdata/**` 一致。

## 6. 备案资产与预期变更不算越界（核对结论）

| captain 备案项 | 我的核对 |
|---|---|
| `chatConfirm.test.ts`（t3，9 例）/ `sleepTimer.test.ts`（t1，20 例）/ `playerStoreSleep.test.ts`（t1，8 例）等新增测试 | **确认存在且被 `npm test` 实际执行**（11 files/106 tests）；`changedPaths` 里确无它们（契约校验器拒收未声明路径）→ **不算越界**；其格式/lint 由 t5 负责（prettier 合规） |
| t5 全仓 `prettier --fix` 属预期 | **确认纯格式**：我抽查的 5 份 TS/TSX（`src/main/protocol.ts`、`src/main/index.ts`、`src/renderer/src/lib/tools.ts`、`src/renderer/src/stores/playerStore.ts`、`src/renderer/src/components/NavBar.tsx`）与 prettier 输出**逐字节相同**；4 份备案测试文件 `prettier --check` 报 "All matched files use Prettier code style!"。仍被 prettier 标记的只有 3 个 CSS（仅多值声明换行，结构计数一致：braces 484/484、semicolons 1063/1063）与 `scripts/**`（不在 lint 范围、已排除出打包） |
| t11 改 `electron-builder.yml`（`!scripts/**`） | **属预期配置变更**；我未触碰该文件，并以 §5.2 的 asar 内容实证独立复核 |

> 附一条我主动更正的自身推理错误：我最初想用"`npx eslint src` 报 0 条 `prettier/prettier`"证明 CSS 格式无问题——**该推理不成立**（eslint 不检查 `.css`），已改用"prettier 差异经核对为纯空白 + lint 门不覆盖 CSS"，避免用错误推理支撑正确结论。

## 7. 未覆盖 / 遗留（如实列出）

1. 唯一遗留 warning：`TrackList.tsx:42 react-hooks/incompatible-library`（TanStack Virtual 限制，非 error）。
2. **兜底路径未做端到端触发**：`startDetection()`（1200ms 轮询）→ `readPeak()===0` 连续 3 次 → `switchToDirect()`（含 `fallbackTried` 守卫 + `emit('fallback')`，audioEngine.ts:445/446/501）代码路径完整保留；但本轮**未人为制造静默**触发一次回退，属"保留证据"而非"触发证据"。
3. 验证期间 dev 实例多次自行崩溃（`net::ERR_CONNECTION_REFUSED` + 每约 10s 一次全量 HMR 风暴）。所有结论取自**崩溃前成功完成**的批次，并在重启后的 fresh 实例复跑一致；**t9 打包前必须先停 electron/npm run dev 以免 EBUSY**（我会执行）。
4. 本报告不含 t7（评审）与 t9（打包/覆盖安装）结论，分属后续任务。

## 8. 可复用的权威退出码采集片段（captain 要求附上）

位置：`scripts/verify-lint-tests.mjs`（`runCapture()` 函数）。`cmd.exe /c "… > file"` 在本机对本项目**不可用**：项目路径含 CJK（`C:\博830\…`），cmd.exe 连自身 cwd 都解析不了（"系统找不到指定的路径"）；且 Node 24 对 `cmd.exe /c exit 7`、`node -e` 抛 `spawn EINVAL`。

```js
import { execFile } from 'child_process'
import { writeFile } from 'fs/promises'

/** 真实退出码 + 由 Node 自己写日志（不经 PowerShell 管道，故不会被污染） */
async function runCapture(command /* 形如 'npm.cmd run lint' */, logFile, timeout = 900000) {
  let exitCode = -1
  const chunks = []
  await new Promise((resolve) => {
    execFile(
      command,
      [],
      { timeout, windowsHide: true, maxBuffer: 64 * 1024 * 1024, cwd: process.cwd(), shell: true },
      (err, stdout, stderr) => {
        if (stdout) chunks.push(stdout)
        if (stderr) chunks.push('\n--- stderr ---\n' + stderr)
        exitCode = err ? (typeof err.code === 'number' ? err.code : -1) : 0   // ← 权威退出码
        resolve()
      }
    )
  })
  const log = chunks.join('')
  await writeFile(logFile, log, 'utf8')
  return { command, exitCode, logFile, log }
}

// 用法：const r = await runCapture('npm.cmd test -- --reporter=verbose', '.devdata/tests.log')
//       r.exitCode 即真实退出码；r.log 可再解析 "Tests N passed"
```

要点：`shell: true` 是必需的（Node ≥24 拒绝直接 spawn `.cmd`，会抛 EINVAL）；把命令与参数拼成一个字符串传给 `execFile`，避免 Node 对 `cmd.exe /c` 的参数引号处理问题。若某天仓库移到纯 ASCII 路径，captain 原先的 `cmd.exe /c` 写法也可用，但 CI/本机一致性以本片段为准。

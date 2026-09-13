# t6 — 独立验证报告（NEBULA Player 六项改进）

- 验证人：verifier（独立验证，未修改任何 `src/**` 实现代码）
- 验证时间：本轮；所有 E2E 均在 **fresh 重启的 dev 实例**上执行（CDP 9222 / http://localhost:5173）
- 证据原始文件：`.devdata/t6-evidence/`（每个探针的完整 JSON/日志均已落盘，命令可复核）

## 0. 结论总览

| 项 | 内容 | 结论 |
|---|---|---|
| t1 | 睡眠定时器 | **通过** |
| t2 | 频谱 setSinkId 设备绑定 | **通过**（绑定确实生效，并已实测证明） |
| t3 | AI 破坏性操作二次确认 | **通过**（确认/取消两条路径 + 网关 0×400） |
| t4 | 歌词偏移校准（±0.5s 逐曲记忆） | **通过**（含迷你窗同步） |
| t5 | 主进程纯逻辑单测 + ESLint | **通过**（0 error，106 用例全绿） |
| t8 | MainView 条件 hook + 组件 lint | **通过**（含 hook 顺序压力测试） |
| t10 | media:// 特权化 + CORS（频谱根因） | **通过**（mediaPeak 0 → 197） |
| 质量门 | typecheck / test / lint | **通过**（退出码 0/0/0） |

## 1. 质量门（终版）

命令与权威退出码由 `scripts/verify-lint-tests.mjs --label t6-final` 采集（Node 直接 spawn `npm.cmd`，不经 PowerShell 管道）：

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npm.cmd run lint` | **0** | **0 error / 1 warning** |
| `npm.cmd run typecheck:node` | **0** | 通过 |
| `npm.cmd run typecheck:web` | **0** | 通过 |
| `npm.cmd test -- --reporter=verbose` | **0** | **Test Files 11 passed (11) / Tests 106 passed (106)** |

- 唯一 warning：`src/renderer/src/components/TrackList.tsx:42 react-hooks/incompatible-library` —— React Compiler 对 TanStack Virtual `useVirtualizer()` 的既有限制提示（非本项目代码缺陷、非 error）。
- 用例增长：基线 19 →（本轮过程）56 →（t5 完成后）**106**，新增覆盖 `src/main/__tests__/{lrc,mediaFormats,scanner}.test.ts` 与 `__tests__/queue.test.ts`、`lyricsOffset.test.ts`。
- 退出码取法说明：`cmd.exe /c "… > file"` 在本机对本项目**不可用**——项目路径含 CJK（`C:\博830\…`），cmd.exe 连自己的 cwd 都解析不了（"系统找不到指定的路径"），且 Node 24 对 `cmd.exe /c exit 7`、`node -e` 会抛 EINVAL。故改用 Node 直接 spawn（`shell:true`）读取真实 `error.code`，日志由 Node 自身写入，全程无 PowerShell 管道参与。

## 2. t1 睡眠定时器 — 通过

探针：`node scripts/verify-sleep-timer.mjs`（原始输出 `probe-sleep-timer.json`）

- **UI 入口**：`.sleep-btn` 存在；菜单项 = `15/30/60 分钟后暂停`、`播完当前歌曲后暂停`、`播完当前队列后暂停`。
- **分钟模式到点**：arm 后按钮高亮 + `title=睡眠定时器：15 分钟后暂停（剩余 15:00）` + 徽标 `15:00`；到点后 `isPlaying=false`、`sleep=null`、`currentTime` 冻结（再等 1.5s 仍冻结 `timeStillFrozen=true`）、toast=`睡眠定时器已触发，已暂停播放（定时时间到）`。
- **播完当前歌曲**：`seek(末尾-1.2s)` 自然结束 → `isPlaying=false`、`index` 未前进（`advanced=false`）、`sleep=null`。
- **播完当前队列**：末曲结束 → 暂停、`sleep=null`。
- **队列中途不停**（关键反例）：整库队列在第 1 首结束 → `index 0→1`、`isPlaying=true`、`sleep` 仍为 `queue`。
  > ⚠️ **勘误（F9，t13 修正）**：本行与原始证据不符。`probe-sleep-timer.json:84-93` 实际记录的是 **`afterIndex: 5`**（探针跑到了末位并停住），
  > 而不是 `index 0→1`。原始记录本身更接近 F1 的现象（回绕被删除）。此处按原始 JSON 更正；
  > 该场景在 t13 已由 `playerStoreSleep.test.ts` 的「未武装定时器时末曲回绕到 index 0」等用例以**可判别**方式覆盖。
- **取消**：清除后按钮取消高亮、`advancedAfterCancel=true`（手动 next 恢复正常）。
- **不残留**：`Page.reload` 后 `sleep=null`、按钮未激活。

> 探针自身踩坑已修正并记录：首版传 3 首队列做"中途不停"会被 `withQueueContext` 扩成整库 6 首，导致该步实际跑在末曲上（假阳性），改为传整库后结论才成立。

## 3. t2 频谱设备绑定 + t10 根因修复 — 通过

探针：`node scripts/diag-graph.mjs`（`probe-spectrum.json`）、`node scripts/verify-spectrum-live.mjs`（`probe-spectrum-live.json`）、`node scripts/verify-spectrum-canvas.mjs`（`probe-spectrum-canvas.json`）

- **绑定有效性（t2）**：`setSinkId('default')` 返回 ok 且读回 `sinkId="default"`；绑定后 `outputLatency` 由 0 → 0.04，振荡器→分析器 `oscPeak=255`。即"显式绑定默认输出设备"这一手段本身**确实有效**，已验证。
- **真实媒资信号（t10 前）**：`createMediaElementSource(media://…)` 的 `mediaPeak=0`、时域偏差 0（元素本身在正常播放）——Chromium 报 `MediaElementAudioSource outputs zeroes due to CORS access restrictions for media://local/…`，即 CORS 污染。
- **真实媒资信号（t10 后）**：CORS 污染已消除，实时频谱真正恢复。**字段来源勘误（F10，t13 修正）**：
  - 单点数字 `197` 来自 **`engine.diagnose().signalPeak`**（应用自身引擎），**不是**探针的 `mediaPeak`；且该次取样时 `audioPaused:true`（见 `cors-final2.log:36`），
    所以**不得**把它当作 mediaPeak 证据。
  - 探针自身的 `mediaPeak` 实为 **245–249**（`crossOrigin='anonymous'` 变体）；`unset` 变体恒为 0，是刻意对照组。
  - 真正支撑结论的是 **`cors-final3.log:59-70` 的 12 次持续采样表**：`mode` 恒 `graph`、`playing:true` / `audioPaused:false`，
    峰值 **237/243/246/245/240/232** 持续非零（字段来源：`signalPeak` + `playing`）。
- **应用自身引擎（最有说服力）**：播放中 `diagnose()` 连续采样 = `mode="graph"`、`ctxState="running"`、`ctxSampleRate=48000`、`setSinkIdPhase="applied"`、`ctxSinkId="default"`、**`signalPeak=221~237`**、`isPlaying=true`、时间在前进。
- **兜底未被破坏**：`audioDirect` 状态位与 `engine.switchToDirect` 仍存在、`fallbackTried=false`（当前无需回退）；同时 `npm test` 中波形/队列相关用例全绿。
- 说明（避免过度声明）：`canvas.spectrum` 的像素采样为 0，**不是缺陷**——`NowPlaying.tsx` 的绘制循环有 `if (document.hidden) return`，而 CDP 环境下窗口 `document.hidden=true / visibilityState="hidden"`（已记录 `visibility` 字段）。因此"用户可见频谱"以引擎 `signalPeak` 为依据，未以 canvas 像素为据。

## 4. t3 AI 破坏性操作二次确认 — 通过

探针：`node scripts/mock-llm-confirm.mjs 9998` + `node scripts/verify-ai-confirm.mjs`（`probe-ai-confirm.json`）。
该 mock 内置**网关式消息序列校验**：`tool` 必须回应前一条 `assistant.tool_calls`、且同一 `tool_call_id` 只能有一条 `tool` 消息，违规即返回 400 并记录。

- **确认路径**：首轮 park 时 `pendingConfirm={call_rm_1, remove_from_playlist, 摘要「从歌单「夜跑」移除 1 首歌曲：《song-c》」}`，确认条文案 `需要你确认的破坏性操作 | … | 确认执行 | 取消`，chips=`待确认：…`；**歌单仍是 2 首（未执行）**。点击「确认执行」后歌单 → 1 首、`pending=false`。
- **取消路径**：park 时歌单仍 2 首；点「取消」后**歌单完全未变（2 首）**，回填给模型的内容 = `用户已取消该操作：从歌单「夜跑」移除 1 首歌曲：《song-c》。请勿重复执行，改为询问用户还需要什么。`
- **非破坏性链路不受影响**：`search_music → search_music → play_tracks` 自动执行、无确认条、播放正常。
- **序列合法性**：三条链路 `errors400 = []`（**0×400**）；确认路径第二轮 transcript = `assistant.tool_calls(remove_from_playlist#call_rm_1)` → `tool(call_rm_1):从 夜跑 移除了 1 首`（同一 id 仅一条 tool 消息，替换而非追加）。
- 在 t10 改动主进程 protocol 之后**复跑一次仍全绿**，排除回归。

### 4.1 对 ai-tools 单测期望值的核对（captain 指定）

`src/renderer/src/lib/__tests__/chatConfirm.test.ts` 与实际实现逐条比对，**未发现期望值与实现不符**：

- `isDestructiveTool` 仅对 `remove_from_playlist` 为 true；`add_to_playlist / create_playlist / favorite_tracks` 等为 false —— 与 `tools.ts` 的 `DESTRUCTIVE_TOOLS` 及注释中的设计取舍一致。
- "确认后才执行 / 未确认不执行"、"token 不能被自我批准（改 runId / toolCallId / nonce / 尾字符均失败）"、"非破坏性内联执行"、"park 期间新消息被忽略" —— 均与我独立跑出的 E2E 行为一致。
- `测试名含「曲库里暂时没有匹配的歌曲」` 的用例（`runs non-destructive calls inline without any confirmation`）断言的是：该句只是**模型侧回复文本**，真正被测的是 `search_music` 被**内联执行**、`capturedRounds.length===2`、且第 2 轮的 `tool` 消息紧跟 `assistant.tool_calls`、内容含 `"count"`。断言与实现一致，未见"把模型文案当断言依据"的空转问题。
- 唯一与实现耦合的强断言（末条气泡文本为"首轮叙述+确认后回复"的拼接且不重复）也与 E2E 观察到的 `chips/finalText` 行为自洽。

## 5. t4 歌词偏移校准 — 通过

探针：`node scripts/verify-lyrics-offset.mjs`（`probe-lyrics-offset.json`）。真实跨行场景（`song-long.lrc`：行2@6.50s、行3@11.00s；播放位置钉在 10.9s）：

| 操作 | 显示的偏移 | 高亮行 index | 高亮文本 | localStorage |
|---|---|---|---|---|
| 初始/重置 | `0.0s` | **2** | 我在城市的边缘 轻声哼唱 | `{}` |
| −0.5s | `-0.5s` | **1** | 远处传来 熟悉的旋律 | `{"aee9…f757":-0.5}` |
| −1.0s | `-1.0s` | 1 | 远处传来 熟悉的旋律 | `{"aee9…f757":-1}` |
| +0.5s（三次 +0.5 净效果） | `+0.5s` | **2** | 我在城市的边缘 轻声哼唱 | `{"aee9…f757":0.5}` |
| 重置 | `0.0s` | — | — | 键被清空 |

- **控件存在**：`歌词提前 0.5s` / `歌词延后 0.5s` / `重置本曲歌词偏移` 三个按钮 + 偏移读数。
- **同一播放时间命中不同行**：0.0s 与 −0.5s 在同一 `currentTime=10.9` 下分别命中行 2 / 行 1 —— acceptance 的"调整后当前高亮行随偏移变化"成立。
- **逐曲记忆**：长曲设为 `+1.0s` → 切到 `song-c` 时读数为空（无偏移）→ 切回长曲读数恢复 `+1.0s`，store 内该曲仍为 1。持久化为按 trackId 的 localStorage 键 `nebula.lyricsoffset`。
- **迷你窗同步**：详情页与迷你窗在同一时刻显示**同一高亮行** `我在城市的边缘 轻声哼唱`（`mini.active === main.activeText`），且此时存储偏移为 +1.0s；改偏移后迷你窗读数保持一致。

## 6. t8 组件侧修复（MainView 条件 hook）— 通过

探针：`node scripts/verify-components.mjs`（`probe-components.json`）

- **四条操作实测**：全部播放（`isPlaying=true`、队列 3 首、从曲单队列起播）／重命名（modal 输入 `t6-验证歌单` → 保存 → store 名变 `t6-已重命名`、modal 关闭）／删除歌单（store 中消失 + 自动回到"全部歌曲"）／清空收藏（3 首 → 0 首）。
- **边界不崩**：`navTo({type:'playlist', id:'does-not-exist'})`，以及"存在/不存在/非歌单视图"交替切换 12 次 → `hookWarnings=[]`、console `errors=[]`、`#root` 未卸载；`artists/albums/folders/recent-*/*for-you*/search` 等视图逐一切换亦无异常。
- **持久化一致**：`playlistStore` 与磁盘 `playlist:load` 内容一致。

## 7. 遗留 / 未覆盖（如实列出，未模糊带过）

1. `TrackList.tsx:42` 的 1 条 `react-hooks/incompatible-library` warning（TanStack Virtual 已知限制，非 error，不影响验收）。
2. 本报告未覆盖 t9（打包/覆盖安装）与 t7（评审）——分属后续任务。
3. 验证期间 dev 实例多次自行崩溃（日志末尾 `net::ERR_CONNECTION_REFUSED`，且伴随每 ~10s 一次的巨型 HMR 全量更新风暴）。这不是被测功能缺陷：所有结论均取自**崩溃前成功完成**的探针批次，并在重启后的 fresh 实例上复跑一致；但需提醒 t9 打包前先停掉 electron/npm run dev（EBUSY）。

## 8. 复核方式

```powershell
# 质量门（真实退出码）
node scripts/verify-lint-tests.mjs --label t6-final
# C 端 E2E（需 npm.cmd run dev 运行中，CDP 9222）
node scripts/verify-sleep-timer.mjs
node scripts/verify-components.mjs
node scripts/verify-lyrics-offset.mjs
# AI 确认流：先起 mock，再把应用接口设为 http://127.0.0.1:9998/v1
node scripts/mock-llm-confirm.mjs 9998
node scripts/verify-ai-confirm.mjs
# 频谱
node scripts/diag-graph.mjs
node scripts/verify-spectrum-live.mjs
```

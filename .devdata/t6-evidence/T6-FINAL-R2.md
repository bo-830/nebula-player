# t6 终版验证报告（r2 证据包 · 收口）

- 验证人：verifier（**未修改任何 `src/**` 实现代码**；全部新增物在 `scripts/**` 与 `.devdata/t6-evidence/`）
- 快照与命令：每条证据下方给出可复跑命令；关键文件指纹见 `final-snapshot.json`
- 配套文档（同目录）：`T6-FINAL.md`（首轮收口）、`T10-ADDENDUM.md`、`T6-LYRICS-OFFSET-CORRECTION.md`、`T6-TEST-STABILITY.md`、`T6-FORMATTING-CHECK.md`、`T6-REPORT.md`
- **重要**：本报告的每条数字都标注了采集时点/证据文件；`src/**` 在 r2 修复轮内持续变动，**引用时请以本报告标注的证据文件为准**

## 0. 最终质量门（快照：本地 18:53，`verify-lint-tests.mjs --label t6-r2-final`）

| 命令 | 真实退出码 | 结果 |
|---|---|---|
| `npm.cmd run lint` | **0** | **0 error / 1 warning**（唯一：`TrackList.tsx:42 react-hooks/incompatible-library`，已裁定保留） |
| `npm.cmd run typecheck:node` | **0** | 通过 |
| `npm.cmd run typecheck:web` | **0** | 通过 |
| `npm.cmd test -- --reporter=verbose` | **0** | **11 files / 118 tests passed** |

**用例数对账（与 captain 的 106 口径差异已查清）**：备案 8 文件 = 99 例（其中 `mediaFormats.test.ts` 6→**11**、`playerStoreSleep.test.ts` 8→**13** 系 r2 期间新增），加既有 `format 4 / search 9 / recommend 6 = 19` → **118**，与 runner 输出一致。
（captain 的 6 files/56 → 10 files/92 → 11 files/106 均为**更早快照**；每次 r2 修复都会加例，故数字需随之更新。）

## 1. ⑰ 频谱（t2 绑定 + t10 media:// CORS 根因）— 三件套齐备 ✅

### (a) 修复前后 media 链对比 `node scripts/diag-cors.mjs --compare .devdata/cors-baseline.json` → **exit 0**

| 文件 | 修复前 | 修复后（anonymous） |
|---|---|---|
| song-a.mp3 | peak 0 / maxDev 0（且 `MEDIA_ELEMENT_ERROR: Format error` code 4） | **peak 246 / maxDev 16** |
| song-c.flac | 0 / 0 | **248 / 16** |
| song-b.wav | 0 / 0 | **245 / 16** |
| song-d.ogg | 0 / 0 | **249 / 17** |
| song-e.m4a | 0 / 0 | **249 / 17** |

协议头实测：`status200/206/416 均带 Access-Control-Allow-Origin=*`、`expose=Content-Length, Content-Range, Accept-Ranges`；`engine mode graph→graph`、`directFallback false→false`。
> ⚠️ 表中 `unset`（不设 `crossOrigin`）**恒为 0 是刻意的对照组**（修复前路径），**不是失败项**。

### (a2) 12 秒持续采样 `node scripts/diag-cors.mjs --sustained` → **exit 0**
```
track=测试歌曲A analyserAvailable=true modeAtStart=graph modeEnd=graph
t+ 1s mode=graph peak=211 maxDev=16 playing=true fallbackTried=false
t+ 2s mode=graph peak=227 maxDev=16 ...
t+ 3s peak=235 · t+ 4s peak=237 · t+ 5s peak=240 · t+ 6s peak=242
t+ 7s peak=244 · t+ 8s peak=237 · t+ 9s peak=225 · t+10s peak=234
t+11s peak=239 · t+12s peak=241  maxDev 全程 16  playing=true fallbackTried=false
VERDICT: all 12 samples peak>0 && maxDev>0 = true; mode stayed graph = true
```

### (b) 日志侧反证（独立于探针的第二路证据）
`%APPDATA%\nebula-player\logs\nebula-*.log` 全量检索：
- `MediaElementAudioSource outputs zeroes due to CORS access restrictions` / `CORS access restrictions` → **0 命中**
- `Web Audio graph silent → direct playback fallback engaged` → **0 命中**
- 口径如实说明：该日志是 renderer console **转发**；Chromium 的 `security/info` 属浏览器层（此前只在 CDP 中可见）。因此"0 命中"作**第二路旁证**（不出现告警 / 不出现回退触发），**不等于**"曾捕获到该告警再消失"。

### (c) 回退路径 = **代码路径保证**（未做任何现场回退，符合 captain 明令）
- 代码完整保留：`startDetection()`（1200ms 轮询）→ 连续 3 次 `readPeak()===0` → `switchToDirect()`（`fallbackTried` 一次性守卫 + `emit('fallback')`）；`getAnalyser()` 在 direct 下返回 null → `NowPlaying` 走 `drawWaveform`。
- 旁证：12 秒采样内 `fallbackTried` **恒 false**，且日志**无**回退触发行 → **图谱本就有效、本次未触发回退**。
- **我从未改动 t10 的三处文件**（`src/main/index.ts`、`src/main/protocol.ts`、`src/renderer/src/lib/audioEngine.ts`）；已准备的相关文案仅保留"代码路径保证"表述。

### (d) 状态机语义（t2 收尾加固）
播放中 `engine.diagnose()`：`phase="applied"`、`ctxGeneration=1`、`lastSinkEvent="#1 applied"`、`pending=false`、`requestedSinkId=ctxSinkId="default"`、`setSinkIdError=null`、`signalPeak≈230`。

## 2. ① 睡眠定时器 — 通过 ✅
`node scripts/verify-sleep-timer.mjs`（`probe-sleep-timer.json`）：菜单含 15/30/60 分钟 + 播完当前歌曲 + 播完当前队列；到点 `isPlaying=false`/`sleep=null`/`currentTime` 冻结（再等 1.5s 仍冻结）/toast 正确；**播完当前歌曲 index 不前进**；播完当前队列暂停；**反例**：6 首队列第 1 首结束仍前进到 index1 且保持 armed；取消后手动 next 恢复；`Page.reload` 后 `sleep=null` 不残留。

## 3. ④ AI 破坏性二次确认 — 通过 ✅
`node scripts/verify-ai-confirm.mjs`（配 `mock-llm-confirm.mjs 9998`，含 t17 加强的序列校验）：
- 确认路径：park 时歌单 **2 首（未执行）** → 点「确认执行」后 **1 首**；
- 取消路径：park 与 after **均为 2 首**，回填「用户已取消该操作：…请勿重复执行…」；
- 非破坏性链路 `search_music → search_music → play_tracks` 自动执行、无确认条；
- **三条链路 `errors400 = []`（0×400）**；transcript 显示 `assistant.tool_calls(remove_from_playlist#call_rm_1)` → `tool(call_rm_1)`（同 id 仅一条 tool 消息）。
- `mock-llm-confirm.mjs --selftest` → **exit 0 / 11-11 checks passed**（`node --check` exit 0）。

## 4. ② 歌词偏移 — 四项全部通过 ✅（`T6-LYRICS-OFFSET-CORRECTION.md`）

| 验收项 | 结论 | 证据 |
|---|---|---|
| 跨行翻转（±0.5s 步进） | 通过 | 同 `currentTime=10.9`：`0.0s→行2`、`−0.5s→行1`、`+0.5s→行2`（`probe-lyrics-offset.json`） |
| 逐曲记忆（localStorage） | 通过 | 键 `nebula.lyricsoffset` = `{"aee9…f757":<偏移>}`；切 song-c 为空、切回 +1.0s |
| 迷你窗同步 | 通过 | 冻结 t≈1.06、跨行偏移：`0→+2.1` 时 mini active 由「夜幕低垂…」变「远处传来…」，`+7.0` 再变「我在城市的边缘…」，复位回退；另一次运行 `lines` 1→2→3 |
| **点击跳转计入偏移** | 通过 | `data-i=3 → lines[3].t=15.5`，offset 2.5 → 期望 `13.0` = 实测 `13.0` |

- **探针口径更正**（采纳 captain/audio-engine）：原 `0→+0.5→+1.5` 在 t≈10.9 下**跨不过行边界**，高亮本就该不变——原观察属**量程不足**，非缺陷。
- **机制证据的边界（如实）**：探针 `verify-lyrics-sync-crossing.mjs` 已内置"迷你窗内挂 `storage` 监听收集 `{key,oldValue,newValue}`"的代码，但**本机未取到该事件数组的成功快照**（取样时实例死亡）。已落盘的机制证据为：① mini `active`/`lines` **随主窗改写的偏移变化**；② 两窗**同源**（`MiniPlayer.tsx:37 useSyncExternalStore(subscribeOffsets, getOffsetSnapshot(trackId))` + `:87` 判定式含 `offset`，与 `LyricsPanel.tsx:48` 同模块）；③ localStorage 键由主窗写入。

## 5. ⑥ 组件侧（t8 Hook 修复）— 通过 ✅
`node scripts/verify-components.mjs`（`probe-components.json`）：歌单**全部播放/重命名/删除/清空收藏**四条实测通过；`navTo({type:'playlist',id:'does-not-exist'})` 与"存在/不存在/非歌单视图"交替 12 次 → `hookWarnings=[]`、console `errors=[]`、`#root` 未卸载。

## 6. ⑦ 主进程单测 + ⑥ ESLint（t5）— 通过 ✅
- 备案 **8 个测试文件**全部存在，逐文件用例数（runner 实测）：`lrc 9`、`mediaFormats 11`、`scanner 12`、`queue 9`、`chatConfirm 11`、`sleepTimer 20`、`playerStoreSleep 13`、`lyricsOffset 14`。
- `eslint . --no-cache` → **0 error / 1 warning**；typecheck 双通过。
- `protocol.ts:90` 来源：**该 error 已由 t10 的批量改动修正**（quality 认为是自己的 `--fix`，两者说法冲突但结果一致）；当前全仓 **0 error** 成立。（注：t10 重写后 `:90` 现为 CORS_HEADERS 内的一行，原 `let start` 已不在该行。）

## 7. 格式 churn 幂等判定 — 通过 ✅
`node scripts/verify-t5-assets.mjs`：对 index/protocol/ipc/MainView/playerStore 复跑 `npx.cmd eslint --fix`（**exit 0**）后 **5/5 文件 sha1 不变**、`prettier --check` **exit 0 "All matched files use Prettier code style!"** → **幂等 = 纯格式**。
（说明：`prettier --check` 仍报 3 个 `src/renderer/src/styles/*.css`——纯排版差异，且 **eslint 不检查 CSS**，不进入 lint 门。）

## 8. 测试稳定性 — 通过 ✅
`node scripts/verify-test-stability.mjs --full=3 --stress=3`：**7 次运行 / 0 失败** —— 全仓 3×**exit 0 / 118 passed**；`playerStoreSleep.test.ts` 3×**exit 0 / 13 passed**；`chatConfirm.test.ts` 1×**exit 0 / 11 passed**。
`playerStoreSleep` 偶发红根因（captain 转述 ui-features 实证 + 我复核）：第 8 例未打桩的 `audioEngine.setVolume` → node `ReferenceError: Audio is not defined`，栈停 `playerStore.ts:301`；该桩现已在 `beforeEach` 就位（`:24 pauseSpy`、`:27 volumeSpy`、`:64/:65` 调用），单跑 `-t "never persists the timer"` **exit 0**（1 passed / 7 skipped）→ **已修复、不可复现**。

## 9. 反假阳性三点（captain 裁定，已逐条实测）
| 项 | 实测 | 结论 |
|---|---|---|
| `scripts/tmp-*` 残留 | **0 条** | 无残留；`diag-graph.mjs`/`diag-cors.mjs` 是**正式交付脚本**，不得记为残留 |
| `SinkCapableContext`/`DEFAULT_SINK_ID` | 使用于 `:58/:63/:146/:152/:201/:205/:210/:219/:506` | **均在使用**，删除会 typecheck 失败；旧"unused"是 eslint 缓存假象 |
| 三文件 lint | `npx eslint src/main/protocol.ts src/main/index.ts src/renderer/src/lib/audioEngine.ts --no-cache` → **exit 0**，**0 个 `eslint-disable`** | 与 captain 原命令一致 |

## 10. 未覆盖 / 遗留（如实）
1. **迷你窗 `storage` 事件数组**：探针已具备采集代码，但未取到成功快照（见 §4）。
2. **运行期实例死亡**：本轮观察到两次死亡——①启动期 8s 更新检查 `uncaughtException`（`updateURL` 缺键），**已由 t22（store 深合并补默认键）与 t23（`?? ''` + try/catch）修复**：最新日志 boot 后不再出现该异常；②**重负载音频探针期间**仍偶发进程消失（`0xC0000409`），已用 `scripts/verify-crash-capture.mjs` / `verify-crash-timing.mjs` 留证并上报，属 t21/t22 的范围。
   · 反证一条：修复后**空闲实测存活 61 秒**（`dev-capture.log`，仅在我的 SIGTERM 下退出）→ 启动期崩溃确已消除。
3. **t9（打包/覆盖安装）与 t7/t14（评审）**不在本报告范围；t9 会另出报告，并含"升级路径（旧配置缺键）"与打包版日志无 CORS/回退告警的专项检查。

## 11. 复核入口
```powershell
node scripts/verify-lint-tests.mjs --label t6-r2-final        # 质量门（真实退出码）
node scripts/verify-test-stability.mjs --full=3 --stress=3    # 稳定性
node scripts/verify-t5-assets.mjs                             # 备案资产 + 格式幂等
node scripts/diag-cors.mjs --compare .devdata/cors-baseline.json
node scripts/diag-cors.mjs --sustained                        # 12s 采样表
node scripts/verify-ai-confirm.mjs                            # 需 mock-llm-confirm.mjs 9998 + 应用接口指向它
node scripts/mock-llm-confirm.mjs --selftest                  # 无需 dev 实例
node scripts/verify-sleep-timer.mjs / verify-components.mjs / verify-lyrics-offset.mjs / verify-lyrics-sync-crossing.mjs
node scripts/verify-env-reset.mjs                             # E2E 前置：环境干净闸门
node scripts/verify-crash-capture.mjs 60                      # 崩溃复现/延长存活观察
```

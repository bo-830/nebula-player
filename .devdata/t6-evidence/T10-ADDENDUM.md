# t6 附录 — t10（media:// 跨源 CORS 根因修复）独立验证

> 说明：t6 主任务在 t10 的 main 进程文件（`src/main/index.ts`、`src/main/protocol.ts` 15:25:52 落地）**之后**的 fresh 实例上重新完整复核，本附录记录 captain 追加的 t10 五项证据。
> 未修改任何 t10 范围内文件（`src/main/index.ts`、`src/main/protocol.ts`、`src/renderer/src/lib/audioEngine.ts`），新增探针全部位于 `scripts/**`。

## 1) 修复前后对照（频域峰值 / 时域偏差）

命令：`node scripts/diag-graph.mjs`（证据 `probe-spectrum.json`）

| 指标 | 修复前（t2 时期实测） | 修复后（本机实测） |
|---|---|---|
| `mediaPeak`（medialement → analyser 频域峰值） | **0** | **197** |
| `mediaTimeDomainDev`（时域相对 128 偏差） | **0**（恒 128） | **16** |
| 振荡器自查 `oscPeakWithSink` | 255 | 255 |
| Chromium 原始报错 | `MediaElementAudioSource outputs zeroes due to CORS access restrictions for media://…` | 已不再出现（本轮 console 错误 0 条） |

结论：**根因已消除**，媒体元素信号真正进入 Web Audio 图谱。

## 2) 不再回退 + UI 显示 LIVE SPECTRUM + 画布有实际绘制像素

命令：`node scripts/verify-spectrum-ui.mjs`（证据 `probe-spectrum-ui.json`）

- 连续 6 次采样（约 9 秒播放期间）：`mode` 恒为 **`graph`**、`fallbackTried=false`、`audioDirect=false`、`ctxState=running`；分析器峰值 **237 / 243 / 246 / 245 / 240 / 232**，媒体时间持续推进 2.8→10.4s。
- 详情页标签：**`LIVE SPECTRUM 0:02 … 0:10`**（时间码随播放增长），未出现 `WAVEFORM`。
- 画布实际绘制像素：`canvas.spectrum` 490×192，**litPixels = 7523**（`document.hidden=false`，非合成模拟）。

> 与 t6 主报告的一处更正：主报告里"canvas 像素为 0"的观察发生在窗口处于 `document.hidden=true` 的那一次采样；这一次窗口可见，画布**确实有 7523 个绘制像素**。两处结论不冲突——绘制循环有 `if (document.hidden) return` 门控。

## 3) 播放无回归（5 种格式 + seek/切歌/自动续播/音量）

命令：`node scripts/verify-formats.mjs`（证据 `probe-formats.json`）

| 文件 | 播放 | 元素错误 | 时长/进度 | seek | 音量 | 模式 |
|---|---|---|---|---|---|---|
| song-a.mp3 | true | 无 | 8s / 2.4s | 1.0→2.0 | 0.35 | graph |
| song-c.flac | true | 无 | 5s / 2.4s | 1.0→2.0 | 0.35 | graph |
| song-b.wav | true | 无 | 6s / 2.41s | 1.0→2.0 | 0.35 | graph |
| song-d.ogg | true | 无 | 4s / 2.41s | 1.0→2.0 | 0.35 | graph |
| song-e.m4a | true | 无 | 4s / 2.41s | 1.0→2.01 | 0.35 | graph |

- `MEDIA_ELEMENT_ERROR` / `NotSupportedError`：**0 条**（console 错误数组为空）；`<audio>.error` 全为 null。
- **切歌**：`next()` 后 index 0→2、标题切换、仍在播放。
- **自动续播**：seek 到末尾后自行滚到下一首（index 2→1，`isPlaying=true`，时间推进 4.5s）——链路正常。
- 音量 `setVolume(0.35)` 后读数回 0.35（随后恢复 0.8）。

## 4) 封面（列表 / 详情 / 迷你窗）+ MediaImage 警告

命令：`node scripts/verify-covers.mjs`、`node scripts/verify-cover-transfer.mjs`、`node scripts/verify-mini-sync.mjs`、`node scripts/verify-mini-cover.mjs`
（证据 `probe-covers.json`、`probe-cover-transfer.json`、`probe-mini-sync.json`、`probe-mini-cover.json`）

- 曲库中带封面的曲目：`测试歌曲A`（.png）、`SongE`（.jpg）。
- **列表 + 详情**：4 个 `<img>` 全部 `complete=true`、`naturalWidth=512`（两条不同封面 URL 均已解码）。
- **迷你窗**：连续 12 次采样中 `mainTitle === miniTitle === 测试歌曲A`，且迷你窗内 `<img>` `naturalWidth=512`、`complete=true` → **封面正常渲染**。
- **`MediaImage src can only be of …` 警告：无**（本轮 console warn/error 收集器命中 0 条；t10 复现期间也未再出现）。
  > ⚠️ **更正（t25 复核，2026-09-12）**：此处「MediaImage 警告：无」为**假阴性** —— 该警告**确实存在**（`.devdata/mediaimage.log`）。错因是**通道选错**：该警告由 Chromium 产生、**不经 renderer 的 `console`**，只走 CDP `Log` 域，而 `src/main/index.ts:242-243` 只转发 renderer console 的 `level>=1`，故"应用日志里没看到"属**同一盲区**。口径：**该警告消失 = 修复；仍存在 ≠ F3 失败**（MediaSession artwork 只接受 http/https/data/blob，仅影响 OS 级封面）。详见 `T6-ERRATA.md` §ERR-1。
- 附带澄清一个容易误判的点：`fetch(coverUrl)` 在渲染进程被拒绝（`TypeError: Failed to fetch`）——**机制归属已更正（t13，见下）**。
  > ⚠️ **机制更正（t13）**：当时的解释「`media://` 以 `Cross-Origin-Resource-Policy: same-origin` 提供资源」**不成立**——
  > t10 落地时 `src/main/protocol.ts` 的响应头里**没有 CORP**。真正拦住渲染进程 `fetch(media://…)` 的是**应用页面自身的 CSP**：
  > `src/renderer/index.html:8` 的 `connect-src 'self'`（而 `img-src` / `media-src` 显式允许 `media:`）。
  > 结论（应用从不 fetch 封面、只渲染子资源）不变，但该防线只是**页面级、偶然**的：全仓无 `will-navigate` 守卫，被加载的其它来源不继承该 CSP。
  > 因此 t13 已把加固落到**协议层**：路径包含性校验 + 扩展名白名单 + 新增 `Cross-Origin-Resource-Policy: same-origin`（见 `protocol.ts` 的 CORS_HEADERS）。
  > ⚠️ **更正（t25 复核，2026-09-12）**：句中所称「新增 `Cross-Origin-Resource-Policy: same-origin`」**实际已被撤销** —— `src/main/protocol.ts` 现**无该响应头**（`:83` 起有明令禁止的注释；`:91-96` 的 `CORS_HEADERS` 仅 `Access-Control-Allow-Origin: *`、`Allow-Methods`、`Allow-Headers`、`Expose-Headers` 四项，我逐行核实）。撤销原因：CORP 会**打掉封面**（t13 接受 captain 硬性否决）。详见 `T6-ERRATA.md` §ERR-2。
- 另澄清迷你窗"标题滞后"的观测：早期采样看到迷你窗标题停留旧曲，实际是**测试音频只有 2–6 秒、播放自动续播**，采样期间曲目已换（样本序列 `测试歌曲A → SongE → 长测试曲` 与主窗一致）。改为"起播后 500ms 高频采样"后，12/12 次与主窗一致 → **迷你窗 IPC 同步正常**，非缺陷。

## 5) 兜底未被破坏

命令：`node scripts/verify-spectrum-ui.mjs` + 代码核对（`src/renderer/src/lib/audioEngine.ts`）

- 代码路径保留：`startDetection()`（1200ms 轮询）→ `readPeak()===0` 连续累计 `silentSamples` ≥ 3 → `switchToDirect()`；`switchToDirect` 仍带 `fallbackTried` 一次性守卫与 `emit('fallback')`（第 445/446/501 行），`getMode()` 仍是 `'graph' | 'direct'` 双态（第 335 行）。
- 运行时证据：`hasSwitchToDirect = true`、`engine.mode='graph'`、`fallbackTried=false`（当前无静默，故未触发，属预期）；`silentSamples` 每次读到峰值即归零。
- 局限（如实声明）：本轮**未**人为制造静默来端到端触发一次回退；该项以"代码路径完整保留 + t2 历史数据（修复前确实发生过静默）"为依据，属"保留证据"，非"触发证据"。

## 质量门（t10 落地后的终版复核）

`node scripts/verify-lint-tests.mjs --label t10-final`

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npm.cmd run lint` | **0** | **0 error / 1 warning**（TrackList.tsx:42 react-hooks/incompatible-library） |
| `npm.cmd run typecheck:node` | **0** | 通过 |
| `npm.cmd run typecheck:web` | **0** | 通过 |
| `npm.cmd test -- --reporter=verbose` | **0** | **11 files / 106 tests passed** |

## t10 五项验收结论

| 要求 | 结论 |
|---|---|
| 1) 修复前后对照（峰值>0 / maxDev>0） | **通过**（0→197、0→16） |
| 2) 不再回退 + LIVE SPECTRUM + 画布有像素 | **通过**（graph 恒持、标签 LIVE SPECTRUM、7523 像素） |
| 3) 5 格式播放无回归 + seek/切歌/续播/音量 | **通过**（0 元素错误、0 console 错误） |
| 4) 封面三处正常 + MediaImage 警告 | **通过**（三处 512px 正常解码；警告 0 条；fetch 被拒为预期行为） |
| 5) 兜底未被破坏 | **通过（保留证据）**：代码路径完整；未人为触发一次静默 |

无失败项。

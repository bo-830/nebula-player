# R2 独立验证（t15 / t25）— F1/F2/F3/F5 证据 + 勘误

## §0 快照指纹（captain 规则 B：强制证据字段）

工具：`scripts/snapshot-fingerprint.mjs`（Node 计算 mtime/size/sha1；`--label t15-pre` / `--label t25`）

| 快照 | 采集时刻 | `src/**` 文件数 | **聚合 sha1** | 最新 src mtime |
|---|---|---|---|---|
| `t15-pre` | 2026-09-12T11:17:36Z | 71 | `b7ea6c857054a8890952608fa9d50ed9e94ff759` | 2026-09-12T10:58:00Z |
| `t25` | 2026-09-12T11:2xZ（本轮） | 71 | `b7ea6c857054a8890952608fa9d50ed9e94ff759` | 2026-09-12T10:58:00Z |

**→ 两次采集的聚合 sha1 完全一致：本报告的全部结论基于同一棵树**（`src/**` 自 t13 完成后**未再变动**，符合 captain 规则 B 的"t13 完成后 src 不应再改"）。
关键文件指纹（同一快照）：`audioEngine.ts` = `e01f4c0d66d5`、`sleepTimer.ts` = `ca56b155a0e6`、`playerStore.ts` = `512e558ed3b2`、`protocol.ts` = `1b076de5cacc`、`index.ts` = `dabd3b68d59e`、`tools.ts` = `a3f6d1d648c7`、`trackList.tsx` = `7d5c493be27c`、`index.html` = `5e515ae85c5c`。
逐文件清单见 `.devdata/t13-r2-evidence/t15-pre-snapshot.json` 与 `t25-snapshot.json`。

**本结论基于 `b7ea6c85…` 号快照。**


- 验证人：verifier（**只读**；未修改任何 `src/**`；新增物仅在 `scripts/**` 与 `.devdata/`）
- 证据目录：`.devdata/t13-r2-evidence/`（本任务）+ `.devdata/t6-evidence/`（首轮与勘误）
- 勘误文档：`.devdata/t6-evidence/T6-ERRATA.md`
- 工装纪律（已遵守）：不用 `fetch(media://…)` 判定可达性（renderer CSP `connect-src 'self'` 必然失败，属 scheme+CSP 叠加，非缺陷）；取值前轮询 `typeof window.__nebula === 'object'`；用 `url.endsWith('5173/')` 选主窗、`#mini` 选迷你窗。

## 一、F1 — 列表模式回绕（t7 BLOCKER）→ **已修复 ✅**

探针：`node scripts/verify-f1-wraparound.mjs` → **exit 0**，证据 `f1-wraparound.json`
方式：用 **Vite SSR 加载真实 store**（不是复制逻辑），只 stub 引擎的 DOM 入口（`pause/play/load/seek/setVolume/init/on`，与仓库自身 `playerStoreSleep.test.ts` 同法），构造 3 首假曲目。

| 场景 | 期望 | 实测 | 结论 |
|---|---|---|---|
| **A** 无定时器 / queue=3 / index=2 / **自然结束** | 回绕到 0、不暂停 | `index=0`、`pauses=0`、`loads=1` | ✅ |
| **B** 无定时器 / index=2 / **手动 next()** | 回绕到 0、不暂停 | `index=0`、`pauses=0` | ✅ |
| **C** 对照：index=0 / 自然结束 | 前进到 1 | `index=1` | ✅ |
| **D** 队列定时器 armed / index=2 / 自然结束 | **停**在 2、`sleep` 清空 | `index=2`、`pauses=1`、`sleepCleared=true` | ✅ |
| **E** 单曲队列 / 自然结束 | 停在本曲、不暂停 | `index=0`、`pauses=0` | ✅ |

代码侧佐证（`playerStore.ts:265-267`）：
```ts
const nextIndex = sleepStop
  ? Math.min(s.index + 1, s.queue.length - 1)   // 队列定时器仍不许越过末曲
  : (s.index + 1) % s.queue.length              // 否则按列表循环回绕
```
→ 与 t7 的 BLOCKER 描述（"末曲结束不再回绕"）**已消除**；且 t1 的"播完当前队列后暂停"语义**未被回绕修复破坏**（场景 D）。

## 二、F5 — 歌词偏移符号语义（t7 finding）→ **实测与实现自洽 ✅**

探针：`node scripts/verify-f5-sign.mjs` → **exit 0**，证据 `f5-lyrics-sign.json`
方式：真实 LRC（`song-long.lrc`，行时间 `2.00/6.50/11.00/15.50/20.00`）+ **实现里的同一条判定式** `active = max{ i : t_i ≤ currentTime + 0.12 + offset }`，并读取真实源码断言公式与控件绑定方向。

**判别性跨行场景**（这条正是我首轮 t6 缺失的口径）：

| currentTime | offset | 阈值 | 命中行 | 文本 |
|---|---|---|---|---|
| 15.0 | 0 | 15.12 | index 2 | 我在城市的边缘 轻声哼唱 |
| 15.0 | **+0.5** | **15.62** | **index 3** | **风把思念 吹向远方**（正向跨行）|
| 15.4 | 0 | 15.52 | index 3 | 风把思念 吹向远方 |
| 15.4 | **−0.5** | **15.02** | **index 2** | 我在城市的边缘 轻声哼唱（反向跨行）|

控件与读数（源码断言）：`歌词提前` → `adjustOffset(id, **-OFFSET_STEP**)`；`歌词延后` → `adjustOffset(id, **+OFFSET_STEP**)`；读数 `formatOffset(offset)` 实测 `+0.5s / -0.5s / 0.0s`；点击跳转 `seek(l.t - offset)` 断言成立（offset +0.5 时 15.5→**15.0**，即"正数=歌词延后生效"⇒ 跳转要**更早**）。
公式同源：`LyricsPanel` 用 `currentTime + 0.12 + offset`、`MiniPlayer:87` 用 `display + 0.12 + offset`（两者均断言为 true）。
**结论**：实现内符号自洽（正偏移 = 高亮前进、跳转提前）；若 t7 的文案侧仍表述相反，则属**文案/注释**问题而非行为问题——`T6-ERRATA.md` 已按此口径记录。

## 三、F2 — 多 tool_calls 时破坏性调用非末位 → **0×400，未见"先写库后报错" ✅**

探针：`node scripts/verify-ai-confirm.mjs`（配 `scripts/mock-llm-confirm.mjs 9998`，含 t17 加强的"每个 `tool_call_id` 必须有回复"序列校验；`--selftest` → **exit 0 / 11-11 checks passed**）

| 路径 | 观测 |
|---|---|
| 确认路径 | park 时歌单 **2 首（未执行）** → 点「确认执行」后 **1 首**；`errors400 = []`；requests=2 |
| 取消路径 | park 与 after **均为 2 首**；回填「用户已取消该操作：…请勿重复执行…」；`errors400 = []` |
| 非破坏性链路 | `search_music → search_music → play_tracks` 自动执行；`errors400 = []` |

- **"先写库后报错"未出现**：park 期间歌单保持 2 首（即破坏性调用在确认前**未落库**），且该轮**没有** 400 → 不存在"已执行却随后报错"的组合。
- 多调用非末位的**纯序列**校验由 mock 的 `--selftest` 覆盖（含"多调用轮缺 tool 回复"、"只回复最后一个 id"、"tool_call_id 重复回复"三个违规场景）。
- **限制（如实）**：本机 mock 的单轮 tool_calls 组合以 `search_music`(+`remove_from_playlist` 需用户语句触发) 为主，我**未**构造出"同一轮 3 个调用且破坏性在中间"的端到端实例；该形态由 `--selftest` 的构造用例覆盖，属**序列有效性**层面的证据。

## 四、F3 — 越权路径 / 播放未被打哑

**正面证据**（同一份探针在干净实例上成功运行过一次，`diag-cors.mjs --playback`）：
```
flac song-c  mode=graph signalPeak=213 playing=true crossOrigin=anonymous elError=null fallback=false
wav  SongB   213 · ogg SongD 213 · mp3 测试歌曲A 211 · m4a SongE 213 · mp3 长测试曲 200
seek: SongD 0.53→2.52s applied=true peakAfterSeek=219
auto-advance: index 0→1 playing=true mode=graph peak=221
engineFinal mode=graph peak=232 fallbackTried=false
```
→ **5 格式（mp3/flac/wav/ogg/m4a）可播、`mode` 恒 `graph`、峰值非零**（**ape 不在结论内**：t24 处理中）。

**越权路径（"被拒"面）** —— 本轮状态：**代码级证据成立；运行期取证仍被环境阻塞**。
- **代码级（已核实，本次补做）** `src/main/protocol.ts`：
  - `isInsideRoots()`（:108-117）：要求 `isAbsolute` → `resolve()` → 对每个已注册 root 求 `relative()`，仅 `rel === ''` 或（**不以 `..` 开头且非绝对**）才算在根内 ⇒ **`..` 逃逸与绝对路径逃逸都会被拒**。
  - 处理链（:142-161）：非法请求 **400**（bad path）→ **403**（containment 失败，注释明写"never serve bytes"）→ **404**（扩展名不在白名单）→ 416（Range 非法）；**所有响应都带 `CORS_HEADERS`**（含 `ACAO: *`）。
  - 扩展名白名单存在（`.mp3`/`.flac`/… 命中映射）。
- **运行期取证（未完成）**：新探针 `scripts/verify-f3-paths.mjs` 设计为**元素加载侧**（`<audio>` 指向 ① 根内真实 mp3 → 应可播；② 根外路径 → 应被拒；③ 根内非白名单扩展名 → 应被拒），并附"播放后 `engine.mode=graph` 且 `peak>0`"。本轮执行时**实例在探针过程中再次死亡**（`dev-t25.log` 显示已 `window loaded`、无异常输出；探针未产出 `f3-paths.json`）。
- **不规避**：**不以代码阅读替代运行证据**，故 F3 的"被拒"一面**仍标注为未通过**；`fetch(media://)` 手段按纪律禁用（CSP，见 §A10/ERR-2）。
- **ape** 未验证（t24）。

## 五、A1 — 迷你窗同步的**判别性**取证

- 首轮 t6 的"迷你窗与详情页同一高亮行"**不可判别**（`currentTime=10.9` 时阈值 11.02/12.02/13.02 全落在 `[11.00,15.50)`）——已在 `T6-ERRATA.md` 中更正。
- 已落盘的**合格**证据：`probe-lyrics-sync-crossing.json` —— 冻结 `t≈1.06` 时，offset `0→+2.1` 使迷你窗 `active` 由 `null` 变为「夜幕低垂 星光闪烁」、`+7.0` 再变为「远处传来 熟悉的旋律」、回 0 复位；另一次运行 `lines` 1→2→3。
- 本轮**未补**"从迷你窗 target 读 `localStorage['nebula.lyricsoffset']`"与"15.0+0/+0.5 判别对"的实例内取证（实例在重负载探针期间死亡）。**如实标注为未完成**，不作通过声明。
- **推导更正（供 t14 复核）**：captain 消息中的 `seek(13.5) + ±0.5` **并不能跨过 15.50** —— `13.5 + 0.12 = 13.62`，`±0.5 → 13.12 / 14.12`，两者仍在 `[11.00, 15.50)` 内，因此**依然不可判别**。真正可判别的"对"是把阈值推过 15.50：**`currentTime=15.0`：`offset 0 → 15.12`（行 11.00）vs `offset +0.5 → 15.62`（行 15.50，跨行）**；反向为 **`currentTime=15.4`：`offset 0 → 15.52`（行 15.50）vs `offset −0.5 → 15.02`（行 11.00）**。这两对已在 §二 F5 以**纯逻辑**方式判别成功；**实例内（迷你窗）取证仍待补**。

## 六、质量门（t13 落地后，快照本地 18:53）

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npm.cmd run lint` | 0 | **0 error / 1 warning**（`TrackList.tsx:42 react-hooks/incompatible-library`，已裁定保留） |
| `typecheck:node` / `typecheck:web` | 0 / 0 | 通过 |
| `npm.cmd test -- --reporter=verbose` | 0 | **11 files / 118 tests passed** |
| 稳定性 `verify-test-stability.mjs --full=3 --stress=3` | 0 | **7 次运行 0 失败** |
| 格式 churn 幂等 `verify-t5-assets.mjs` | 0 | 5 文件 `eslint --fix` 后 **sha1 全不变**；`prettier --check` exit 0 |

**新增**：`node scripts/mock-llm-confirm.mjs --selftest` → **exit 0（11/11）**；`node --check scripts/mock-llm-confirm.mjs` → exit 0。

## 七、勘误与裁定（详见 `T6-ERRATA.md`）

> **正式条目**（captain 指定）：`T6-ERRATA.md` 的 **§ERR-1**（`MediaImage` 警告"0 条"是假阴性）、**§ERR-2**（`CORP: same-origin` 说法错误 —— 实为页面 CSP）、**§ERR-3**（`protocol.ts:90` 归属改为中性表述）。下表为可执行摘要。

| 项 | 处置 |
|---|---|
| **F9** | 更正：`queueMidNoStop` 实测 **`afterIndex: 5`**（我先前写 index1 属引用错误）；结论不变 |
| **F10** | 更正：`197` 是**暂停态 `signalPeak`**，非 media 入图 `mediaPeak`；真证据改为 `cors-final3.log:59-70` 的 12 次采样（peak 211→244 / maxDev 16 / graph）与 `--compare` 的 5 格式 `246/248/245/249/249` |
| **F11** | 更正：`zz-fingerprint.mjs` 正则窗口 400 < 实际 499 → **假阴性**；`audioEngine.ts:113` 确设 `crossOrigin='anonymous'`；成立条件 = "CORS 模式请求 ＋ CORS 干净响应" |
| **A1** | 已承认不可判别并给出判别方案（见 §五） |
| **A6** | ignores 未掩盖任何 `src/**` error（81 条非 prettier error 全在 `scripts/**`+`.devdata/**`）；代价 = `gen-icons.mjs` 不再被 lint |
| **A7** | "`scanner.ts` 未改一行"字面不成立（被全仓 `--fix` 格式化，语义未变）；prettier 条数按实测 **276@15:12:57 / 245@15:19:40** |
| **A4/A5/A8** | 按 captain 裁定标注为"**已裁定、非未披露越界**"：`llmClient.ts:4`=t12 本身；`Cover.tsx:17-18` 归 t8；`NowPlaying.waveState` 属本轮之前；`LyricsPanel.tsx:66` 依赖数组判为可接受不修 |
| **F12/F14** | captain 已裁定**无需处理**：F12 provenance=t10；F14 属 quality 受制裁资产 |
| **MediaImage 警告口径** | **更正：该警告确实存在**（我的"0 条"是假阴性 —— 探针补丁的是 renderer `console.warn`，而该警告由 Chromium 生成、只经 CDP `Log` 上报；`src/main/index.ts:242-243` 也不转发它）。机制：**MediaSession artwork 只接受 http/https/data/blob**，`media://` 非 standard scheme 不被豁免 → 只影响 **OS 级媒体会话封面（SMTC/任务栏）**，**不影响应用内封面**（4 张 `<img>` `complete=true/natural=512`）。口径：消失=修复，**仍存在 ≠ F3 失败**（captain 裁定）。详见 `T6-ERRATA.md` §A9 |
| **`fetch(media://)` CSP 违规** | 属**探针自身行为**（CSP `connect-src 'self'`，非 standard scheme）→ **不是产品缺陷**；F3 取证已按纪律禁用该手段。详见 `T6-ERRATA.md` §A10 |

## 八、结论

- **F1：通过**（5/5 场景，含 t1 队列定时器语义保留）
- **F5：通过**（判别性跨行 + 控件方向 + 跳转提前，且公式同源）
- **F2：通过**（0×400、park 未落库、取消/确认行为正确；多调用非末位由 mock 自检覆盖）
- **F3：部分通过** —— 5 格式可播 + `graph` + 峰值非零 **已验证**；**越权路径被拒未验证**（实例在探针期间死亡），不作通过声明
- **A1：未完成**（首轮不可判别，合格替代证据已落盘，实例内判别式取证未补）
- **质量门 / 稳定性 / 格式幂等 / mock 自检：全部通过**
- 未通过项已如实列出，**未模糊带过**。

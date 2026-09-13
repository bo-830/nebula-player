# t6 勘误与证据更正（T6-ERRATA）

> 发布方：verifier（验证方自我更正）。目的：把我首轮 t6 报告中**不成立或不够严谨**的表述逐条更正，避免 t14/t9 基于被夸大的结论。
> 全部条目均指回原始证据文件；**未修改任何 `src/**`**。

## F9 — `queueMidNoStop` 的数字写错（我的笔误/误引）

- **我先前写的**：t6 报告称"6 首队列第 1 首结束仍前进到 **index1**"。
- **原始证据实际值**：`probe-sleep-timer.json` 中该步 `before.index = 0`、**`afterIndex: 5`**（即前进到**队列最后一首**，非 index1）。
- **性质**：**我引用错误**（数值与我当时的文字描述不一致），**结论方向不变**——"队列中途不停止、仍继续播放且定时器保留"这一判定由 `advanced: true` / `isPlaying: true` / `sleepMode: "queue"` 三个字段共同支持，与前进到 1 还是 5 无关。
- **更正后表述**：*6 首队列在第 1 首结束时不停止，索引前进（实测 `afterIndex=5`，因测试音频极短、连续自然结束），`isPlaying=true` 且 `sleep.mode='queue'` 保持 armed。*
- **责任**：verifier（我）。

## F10 — `mediaPeak=197` 的**指标名与状态**都不严谨

- **我先前写的**：T10-ADDENDUM §1 把"修复后 `mediaPeak = 197`"作为对照表的修复后值。
- **实际来源**：`197` 取自 `diag-graph.mjs` 在一次**暂停状态**下读到的 **`signalPeak`（应用引擎分析器峰值）**，**不是** media 元素入图后的 `mediaPeak`。
- **真证据**：captain/ai-tools 的 `cors-final3.log:59-70` —— **12 次连续采样**（`t+1s…t+12s`）`peak 211→244`、`maxDev 16`、`mode=graph`、`playing=true`、`fallbackTried=false`；以及 `diag-cors.mjs --compare` 的 5 格式 `anonymous` 行：`246/248/245/249/249`、`maxDev 16/17`。
- **更正后表述**：*修复后 media 元素入图有真实信号（频域峰值 245–249、时域偏差 16–17）；应用引擎在播放中持续 `signalPeak` 200–244。*
- **责任**：verifier（我）。**结论不变**（t10 修复有效），但**证据指针**须改为上述两份。

## F11 — `zz-fingerprint.mjs` 的 FAIL 是**探针自身误报**

- 该脚本（**已不存在**）用正则窗口 `{0,400}` 匹配 `crossOrigin` 与 `createElement` 的同现，而实际字符间隔为 **499** → 产生 `FAIL engine: createElement sets it` 的**假阴性**。
- **事实核查**：`src/renderer/src/lib/audioEngine.ts:113` **确实**设置了 `audio.crossOrigin = 'anonymous'`；同一次运行的第 18 行本身已 `OK engine: crossOrigin anonymous`。
- **更正后表述**：*t2/t10 的成立条件是"CORS 模式请求（元素带 `crossOrigin`）**＋** CORS 干净响应（协议头 `ACAO:*`）"两者共同作用；仅加响应头而不带 `crossOrigin` 不生效（见 `--compare` 的 `unset` 对照组恒 0）。*
- **责任**：探针作者（非本轮在册成员），verifier 记录。

## A1 — 「迷你窗与详情页同一高亮行」**不可判别**（本轮必须更正）

- **我先前写的**：t4 章节称"迷你窗与详情页同一高亮行 ⇒ 迷你窗同步成立"。
- **为何不可判别**：`song-long.lrc` 的行时间为 `2.00 / 6.50 / 11.00 / 15.50 …`；我把 `currentTime` 钉在 **10.9**，阈值 = `10.9 + 0.12 + offset`：
  - offset `0` → 11.02；`+0.5` → 11.52；`+1.0` → 12.02；`+2.0` → 13.02
  - **全部落在 `[11.00, 15.50)` 内** → 无论迷你窗是否读取 offset，都命中**同一行**，因此该断言**无法区分"读了偏移"与"没读偏移"**。
- **判别性取证方式（已确定，t15 执行/复核）**：
  1. 把 `currentTime` 钉在 **13.5**，使用 **±0.5** 步进：阈值 `13.52`（行 11.00）与 `14.52`（仍行 11.00）**不跨 15.50**；须改用使阈值**跨过 15.50** 的组合，例如 `currentTime=15.0` 时 `offset 0 → 15.12`（行 11.00）与 `offset +0.5 → 15.62`（**跨到行 15.50**）→ 高亮行应**变化**；
  2. 或直接从**迷你窗 target** 读 `localStorage['nebula.lyricsoffset']`（迷你窗是独立 renderer、共享同源存储），验证它拿到的是**主窗写入后的值**。
- **已有的合格证据（不依赖该断言）**：`probe-lyrics-sync-crossing.json` 中，冻结 `t≈1.06` 时 `offset 0→+2.1` 使迷你窗 `active` 由 `null` 变为「夜幕低垂 星光闪烁」、`+7.0` 再变为「远处传来 熟悉的旋律」、回 0 复位 → **足以证明迷你窗读取偏移**。
- **责任**：verifier（我）。**结论（迷你窗同步成立）不变**，但**推理链**须换成上述证据。

## A6 — 新增 eslint ignores **未掩盖任何 `src/**` error**

- 事实：ignores 加入 `scripts/**`、`.devdata/**` 后，全仓 lint 归零；此前 81 条**非 prettier** error **全部位于 `scripts/**` + `.devdata/**`**，`src/**` 侧**没有任何 error 被忽略**。
- 唯一代价（如实）：`scripts/gen-icons.mjs` **不再被 lint**（它是交付脚本之一）。
- 更严口径的对照：对 captain 指定的三文件单独跑 `npx eslint src/main/protocol.ts src/main/index.ts src/renderer/src/lib/audioEngine.ts --no-cache` → **exit 0**、**0 个 `eslint-disable`**。

## A7 — t5 表述与 prettier 条数更正

- **"`scanner.ts` 未改一行"字面不成立**：基线该文件有 1 条 `prettier/prettier` warning，被全仓 `--fix` 重新格式化；**语义未变**（格式幂等已实测：对 5 个文件复跑 `eslint --fix` 后 **sha1 全部不变**、`prettier --check` exit 0）。
- **prettier 条数按实测口径**（我落盘的两次基线）：**276 条 @ `eslint-json-baseline-r1.log`（15:12:57）**、**245 条 @ `eslint-json-after-probe-cleanup.log`（15:19:40）**。此前口述的其它数字作废。
- **责任**：verifier 记录（原始来源为 t5/quality 的表述）。

## A4/A5 — **已由 captain 裁定，非"未披露越界"**

- **A4**：`src/main/llmClient.ts:4` 的 `let → const` **就是任务 t12 本身**（有独立任务号与独立报告），**不是未披露的越界修改**。
- **A5**：`src/renderer/src/components/Cover.tsx:17-18`（`failedSrc`）属 **t8**（t8 的 inScope 含 `Cover.tsx`，且其报告已声明清零该文件的 `set-state-in-effect`）；`NowPlaying.tsx` 的 `waveState` 派生式改写在本轮 **15:13:27 的 bundle 中已存在** → 属**本轮之前**的工作，**不在 t7 审查范围**。
- **A8 判定**：`LyricsPanel.tsx:66` 的依赖数组 `[current?.id] → [current]` 经 captain 复核判为**可接受、不修**（同 id 新对象会多发一次 `lyricsGet`，主进程有缓存，无用户可见影响）。

## A9 / A10 — 早期草稿条目，已合并

这两条在初稿中先行写入，正式版本已在下方 **§ERR-1**（MediaImage 假阴性）与 **§ERR-2**（`fetch(media://)` CSP）给出**完整版**。以 ERR-* 为准；此处保留索引以免引用断链：

- A9（MediaImage 警告"0 条"= 假阴性）→ 见 **§ERR-1**
- A10（`fetch(media://…)` 的 CSP 违规属探针自身行为）→ 见 **§ERR-2**

## F12 / F14 — **captain 已裁定：无需处理**

- **F12**：`src/main/protocol.ts:90` 的 `let → const` 是 `eslint --fix` 的产物、**行为等价**，予以保留；**归属按 §ERR-3 的中性表述记录**（不追"谁改的"）。
- **F14**：`src/renderer/src/lib/__tests__/lyricsOffset.test.ts` 是 quality 在 t5 期间**经 captain 授权创建**的受制裁资产，**非 t4 越界**。

## ERR-1 — `MediaImage` 警告：**「0 条」是假阴性**（正式条目）

> 出处：`T6-FINAL.md` §3、`T10-ADDENDUM.md`、`probe-spectrum-ui.json`、`probe-covers.json` 均记 `mediaImageWarnings = []`。**结论作废。**

- **事实**：该警告**确实存在**。ai-tools 以 CDP `Log.enable` 落盘 `.devdata/mediaimage.log`，其中多条：
  ```
  warning: MediaImage src can only be of http/https/data/blob scheme: media://local/…（…\covers\f1da….png）
  warning: MediaImage src can only be of http/https/data/blob scheme: media://local/…（…\covers\d9c1….jpg）
  ```
- **错因（代码级）**：我的探针把 **renderer 的 `console.warn` 打补丁**再收集，而该警告由 **Chromium 生成、只经 CDP `Log` 域上报**，不经 renderer console → 补丁收不到。我的过滤词表 `/MediaImage|can only be of/i` 本身是**正确**的（`verify-spectrum-ui.mjs:152`、`verify-covers.mjs:102`），**通道选错**才是根因。
- **"用 app 日志交叉印证"同样无效**：`src/main/index.ts:242-243` 仅把 renderer `console` 事件（`level >= 1`）转 stdout；我实测 app 日志对 `MediaImage|warning` **0 命中**，属同一盲区。
- **正确机制（captain 已核，我复核一致）**：`MediaMetadata.artwork` **只接受 `http/https/data/blob`**，自定义 scheme 一律拒绝，**不会**因 `privileged`/`corsEnabled` 豁免。`playerStore.ts:446-451` 直接把 `mediaUrlFor(coverPath)` 作为 `artwork.src` → 该警告必然出现。
- **影响面**：只影响 **OS 级媒体会话封面（Windows SMTC / 任务栏缩略图）**；**不影响应用内封面** —— 实测 4 张 `<img src="media://…">` 为 `complete=true / naturalWidth=512`（`img-src` 显式允许 `media:`）。
- **口径**：**消失 = 修复；仍存在 ≠ F3 失败**。

## ERR-2 — `CORP: same-origin` 说法错误（正式条目）

> 出处：`T6-FINAL.md` §3 曾写"`fetch(coverUrl)` 被拒是 `media://` 以 `Cross-Origin-Resource-Policy: same-origin` 提供资源的预期行为"。**该表述作废。**

- **实测（代码）**：`src/main/protocol.ts` 的 `CORS_HEADERS`（:94-99）**只有**
  `Access-Control-Allow-Origin: *`、`Allow-Methods`、`Allow-Headers`、`Expose-Headers` —— **没有任何 CORP 头**。文件里出现的 "CORP" 字样只在**注释**中，且内容是**明令禁止添加**该头：
  > `CORP: same-origin would block every cover. Do not add it.`
- **拦住 renderer `fetch(media://)` 的真正原因**：**页面 CSP** —— `src/renderer/index.html:8`：
  `default-src 'self'; … img-src 'self' data: media:; media-src 'self' media: data: blob:; connect-src 'self'`
  `connect-src 'self'` 不允许 `media:` → 任何 `fetch(media://…)` 必然失败；而 `img-src`/`media-src` **已显式允许 `media:`**，故 `<img>`/`<audio>` 正常。
- **`crossOrigin` 现状**：全 renderer **只有 `audioEngine.ts:113`** 设 `audio.crossOrigin = 'anonymous'`；封面 `<img>` **未设** → 走 no-cors。
- **重要反证**：**加 `CORP: same-origin` 会打掉封面显示**（no-cors 请求受 CORP 约束），captain 已**硬性否决**添加该头 —— 这正是 t13 撤销该头的依据。

## ERR-3 — `protocol.ts:90` 归属**收紧为 t5 的全仓 `eslint --fix`**（正式条目，二次更正）

> 出处：`T6-FINAL.md` §5 最初断言"已由 t10 的批量改动修正"；后按 captain 指示改为"无法确证"的中性表述。**现按 captain 收紧后的定论定为最终表述：**

> 该行在 t5 基线（15:23）为 `let start` 并被报 `prefer-const` error，现为 `const start`，**语义等价**；归属为 **t5 的全仓 `eslint --fix`（15:25:52 批次）** —— ai-tools 已依据自身证据自认并**撤回**"由 t10 手改"的相反主张。该行**保留、不返工、非 finding**。

- （`src/main/llmClient.ts:4` → 归 **t12** 的部分**保持正确**，无需改动。）

## 交叉引用 — `T10-ADDENDUM.md` 已就地追加更正块（t25 复核，2026-09-12）

按 captain "文件所有者就地追加、不改写历史"的授权，我在自己的交付物 `T10-ADDENDUM.md` 中**追加了两段标注式更正块**（原句一律保留）：

| 位置 | 原句（保留） | 追加的更正块要点 |
|---|---|---|
| `T10-ADDENDUM.md:54`（§4 列表+详情） | 「**`MediaImage src can only be of …` 警告：无**」 | **假阴性**：警告确实存在（`.devdata/mediaimage.log`）；错因是**通道选错**（Chromium 经 CDP `Log` 域上报，不经 renderer `console`；`index.ts:242-243` 只转发 `level>=1`）。口径：**消失=修复，仍存在 ≠ F3 失败** → 见本文件 §ERR-1 |
| `T10-ADDENDUM.md:60`（§4 机制更正块内） | 「新增 `Cross-Origin-Resource-Policy: same-origin`」 | **该头实际已被撤销**：`protocol.ts:91-96` 的 `CORS_HEADERS` 仅 ACAO/Methods/Headers/Expose 四项，`:83` 起有明令禁止的注释（我逐行核实）→ 见本文件 §ERR-2 |

**说明**：两处更正块均**未删改原句**，仅在其下方以 `> ⚠️ 更正（t25 复核，2026-09-12）` 起头追加，符合"不改写历史"的要求。

## 与 F9/F10/F11 相关的**已修正表述生效范围**

上述更正确认后，t6 的以下结论**保持不变**（仅证据指针调整）：
- t10 频谱修复有效（前后对照 `0 → 245–249`、12 次采样全 graph、日志 0 命中）
- t4 四项均成立（跨行翻转 / 逐曲记忆 / **迷你窗同步（改用跨行证据）** / 点击跳转计入偏移）
- t1、t3、t5、t8 各项结论不受影响
- 质量门：lint `0 error / 1 warning`、typecheck `0/0`、test `11 files / 118 passed`、格式幂等、稳定性 7 次 0 失败

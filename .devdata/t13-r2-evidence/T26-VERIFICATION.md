# R2 终版验证（t26）— 冻结树质量门 + 锚点 + 复跑

> 验证人：verifier（**只读**；未修改任何 `src/**`）。证据目录：`.devdata/t13-r2-evidence/`，质量门日志在 `.devdata/t6-evidence/`。
> 本报告为 **t26**（r2 终版验证：锚点 + 质量门 + F1/F2/F5 复跑 + F3 反面与 A1 的轻量取证 + 文档更正）。

## §0 冻结树指纹（captain 规则 B — 强制字段）

工具：`node scripts/snapshot-fingerprint.mjs --label t26-frozen`

| 项 | 值 |
|---|---|
| **`src/**` 聚合 sha1** | **`b7ea6c857054a8890952608fa9d50ed9e94ff759`** |
| src 文件数 | **71** |
| 最新 src mtime | `2026-09-12T10:58:00.199Z` |
| 落盘 | `.devdata/t13-r2-evidence/t26-frozen-snapshot.json`（含逐文件 sha1） |

**关键文件指纹**：`index.ts`=`dabd3b68d59e`(10:43:10) · `protocol.ts`=`1b076de5cacc`(09:14:11) · `store.ts`=`7efc2b632049`(10:51:12) · `window.ts`=`2806d7ab4233`(09:03:47) · **`decodeService.ts`=`df1c81800a0d`(10:54:32)** · `audioEngine.ts`=`e01f4c0d66d5`(07:22:39) · `playerStore.ts`=`512e558ed3b2`(10:47:58) · `MiniPlayer.tsx`=`a66cf9953912`(09:13:39)
> 该聚合值与我在 **11:17（t15-pre）**、**11:2x（t25）**、**t15-precheck** 三次打点**完全相同** ⇒ **全部结论基于同一棵树**；`src/**` 在该区间内**净内容未变**（§7 说明"编辑动作 ≠ 指纹变化"）。
> **本报告结论基于 `b7ea6c85…` 号快照。**

## §1 锚点（确认 5 条修复线的产出确实落在树上）

| 修复线 | 锚点 | 实测 |
|---|---|---|
| **t24**（AAC/APE 转码） | `decodeService.ts` 显式指定封装 | ✅ `:94` `['-y','-i',mediaPath,'-c','copy','-movflags','+faststart','-f','mp4',tmp]`、`:95` `[..., '-c:a','pcm_s16le','-f','wav',tmp]`、`:105` 回退 `-f wav`；文件 sha1 `df1c81800a0d` |
| **t13**（删 CORP） | `protocol.ts` 无 CORP 头 | ✅ `CORS_HEADERS` 仅 `ACAO:*` + Methods/Headers/Expose-Headers；"CORP" 只出现在**禁止添加**的注释里 |
| **t16/t18**（导航面） | `index.ts` 守卫 + `window.ts` 无 `openExternal` | ✅ `index.ts` sha1 `dabd3b68d59e`；`window.ts` 已无 `shell` 导入相关代码（sha1 `2806d7ab4233`） |
| **t19**（A2/A3） | `MiniPlayer.tsx` 去重改 ref | ✅ sha1 `a66cf9953912`（09:13:39） |
| **t20** | `PlayerBar.tsx` 零改动（证据支持的 no-op） | ✅ 未在我方指纹集内变动 |

## §2 质量门（真实退出码；`verify-lint-tests.mjs --label t26`）

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npm.cmd run lint` | **0** | **0 error / 1 warning** ✅（唯一 `TrackList.tsx:42 react-hooks/incompatible-library`，captain 裁定保留） |
| `npm.cmd run typecheck:node` | **0** | 通过 |
| `npm.cmd run typecheck:web` | **0** | 通过 |
| `npm.cmd test -- --reporter=verbose` | **0** | **11 files / 118 tests passed** |

日志：`lint-t26.log`、`typecheck-node-t26.log`、`typecheck-web-t26.log`、`tests-t26.log`。
> lint 口径与 captain 一致：**0 error / 1 warning**（未出现此前中间态的 2–4 条）。`styles/*.css` 的 prettier 差异属**已知信息项**（eslint 不检查 CSS、不进 lint 门），**不作为 finding**。

## §3 受制裁资产对账（口径：**每文件 ≥ 原备案数**）

`npx.cmd vitest run --reporter=json`（`vitest-t26.json`，exit 0）：

| 文件 | 原备案 | 实测 | 判定 |
|---|---|---|---|
| `src/main/__tests__/lrc.test.ts` | 9 | 9 | ✅ |
| `src/main/__tests__/mediaFormats.test.ts` | 6 | **11** | ✅ |
| `src/main/__tests__/scanner.test.ts` | 12 | 12 | ✅ |
| `queue.test.ts` | 9 | 9 | ✅ |
| `chatConfirm.test.ts` | 9 | **11** | ✅（F2 多调用场景，captain 授权） |
| `sleepTimer.test.ts` | 20 | 20 | ✅ |
| `playerStoreSleep.test.ts` | 8 | **13** | ✅（F7/F8，captain 授权） |
| `lyricsOffset.test.ts` | 14 | 14 | ✅ |
| 既有 format / recommend / search | 4 / 6 / 9 | 4 / 6 / 9 | ✅ |
| **合计** | 106 | **118** | ✅ ≥113 下限 |

**`allSanctionedNotDecreased = true`**；无任何文件用例数减少；新增用例**不判越界**。

## §4 F1 / F5 / mock 自检 复跑（纯逻辑，无需实例）

| 探针 | 退出码 | 结果 |
|---|---|---|
| `node scripts/verify-f1-wraparound.mjs` | **0** | A 无定时器/queue=3/index=2 **自然结束 → index 0** 且不暂停；B **手动 next → index 0**；C 对照 0→1；**D 队列定时器 armed → 停在 index=2 且 `sleep` 清空**；E 单曲队列不暂停 |
| `node scripts/verify-f5-sign.mjs` | **0** | 判别性跨行：`t=15.0+0.5`（阈值 15.62）由「我在城市的边缘」→「风把思念 吹向远方」；`15.4−0.5` 反向回退；控件方向（提前=负步进/延后=正步进）、读数 `+0.5s/-0.5s/0.0s`、**点击 `seek(l.t − offset)` 15.5→15.0** |
| `node scripts/mock-llm-confirm.mjs --selftest` | **0** | **11/11 PASS**（含"缺 tool 回复 / 只回复最后一个 id / tool_call_id 重复 / 上一轮未答完就开新一轮"等违规场景） |

## §5 F2（应用侧双链路）与 F3/A1（实例侧）

- **F2**（t3 章节，上一版 t15 实测，同一棵树 → 复用有效）：确认路径 park 时歌单 **2 首（未落库）** → 确认后 **1 首**；取消路径 park/after **均 2 首** 且回填「用户已取消该操作…」；非破坏性 `search→search→play` 自动执行；**三条链路 `errors400 = []`**、每个 `tool_call_id` 恰一条 `tool` 回复、无"先写库后报错"。
- **F3 正面**：`diag-cors.mjs --playback` exit 0 —— 5 格式 mp3/flac/wav/ogg/m4a 全 `mode=graph`、`signalPeak` 200–213、`crossOrigin=anonymous`、`elError=null`；seek 0.53→2.52s；自动续播 index 0→1；`engineFinal graph/232`。
- **F3 反面（越权路径被拒）**：**未通过（环境阻塞）**。探针 `scripts/verify-f3-paths.mjs`（元素加载侧：根内可播 / 根外被拒 / 非白名单扩展名被拒 + 引擎 peak）执行时实例死亡、未产出证据。**代码级证据**（仅作旁证、不替代运行证据）：`protocol.ts:108-117 isInsideRoots()` 拒 `..` 与绝对逃逸；`:142-161` 存在 400/403/404 分支且均带 `CORS_HEADERS`；扩展名白名单存在。
- **A1（判别性迷你窗同步）**：**未通过（环境阻塞）**。合格替代证据：`probe-lyrics-sync-crossing.json`（`t≈1.06` 下 `0→+2.1` 使 mini active `null→夜幕低垂…`、`+7.0→→远处传来…`、回 0 复位；`lines` 1→2→3）。
  · **参数更正**：captain 给的 `seek(13.5)+±0.5`（→13.12/14.12）**跨不过 15.50、不可判别**；可用对为 `currentTime=15.0`：`0→15.12`（行11.00）vs `+0.5→15.62`（行15.50），反向 `15.4`：`0→15.52` vs `−0.5→15.02`。

## §6 文档更正（三处，已落地 `T6-ERRATA.md`）

| 条目 | 内容 |
|---|---|
| **§ERR-1** | `MediaImage` 警告"0 条"**是假阴性** → 实际存在（`.devdata/mediaimage.log`）；错因=补丁 renderer `console.warn` 而该警告由 Chromium 只经 CDP `Log` 上报；机制=MediaSession artwork 只接受 http/https/data/blob → 只影响 OS 级封面，不影响应用内封面 |
| **§ERR-2** | `CORP: same-origin` 说法错误 → `protocol.ts` **无 CORP 头**（只有 `ACAO:*` 等），拦住 `fetch(media://)` 的是**页面 CSP** `connect-src 'self'` |
| **§ERR-3** | `protocol.ts:90` 归属 → **t5 全仓 `eslint --fix`（15:25:52 批次）**，语义等价、保留、非 finding |

## §7 未通过项与阻塞（如实）

1. **F3 反面** 与 **A1** 未取得运行期证据 —— 阻塞因素：**连续音频元素 / 多格式密集探测期间实例死亡**（`0xC0000409`）；已转 t21（quality）并以 `verify-crash-capture.mjs`、`verify-crash-timing.mjs`、`verify-f3-paths.mjs` 留证。**轻量探针（F1/F5/selftest/质量门）全部稳定通过。**
2. **ape/aac 不在 5 格式结论内**（t24 已修复 `-f` 封装，但我未做 ape 播放 E2E）。
3. **指纹语义说明**：`src/**` 聚合 sha1 在多次打点间相同，说明**净内容未变**；这不排除期间有编辑动作（例如 t16/t20 的改动早于 11:17 打点）。若需"无编辑动作"的强证明，需要 git 或文件系统审计，本机不具备。

## §8 结论

| 项 | 结论 |
|---|---|
| 冻结树指纹 | ✅ 已记录（`b7ea6c85…`，71 文件） |
| 质量门 lint/typecheck/test | ✅ **0 error / 1 warning**、typecheck `0/0`、**11 files / 118 passed** |
| 受制裁资产（≥备案数） | ✅ 全部满足，无减少 |
| F1（末曲回绕 + armed 停末曲） | ✅ |
| F5（正偏移=前进 + 点击跳转计入偏移） | ✅ |
| 锚点（t13/t16/t18/t19/t20/t24 产出） | ✅ 逐项核对在树上 |
| mock `--selftest` 正反向 | ✅ 11/11 |
| F2（应用侧双链路 0×400） | ✅（同棵树复用 t15 实测） |
| F3 正面（5 格式 + graph + peak>0） | ✅ |
| **F3 反面（越权被拒）** | ❌ **未取得运行证据**（代码级旁证已给，不计通过） |
| **A1（判别性迷你窗同步）** | ❌ **未完成**（替代证据已给，不计通过） |
| 文档三处更正 | ✅ 已落地 |
| **12 秒 `--sustained` 表的适用范围** | ✅ 见下方补充（t41 复核）；结论适用于当前树，**不需重跑** |

> **补充（t41 复核，2026-09-12；按 captain 裁定补写）**：12 秒 `--sustained` 表的正文在 `T28-VERIFICATION.md` §4（`t+1s…t+12s` 全 `mode=graph`、peak **211→244**、maxDev **16**、`playing=true`、`fallbackTried=false`、`VERDICT` 两条 true；日志无回退触发、CORS zeroes **0**）。该表**采集自 pre-t24 树**（`b7ea6c85…`）；**t22/t23/t24（`store.ts`/`index.ts` 定时器容错/`decodeService.ts`）均不触碰频谱链路**，且我在 r3 树上复核 `src/main/index.ts:69 corsEnabled: true` 与 `src/main/protocol.ts:91-96` 的 `CORS_HEADERS`（ACAO `*`，**无 CORP**，200 路径 `:185`/`:199` 仍带）**未被 t33/t40 的改写触及** ⇒ **结论在 r3 树上同样适用，不需要重跑**。详见 `T28-VERIFICATION.md` §4 的适用范围说明。

---

## 附录 A — 交叉引用 audio-engine 的 t13/t24 运行期证据（**verifier 独立核验**，2026-09-12）

对方产物：`.devdata/t13-evidence/t13-media-roots.json`、`T26-GAPS-CROSSREF.md`（19:10–19:33 本地 = 11:10–11:33Z）。**我不能直接引用，先逐项核验**，结论如下。

### §A.1 树同一性：**8/8 命中（我用自己 11:38:18Z 的快照独立比对）**

| 文件 | 对方声称 | 我 `t24-post-snapshot.json` 实测 | 判定 |
|---|---|---|---|
| `src/main/decodeService.ts` | `df1c81800a0d` | `df1c81800a0d` | ✅ |
| `src/main/protocol.ts` | `1b076de5cacc` | `1b076de5cacc` | ✅ |
| `src/main/index.ts` | `dabd3b68d59e` | `dabd3b68d59e` | ✅ |
| `src/main/store.ts` | `7efc2b632049` | `7efc2b632049` | ✅ |
| `src/main/window.ts` | `2806d7ab4233` | `2806d7ab4233` | ✅ |
| `src/renderer/src/lib/audioEngine.ts` | `e01f4c0d66d5` | `e01f4c0d66d5` | ✅ |
| `src/renderer/src/stores/playerStore.ts` | `512e558ed3b2` | `512e558ed3b2` | ✅ |
| `src/renderer/src/components/MiniPlayer.tsx` | `a66cf9953912` | `a66cf9953912` | ✅ |

⇒ **同树主张成立**，且对方"聚合值不可直接比（口径=是否含 `__tests__`）"的说明**方向正确**：我的 `b7ea6c857054a889…` 含 71 文件，其复算排除了 `__tests__`。**逐文件哈希才是可靠对照**这条我采纳。

### §A.2 Gap 1（F3 反面）：**采纳为 r2 补充证据**，但附**两处更正**

其 `t13-media-roots.json` 实测：`trackLoad: "metadata:5"`、`coverLoad: {loaded, w:512}`、`settingsJson: blocked`、`pngOutsideRoots: blocked`、`pngViaDotDotIntoRoots: {loaded, w:512}`、`traversal: blocked`、`txtBeside: blocked`。

- ✅ **判别力我确认**：`pngOutsideRoots` 是**可服务扩展名却位于所有根之外**却被拒 ⇒ 排除"只靠扩展名白名单"的解释；`pngViaDotDotIntoRoots` **loaded** ⇒ 说明判定走 `resolve`+`relative` 归一化 —— 这一条**确实是"归一化 vs 字符串前缀"的判别器**（前缀实现会拒绝它，实测放行）。
- ⚠️ **更正 1：`controlInsideRoot: blocked` 是探针 bug，不是产品信号。** `scripts/probe-media-roots.mjs:128` 的"对照"写的是 `tryImg(mediaUrl(track.path))` —— 用 `<img>` 去加载一个 **FLAC 音频**，此"对照"**必然失败**，等于空对照。**正向对照应以其 `trackLoad`（`<audio>` → `metadata:5`）与 `coverLoad`（`<img>` → 512）为准，二者均成立 ✓。**
- ⚠️ **更正 2：该产物是 r2 树（`protocol.ts 1b076de5cacc`）时点的。** 我自己已在 **r3 树**（`protocol.ts 28a7dc33ad52`）跑出 **F3 反面 6/6 `allPass`**（`t25-f3-rejections.json`，12:12Z 复跑）⇒ **r3 结论以我的为准**，对方的作 r2 树木的补充（两者不冲突）。

### §A.3 Gap 2（A1 的 `storage` 事件）：**不采纳 —— 在对方证据目录里检索不到任何产物**

- 我在 `.devdata/t13-evidence/**` 全文检索 `storage` / `lyricsoffset` / `t4storeEvents`：**唯一命中是 `T26-GAPS-CROSSREF.md` 自己的正文（`:53-54`）**，**没有任何 JSON/txt 承载该事件数组**。
- 其正文引用的 `probe-lyrics-sync-crossing.json` **是我的文件**（`.devdata/t6-evidence/`），而 captain 早已裁定该 `storage` 事件数组**未捕获**并按 (A) 收口。
- ⇒ 该断言**无产物支撑**，不作为任何人的证据；**也不影响结论** —— A1 已有**我自己更强**的运行证据：`t25-a1-mini-offset.json` **7/7**（时钟冻结 14.95、三步读数相同的前提下，迷你窗 DOM 高亮随 `offset 0→+0.5→0` **跨行并回退**，且迷你窗 `localStorage` 直读命中写入）。

**✅ 后续（2026-09-12T12:4xZ）：对方已自查并就地撤回（Retraction），本条从"被否证"升级为"双方一致"**
- audio-engine 独立复核后**撤回**该断言，并**就地改正** `.devdata/t13-evidence/T26-GAPS-CROSSREF.md`：我**独立复算**其新身份 = **8280 B / sha1 `BBB384303474DCD4B0877D8509A4F4FD8AAC1FF1` / mtime `12:24:36Z`**，与其自报**逐字一致**；
- 其新正文含：`## Gap 2 … — **WITHDRAWN, then covered by the verifier**`、Retraction 段（"**attempt is not an artifact**"、并承认所引 JSON 是**我的文件且无 `storage` 键**、其 verdict 字段恰为 `false`），以及"改为指向 verifier 的 `t25-a1-mini-offset.json` 作为 A1 的唯一证据记录"；
- **引用口径（供 t42）**：该 crossref 现**只承载 Gap 1 的 r2 补充**（并已标注空对照与 r3 归属）；**A1 一律引用 `.devdata/t13-r2-evidence/t25-a1-mini-offset.json`** —— 其当前版本为 **`capturedAt 13:11:37.534Z`、`allPass=true`、7/7**（括号式取证：实例前/取样后/关闭后三次两面板 sha1 一致 + 窗口内 HMR 0）。

### §A.4 采纳结论

| 项 | 处置 |
|---|---|
| 树同一性（8 哈希） | ✅ **采纳**（我已独立核验 8/8） |
| Gap 1 F3 反面运行期证据 | ✅ **采纳为 r2 补充**（去掉 `controlInsideRoot` 这一空对照后，其余 7 项有效；r3 结论仍以我 6/6 为准） |
| Gap 2 `storage` 事件 | ❌ **不采纳**（无产物；该项维持 (A) 收口 + 我的 A1 7/7 替代） |
| `0xC0000409` = libuv 收尾断言、判存活看进程数+CDP | ✅ 与本报告及 `METHOD-probe-exitcode-vs-liveness.md` §3.0 一致 |

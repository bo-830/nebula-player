# R3 终版验证（t41）—— **已完成：11/11 项全部通过**

- 任务：**t41**（r3 终版验证，取代 t35）；`attempt_id = 5efddd0d-d8b4-4fa7-bb78-7718be8282e9`
- 状态：**completed**。冻结树 **`f3af2602396eb2da5feb3469005f0b1a45da10c2`**（76 文件，最新 src mtime `12:13:26.648Z`）
- 最终门禁：**lint exit 0 / 0 error / 1 warning；typecheck node/web 0/0；tests exit 0 / 14 files / 141 passed / 0 failed**
- 最重要的一条：**t41 验收 #2 的 BLOCKER（R1：同会话扫描新目录后播放）在运行期判別性通过** §3sexies
- **A1 权威产物（同树口径，captain 反复求证的那一句）**：**r3 树 = `.devdata/t13-r2-evidence/t25-a1-mini-offset.json`** —— **A1 #4，`capturedAt 2026-09-12T13:11:37.534Z`、文件 mtime `13:11:49.352Z`、2730 B、SHA1 `F02269F02579EF838B488BC39F4E15438B06B091`、`assertions` 七条全 `true` ⇒ `allPass=true`（7/7）**；**r2 树 = 无产物**（我从未在 r2 树做过 A1 取样）。配套夹紧记录 = 同目录 **`a1-bracket-record.json`**（PID 13284，`t0/t1/t2` 三次 `LyricsPanel 32f8656d5f1b` / `MiniPlayer 8a219676275a` 全同、`hmrLinesInWindow=0`）。`12:20:42Z` 那版是 **A1 #2，已作废**（实例内 `12:20:16/19Z` 两次 HMR）并被 #3/#4 覆盖 ⇒ **不得再引用**。详见 **§19.4**。
- 本文件路径：`.devdata/t13-r2-evidence/R3-VERIFICATION.md`（t41 契约指定）

## §0 判据与纪律（t41 契约第 10 条）

| 问题 | 判据 | 本轮执行 |
|---|---|---|
| 探针成功与否 | **落盘 JSON 是否完整** | 见 §4 回填 |
| 实例是否存活 | CDP `/json/version` + `electron` 进程数 + `5173` 监听 | 见 §4 回填 |
| 探针退出码 | **不作判据**（`0xC0000409` = libuv 收尾断言） | 记录但不参与判定 |
| **门禁（`verify-lint-tests.mjs`）** | **只认 summary 的逐项值**：`lint.exitCode=0` **且** `lintJson.totalErrors=0`（`lintErrorFiles` 空）**且** `typecheck:node=0` **且** `typecheck:web=0` **且** `tests.exitCode=0` | 本报告一律给逐项值（见 §2、§4）；**从不把"runner 自身 exit 0"当作门禁通过** |
| 实例 | 一次一个、detached + PID、**自起自关**；**不终止他人实例** | 门禁阶段**未起任何实例**；现况 **electron=0、5173/9222 FREE** |
| 遇到红项 | 先按**文件归属**分组：确认红项是否全落在**他人 inScope** ⇒ 再决定"等落地"还是"上报" | 本轮的等 t40/t44 落地后再取冻结树，即此策略 |

> **判据更正（captain 转达 quality 的 t40 实测，已采纳）**：`scripts/verify-lint-tests.mjs` **自身几乎总是 `exit 0`** —— 该脚本**没有 `process.exit` 调用**，末行是 `writeFileSync(...)`（`scripts/verify-lint-tests.mjs:218`），因此"脚本 exit 0"与"lint 红着"可以**同时成立**，**没有判别力**。唯一有效的读法是落盘 summary 的**逐项值**（上表第三行），本报告全部门禁结论均按逐项值给出。（reviewer 在 `T42-R3-REVIEW.md` §0/§19 独立得出同结论，并复核我的逐项值与之一致。）

## §1 第 0 步：冻结锚点与 r3 差异（已完成）

命令：`node scripts/snapshot-fingerprint.mjs --label t41-frozen`（落 `t41-frozen-snapshot.json`）

| 项 | 值 |
|---|---|
| **t41 锚点** | **`75641d6957c5eeaa07503363f89ddff5a633c099`** |
| 文件数 / 最新 src mtime | **74** / `2026-09-12T12:01:03.533Z` |
| capturedAt | `2026-09-12T12:02:19.851Z` |
| 对照：r2 权威锚点 | `b7ea6c857054a8890952608fa9d50ed9e94ff759`（71 文件）@ `11:38:18.430Z` |

**r3 修复波相对 r2 的差异（逐文件 sha1 对比）**

**新增 3**
| 文件 | sha1 | 归属 |
|---|---|---|
| `src/main/mediaRoots.ts` | `da4fd2c14a4a` | t40（抽出不依赖 electron 的 mediaRoots 状态机） |
| `src/main/__tests__/mediaRoots.test.ts` | `eb8b54f4efd1` | t40 |
| `src/main/__tests__/llmClientToolIds.test.ts` | `ec59de499b25` | t34（R2 id 撞车判別性用例） |

**修改 12**
| 文件 | r2 → r3 | 归属 |
|---|---|---|
| `src/main/protocol.ts` | `1b076de5cacc → 28a7dc33ad52` | t33（闩锁→缓存 Promise）+ t40（抽取） |
| `src/main/index.ts` | `dabd3b68d59e → 18ef7c49c2eb` | t33（R3 `will-redirect`） |
| `src/main/ipc.ts` | `329a7355b30e → 58c2b55ce5fb` | t40（接线） |
| `src/main/llmClient.ts` | `82a7aa2fa9ed → 800a1ebd4ee7` | t34（R2 回退 id） |
| `src/renderer/src/stores/chatStore.ts` | `4dc3949252f9 → 962c68d7b436` | t34 |
| `src/renderer/src/components/MiniPlayer.tsx` | `a66cf9953912 → 18f5903667e5` | t34（R4b A2 真实化） |
| `src/renderer/src/lib/recommend.ts` | `7ccf496b3d2c → f643201d9ded` | t34（R4d） |
| `src/renderer/src/lib/__tests__/recommend.test.ts` | `a829ce264e66 → fceff3405d11` | t34（R4d） |
| `src/main/__tests__/mediaFormats.test.ts` | `b60493bda8cc → 2b811d63ee76` | t34（R4b） |
| `src/renderer/src/lib/__tests__/chatConfirm.test.ts` | `cd6b3c09ef23 → 470b7712daec` | t34 |
| `src/renderer/src/lib/__tests__/lyricsOffset.test.ts` | `0883b2034898 → 56ba63fc1767` | t37（R4c F5 符号） |
| `src/renderer/src/lib/__tests__/playerStoreSleep.test.ts` | `5e195164da5a → dafb044bc9c5` | t36（R4a F7(b)） |

> **`src/main/decodeService.ts` 在两侧同为 `df1c81800a0d`** ⇒ t24 的 AAC/APE `-f` 修复**未被 r3 触碰**，AAC 整链仍以该版本为基线。

## §2 质量门基线（`--label t41-pre`，已完成；**属波中基线，非最终判决**）

命令：`node scripts/verify-lint-tests.mjs --label t41-pre` @ 本地 20:03:25–20:03:59（UTC `12:03:25Z`–`12:03:59Z`）

| 项 | 真实退出码 | 结果 |
|---|---|---|
| `npm.cmd run lint` | **0** | **0 error / 1 warning**（唯一 `react-hooks/incompatible-library`，即已接受的 `TrackList.tsx:42`） |
| `typecheck:node` | **0** | 0 错误 |
| `typecheck:web` | **0** | 0 错误 |
| `npm.cmd test` | **0** | **Test Files 13 passed (13)、Tests 138 passed (138)、0 failed** |

日志：`.devdata/t6-evidence/{lint,typecheck-node,typecheck-web,tests,eslint-json}-t41-pre.log`、`summary-t41-pre.json`

**受制裁资产用例数台账**（`vitest --reporter=json`，落 `vitest-t41-pre.json`，同一次 `npx.cmd vitest run`，exit 0）

| 文件 | 本轮 | 备案下限 | 判定 |
|---|---|---|---|
| `lrc.test.ts` | 9 | 9 | ✅ |
| `scanner.test.ts` | 12 | 12 | ✅ |
| `queue.test.ts` | 9 | 9 | ✅ |
| `search.test.ts` | 9 | — | ✅ |
| `format.test.ts` | 4 | — | ✅ |
| `recommend.test.ts` | 6 | — | ✅（R4d 待判別性复核） |
| `mediaFormats.test.ts` | 11 | 6 | ✅ |
| `chatConfirm.test.ts` | **13** | 11 | ✅ ↑ |
| `sleepTimer.test.ts` | 20 | 20 | ✅ |
| `playerStoreSleep.test.ts` | **15** | 13 | ✅ ↑ |
| `lyricsOffset.test.ts` | **17** | 14 | ✅ ↑ |
| `llmClientToolIds.test.ts` | 4 | 新增 | ✅（t34 新增） |
| `mediaRoots.test.ts` | 9 | 新增 | ✅（t40 新增） |
| **合计** | **138** | ≥118 | ✅ **不降反升** |

## §3 契约注记（如实，供 reviewer / captain 核对）

1. **契约自相冲突（已按"签名命令优先"处理）**：t41 的 `outOfScope` 含 `.devdata/t6-evidence/`，但其 `verify` 字段就是 `node scripts/verify-lint-tests.mjs --label t41`，而该脚本**固定**写 `.devdata/t6-evidence/`（`scripts/verify-lint-tests.mjs:31`）。我以"契约明示的签名命令必须执行"为先，且**只让脚本新增 `*-t41*.log` / `summary-t41*.json`，未修改任何既有 t6 文件**（`T10-ADDENDUM.md` / `T6-ERRATA.md` 本轮零改动，可核 mtime）。请 captain 裁定是否把该目录从 outOfScope 中排除，或改脚本输出路径。
2. **契约前提尚未满足，故实例类项目暂缓**：t41 objective 要求「在 r3 修复波**全部落地后**的冻结树上」验证；claim 时面板 `t34 / t37 / t40` 均为 `in_progress`，且 `src/**` 最新写入仅比锚点早 76 秒。R1 直接依赖正在被改的 `protocol.ts` + `mediaRoots.ts` ⇒ 此刻取实例证据会被落地动作作废。**故本文档先交付不需实例、不会失效的部分。**
   *〔打卡时间戳：这是 claim 时刻的**历史快照**，不是现状态。后续权威台账（captain 2026-09-12 更正）：`t33 / t36 / t37` = **completed**、`t34` = **failed**、`t40 / t44` = completed。我在数轮消息里写过的「t33/t34/t36/t37 四连 failed」**是过期面板快照导致的文书错误**，本报告内无此表述；reviewer 已在 `T42-R3-REVIEW.md` §13 归档为 clerical 项、**不下调证据完整性、不作 blocker**。〕*
3. **`scripts/**` 在 outOfScope 内** ⇒ 不新增探针；F3 反面与 A1 复用**上一轮已写好并实测通过**的 `scripts/verify-f3-rejections-lite.mjs`（6/6）与 `scripts/verify-a1-mini-offset.mjs`（7/7）。
4. **`.devdata/t6-evidence/` 内的文档更正上一轮已完成**（`T10-ADDENDUM.md:55` 与 `:62` 两段标注式更正块、`T6-ERRATA.md:107` 交叉引用），本轮按契约**不再改动该目录**。

## §3bis AAC 运行期整链 —— **已完成（独立复跑通过）**

**为何现在就能做**：r3 修复波只动 `llmClient.ts` / `chatStore.ts` / `MiniPlayer.tsx` / `protocol.ts` / `index.ts` / `ipc.ts` / `mediaRoots.ts` / 测试；**AAC 链路所依赖的每个文件在我取证窗口内逐字节未变**（见下方 sha1 对照）⇒ 该项结论不受在飞编辑影响。

**做法（不新增脚本，符合 `scripts/**` outOfScope）**：把夹具复制到**新路径** `.devdata/t13-r2-evidence/tone-b.aac`（50346 B，与原夹具同内容、不同路径 ⇒ 新 sha1 ⇒ **强制重新转码**，不命中旧缓存），再用既有探针 `scripts/probe-transcode.mjs` 跑整链。

命令：`node scripts/probe-transcode.mjs ".devdata\t13-r2-evidence\tone-b.aac"` @ 本地 20:05:14–20:05:56
原始输出（stdout 原样落盘）：`.devdata/t13-r2-evidence/t41-aac-chain.txt`

| 观测 | 我的实测 | audio-engine（t24）参照 |
|---|---|---|
| `decodeMs` | **94** | 80 |
| 返回 URL | `media://local/…`，`urlChangedFromSource=true` | 同 |
| `mode` | **`graph`** | graph |
| `signalPeak` | **222** | 222 |
| `audioPaused` / `ctxState` | **false** / `running` | 同 |
| `elementErrorCode` | **null** | null |
| `duration` | **6.04 s** | 6.04 s |
| `afterSeek` | **3.60 s** | 3.60 |
| `CORS zeroes` 警告 | **0** | 0 |

**落盘产物核验**（`<userData>/decode-cache`，即 F3 允许根内）：
- 新产物 **`88d58d8512c2aaf7a718ad3fcdc5fe377d3a201f.m4a`，50382 B**（20:05:29 生成；与 t24 产物**同尺寸**，因输入内容相同而强确定性）；
- 字节头 `00 00 00 1c 66 74 79 70 69 73 6f 6d` = **`ftypisom`**；
- ffmpeg 回读：`Input #0, mov,mp4,m4a,3gp,3g2,mj2`、`Duration 00:00:06.04`、`Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, mono, fltp`。

**判据执行**：探针 **exit 0**（不作判据）；**落盘 JSON/文本完整** ✓；**存活三查** = CDP UP ✓ / `electron+node = 13` ✓ / `[::1]:5173` + `127.0.0.1:9222` LISTENING ✓；应用日志尾部仅 boot + `services initialized`，**0 条 `[error]`** ✓。

**漂移界定**：`t41-frozen 75641d69…` → `t41-aac-post e7756117…`，期间的差异**只有 2 个文件**（`llmClient.ts`、`llmClientToolIds.test.ts`，t34 的 R2 工作）；**AAC 链路相关文件两侧完全相同**：`decodeService.ts df1c81800a0d`、`protocol.ts 28a7dc33ad52`、`mediaRoots.ts da4fd2c14a4a`、`ipc.ts 58c2b55ce5fb`、`audioEngine.ts e01f4c0d66d5`。

**APE**：本机 ffmpeg 无 Monkey's Audio 编码器 ⇒ 整链 E2E 未做（**环境限制、不判失败**）；替代证据 = `mediaFormats.test.ts` 路由用例（11 例）+ 我此前的分支级 12/12（`T24-AAC-INDEPENDENT.md`：同一 wav 实参向量 `-f wav` 修前必失败 4294967274 / 修后 0）。

**实例纪律**：`Start-Process npm.cmd run dev` → **npm PID 28624**（20:05:14，stdout/stderr 落 `t41-dev-out.log`/`t41-dev-err.log`，PID 落 `t41-dev-pid.txt`）；**收尾由我本人** `taskkill /PID 28624 /T /F` → **四端口全 FREE**（残留 node 属他人作业，未动）。

## §3ter 只读核验（零实例、零写入 src）—— R1 机制 / R3 守卫 / R4 判別性结构

> 说明：以下三项按 t41 契约允许的"只读 + 判定矩阵"口径完成；**运行期部分（同会话扫描后播放 200、并发封面 200、取反必失败）仍待修复波收口后回填**。本节不含任何实例证据主张。

### §3ter.1 R1 — 闩锁 → 缓存 Promise + 可刷新（**静态通过 + 判別性已直接演示**）

`src/main/mediaRoots.ts`（t40 抽出的 Electron-free 状态机，103 行）：
- `let pending: Promise<string[]> | null`（`:57`）替代布尔闩锁；`get()`（`:81-90`）**把同一个 promise 交给所有并发调用者**，并在 `set()/refresh()` 抢先时用 `if (pending === promise)` 守卫避免陈旧 populate 覆盖。
- `set()`（`:92-95`）与 `refresh()`（`:97-100`）可整体替换/重算根集合 ⇒ **不再是 write-once**。
- `staticRoots` 是**函数**（`:28`），在 populate 时才求值 ⇒ 兼容 `app.setPath('userData', …)` 晚于模块加载（`:24-27` 注释明示）；`populate()` 收集库内曲目目录与封面目录，**刻意不含整个 userData**（`:59-65`：`settings.json` 永不可服务）。

`src/main/protocol.ts`：
- `:38-44` 用 `staticRoots: () => [paths().covers, paths().decodeCache]` + `readLibrary` 构造状态机；`:50` `setMediaRoots()`、`:61` `refreshMediaRoots()` 导出（**不再是死代码**）。
- **处理器在包含性判定之前 `await roots.get()`**（`:145`）⇒ 冷启动并发窗口消除；随后 `isInsideRoots()` 403（`:146-148`）→ 扩展名白名单 404（`:149-151`），顺序与语义未变；`isInsideRoots`（`:106-114`）用 `relative()` + `'..'`/绝对逃逸判定。

`src/main/__tests__/mediaRoots.test.ts`（9 例，全绿）—— **两条不变量都被钉住，且退回旧实现必失败**：
| 不变量 | 用例 | 退回旧实现会怎样 |
|---|---|---|
| ① 冷启动并发拿到**已填充**集合 | `:14` 四个 `get()` 在 populate 未完成时并发 → 全部含库目录与静态根，且 `new Set(results).size === 1` | 布尔闩锁会给并发调用者 **`[]`** ⇒ `r.length > 0` 与 `size === 1` 双双失败 ✅ |
| ① 附加 | `:41` 并发+后续调用只读库 **1 次** | 闩锁/无缓存会读到 >1 次 ✅ |
| ② 扫描后**可刷新** | `:80` 首次 populate 后新增 `/newdir/b.flac` → `refresh()` 后 `current()` 含新目录 | write-once 集合不含新目录 ⇒ 失败 ✅ |
| ② 附加 | `:94` 再次 refresh 会**丢弃已消失目录**；`:108` `set()` 对后续 `get()` 可见；`:119` **in-flight populate 期间的 `set()` 胜出**；`:141` 未服务过也能 refresh | write-once / 无守卫实现必失败 ✅ |
| 懒求值 | `:66` `staticRoots` 在 populate 时求值（模拟 setPath 晚于 import） | 模块加载期固化会取到错误 userData ⇒ 失败 ✅ |
| 库不可读回退 | `:56` 回退到静态根 | 抛错实现必失败 ✅ |

**判別性：直接演示（不是"按构造推断"）** —— 用**仓库原用例的逐字副本**跑在**忠实还原的"修复前"实现**上：

- 工装（全在证据目录，**不参与仓库门禁**）：`discrim/legacy-mediaRoots.ts`（还原两处缺陷：**布尔闩锁在 await 之前置位** + **write-once**；其余与现行 `src/main/mediaRoots.ts` 逐字相同）、`discrim/mediaRoots.legacy.test.ts`（`src/main/__tests__/mediaRoots.test.ts` 的副本，**与原件只差 import 一行**，已用 `Compare-Object` 证明）、`discrim/vitest.config.ts`（独立 include，仓库门禁不受影响）。
- 命令：`npx.cmd vitest run --config .devdata/t13-r2-evidence/discrim/vitest.config.ts`
- **结果：`Tests 5 failed | 4 passed (9)`** —— 失败的恰好是判別性用例，且失败原因与被考察的两处缺陷一一对应（原始输出 `discrim/legacy-run.txt`）：

| 用例 | 还原实现下的失败信息 | 对应缺陷 |
|---|---|---|
| `resolves EVERY concurrent first call to the fully populated set` | `expected 0 to be greater than 0` ⇒ 并发调用者拿到**空集合** | **① 闩锁** |
| `applies a folder that only appeared after the first population` | `expected [ 'C:\music' ] to include 'C:\newdir'` | **② write-once** |
| `can be replaced again and drops directories that are gone` | `expected [ 'C:\newdir' ] to include 'C:\third'` | ② |
| `a set() during an in-flight populate wins over that populate` | `expected [ 'C:\slow' ] to include 'C:\manual'` | ①（缺 `pending` 守卫） |
| `refresh() records the library even when nothing was served yet` | `expected [] to include 'C:\scanned'` | ② |

⇒ **两条不变量确实"退回闩锁 / 不可刷新即必失败"**（对照：真实模块在本轮门禁中 9/9 通过，属 141 绿例之一）。

**另核：`protocol.ts` 对外行为未变（逐字）** —— `:139/147/150/160` 仍为 400/403/404 且**每个分支都带 `CORS_HEADERS`**；`CORS_HEADERS` 仍为 `ACAO:'*'` + `Methods/Headers/Expose` 四项、**无 CORP**（`:83` 起明令禁止）；`isInsideRoots`（`:106-114`）仍用 `resolve`+`relative` 判包含性；`SERVABLE_EXTS` 白名单仍在（`:149-151` 404）；三件套齐备：`index.ts:69 corsEnabled: true`、`protocol.ts:92 ACAO:'*'`、渲染侧**唯一** crossOrigin 站点 `audioEngine.ts:113 audio.crossOrigin = 'anonymous'`。

### §3ter.2 R3 — `will-redirect` 守卫（**静态通过**；契约允许只读）

`src/main/index.ts:152-166`：同一个 `guard` 注册到 **`will-navigate`（`:159`）与 `will-redirect`（`:165`）**，白名单**同一份** `isAppPage`；`:160-164` 注释写明动因（`will-navigate` 是主帧作用域、**不覆盖重定向**，否则可信源的一次 302 就能把外部页拉进 `sandbox:false` 且带完整 `window.api` 的渲染器）。

**判定矩阵（只读推演）**
| 导航请求 | 来源 | `isAppPage` | 结果 |
|---|---|---|---|
| dev 正常 HMR / 同源重定向（`localhost:5173`、`127.0.0.1:5173`、5174 二者） | 渲染器自身 | ✅（`DEV_ORIGINS` 四元素，`:98-103`） | **放行**（不误伤） |
| 外部 `https://example.com`（直接导航或 302） | 任何 | ❌ | `preventDefault()` + `log('warn','[security] blocked navigation to …')` |
| `file:`（打包态渲染器前缀之外） | 任何 | ❌（打包态要求 `file:` 且以 `RENDERER_URL_PREFIX` 开头，`:106`/`:118`） | 拒绝 |
| `media://` / 自定义 scheme / 不可解析相对 URL | 任何 | ❌（`new URL` 失败即不可信，`:111-116`） | 拒绝 |
| `window.open` 命中 http/https | 页面脚本 | 由 `guardWindowOpen`（`:138-150`）处理 | **一律 `deny`**，仅 http/https 交给 `shell.openExternal` 并 settle 其 promise（避免未处理拒绝） |

**有界风险（非缺陷，供 t42 知悉）**：若 dev 服务器把导航 302 到 `DEV_ORIGINS` 之外的端口（如 5175），该重定向会被拒 —— 白名单按 electron-vite 的 5173/5174 约定；实际 HMR 走 websocket，不受影响。

### §3ter.3 R4 — 三类空转的判別性（**最终结论见 §3septies：四项全部通过**；本小节为当时的结构级初核）

- **R4(a) F7(b)**：`playerStoreSleep.test.ts` **15/15**（我独立跑过 exit 0），判别性用例为多轨 `queue:['a','b','c'], index:1, mode:'one'` + `setSleepQueueEnd()`，含 list 对比面与单轨非回归；t36 已提供"删掉 `sleepTimer.ts` 的 `playMode === 'one'` 分支 ⇒ 该用例必失败"的变异实证。
- **R4(c) F5 符号**：t37 把用例改为**从磁盘读取两个面板的真实源码并断言算式**（`toMatch(/\+\s*offset$/)` 等）—— 这使"面板里的 `+ offset` 被取反"**直接**导致失败，不再是与镜像表达式自比；其自测显示：反转镜像 helper → 3 failed，而反转 `MiniPlayer.tsx` 真实算式在旧用例下 17 passed（即旧用例确实假）⇒ 新用例修复了该缺口。
- **R4(d)**：`recommend.ts` + `recommend.test.ts` 均已改写（sha1 变更见 §1），t34 报告称两条空转已改写/删除。
- **待回填**：三条"取反/删除后必失败"的**本机复跑**需临时改动 `src/**` —— 在修复波仍在写文件期间做会有冲突风险，故留到安静窗口（与 F3/A1 同一窗口）。

## §3quater 已知非缺陷路径（按 captain 要求单列并说明为何排除）

**`closeToTray` 与 `window-all-closed`**
- `src/main/index.ts:347-355`：仅当 `platform !== 'darwin' && !isQuitting() && !settings.general.closeToTray` 时才 `app.quit()`；`src/main/settings.ts:22` 的默认值是 **`closeToTray: true`**（dev 与打包态实测均为 true）。
- ⇒ **主窗仍在时关闭迷你窗不会触发 `window-all-closed`**，应用应继续存活（这正是 t41 验收第 8 项要实测的）。
- ⇒ **`closeToTray=false` 时关主窗 → `window-all-closed` → 干净 `app.quit()`，且不写日志** —— 这是**已知非缺陷路径**，探针极易把它误读为"崩溃"。

**为何它解释不了我们观测到的多次实例消失**：观测到的消失发生在**主窗仍开着**、且我从未把 `closeToTray` 改成 `false` 的场景下（配置实测为 `true`）；干净退出只会由"关主窗 + `closeToTray=false`"触发，两者条件都不满足 ⇒ 与之归因不一致，**不采用该解释**；与已有归因（**dev 链被作业生命周期回收 = 环境/基础设施**）一致，详见 `METHOD-probe-exitcode-vs-liveness.md` §3.0。



## §3quinquies 承 t28 收窄三项（实例窗口 12:13:32Z–12:14:44Z）——**三项均通过**

> 说明：captain 把这三项指派给 `t28`，但 **`t28` 是 `failed` 终态**（`claim_task t28` → `Error: task status cannot move from "failed" to "claimed"`，本会话第 4 次遇到同一条终态规则）。三项内容与 **t41 的在办范围一致**，故在 t41 名下执行，产物仍落 `.devdata/t13-r2-evidence/`。

### 项 1 — decode-cache 是否在 `media://` 允许根内：**通过**

命令：`node .devdata/t13-r2-evidence/tmp-decode-cache-serve.mjs`（**元素侧**，纯 `new Audio()`，不建图谱）@ `12:12:18.370Z`；产物 `t41-decode-cache-serve.json`，**`allPass = true`**

| 对象 | 结果 |
|---|---|
| `decode-cache/2fcfd214…m4a`（audio-engine 的 t24 产物） | `loadeddata`、`readyState=4`、`duration=6.04`、`errorCode=null` → **可加载 ✓** |
| `decode-cache/88d58d85…m4a`（我 20:05 生成的产物） | 同上 → **可加载 ✓** |
| 对照 `<userData>/settings.json`（同一 `media://` 编码方式） | `error`、`readyState=0`、`errorCode=4` → **被拒 ✓** |

⇒ **decode-cache 确实在允许根内**（否证了 captain 担心的"不在根内 ⇒ 真实缺陷"这一支）；且"能播"不是"什么都放行"。
同期复跑 `scripts/verify-f3-rejections-lite.mjs` → **`allPass = true`（6/6）**：根内 mp3 可播 / 根外真实 mp3 / `..` 绕出 / `settings.json` / 根外真实 png 全部被拒 / 根内封面 png 512 可加载。

**F3 反面的"最终冻结树复跑"（captain 硬性要求，已单独执行）** @ `12:36:21.385Z`，实例 npm PID **26604**：
- 运行前锚点 `t41-f3refrozen-pre` = **`f3af2602…`**（76 文件，最新 src mtime `12:13:26.648Z`）；运行后 `t41-f3refrozen-post` = **同一值** ⇒ **窗口内零漂移，本次 F3 证据与 A1/R1/R2/R4 同锚点**；
- 结果 **`allPass = true`（6/6）**，逐项与上表一致：`inRootsAudio: loadeddata/loaded`、`outOfRootsAudio`/`traversalAudio`/`settingsJson` 均 `error code 4`、`outsidePng: naturalWidth 0`、`inRootsPng: load/512`；
- **存活三查**：CDP UP ✓ / procs = **7** ✓ / `5173`+`9222` LISTENING ✓；应用日志尾部仅 boot + `services initialized`（无 `[error]`）；
- **收尾**：我本人 `taskkill /PID 26604 /T /F` ⇒ `electron=0、node=0`，**5173/5174/9222/9998 全 FREE**。
⇒ 上一版（`12:12:18Z`，树 `f1899dcb`，与最终树只差 `miniLyricsDedup.ts` 一个文件）**由本次取代**，避免任何"锚点不完全一致"的解读空间。

### 项 2 — 迷你窗关闭存活实验：**通过（4/4）**

实例：`Start-Process npm.cmd run dev -PassThru` → **npm PID 2480**（`12:13:32Z`，PID 落 `t41c-dev-pid.txt`）。
命令：`node .devdata/t13-r2-evidence/tmp-mini-close-probe.mjs`；产物 `t41-mini-close.json`（`12:13:34.516Z` 采集）

| 断言 | 实测 |
|---|---|
| 关闭前存在 `#mini` target | ✅ `http://localhost:5173/#mini` |
| **关闭后迷你窗处于 hidden** | ✅ `document.visibilityState === 'hidden'` |
| **主窗 target 存活** | ✅ `mainTargets = 1` |
| **主窗渲染进程仍可评估** | ✅ `{title:"NEBULA Player", hasNebula:true, tracks:7}` |
| 主窗内容仍在（队列完好） | ✅ 队列 7 首 |

**⚠ 我自己的探针规格错误（如实记录）**：第一版断言写的是「关闭后 `#mini` **target 消失**」⇒ `allPass=false`。核对源码后确认规格错了：**`closeMiniWindow()` 是 `getMiniWindow()?.hide()`**（`src/main/mini.ts:60-62`），**只隐藏、不销毁**，因此 CDP target **按设计保留**；"已关闭"的可观测推论是 `visibilityState === 'hidden'`。按源码语义更正断言并重跑 → **通过**。此错在**我的探针**，不是产品行为（第一版 JSON 已被覆盖，其原始 step 值 `main=1/mini=1/hasNebula:true/tracks:7` 与本表一致）。

**判据**：探针 exit 0/1 均不作判据；**落盘 JSON 完整** ✓；**存活三查**：CDP UP ✓ / `electron=4` ✓ / `5173`+`9222` LISTENING ✓。

### 项 3 — 完整 12 秒 `--sustained` 表：**通过（12/12）**

命令：`node scripts/diag-cors.mjs --sustained`；原始输出落 `t41-sustained.txt`
`track=测试歌曲A`、`analyserAvailable=true`、`modeAtStart=modeEnd=graph`：

| t | mode | peak | maxDev | playing | fallbackTried |
|---|---|---|---|---|---|
| +1s | graph | 211 | 16 | true | false |
| +2s | graph | 227 | 16 | true | false |
| +3s | graph | 235 | 16 | true | false |
| +4s | graph | 237 | 16 | true | false |
| +5s | graph | 240 | 16 | true | false |
| +6s | graph | 242 | 16 | true | false |
| +7s | graph | 244 | 16 | true | false |
| +8s | graph | 244 | 16 | true | false |
| +9s | graph | 245 | 16 | true | false |
| +10s | graph | 245 | 16 | true | false |
| +11s | graph | 246 | 16 | true | false |
| +12s | graph | 246 | 16 | true | false |

`VERDICT: all 12 samples peak>0 && maxDev>0 = true; mode stayed graph = true`
**dev stdout 中 `Web Audio graph silent` / `fallback engaged` = 0 命中** ✓
⇒ 本表**在本轮当前树上重新采集**（不再依赖"引用 pre-t24 那次"）；5 格式对照仍为 `unset`（刻意）→ `silent-zeroes`、`anonymous` → `signal 245–249/maxDev 16–17`，即 CORS zeroes **只出现在刻意对照里**；`protocol.ts` 的 200/206/416 三分支均带 `ACAO *`。

### 本窗口的实例消失事件（按并列裁定记账，不判失败）

- 第一次重跑迷你窗实验时，探针**取不到主窗 target**；随后三查显示 **`electron=0`、四端口无监听、我的 npm PID（7820）已消失** ⇒ 实例在取证期间消失。
- **三件套**：① 探针退出码 = 1（`main dev window not found`）；② `electron` 进程数 = **0**；③ 应用日志尾部**无 `[error]`**（该窗口只有 boot + `services initialized` 两行）。
- **伴生事实**：应用日志在 `12:12:50.583Z` 出现**一次不是我启动的 boot**，而我的实例启动于 `12:12:04.775Z` —— 同期有他人实例/进程介入；dev stdout 亦显示 `MiniPlayer.tsx` 在 `12:12:17`/`12:12:36` 被 HMR 重载（t44 在写）。
- ⇒ 按 captain 的**并列裁定**：**dev 实例取证期间消失 = 环境/基础设施（未定性）**，**不判产品缺陷**、也不写"已解释"；该次不作为失败项（随后换新实例即完成项 2/3）。

### 漂移界定

`t41-run2-pre f1899dcb…` @`12:11:30Z`（76 文件）→ `t41-run2-post f3af2602…` @`12:14:44Z`：窗口内**只有一个文件变化**（`src/renderer/src/lib/miniLyricsDedup.ts`，t44）；**运行期相关文件逐字节相同**：`protocol.ts 28a7dc33ad52`、`mediaRoots.ts da4fd2c14a4a`、`ipc.ts 58c2b55ce5fb`、`index.ts 18ef7c49c2eb`、`mini.ts ec39b42b3172`、`audioEngine.ts e01f4c0d66d5`、`MiniPlayer.tsx 8a219676275a` ⇒ **本节三项结论对上述版本有效**。

## §3sexies R1 运行期判別性（**通过**）+ A1 最终树复跑（**通过**）—— 实例窗口 12:18:49Z–12:20:23Z

### R1-a：**同会话扫描新目录后播放必须成功** → **通过**（`t41-r1-runtime-2.json`）

- 构造（判別性）：造一个**从未扫描过、不在曲库、不在根集**的新目录 `.devdata/t13-r2-evidence/r1-newdir2/`，放入真实 `r1-fresh.mp3`。
- **关键手法（排除浏览器缓存假阴性）**：每次都用**新的查询串** `media://local/<b64(path)>?n=<nonce>` —— 应用侧 `new URL(url).pathname` 只取 pathname，查询串对服务端**完全透明**，但对浏览器缓存是不同资源。

| 时点 | 结果 |
|---|---|
| 扫描**前**（cache-busted URL） | **`error` / code 4 → 被拒 ✓**（证明该目录此刻确实不在根集内） |
| `libraryScan([新目录])` | `{added: 1}`，曲库 **7 → 8** ✓ |
| 扫描**后立即**（**新** URL） | **`loadeddata` / duration 8 → 可播 ✓** |
| +500 ms / +2000 ms / +5000 ms | 全部 `loadeddata` ✓ |
| 再扫一次同目录后 | `loadeddata` ✓ |
| 收尾 | `libraryRemove` → 曲库复原 **8 → 7** ✓ |

⇒ **R1 的 BLOCKER 在当前树上是真修好了**：`ipc.ts:114-115`（`await svc.library.flush()` → `await refreshMediaRoots()`）在运行期确实生效；扫描前拒绝、扫描后放行，**同一进程内、无需重启**。

> **⚠ 我自己的假阴性更正（如实记录）**：第一版探针（`t41-r1-runtime.json`）报 `afterScan.loaded = false`，我一度准备按"BLOCKER 未修"上报。原因是**它复用了与扫描前完全相同的 URL**，Chromium 缓存了先前那次失败 ⇒ **假阴性**。改用 cache-busting 后在**真正新鲜的目录**上得到干净的判別（前拒后放）。**这正是"同 URL 复测"这类构造必须加 nonce 的原因**，记录备查。

### R1-b：注入后首批请求即并发封面 → **通过**
4 路并发 `<img>`（不做任何音频预热）全部 `load / w=512` ✓。
**口径说明（如实）**：主窗自身首屏可能已先发过封面请求，CDP 侧无法消除该因素；**真正的"冷启动空集合窗口"由确定性单元不变量钉住**（`mediaRoots.test.ts:14`：populate 未完成时 4 个并发 `get()` 必须都拿到已填充集合、且是同一数组；闩锁实现会给 `[]`），并配合 `protocol.ts:145` 的 `await roots.get()`。

### R1-c：t40 两条不变量 → **通过（结构级 + 单元级）**
见 §3ter.1（缓存 Promise / 可刷新 / 懒求值 staticRoots / 库不可读回退 / in-flight `set()` 胜出）。

### A1 最终树复跑 → **通过（7/7）**（`t25-a1-mini-offset.json` 已更新，`capturedAt 12:20:32Z`）
针对当前 `MiniPlayer.tsx 8a219676275a` 重取：时钟**冻结在 14.95**（三步 `currentTime` 读数完全相同）前提下，**主窗与迷你窗**高亮均随 `offset 0 → +0.5 → 0` **跨过 15.50 行并回退**；两窗逐步一致；迷你窗 `localStorage['nebula.lyricsOffset']` 直读命中写入 ⇒ **上一轮（20:05）产物按规则声明作废，以本文件为准**。

## §3septies R2 运行期（mock 网关）+ R4 三类空转判別性 —— **均通过**（实例窗口 12:22:41Z–12:24:37Z）

### R2 —— mock 9998 驱动的双链路，**链路 0×400**（`verify-ai-confirm.mjs`，实例 npm PID 16680 + mock PID 34336）

| 链路 | 实测 |
|---|---|
| **确认路径** | 破坏性工具 park：`pending.toolCallId = call_rm_1`、确认条「需要你确认的破坏性操作 \| … \| 确认执行 \| 取消」；确认后歌单 **2 → 1 首**、`pending=false`、chips 清空、末条消息「好的，操作已完成。」 |
| **网关 transcript** | 第 2 轮 = 第 1 轮 + `assistant.tool_calls(remove_from_playlist#call_rm_1)` + `tool(call_rm_1):从 夜跑 移除了 1 首` ⇒ **每个 `tool_call_id` 恰一条 tool 回复**、**上一轮 tool 消息未被覆盖** |
| **取消路径** | park 后取消 → 歌单**不变**（仍 2 首）、`lastToolContent` = 「用户已取消该操作…请勿重复执行」 ⇒ 该 id 也被恰一条回复 |
| **非破坏性链** | `search_music → search_music → play_tracks` 自动执行，`playing=true`、`current=测试歌曲A`、队列 7 首 |
| **0×400** | 三条链路 **`errors400` 均为 `[]`** ✓ |

**判据**：探针 exit 0 不作判据；**存活三查**：CDP UP ✓ / procs=8 ✓ / `5173`+`9222`+`9998` LISTENING ✓；mock 与实例均由我本人 `taskkill /T` 收尾。

### R4 —— 三类空转的判別性（**用"不改写 `src/**`"的手段独立核验**）

t41 契约把 `src/**` 列为 outOfScope，而"取反必失败"的经典做法需要临时改写 `src/**`；我改用**不触碰源码**的等价手段，逐项如下：

| 子项 | 我的核验方式 | 结论 |
|---|---|---|
| **F5 符号（R4c）** | **忠实复刻** `lyricsOffset.test.ts:299-339` 的守卫（同一 `OFFSET_TERM`/三个 `head`/三条 expect/以及 head 为 null 时的回退断言），对**副本**施加 `+ offset → − offset`：真实面板 → **guard PASS**（heads = `currentTime + 0.12 + offset`、`display + 0.12 + offset`×2）；取反副本 → **三个 head 全为 null → 回退断言 `expect(inlineArithmetic).toHaveLength(0)` 失败**（计数 2）⇒ **取反必失败**，且**失败落在符号断言上而非被静默跳过** | ✅（`t41-r4c-signflip.json`，`allPass=true`） |
| **A2 去重（R4b）** | `MiniPlayer.tsx:11` 从 `../lib/miniLyricsDedup` 导入（`:30-31` 注释说明该回归套件驱动**生产函数**）；`miniLyricsDedup.test.ts:8` 导入同一模块、harness 注释声明"每个判定都来自该模块"；用例头 `:20-24` 记录**作者侧变异实证**（把 `claimLyricsRequest` 退回"总是认领"⇒ 前两例失败，还原后复绿） | ✅ |
| **F7(b)（R4a）** | 读 `sleepTimer.ts:112-127` 控制流：`sleep.mode==='queue'` 且 `ctx.playMode==='one'` → **`:121 return 'stop'`**；若删/反该行则落到 `singleTrack = queueLength <= 1`（`:122`）→ 多轨队列为 false → `:123` false → **`'advance'`** ⇒ 多轨+`one` 的用例（断言 `applySleepStop('queue')` 且 `pause` 恰一次）**必然失败**。叠加 t36 的作者侧变异记录（改空块 ⇒ 用例 A `pause` 0 次失败；还原后 SHA256 一致、15/15 复绿） | ✅ |
| **recommend 两条空转（R4d）** | `recommend.test.ts:70` 已改写为 `'penalises the most recently played track (R4d: asserts the observable effect)'`：注释显式说明旧断言（`rock2Index > rock1Index`）因分数相等而**靠标题 tie-break 通过**，新断言改为**精确分数**（play 过 4.0 vs 未播 7.6，并注明"惩罚弱化成 −0.1 会得 5.7 ⇒ 失败"）⇒ 已具判別性 | ✅ |

**`src/**` 零改动验证**：上述全程结束后 `src/**` 聚合仍为 **`f3af2602396eb2da5feb3469005f0b1a45da10c2`**（与窗口前一致）✓。

## §4 待回填项 → 最终结论（全部处置完毕）

| # | 项 | 结论 | 证据 |
|---|---|---|---|
| 1 | 四项门禁 `--label t41` | ✅ **`lint.exitCode=0`、`lintErrorFiles=[]（count 0）`、`lint.errors=0`/`warnings=1`、`typecheck:node=0`、`typecheck:web=0`、`tests.exitCode=0`、`Test Files 14 passed`、`Tests 141 passed / failed 0`**（基线 14 files / 141 passed **未下降**；runner 自身退出码不作判据） | `summary-t41.json` |
| 2 | **R1 判別性（BLOCKER）** | ✅ **通过**：同会话扫描后**立即**可播（前拒后放，cache-busted） | §3sexies / `t41-r1-runtime-2.json` |
| 3 | R3 `will-redirect` | ✅ **静态通过**（同一 guard 注册两事件 + 判定矩阵） | §3ter.2 |
| 4 | R2 运行期（mock 链路 0×400） | ✅ **通过**（三链路 `errors400=[]`、每 id 恰一条回复、上一轮 tool 未被覆盖） | §3septies |
| 5 | R4 三类空转 | ✅ **通过**（F5 用忠实复刻 + 副本取反证明"取反必失败"；A2/F7(b) 结构+变异证据；recommend 两条已改写为精确分数断言） | §3septies |
| 6 | F3 反面 + 5 格式 | ✅ **通过 6/6** + `--sustained` 12/12（5 格式 `anonymous` 有信号、`unset` 对照为 0） | §3quinquies 项 1、项 3 |
| 7 | A1 复跑 | ✅ **通过 7/7**（最终树） | 本节 |
| 8 | 迷你窗关闭存活 | ✅ **通过 4/4**（`hidden` + 主窗存活 + 队列完好） | §3quinquies 项 2 |
| 9 | AAC 运行期整链 | ✅ **通过** | §3bis |

### 未闭合项 → **现已全部闭合**（R2 运行期与 R4 判別性均见 §3septies）

**已全部闭合** —— 早先列出的两项在 `§3septies` 完成：R2 运行期已用 mock 网关实测（三链路 0×400）；R4 的"取反必失败"已用**忠实复刻 + 副本取反**（不触碰 `src/**`）与结构/变异证据独立核验。仍保留两条**口径说明**供 t42 知悉：
1. R4 的"取反必失败"我是用**复刻断言 + 副本**证明的（因 `src/**` 在 t41 的 outOfScope 内），不是直接改写真实文件后跑真实用例；t36/t37 的作者侧变异记录（含还原哈希）可作为第二路。
2. R2 的 mock 链路覆盖"同一轮多调用 + 破坏性不在末位 + 取消路径 + 非破坏性链"，与 t41 验收 #4 要求的"同一工具两轮调用 + 供应商省略 id"**互补**（后者由 `llmClientToolIds.test.ts` 的 4 例在单元层覆盖，含跨两轮 id 不同的判別）。

## §5 冻结声明（规则 B）

**`src/**` 聚合 sha1 在运行期窗口前后完全一致**：
`t41-run2-pre f1899dcb…`（76 文件）→ 实例窗口 `12:18:49Z–12:20:23Z` → `t41-frozen-final f3af2602396eb2da5feb3469005f0b1a45da10c2`（76 文件，最新 src mtime `12:13:26.648Z`）。
⇒ **本轮全部运行期证据取自同一棵冻结树 `f3af2602…`**；`protocol.ts 28a7dc33ad52`、`mediaRoots.ts da4fd2c14a4a`、`ipc.ts 58c2b55ce5fb`、`index.ts 18ef7c49c2eb`、`mini.ts ec39b42b3172`、`audioEngine.ts e01f4c0d66d5`、`MiniPlayer.tsx 8a219676275a`。
（相对 r2 锚点 `b7ea6c85…` 的完整差异清单见 §1。实例 PID：2480（§3quinquies）、26900（本节），**均由我本人 `taskkill /T` 收尾**，末态 `electron=0`、四端口全 FREE。）



## §6 环境与工具链注记

- 门禁阶段：`electron = 0`、`node = 2`、`5173/9222 FREE`；**该阶段未起任何实例、未终止任何进程**。
  （注：20:01 期间观察到 **22 个 node 进程**的并发批次，属他人测试作业，未干预。）
- **⚠ vite 只绑 IPv6（假阴性陷阱，captain 要求记入）**：`npm run dev` 的 dev server 监听的是 **`[::1]:5173`**（IPv6 回环），**不是** `127.0.0.1:5173`。因此用 `Test-NetConnection 127.0.0.1 -Port 5173` 会**恒返回 `False`**，据此判断"dev 没起来"是**假阴性**；本轮我在 19:37 就踩到过这一条（用 `netstat` 才看到 `[::1]:5173 LISTENING`）。**正确判据**：`netstat -ano | findstr LISTENING`（看 `[::1]:5173`）或直接 `localhost:5173`，以及 **CDP 9222 的 target 列表里存在 `http://localhost:5173/`**。
  同理，探针里挑选主窗口必须用 `type==='page' && url.includes('localhost:5173') && !url.includes('#mini')`（`verify-lib.mjs` 的 `mainTarget()`）——**`#mini` 目标没有 `window.__nebula`**，误选它会让 `awaitPromise` 挂起。
- **实例取证时序**：store 类探针（F1/F7 等，不需要实例）应在 **electron 关闭之后**跑 —— Chromium 会锁 `.devdata/user/Network/Cookies`，导致 vite watcher `EBUSY`；正确顺序 = 「需实例的取证 → 关实例 → store 探针」。（我给 Vite SSR 加载器加 `watch:null, hmr:false` 正是规避同一把锁。）
- **并发实例干扰的实测痕迹**：本轮第一次迷你窗实验被"实例消失"打断时，应用日志在 `12:12:50.583Z` 出现**一次不是我启动的 boot**（我的实例启动于 `12:12:04.775Z`），且 dev stdout 显示 `MiniPlayer.tsx` 在 `12:12:17`/`12:12:36` 被 HMR 重载（他人正在编辑）⇒ 同期存在并发实例/编辑。按 captain 的**并列裁定**：dev 实例在取证期间消失 = **环境/基础设施（未定性）**，不判产品缺陷、也不写"已解释"。

## §7 勘误与证据链交叉引用（t41 的 inScope 只有 `.devdata/t13-r2-evidence/`，故本节只**引用**，不改动 `.devdata/t6-evidence/`）

### §7.1 三处正式勘误（详见 `T6-ERRATA.md`）

| 条目 | 内容（一行摘要） | 本报告中的落地 |
|---|---|---|
| **§ERR-1** | `MediaImage …` 警告「0 条」**是假阴性**：该警告由 Chromium 产生、**不经 renderer `console`**，只走 CDP `Log` 域；`index.ts:242-243` 只转发 renderer console 的 `level>=1` ⇒ "日志里没看到"属同一盲区。**口径：该警告消失 = 修复；仍存在 ≠ F3 失败**（MediaSession artwork 仅接受 http/https/data/blob，只影响 OS 级封面） | §3quinquies 项 1 的 F3 反面结论**不依赖**该警告 |
| **§ERR-2** | `CORP: same-origin` 说法**错误且已被撤销**：`protocol.ts:91-96` 的 `CORS_HEADERS` 仅 `ACAO:*`/`Allow-Methods`/`Allow-Headers`/`Expose-Headers` 四项，**无 CORP**（`:83` 起有明令禁止的注释 —— 加它**会打掉封面**）；拦住 `fetch(media://)` 的是**页面 CSP** `connect-src 'self'` | §3ter.2 与 §3bis 均按此口径（200/206/416 三分支仍带 `ACAO *`） |
| **§ERR-3** | `protocol.ts:90` 的 `let → const` 归属 **t5 全仓 `eslint --fix`（15:25:52 批次）**，语义等价、保留、**非 finding** | 与 §1 的 r3 差异清单不冲突 |
| **§ERR-4（本次新增）** | **`scripts/probe-media-roots.mjs:128` 的"对照"是空对照**（`tryImg(mediaUrl(track.path))` = 用 `<img>` 加载 **FLAC**，必然失败）。**归因：探针 bug，不是产品信号** —— **不得**被读成"根内也被拒"；`t13-media-roots.json` 里真正的正向对照是 `trackLoad`（`<audio>` → `metadata:5`）与 `coverLoad`（`<img>` → 512）。**裁定：现在不改它**（`scripts/**` 已被 t11 排除在安装包外、与发布产物无关），记为 backlog（见 §9.2） | audio-engine 的 r2 树证据在 `T26-VERIFICATION.md` 附录 A §A.2 已按此更正 |

### §7.2 A1 产物链：哪些 JSON 有效、哪些**不得引用**

| 产物 | 状态 |
|---|---|
| **`.devdata/t13-r2-evidence/t25-a1-mini-offset.json`** | ✅ **唯一有效**：`capturedAt 12:20:32Z`，针对当前树 `MiniPlayer.tsx 8a219676275a`，**7/7 allPass**（时钟冻结 14.95、两窗同步跨 15.50 行并回退、迷你窗 `localStorage` 直读命中） |
| 同文件的 20:05 版 | ❌ **作废**（被本轮覆盖；对应 `MiniPlayer 18f5903667e5` 已被 t44 改写） |
| `.devdata/t6-evidence/probe-lyrics-sync-crossing.json` | ❌ **不得引用**（早期运行，曾发生"失败运行覆盖产物"，`mini.title=测试歌曲A` / `active:null` / `lines:1` / `highlightChangedWithOffset:false`）；`T26-GAPS-CROSSREF.md:54` 引用的正是这一份 |
| audio-engine 的 `.devdata/t13-evidence/**` | ⚠️ 其 F3 部分**采纳为 r2 补充**（并更正 `controlInsideRoot` 为空对照）；其 **`storage` 事件数组在对方目录中检索不到任何产物** ⇒ 该断言**不作为证据** |

### §7.3 「迷你窗收到 `storage` 事件」的口径

**无成功快照**（本机未落盘该事件数组）⇒ 按**机制替代证据**如实标注，**不计通过也不判失败**。替代链为：① 迷你窗与主窗共用 `useSyncExternalStore(subscribeOffsets, getOffsetSnapshot(trackId))`；② **迷你窗 DOM 高亮在冻结时钟下随 offset 跨行并回退**（§3sexies，7/7）；③ 迷你窗 target **直读** `localStorage['nebula.lyricsoffset']` 命中主窗写入；④ 键由主窗写入、两窗同源。
⇒ reviewer 只需按 **`t25-a1-mini-offset.json`（12:20:32Z）** 这一份新快照判读；**不需要**也不应依据任何 `storage` 事件断言。

## §10 t44 / R4(b) 复核补强：A2 去重规则的**变异判別性**（直接演示）

> captain 要求「新测试必须真正 import 生产模块，且把去重改回『永远 claim』后必失败」。**两条我都独立验证，且第二条是直接演示**（与 §3ter.1 的 mediaRoots、§3septies 的 F5 同一手法，全程不动 `src/**`）。

### §10.1 测试确实驱动**生产模块**（不是测试侧复刻）

| 证据 | 内容 |
|---|---|
| 生产模块 | `src/renderer/src/lib/miniLyricsDedup.ts`（59 行，**无 React/DOM/Electron import**，故 node 环境可加载）；导出 `claimLyricsRequest` / `acceptLyricsResponse` / `trackLyricsPush` / `clearLyricsHolders` |
| 组件调用它 | `MiniPlayer.tsx:11` `import { … } from '../lib/miniLyricsDedup'`（`:30-31` 注释明示该模块是回归套件的驱动对象） |
| 测试驱动它 | `miniLyricsDedup.test.ts:8` 从 `'../miniLyricsDedup'` 导入；harness 注释声明"每个判定都来自该模块" |
| 迁移落位 | `src/main/__tests__/mediaFormats.test.ts:42-52` 留有**迁移说明块**："A2 … used to be modelled here as a test-side copy … is now genuinely guarded by `src/renderer/src/lib/__tests__/miniLyricsDedup.test.ts` … **nothing about A2 is asserted in this file any more**"；该文件现存用例只剩 `needsConvert` 相关 ✓ |

### §10.2 「永远 claim」变异 ⇒ **必失败**（实测）

- 工装（证据目录内，**不参与仓库门禁**）：`discrim-a2/reverted-miniLyricsDedup.ts`（生产模块副本，**只改 `claimLyricsRequest` 为 `return true`** —— 即修复前"守卫比较渲染闭包 `null` 值、等于没去重"的行为，其余逐字相同）；`discrim-a2/miniLyricsDedup.reverted.test.ts`（原用例副本，`Compare-Object` 证明**与原件只差 import 一行**）；`discrim-a2/vitest.config.ts`。
- 命令：`npx.cmd vitest run --config .devdata/t13-r2-evidence/discrim-a2/vitest.config.ts`
- **结果：`Tests 3 failed | 5 passed (8)`**，失败的三条正是该规则的核心判別项（原始输出 `discrim-a2/a2-mutation-run.txt`）：

| 用例 | 变异实现下的失败信息 | 含义 |
|---|---|---|
| `issues one lyricsGet for a sustained stream of the same track` | `expected ['track-a','track-a',…(10)] to deeply equal ['track-a']` | **11 次请求而不是 1 次** ⇒ 正是修复前 ~4 次/秒的 IPC 风暴 |
| `issues one fetch per distinct track when the track changes` | `expected ['track-a','track-a',…(4)] to deeply equal ['track-a','track-b','track-c']` | 换曲前后重复请求 |
| `claimLyricsRequest is a no-op for a repeated id but true for a new one` | `expected true to be false` | 规则本体被破坏 |

- **对照**：真实模块 + 真实用例 `npx.cmd vitest run src/renderer/src/lib/__tests__/miniLyricsDedup.test.ts` → **`Tests 8 passed (8)`**；仓库门禁 `--label t43` 全绿（14 files / 141 passed）。
⇒ **R4(b) 的"假验证"确已消除**：用例不再是与镜像表达式自比，而是驱动生产模块，且退回旧行为**确实必失败**。

## §11 t33 明确划界的**三项**在本冻结树上的映射（captain 要求单独复核）

t33（quality）明确声明**未重跑、也不得被冒称**的三项，均在**发布所用冻结树 `f3af2602…`** 上由我独立取数，位置如下：

| t33 划界项 | 我在这棵冻结树上的证据 | 结果 |
|---|---|---|
| **① 5 格式连播** | `scripts/diag-cors.mjs --sustained` @ `12:13:5xZ`（原始输出 `t41-sustained.txt`）：`song-a.mp3 / song-c.flac / song-b.wav / song-d.ogg / song-e.m4a` **逐首播放**，`anonymous` 变体 peak **245–249**、`maxDev 16–17`、`paused=false` | ✅ 5/5 有信号 |
| **② `MediaElementAudioSource outputs zeroes…` 出现 0 次** | 同上运行的 Chromium 日志统计：**该警告只出现在刻意构造的 `unset` 对照变体里（5 条，每个格式一条）**；**`anonymous`（= 应用真实路径，`audioEngine.ts:113` 设 `crossOrigin='anonymous'`）下 0 条** | ✅ 真实路径 0 次（对照出现属预期） |
| **③ traversal / `settings.json` 被拒** | `scripts/verify-f3-rejections-lite.mjs` @ **最终冻结树 `12:36:21.385Z`**（`t25-f3-rejections.json`，含"同一真实 mp3 走 `..` 绕出被拒"与"根内对照可播"） | ✅ 6/6 全通过 |

**备注（口径）**：② 的"0 次"必须限定为**应用真实路径**；把刻意 `unset` 对照的 5 条算进去再宣称"0 次"会是假阳性 —— 这也是上一版 t13 探针容易被误读的地方。
**注**：我未复用 quality 的 `%TEMP%\t33-probe.mjs` 与 `.devdata\t33-*` 夹具数字；R1 判別性由我自建夹具（`r1-newdir2` + cache-busting URL）独立取数（§3sexies），其数字与 quality 的 `probeNewDirFile ok / concurrent×6 ok / controlNeverScanned error` 方向一致但**证据来源独立**。

## §12 t44 两项披露的独立核验（captain 点名要求）

### §12.1 `mediaFormats.test.ts` 用例数 11 → 6：**允许，且三项子要求全部成立**

| 子要求 | 核验方式与结果 |
|---|---|
| **(a) 被删的 5 条确实是"测试侧复刻"而非真实断言** | **两个独立来源**：① 文件内迁移说明块 `mediaFormats.test.ts:41-53` 自述 "…used to be modelled here as a **test-side copy** … **That copy could not detect a regression** — reverting the component to the old closure-based guard left it green"；② **reviewer 的独立 finding**（`.devdata/t7-review/T14-R2-REVIEW.md:76-77`）："A2 的「单测」是测试侧复刻，不覆盖真实组件 … 该文件**不 import `MiniPlayer.tsx`**，而是在测试里自己 `newWindow()` 复刻 … 把 `MiniPlayer.tsx:54` 回退后仍绿"。⇒ **成立**（故删除**未减少真实覆盖**，不构成回退级问题） |
| **(b) 总数不降** | 我用本地 vitest 直接取数（`vitest-post-t44.json`）：**14 files / 141 tests / 141 passed / 0 failed**；`mediaFormats.test.ts` **现为 6 例**（我 §2 台账记 11）与新增 `miniLyricsDedup.test.ts` **8 例** ⇒ **138 + 8 − 5 = 141** 逐一吻合 ✓ |
| **(c) 该去重规则现由"能失败的真实测试"守卫** | 见 **§10.2**：原用例逐字副本跑在"永远 claim"副本上 ⇒ **3 failed / 5 passed**（`expected ['track-a',…(10)] to deeply equal ['track-a']` ⇒ 11 次请求而非 1 次）；真实模块 **8/8** ✓ |

### §12.2 `miniLyricsDedup.ts` 的换行/编码：**当前工作区文件为 LF、无 BOM**（逐字节实测）

| 检查 | 结果 |
|---|---|
| 大小 | **2510 B**（与 ai-tools 自报一致） |
| 前 3 字节 | `2f 2a 2a`（`/**`）⇒ **无 BOM** ✓ |
| CRLF 对数 / 孤立 CR | **0 / 0** ⇒ **纯 LF** ✓ |
| 定向 lint | `node node_modules/eslint/bin/eslint.js <t44 三个文件> --no-cache` ⇒ **exit 0、0 problems** ⇒ 此前 `miniLyricsDedup.ts:59:2` 的 `prettier Delete ␍` 警告**已消失** ✓ |

**关于"哈希一致是否自证循环"（captain 的关切）**：我的结论**不依赖** ai-tools 的 sha256 基线 —— 上述四项都是对**当前字节内容**的直接测量，且 §10.2 的变异判別性也是对**当前文件**跑出来的（其副本仅改一行）。因此即便其基线是在"规范化之后"重算的，**我的核验链条不经过该基线**，不存在自证循环。

## §13 R4(c) 权威证据：**真实 `src/**` 取反实验**（captain 正式指派给 verifier，t37 不再重复）

> captain 的职责划分：R4(c) 的「真实 src 取反必失败」由我承担，要求给出 ① 取反后**目标测试文件 exit 1 且失败点正是该用例** ② 还原后**哈希与基线逐字一致** ③ **其间无残留文件**。以下三项全部实测通过。

### §13.1 方法与安全措施

| 步骤 | 内容 |
|---|---|
| 前置锚点 | `r4c-pre-mutation` = **`f3af2602396eb2da5feb3469005f0b1a45da10c2`**（76 文件）—— 与**发布所用冻结树**相同 |
| **字节级备份** | `LyricsPanel.tsx` 6940 B / sha1 `32f8656d5f1b…`、`MiniPlayer.tsx` 5912 B / sha1 `8a219676275a…`（均**无 BOM、纯 LF**）→ 原样复制到 `.devdata/release-evidence/r4c-mutation/*.orig` |
| 取反脚本 | `r4c-mutation/flip.mjs`：**断言无 CRLF**、**断言 `+ offset` 出现次数符合预期**（LyricsPanel 1 处 + MiniPlayer 2 处 = 3 处）、以 utf8 写回（不加 BOM）；还原时**以备份为准**重建（而非"反向替换"） |
| 命令 | `node .devdata/release-evidence/r4c-mutation/flip.mjs flip` → 跑目标测试 → `... flip.mjs restore` |

**取反后 sha1**：`LyricsPanel.tsx 7f9c879c3d8f…`、`MiniPlayer.tsx b6cbac60a4e7…`（两者均变化 ⇒ 取反确实落到了真实文件）。

### §13.2 ① 取反后：目标测试文件 **exit 1，失败点正是该用例**

命令：`node node_modules/vitest/vitest.mjs run src/renderer/src/lib/__tests__/lyricsOffset.test.ts`（原始输出 `r4c-mutation-flipped-run.txt`）

```
❯ src/renderer/src/lib/__tests__/lyricsOffset.test.ts (17 tests | 1 failed) 14ms
× lyricsOffset — sign convention (positive offset = highlight moves forward)
  > the real panel call sites carry the + offset sign (witnessed in their source)
→ expected [ …(2) ] to have a length of +0 but got 2
❯ src/renderer/src/lib/__tests__/lyricsOffset.test.ts:325:32
Test Files  1 failed (1)   Tests  1 failed | 16 passed (17)   [vitest exit 1]
```
失败点 = **`lyricsOffset.test.ts:325`** 的回退断言 `expect(inlineArithmetic).toHaveLength(0)` —— 与我在 §3ter.1/§10.1 用**副本**预演的结果**逐字一致**（两个面板仍同时含 `offset` 与 `0.12` ⇒ 计数 2）。

### §13.3 ②③ 还原后：哈希逐字一致、无残留

| 检查 | 结果 |
|---|---|
| `LyricsPanel.tsx` sha1 | `32f8656d5f1b…` = 基线 **MATCH ✓** |
| `MiniPlayer.tsx` sha1 | `8a219676275a…` = 基线 **MATCH ✓** |
| 整树聚合（`r4c-post-restore` / `r4c-final-check`） | **`f3af2602396eb2da5feb3469005f0b1a45da10c2`**（76 文件）= 发布树 **MATCH ✓** |
| 目标测试（还原后） | **1 file passed / 17 passed** ✓ |
| 残留文件扫描（`src/`、`scripts/`、仓库根，排除 node_modules/dist/.devdata） | **0 命中 ✓**（`.orig` 备份**按设计**留在证据目录） |
| 发布产物完整性 | `dist/win-unpacked/…/app.asar` 与**已安装** `app.asar` SHA1 仍同为 **`D45D823FF49C8A535836DDC8EFE4E4B47BEF15F6`** ✓ |

**一处需知悉的细节（不是问题）**：还原后两个面板文件的**内容**与基线逐字一致（sha1/聚合值可证），但**mtime 变为 `13:03:51Z`** —— 若有人用 mtime 而非内容做锚点，会误判为"被改过"；**本报告的锚点一律基于内容聚合值**。

**结论**：R4(c) 的"真实 src 取反 ⇒ 必失败；还原 ⇒ 逐字复原"**已以最严格形态完成**，证据在 `.devdata/release-evidence/r4c-mutation/`。全程**未起任何实例**，操作窗口约 1 分钟，其间无并发写入者（前后聚合值相同）。

## §14 完赛口径补充（captain 点名要求）

### §14.1 门禁 **逐项值**（含 `lintErrorFiles`，runner 退出码不作判据）

`node scripts/verify-lint-tests.mjs --label t41` → `summary-t41.json`：

| 字段 | 值 |
|---|---|
| `lint.exitCode` / `lint.errors` / `lint.warnings` | **0** / **0** / **1**（唯一 warning = `react-hooks/incompatible-library`，即已接受的 `TrackList.tsx:42`） |
| **`lintErrorFiles`** | **`[]`（count 0）** |
| `typecheck.node` / `typecheck.web` | **0** / **0** |
| `tests.exitCode` / `filesLine` / `testsLine` | **0** / **`Test Files 14 passed (14)`** / **`Tests 141 passed (141)`**（`failed` 0） |
| 基线 | **14 files / 141 passed**，**未下降** ✓ |

（发布门 `--label t43` 的逐项值同形：`lint.exitCode=0`、`lintErrorFiles=0`、typecheck 0/0、**14 files / 141 passed**。）

### §14.2 关于 `t26` 的正确写法（避免误述）

**`t26` 仍是终态 `failed`、不可变** —— 本报告**不主张**它变为 completed。正确表述是：
> **`t26` 的两项缺口（F3 反面运行期、A1 判別性迷你窗）由 `t41` 的证据关闭**：F3 反面 = 本报告 §3quinquies 项 1 + §3sexies（**最终冻结树 12:36:21Z 的 6/6**）；A1 = 本报告 §3sexies（**最终冻结树 12:20:32Z 的 7/7**）；两者的来源对照见 `T26-VERIFICATION.md` **附录 A**（含对 audio-engine 交叉引用的采纳/更正/不采纳三分）。

### §14.3 结论的**版本有效性声明**（避免跨版本误引）

| 结论 | 有效版本（该结论所测的代码版本） |
|---|---|
| **迷你窗关闭存活 4/4**（`visibilityState='hidden'` + 主窗存活 + 队列 7 首） | `MiniPlayer.tsx 8a219676275a`、`miniLyricsDedup.ts`（t44 版）、`mini.ts ec39b42b3172`、`ipc.ts 58c2b55ce5fb`、`index.ts 18ef7c49c2eb` —— 即**最终冻结树 `f3af2602…`** |
| **12 秒 `--sustained`（12/12 graph、peak 211→246、maxDev 16）** | 同上冻结树（`audioEngine.ts e01f4c0d66d5`、`protocol.ts 28a7dc33ad52`）；其"适用范围"另见 `T28-VERIFICATION.md` §4（承重件 `corsEnabled`/`CORS_HEADERS` 在 r3 树上逐行复核仍在位） |
| R1 判別性（扫描后即可播 / 并发封面全 200） | 冻结树（`protocol.ts`/`mediaRoots.ts`/`ipc.ts` 同上） |
| R2（mock 三链路 0×400） | 冻结树（`llmClient.ts`/`chatStore.ts` 为 t34 版） |
| R4(a)(b)(c)(d) | 冻结树 + §10/§13 的判別性演示（副本与**真实 src 取反**均已复原） |
| **F3 反面 6/6** | **最终冻结树 12:36:21Z**（取代 12:12Z 的 r2 邻接版本，见 §3quinquies 的取代声明） |
| AAC 整链 | 冻结树（`decodeService.ts df1c81800a0d` 与 r2 相同 ⇒ t24 修复未被动） |

### §14.4 收尾与实例纪律

本轮全部实例（npm PID `17728` / `4660` / `2480` / `26900` / `26604` + mock `34336`）**均由我本人** `taskkill /PID … /T /F` 收尾；末态 **`electron=0 / node=0 / nebula-player=0`、5173/5174/9222/9223/9998 全 FREE**；**未终止任何他人进程**。发布态两个进程（PID `22900`、`35324`）同样由我本人关闭。

### §14.5 ⚠ A1 与 `MiniPlayer.tsx` 变异窗口的**重叠判定**与**重取**（captain 时效性告知的落实）

**结论：先判定为"重叠 ⇒ 原 A1 证据作废"，随后在新实例上重取，新证据 7/7 通过且窗口内零 HMR。**

| 时点（UTC） | 事件 | 来源 |
|---|---|---|
| `12:20:16` / `12:20:19` | **`MiniPlayer.tsx` 被写两次（相隔 3 s）⇒ vite HMR 重载两次** | `t41d-dev-out.log`（我 R1/A1 所用实例 PID 26900 的 stdout） |
| `12:20:23–12:20:32` | 我的**旧 A1 取样**（`capturedAt 12:20:32.123Z`，7/7） | `t25-a1-mini-offset.json`（旧版） |
| ⇒ 判定 | **取样点与两次 HMR 重载同属一个实例窗口、相隔 13/16 秒 ⇒ 按 captain 规则"落在该窗口内的 A1 取样必须作废重取"** | —— |
| `13:07:07` | 重取实例启动（npm PID **25932**），启动前 `MiniPlayer.tsx` = `8a219676275a` ✓ | `t41g-dev-out.log` |
| `13:07:22.253` | **A1 重取完成：`allPass = true`（7/7）** —— 时钟冻结 **14.96**（三步读数相同）、主窗与迷你窗同时跨 15.50 行并回退、两窗逐步一致、迷你窗 `localStorage` 直读命中、`lines=3` | `t25-a1-mini-offset.json`（**新版，取代旧版**） |
| 同窗口 | **HMR 行 = 0 命中**（`t41g-dev-out.log` 中 `hmr update`/`MiniPlayer` 全无）⇒ **本次取样未被任何写入扰动** | 同上 |
| `13:07:3x` | 由我本人关闭（PID 25932）⇒ `electron=0 / node=0`，四端口 FREE | —— |
| 事后 | `MiniPlayer.tsx` = **`8a219676275a`** ✓、整树 = **`f3af2602…`** ✓ | `t41-post-a1rerun-snapshot.json` |

**② 最终锚点确认 `MiniPlayer.tsx = 8a219676275a`：MATCH ✓**（发现：其 mtime 为 `13:03:51Z`，即 quality 声称"连 mtime 都恢复"之后又被我的 R4(c) 还原动作刷新——**内容 sha1 与聚合值才是判据**，二者均与原值一致）。

**③ 事实声明（captain 要求）**：t37 的判别性实验**只证明**「见证层能咬住面板取反、而 16 条数值镜像断言全绿」；它**不是**我 R4(c) 真实取反实验的替代 —— **R4(c) 仍由本报告 §13 按原口径独立取数**（真实 `src` 取反 ⇒ 目标测试 `exit 1` 且失败点即该用例；还原后哈希逐字一致、无残留）。

### §14.6 已知限制（quality 提供，captain 裁定"本发布不修"，t42 记一笔）

**见证层的静默降级分支**：`lyricsOffset.test.ts` 的 `witness()` 在**两面板改为委托共享 helper**（不再内联偏移算术）时会返回 `null` —— 此时该用例走回退分支：仅 `console.warn('[lyricsOffset.test] panels no longer inline the offset arithmetic — re-point this witness at the shared helper')` 后 **`return`（即测试通过）**。⇒ **一旦未来做了面板重构，该符号约定会短暂失去守护**（不会报红，只会留一行 warn）。
**裁定**：**本发布不修**（无面板重构计划），记为 backlog；**建议**：将来把该分支改为 `expect.fail()` 或改为断言共享 helper 的算式，使"失去守护"变成显式失败。

## §15 方法学与**污染窗口**（captain 要求单列；含精确 UTC 区间）

### §15.0 窗口总表（t42 必看）

| # | 窗口 (UTC) | 文件 | 内容 | 复原证据 | 与我的取样是否重叠 | 处置 |
|---|---|---|---|---|---|---|
| **A** | **更正后**：`12:17:03Z` → ≤ `12:17:31Z`（quality 备份文件 `%TEMP%\t37-MiniPlayer.orig.tsx` 的 CreationTime = `12:17:03Z`，还原完成于其下一条命令自报 `12:17:31Z` 之前；暴露 ≤28 s）。**重叠判定用保守超集 `12:16:30Z–12:17:31Z`** | `MiniPlayer.tsx` | `display + 0.12 + offset` → `- offset`（2 处） | quality 自报逐字节还原，sha1 `8a219676275a14af…`；**mtime 亦被 `Copy-Item` 恢复**；其残留检索 0 命中 | **不重叠**（保守超集亦不重叠）：该区间内我**没有实例在跑** —— `t41c` 于 `12:14:44Z` 结束、`t41d` 于 `12:18:49Z` 启动，**空档 `12:14:44Z–12:18:49Z` 完整覆盖该超集** | 不触发作废 |
| **A′（我实测的写入）** | `11:55:21`/`11:55:43`、`12:12:17`/`12:12:36`、**`12:20:16`/`12:20:19`** | `MiniPlayer.tsx` | 我实例 stdout 的 **`hmr update` 记录**（vite 本地时间换算） | —— | **`12:20:16/19` 与我的 A1 取样（`12:20:23–32`）重叠**；`11:55:21` 与 A1 旧版 #1（`11:55:21.904`）重叠 | **A1 旧版 #1、#2 作废；#3（`13:07:22.253`，`t41g` 日志 0 HMR）采纳** |
| **B** | **未取得时刻**（audio-engine 未回报） | `LyricsPanel.tsx` | 自报"内存替换式变异"（变异后 vitest **exit 1、仅 1 条失败**、回滚 sha1 一致；稳定值 `32F8656D5F1B`） | 其自报回滚一致；**我方旁证**：全部 9 个实例日志中 `LyricsPanel.tsx` 的 HMR 命中数 = **0** | **改用"取样时 sha1"判据**（§15.5）—— 该面板自 `11:17:36Z` 起 **36 次快照全部为 `32f8656d5f1b`** | 不触发作废 |
| **C（audio-engine 复测变异）** | **未取得时刻**（captain 转达：`MiniPlayer` `8A219676275A` → `5BBC4BBE9941`，回滚一致） | `MiniPlayer.tsx` | 同上（复测） | 同上 | **改用"取样时 sha1"判据**（§15.5）—— 该文件自 `12:11:30.697Z` 起 **连续 22 次快照全部为 `8a219676275a`**；我的实例日志中亦无对应 HMR | 不触发作废 |
| **D（verifier 自己，受控写者）** | `13:03:2x–13:03:51` | **两个面板都动过** | 我按 captain 早前正式指派的 R4(c) 真实取反：`+ offset` → `- offset`（LyricsPanel 1 处 + MiniPlayer 2 处） | **§13**：还原后两文件 sha1 与基线**逐字一致**、整树回 `f3af2602…`、目标测试 17/17、**残留 0 命中** | 该窗口内我**未做任何取证**（实验本身即取证对象） | 无需作废；其还原 mtime = `13:03:51Z` 成为时序参考（§15.3） |

### §15.1 实测偏差（须让 captain 知道）

**① 窗口 A 的转述时刻与我实测的写入时刻不一致（已按更正后窗口重判，结论不变）**

captain 先给 `12:16:30–12:17:00`，后更正为 **`12:17:03–≤12:17:31`**；**两次都与我实测到的三组写入不吻合**（见上表 A′）。三点事实：
1. 无论用哪个版本，**我在该区间（含保守超集 `12:16:30–12:17:31`）都没有实例在跑** ⇒ **我没有任何取样落在窗口 A 内**（`t41c` 止于 `12:14:44`、`t41d` 起于 `12:18:49`，空档完整覆盖）；
2. 但我确实实测到三组 `MiniPlayer.tsx` HMR（`11:55:21/43`、`12:12:17/36`、**`12:20:16/19`**），**其中 `12:20:16/19` 既不在原窗口、也不在更正后的窗口内** —— 相隔仅 3 s（"取反→还原"签名），**至今无人认领**；
3. ⇒ **"污染窗口"应以实例 stdout 的 HMR 记录为准**；本次不论归因如何，处置都是保守的（A1 #1/#2 一律作废、#3 采纳）。

**② 面板 mtime 读数不一致（我方读数为准，附理由）**

| 文件 | captain 转述 | **我此刻实测** | 说明 |
|---|---|---|---|
| `MiniPlayer.tsx` | mtime `20:10:42`（本地） | **`13:03:51Z`（= 21:03:51 本地）** | 我的 §13（R4(c) 真实取反）**还原动作**刷新了 mtime；sha1 仍为 `8a219676275a` ✓ |
| `LyricsPanel.tsx` | mtime `09-12 16:54:42`（本地） | **`13:03:51Z`（= 21:03:51 本地）** | 同上（§13 同时改写了两个面板并逐字还原） |

⇒ captain 引用的两个 mtime 都是**我 §13 还原之前**的读数（因此"quality 全程未触碰 LyricsPanel"与"MiniPlayer mtime 仍 20:10:42"都不再是当前值）。**这不影响任何结论**（内容 sha1 与聚合值均未变），但**再次印证：mtime 不能作判据，只有内容 sha1 + 聚合值可用**。

**③ 窗口 B 的可观测性（我方独立证据）**：全部 **9 个实例日志**中 `LyricsPanel.tsx` 的 **HMR 命中数 = 0**（只有 `MiniPlayer.tsx` 三组与一组无关的 `MainView/App/ChatPanel`）。若 audio-engine 的变异发生在我任一实例运行期间，vite 应打出该文件 HMR ⇒ 未出现 ⇒ **其窗口极可能不与我的实例窗口重叠**；**待其精确时刻到达后逐条反验并回填本表**。

### §15.1 captain 给出的窗口 与 我**实测**到的写入时刻**不一致**

- **captain 转述 quality 的变异窗口**：本地 `20:16:30–20:17:00` = **UTC `12:16:30Z–12:17:00Z`**（`display + 0.12 + offset` → `- offset`，2 处；随后逐字节还原，sha1 `8a219676275a14af…`，**mtime 也被恢复**）。
- **我在自己实例 stdout 里实测到的 `MiniPlayer.tsx` HMR 重载**（vite 打印的是**本地时间**，此处换算为 UTC）：

| 我实例的日志 | 实例窗口 (UTC) | `MiniPlayer.tsx` HMR 时刻 (UTC) | 相隔 |
|---|---|---|---|
| `t25b-dev-out.log` | `11:55:09–11:55:43` | **`11:55:21`、`11:55:43`** | 22 s |
| `t41b-dev-out.log` | `12:12:02–12:12:36` | **`12:12:17`、`12:12:36`** | 19 s |
| `t41d-dev-out.log` | `12:18:49–12:20:19` | **`12:20:16`、`12:20:19`** | **3 s** |
| 其余实例（`t25`,`t41`,`t41c`,`t41e`,`t41f`,`t41g`） | —— | **0 命中** | —— |

⇒ **三点事实**：① 我从未在 `12:16:30Z–12:17:00Z` 期间运行过实例（`t41c` 于 `12:14:44Z` 结束、`t41d` 于 `12:18:49Z` 启动），故**我没有任何取样落在 captain 给的窗口内**；② 但我**实测到三组** `MiniPlayer.tsx` 写入（`11:55:21/43`、`12:12:17/36`、`12:20:16/19`），**没有一组与 captain 的窗口吻合**；③ 因此"污染窗口"必须以**实例 stdout 的 HMR 记录**为准，不能只看转述的时间区间 —— 否则会把 `12:20:16/19` 这次真实写入漏掉。**这一不一致我已上报 captain**（不排除其窗口来自 quality 的另一台/另一日志，或存在更多写入episode）。

### §15.2 逐项裁决（哪些作废、哪些未受影响）

| 我的取证项 | 取样时刻 (UTC) | 所在实例是否出现 `MiniPlayer` HMR | 裁决 |
|---|---|---|---|
| **A1 旧版 #1** | `11:55:21.904` | **是（`11:55:21` 就在取样前 0.9 s）** | ❌ **污染**（早已被后续运行取代） |
| A1 旧版 #2（最终树） | `12:20:23–12:20:32` | **是（`12:20:16/19`，相隔 3 s）** | ❌ **污染 ⇒ 作废** |
| **A1 新版 #3（当前权威）** | **`13:07:22.253`** | **否（0 命中）** | ✅ **有效（7/7）** |
| F3 反面（当前权威 = 12:36 复跑） | `12:36:21.385` | 否 | ✅ 有效（6/6） |
| decode-cache 元素侧 | `12:12:18.370` | 所属实例 `t41b` **有** HMR，但**该项不依赖 `MiniPlayer.tsx` 内容**（只读 `decode-cache/*.m4a` 的 `media://` 可服务性） | ✅ 有效 |
| 迷你窗关闭存活 | `12:13:34.516` | 所在实例 `t41c` = **0 HMR** | ✅ 有效（4/4） |
| 12 秒 `--sustained` | `12:13:5x` | 所在实例 `t41c` = **0 HMR** | ✅ 有效（12/12） |
| AAC 整链 | `12:05:29` | 所在实例 `t41` = **0 HMR** | ✅ 有效 |
| R1 判別性（扫描后即可播） | `12:19:03`/`12:19:48`/`12:20:19.165` | 所属实例 `t41d` **有** HMR，但该项断言的是 `media://` 根集合行为（`protocol.ts`/`mediaRoots.ts`/`ipc.ts`），**与 `MiniPlayer.tsx` 内容无关** | ✅ 有效（结论只依赖上述三个文件，见 §14.3 版本声明） |
| R2（mock 三链路 0×400） | `12:22:41–12:24:37` | 所在实例 `t41e` = **0 HMR**；且不依赖 `MiniPlayer.tsx` | ✅ 有效 |
| R4(a)(b)(c)(d) | `12:24`–`13:07` | 判別性演示用**副本**或**真实取反+还原**（§13，含前后 sha1 对照） | ✅ 有效 |
| R3 / 只读核验 | 全程 | 只读，无实例依赖 | ✅ 有效 |

**净结论**：**仅 A1 需要重取，且已完成（§14.5，`13:07:22Z`，窗口内 0 HMR）**；其余各项或未落在任何写入时刻、或与 `MiniPlayer.tsx` 内容无关（已逐项给出理由），故不作废。

### §15.3 锚点与还原完整性

- **两个面板同时钉住（captain 要求）**：
  `MiniPlayer.tsx = 8a219676275a14af96bc0e69eb493a1416c74140` **MATCH ✓** ；
  `LyricsPanel.tsx = 32f8656d5f1bf87d…` **MATCH ✓**（期望 `32F8656D5F1B`）。
  整树 = **`f3af2602…`** ✓（76 文件）。
  **⇒ 无"验证窗口内改了源码未还原"的情况**（否则按 captain 要求属回退级）。
- **关键的时序判据（比 mtime 更可靠，但仍值得记录）**：两面板的 **mtime 都等于 `13:03:51Z`**，即**我的 §13 还原时刻** ⇒ **此后没有任何人写过这两个文件**。
  因此**最新一次 A1（`13:07:22.253Z`）运行在两个面板均未被改写的状态上**；再加上该实例（`t41g`）**窗口内 HMR = 0 命中**，双重保证其有效性。
- **mtime 不可单独作判据**（quality 用 `Copy-Item` 连 mtime 一并恢复；我的 §13 还原也会刷新 mtime）⇒ 本报告**一律以内容 sha1 + 聚合值为锚点**，mtime 只作辅助时序参考。

### §15.4 交叉印证（来源须注明，**非我的测量**）

captain 转述 quality 的两项自报，我据此**仅作交叉印证引用**，不替代我的独立取数：
1. **零写入的符号敏感性证明**：从 shipped 测试文件原样抽出 `OFFSET_TERM` 与三个 head 字面量，作用于**真实文本 → PASS**、作用于**内存翻转文本 → FAIL**（`RESULT: sensitive=true`）；
2. **`miniLyricsDedup.ts` 编码**：`hasBOM=False / CRLF=0 / LF=59`。
   —— 与**我自己**的测量一致（§12.2：**2510 B / 无 BOM / CRLF=0 / 孤立 CR=0 / 定向 lint 0 problems**），但**我的结论取自我的测量**，quality 的自报仅作品性交叉印证。

### §15.5 **稳健口径**（captain 采纳）：以"取样时刻 + 当时两面板 sha1"自证，不依赖他人报时刻

**判据升级**：有效性 = **取样时两面板 sha1 命中 `MiniPlayer 8a219676275a` / `LyricsPanel 32f8656d5f1b`**（可自证），而不再依赖"是否落在某个污染窗口"。以下为逐项对照。

| 我的取证项 | **取样时刻 (UTC)** | **当时两面板 sha1**（由**锚点快照**证明） | 处置 |
|---|---|---|---|
| **A1 #4（最终，bracketed）** | **`13:11:37.534`** | **`8a219676275a` / `32f8656d5f1b`** —— 实例启动前、取样后、关闭后**三次一致**（`a1-bracket-record.json`），且窗口内 **HMR = 0** | ✅ **采纳（7/7）** |
| A1 #3 | `13:07:22.253` | 同上（`t41-hmr-overlap-check` 13:06:53 与 `t41-post-a1rerun` 13:07:45 前后夹住，值相同）；窗口内 HMR = 0 | ✅ 采纳（已被 #4 复核） |
| A1 #2 | `12:20:23–32` | 值相同，但**窗口内出现 `MiniPlayer` HMR（`12:20:16/19`）** | ❌ **作废** |
| A1 #1 | `11:55:21.904` | 当时 `MiniPlayer = 39397c84c62e`（t44 之前） | ❌ 作废（被取代） |
| 迷你窗关闭存活 | `12:13:34.516` | `8a219676275a` / `32f8656d5f1b`（`12:11:30` 与 `12:14:44` 前后夹住，值相同）；窗口内 HMR = 0 | ✅ 采纳（4/4） |
| 12 秒 `--sustained` | `12:13:5x` | 同上（同实例 `t41c`，0 HMR） | ✅ 采纳（12/12） |
| F3 反面（当前权威） | `12:36:21.385` | 同上（`12:36:05` 与 `12:36:34` 前后夹住） | ✅ 采纳（6/6） |
| decode-cache 元素侧 | `12:12:18.370` | `8a219676275a` / `32f8656d5f1b`（`12:11:30` 与 `12:14:44` 夹住） | ✅ 采纳 |
| R1 判別性 | `12:19:03` / `12:19:48` / `12:20:19.165` | 值相同；窗口内有 `MiniPlayer` HMR，但**该断言只依赖 `protocol.ts`/`mediaRoots.ts`/`ipc.ts`**（与面板无关） | ✅ 采纳 |
| R2（mock 三链路） | `12:22:41–12:24:37` | 值相同；窗口内 HMR = 0 | ✅ 采纳（0×400） |
| R4(a)(b)(c)(d) | `12:24`–`13:04` | 副本演示 + **真实取反**（§13 前后 sha1 对照） | ✅ 采纳 |
| AAC 整链 | `12:05:29` | 当时 `MiniPlayer = 18f5903667e5`（t44 前）—— 但该项**与面板无关**（`decodeService`/`protocol`/`audioEngine`） | ✅ 采纳 |

**支撑证据（自证链）**：我对 `src/**` 的**每一次**锚点快照都记录了逐文件 sha1。抽取两面板历史可见：
- `LyricsPanel.tsx = 32f8656d5f1b` —— **自 11:17:36Z 起 36 次快照全部相同**（从未变过）；
- `MiniPlayer.tsx = 8a219676275a` —— **自 `12:11:30.697Z` 起连续 22 次快照全部相同**（此前序列为 `a66cf9953912 → 6b0634147aa8 → 39397c84c62e → bf0181d83e05 → 18f5903667e5 → 8a219676275a`，即 t34/t44 的迭代，均在本轮取证之前）。
⇒ **凡取样时刻在 `12:11:30Z` 之后的项，其两面板内容均自证为期望值**；A1 另经"实例前/取样后/关闭后"三次 sha1 + 零 HMR 双重确认。

### §15.6 **窗口关闭锚点**（captain 侧独立只读锚点 + 我的复算）

captain 于 **`2026-09-12T12:23:16Z`**（本地 20:23:16）在仓库根**只读**直读（未写文件、未起实例）；我在 **`13:12Z`** 独立复算，**六项全部逐字命中**（sha1 + size）：

| 文件 | captain 报告 sha1 | 我复算 sha1 | size | 判定 |
|---|---|---|---|---|
| `MiniPlayer.tsx` | `8A219676275A14AF96BC0E69EB493A1416C74140` | 同 | 5912 | **MATCH ✓** |
| `LyricsPanel.tsx` | `32F8656D5F1BF87DD45E687F4272ACF2BF9280D5` | 同 | 6940 | **MATCH ✓** |
| `miniLyricsDedup.ts` | `EA7A1C62AFBAEDDD13D4FEFB433E6E61CC8BA4F7` | 同 | 2510 | **MATCH ✓** |
| `lyricsOffset.test.ts` | `56BA63FC17675B12FC085F9A5D6EED4E074B22C6` | 同 | 13412 | **MATCH ✓** |
| `protocol.ts` | `28A7DC33AD520E93E2198E49B240DAE784161DC5` | 同 | 8257 | **MATCH ✓** |
| `mediaRoots.ts` | `DA4FD2C14A4A32F3DB7C94D7C220E53DAA438B5F` | 同 | 4172 | **MATCH ✓** |

⇒ **截至本次复算（`13:12Z`）该锚点仍成立**，两面板处于**稳定状态**，且我此后**未再执行任何 `src/**` 写入**（唯一一次受控写入是 §13/窗口 D，且已在 `13:03:51Z` 逐字节还原）。
**纪律确认（captain 第 3 条）**：**R4(c) 的真实取反已在 captain 早前正式指派下完成并还原**（§13），**我此后没有任何 `src/**` 写入计划**；若还需再做受控写入，我会**先申请**（文件 / 变异内容 / 预计时长），获确认后沿用既有备份-还原-逐字节校验流程。
**A1 处置确认（captain 第 2 条）**：**未沿用任何早于 `12:17:31Z` 的取样** —— 当前权威证据是 **A1 #4（`13:11:37.534Z`，7/7）**，其"时刻 + 两面板 sha1"成对记录见 §15.5 与 `a1-bracket-record.json`。

## §16 「t26 缺口关闭（r2 树）」与「r3 结论（r3 树）」**分列**（captain 同树原则）

### §16.1 先更正一处**事实**:我的 A1 / F3 取数**全部在 r3 树**上，从未在 r2 树

我用全部锚点快照抽取了客观分界标志 —— `src/main/mediaRoots.ts`（r3 波才引入）：

| 快照时刻 (UTC) | 聚合值 | `mediaRoots.ts` | `MiniPlayer.tsx` |
|---|---|---|---|
| `11:19:33` – `11:55:46`（r2 及其后早期） | `b7ea6c85…` → `ed32b455…` | **不存在** | `a66cf9953912` → `39397c84c62e` |
| **`12:00:09` 起至 `13:13:06`（r3）** | `60af497d…` → **`f3af2602…`** | **`da4fd2c14a4a`（存在）** | `bf0181d83e05` → **`8a219676275a`** |

⇒ 我的 **F3 反面**两次取样（`12:12:18`、`12:36:21`）与 **A1** 全部四次取样（`11:55:21`、`12:20:32`、`13:07:22`、**`13:11:37`**）**都在 `mediaRoots.ts` 已存在的树上**，即**全部属 r3 树**（其中 `11:55:21` 那次虽在 r3 波内但**早于 final 树**，已被 #4 取代）。
⇒ **captain 转述的"你的 A1 7/7 与 F3 8/8 同树复现（r2 树）"不成立**：我的数是 **A1 7/7 / F3 6/6，且均为 r3 树**；r2 树（`b7ea6c85…`）上我**没有**任何 A1 或 F3 取样。

### §16.2 分列表（两份证据**不得互相顶替**）

| 项 | **r2 树**（`b7ea6c85…`，71 文件）证据 | **r3 树**（`f3af2602…`，76 文件）证据 | 权威归属 |
|---|---|---|---|
| **F3 反面（越权路径被拒）** | audio-engine 的 `.devdata/t13-evidence/t13-media-roots.json`（**补充**；含 `controlInsideRoot: blocked` **空对照** caveat —— probe `:128` 以 `<img>` 加载 FLAC） | **我的 `verify-f3-rejections-lite.mjs` 6/6 `allPass`**（`t25-f3-rejections.json`；`12:12:18` 首跑、**`12:36:21` 在最终冻结树复跑**，含"同一真实 mp3 走 `..` 绕出被拒"强隔离用例 + 图像侧对照） | **r3 的 6/6 为准**；r2 只作补充 |
| **A1（判別性迷你窗同步）** | **无任何属于我的证据**；唯一曾经声称覆盖它的 `storage` 断言**已被 audio-engine 自行撤回**（"attempt is not artifact"，无落盘产物） | **我的 `t25-a1-mini-offset.json` 7/7**（`13:11:37.534Z`，针对 `MiniPlayer.tsx 8a219676275a`；括号式：实例前/取样后/关闭后三次两面板 sha1 一致 + 窗口内 HMR 0） | **r3 的 7/7 为准** |
| 其余（R1/R2/R3/R4/AAC/门禁/指纹） | 不适用（这些是本轮才做的） | 全部见 §2–§14 | **r3** |

### §16.3 按同树原则的**结论口径**（写入即以此为准）

1. **`t26` 的 F3 缺口**：r2 树上有音频引擎的补充证据（含 caveat），**r3 树上有我的 6/6**；
2. **`t26` 的 A1 缺口**：**在 r2 树上不存在可引用证据**（原断言已撤回，我也没有 r2 树取样）⇒ 按同树原则，该缺口**只能记「未在 r2 树取证」**，其**实质结论由 r3 树承担**；
3. **本报告的全部权威结论 = r3 树（`f3af2602…`）上的取数**；r2 材料一律标注为**补充/历史**，**不用于顶替** r3 结论；
4. `t26` 本身**仍是终态 failed、不可变**（见 §14.2），本报告不主张其状态改变。

## §17 Addendum — 四个变异窗口的**上界时刻**与我的取样完整性终结论

> 依据：audio-engine 从**结果产物写入时刻**倒推给出的窗口上界（每次 `MiniPlayer.tsx` 处于变异态**约 1–3 秒**；其 vitest 用例本体仅 17.7 ms / 14.1 ms）。**本节不重跑实例、不写 `src/**`。**

### §17.1 四个窗口与其影响面

| 窗口 | 时刻（上界） | 文件与变异点 | 影响面（我据此判定的范围） | 结果 |
|---|---|---|---|---|
| **A**（quality） | `12:17:03Z` → ≤ `12:17:31Z`（保守超集 `12:16:30–12:17:31`） | `MiniPlayer.tsx`：`display + 0.12 + offset` → `- offset`（**2 处**） | 仅**迷你窗**歌词算式 | exit 1 / 16 passed / 1 failed |
| **C**（audio-engine） | ≈ `12:17:0xZ` → **`12:17:10Z`** | 同上（**`<` 分支一处算式**） | 仅**迷你窗**歌词算式 | exit 1 / 16 passed / 1 failed |
| **D**（audio-engine，否证前提） | ≈ `12:20:1xZ` → **`12:20:19Z`** | 同上（**同一处算式**） | 仅**迷你窗**歌词算式 | exit 1 / 16 passed / 1 failed |
| **A′**（更早，早期 session） | `11:54:39Z` | `MiniPlayer.tsx`（早期版本） | 同上 | 3 failed / 14 passed |
| **B**（audio-engine） | **NO-OP、从未写入** | `LyricsPanel.tsx` | **无影响面** | 无写入 ⇒ 无污染 |

**影响面要点**：四者**全部只动 `MiniPlayer.tsx` 的歌词偏移算式**（窗口 C/D 仅 `<` 分支一处），**不触及** `LyricsPanel.tsx`、`protocol.ts`、`mediaRoots.ts`、`ipc.ts`、`decodeService.ts`、`audioEngine.ts` 或任何测试文件 ⇒ 受影响面**仅限"迷你窗歌词高亮/两窗一致性"类断言**。

### §17.2 逐条核对我的取样时刻

| 我的项 | 取样/产物时刻 (UTC) | 与窗口的关系 | 判定 |
|---|---|---|---|
| **A1（当前权威 = #4）** | 取样 `13:11:37.534`；**产物 mtime `13:11:49Z`** | **晚于最后一次回滚 `12:20:19Z` 约 51 分钟** | ✅ **未污染**（另：实例启动前/取样后/关闭后**三次**两面板 sha1 均 = `8a219676275a`/`32f8656d5f1b`，窗口内 **HMR 0**） |
| A1 #3 | `13:07:22.253` | 晚于 `12:20:19Z` 约 47 分钟 | ✅ 未污染（已被 #4 复核） |
| **A1 #2**（captain 转述的那版） | 取样 `12:20:23–32`、**产物写入 `12:20:42Z`** | 你据"晚于 `12:20:19Z` 23 秒"判未污染 | ⚠️ **但我不采纳该版**：我的实例 `t41d` **在 `12:20:16/19Z` 实际收到了两次 `MiniPlayer.tsx` HMR 重载**（正是窗口 D，见 §17.3），取样与之同窗口 ⇒ **按我自己的判据已作废**，改以 #4 为准（更保守） |
| A1 #1 | `11:55:21.904` | 与 `11:55:21Z` 的一次 HMR 同刻（见 §17.4） | ❌ 作废（已被取代） |
| 迷你窗关闭 / 12 秒表 | `12:13:34.516` / `12:13:5x` | **早于窗口 A/C** 且实例 `t41c` HMR = 0 | ✅ 未污染（4/4、12/12） |
| F3 反面（权威） | `12:36:21.385` | 晚于所有窗口 | ✅ 未污染（6/6） |
| R1 判別性 | `12:19:03` / `12:19:48` / `12:20:19.165` | 窗口 D 区间内**有 HMR**，但该项断言只依赖 `protocol.ts`/`mediaRoots.ts`/`ipc.ts` | ✅ 未污染（与面板无关） |
| R2（mock） | `12:22:41–12:24:37` | 晚于所有窗口 | ✅ 未污染（0×400） |
| R4 / AAC / 门禁 / 指纹 | `12:05`–`13:13` | 非面板项 | ✅ 未污染 |

**快照侧确认（captain 第 2 条要求）**：我的锚点快照中 `MiniPlayer.tsx` **自 `12:11:30.697Z` 起连续 22 次均为 `8A219676275A…`**、`LyricsPanel.tsx` **自 `11:17:36Z` 起 36 次均为 `32F8656D5F1B…`** ✓（§15.5/§16.1 的同一数据）。

### §17.3 我此前"未认领"的那处写入，**已由窗口 D 解释**

我在 §15.1/§16 一直挂着的"未认领 HMR 对" = `t41d-dev-out.log` 的 **`12:20:16Z`、`12:20:19Z`** 两次 `MiniPlayer.tsx` 重载 ⇒ **与 audio-engine 的窗口 D（≈`12:20:1xZ` → `12:20:19Z`）逐秒吻合**。**该悬案就此关闭**（处置不变：A1 #2 作废）。

### §17.4 两处**仍不完全吻合**的残留（不影响结论）

1. 窗口 A′ 自报 `11:54:39Z`，但我在 `t25b` 实例里实测到的 HMR 是 **`11:55:21Z` / `11:55:43Z`** —— 两者相差约 42 秒，**不能互相解释**（A′ 若已回滚，则 `11:55:21/43` 应有另一写者）。A1 #1 本已作废，故**不影响结论**，仅记录待核。
2. **`LyricsPanel.tsx` 的 mtime 不是 `08:54:42Z`**：captain 引用的该值是我**§13（R4(c) 真实取反）还原之前**的读数。**当前两面板 mtime 均为 `13:03:51Z`** —— 是**我**的还原动作刷新的（内容 sha1 与基线逐字一致）。其**内容全程未变**（36 次快照同值）这一点仍然成立，可作为"窗口 B 为 NO-OP"的更强证据。

### §17.5 终结论（一句话）

> **运行期证据的完整性成立**：所有面板相关断言的**权威版本**取自 **`13:11:37.534Z`（A1 #4）**，晚于全部已知变异窗口、且以"实例前/取样后/关闭后三次两面板 sha1 一致 + 窗口内 HMR 0"自证；**唯一需作废的是已被取代的 A1 #1 与 A1 #2，二者均已重取** —— 其余各项（R1/R2/F3/迷你窗关闭/`--sustained`/R4/AAC/门禁/指纹）经逐项核对**均未受四个窗口影响**。

## §18 台账噪声说明（captain 裁定；团队归档时一并归档）

> **`t9` / `t30` / `t32` / `t35` / `t38` / `t39` 为被取代的空任务**：因依赖处于 `failed`/`pending`，它们**既不可派发也不可取消**（captain 实测 `reassign_task t35 → captain` 被拒："blocked by unfinished dependencies"）⇒ 属**结构性惰性 / 台账噪声，而非工作阻塞**；**本报告与 t42/t43 的结论均不依赖它们**，归档时一并归档即可，无需再为其花任何动作。

**live 链（最终）**：**`t41`（completed，11/11）→ `t42`（审议中/已完成 verdict=pass）→ `t43`（completed，1.0.4 已构建+校验+`/S` 覆盖安装）**；`t14` / `t9` 不参与。

**打包态两项的最终状态（避免与 t43 重复派单）**：
| 项 | 状态 |
|---|---|
| 升级路径 ≥20s 冒烟 | ✅ **已在 t43 完成**：PLAIN 启动 30.5 s、t=5…30 s 逐点存活、出窗口、`uncaughtException` 0 / `reading 'trim'` 0 |
| `settings.json` 补齐核对 | ⚠️ **无对象可补**：真实 `%APPDATA%` 配置**本就有 `updateURL`（空串）** ⇒ 已改为验证"同形状长跑无异常 + 配置逐字节不变"（缺键分支由 dev 夹具证据 + `store.ts:103-104` 承担）；见 `RELEASE-1.0.4.md` §5/§9 |
| 打包态复跑**迷你窗关闭** | ✅ **已在 t43 完成**（`visibilityState='hidden'` + 主窗存活 + 进程未退出） |
| 打包态复跑 **12 秒 `--sustained`** | ❌ **打包态取不到**（打包 userData **无 `library.json`**、用户未扫描任何目录 ⇒ 无曲可播）；按 captain 早前口径**如实标注**并引用 **r3 树 dev 侧重采的 12/12 表**（peak 211→246、maxDev 16、无回退触发行），**不冒充打包态新证据** |

## §19 窗口数据**最终版**（captain `12:26:24Z`）+ captain 四问逐条回答

> 本节**取代 §17.1 的窗口表**（字母映射：§17 的 "A" = 本节 **C**；§17 的 "C/D" = 本节 **D**；§17 的 "A′" = 本节 **A′**；§17 的 "B" = 本节 **B（不存在）**）。

| 窗口 | 目标 | 时刻 (UTC) | 结果 | 回滚 |
|---|---|---|---|---|
| **A′** | `MiniPlayer.tsx` | `11:54:39.510` | 16 passed / **1 failed** | 逐字节一致 |
| **B′** | `MiniPlayer.tsx`（LyricsPanel 臂 **NO-OP**） | `12:02:01.424` | 16 passed / **1 failed** | 逐字节一致 |
| **C** | `MiniPlayer.tsx` | **`12:17:10.676`** | 16 passed / **1 failed** | 回滚后 `8A219676275A` |
| **D** | `MiniPlayer.tsx` | **`12:20:19.305`** | 16 passed / **1 failed** | 逐字节一致 |
| ~~B~~ | `LyricsPanel.tsx` | **不存在（全程零写入）** | — | —— |

### §19.1 回答 (1)：`LyricsPanel.tsx` 无窗口 —— 结论成立，但**第 3 条证据已过时**

captain 的三证中，**第 3 条「mtime 至今 `08:54:42Z`」不再成立**：该值是我 **§13（R4(c) 真实取反）还原之前**的读数；**当前 `LyricsPanel.tsx` mtime = `13:03:51Z`**（= 我的还原动作刷新；内容 sha1 与基线**逐字一致**）。
**但这不影响"无窗口"结论** —— 我方另有**更强**证据：
1. 我的**锚点快照**：`LyricsPanel.tsx` 自 `11:17:36Z` 起 **36 次快照全部为 `32f8656d5f1b`**（内容从未变过）；
2. 我**全部 9 个实例日志**中 `LyricsPanel.tsx` 的 `hmr update` **命中 0**（若真有写入且我在跑实例，必出 HMR 行）；
3. captain 侧两证仍然有效：`%TEMP%` 无 LyricsPanel 备份、四次运行失败数**恒为 1**（只有 MiniPlayer 那条臂生效）。
⇒ **`LyricsPanel.tsx` 相关取样零风险**（成立）。

### §19.2 回答 (2)：C ∩ A 并集 = `12:17:03–12:17:31Z` ⇒ **我无取样落在其中**

该并集内我的实例窗口为**空档**（`t41c` 止于 `12:14:44Z`、`t41d` 起于 `12:18:49Z`）⇒ **没有任何歌词/迷你窗读数落于该并集**，无需作废任何项。附近取样时刻：迷你窗关闭 `12:13:34`、12 秒表 `12:13:5x`（**之前**）；R1 `12:19:03/48`、A1 #2 `12:20:23–32`（**之后**）。

### §19.3 回答 (3)：第 0 步锚点时 `MiniPlayer.tsx` = **`18f5903667e5`**（**不是** `8a219676275a`）

实测（`t41-frozen-snapshot.json` @ `12:02:19.851Z`）：`MiniPlayer.tsx = 18f5903667e5`；到 **`12:11:30.697Z`** 才变为 `8a219676275a`（t44 的写入，`newest src mtime 12:11:25Z`）。
⇒ 该锚点**仍然有效**（其用途是"claim 时的树指纹"，用于与最终树对比列出 r3 差异清单），**只是不能指望它等于 t44 之后的版本**；窗口 **B′ @ `12:02:01.424Z`** 在我取锚点前 **18 秒**已逐字节回滚 ⇒ 锚点读到的是**未被变异的内容** ✓。
另：我的取样中**没有**落在 `11:54:3x`（A′）或 `12:02:0x`（B′）的项 —— 唯一近邻是 A1 #1（`11:55:21.904`，与 `11:55:21Z` 的一次 HMR 同刻）**已作废并被 #4 取代**。

### §19.4 回答 (4)：**r3 树的 A1 7/7 = `t25-a1-mini-offset.json`，写入 `13:11:49Z`（A1 #4）**

| 树 | A1 权威文件 | 说明 |
|---|---|---|
| **r2 树**（`b7ea6c85…`） | **无文件** —— **我从未在 r2 树上做过 A1 取样**（见 §16.1：我的 A1 全部在 `mediaRoots.ts` 已存在的树上，即 r3） | 同树原则下，`t26` 的 A1 缺口**只能记「未在 r2 树取证」** |
| **r3 树**（`f3af2602…`） | **`.devdata/t13-r2-evidence/t25-a1-mini-offset.json`** —— **`capturedAt 13:11:37.534Z`、文件 mtime `13:11:49Z`、`allPass = true`（7/7）** | **该文件是同一个路径、被后续运行覆盖**：`12:20:42Z` 那版是 **A1 #2**（我因实例内 `12:20:16/19Z` 两次 HMR 而**作废**它），现已被 #3/#4 覆盖 |

⇒ 按时间上界：**#4（`13:11:49Z`）晚于最后回滚 `12:20:19.305Z` 约 51 分钟**；且以"实例前/取样后/关闭后**三次**两面板 sha1 = `8a219676275a`/`32f8656d5f1b` + 窗口内 **HMR 0**"自证 ⇒ **A1 证据完整性成立**。
⚠ 因此**不建议**再用"#2 晚 22.7 秒"作为判据 —— 那一版按**事件判据**（同窗口 HMR）已被我作废；现行判据是 **#4 + 双面板 sha1**。

## §8 打包态交接注记（供 1.0.4 集成发布任务 `t43`／其前身命名 `t39` 直接引用）

> 本节是**只读预检 + 已落盘证据的交接**，不含新写入、未起实例。执行打包时按本节即可省去重复调研。

### §8.1 **升级路径不需要造夹具**（captain 采纳，要求写入）

`%APPDATA%\nebula-player\settings.json`（打包/安装态 userData）**本身就是"旧形状"** —— 打包态日志全程 `services initialized; update feed=(none)`，即该配置**本来就没有 `updateURL`**。
⇒ 升级路径长跑**直接用真实用户配置**即可，**不必构造缺键夹具**；仍按契约执行：**启动 ≥20 s → 确认 `updateURL` 键被补齐并落盘 → 记录 `closeToTray` 实际值**。

### §8.2 现成的 **BEFORE** 对照（无需重跑修复前构建）

`LOG-ANALYSIS-dev-vs-packaged.md` §6 已记录同一形状配置下的前后对照：

| 侧 | 观测 |
|---|---|
| **修复前（7 次）** | boot 后 **8.1–8.2 s** 抛 `uncaughtException: TypeError: Cannot read properties of undefined (reading 'trim')`；含已安装 1.0.2/1.0.3（`app.asar\out\main\index.js:1430:47`）与 `dist\win-unpacked`（`:1453:47`） |
| **修复后（7 次）** | **零异常**（其中两次 boot 相隔 30 s） |

⇒ 打包态只需做 **AFTER** 一侧；BEFORE 引用上表即可（口径：不得冒充新证据，需注明来源）。**并明确**：`updateURL` 缺键缺陷**真实但只走 logging 守卫、不杀进程**；打包态的"进程级死亡"仍**未定性**，由本轮长跑判定。

### §8.3 启动期判定判据（团队口径，captain 已更正采纳）

- **应用日志不能判**"启动早期即退" —— `[main] window loaded` 是 `console.log`（`index.ts:256`，同类 `:227`/`:250`/`:253`）**只进 stdout**；健康跑 61 s 与被杀留下同一行。
- **正确判据 = launcher 捕获的 stdout**（`verify-crash-capture.mjs` → `.devdata/t6-evidence/dev-capture.log`）+ **存活三查**（CDP / 进程数 / 端口）。
- dev 侧真正的"早期即退"仅 **3 次**：`07:11:56.144Z`、`07:20:39.666Z`、`07:23:15.023Z`（boot 后无 `services initialized`，而正常相隔仅 10–14 ms）⇒ 归档 **dev 环境工件（未定性）**，不判缺陷，以打包态长跑为准。
- dev 全天 `uncaughtException`/`unhandledRejection` = **0**、`[warn]` = **0**，30 条 `[error]` 全是 vite HMR 瞬态 ⇒ **应用侧无可归因抛错**。

### §8.4 `t43` 只读预检（20:30 实测）

| 项 | 现状 |
|---|---|
| 版本 | `package.json` = **1.0.3** ⇒ 升 **1.0.4** |
| `dist/` | `win-unpacked` 为 **18:52 验证期产物** ⇒ **必须自重构建、不复用**；目录内含 1.0.0/1.0.1/1.0.2/1.0.3 四个 setup，`latest.yml` 当前指向 **1.0.3**（`12:27:30`）⇒ 构建后需确认 `latest.yml` + `nebula-player-1.0.4-setup.exe` 同步刷新 |
| `verify-asar.mjs` | 在位（2341 B） |
| 构建缓存 | `%LOCALAPPDATA%\electron\Cache`、`electron-builder\Cache` **均在** ⇒ 镜像环境下可行 |
| 已安装基线 | `%LOCALAPPDATA%\Programs\nebula-player\nebula-player.exe` 在位，`app.asar` = **186,705,502 B（≈186.7 MB）** |

**额外零成本回归断言（建议纳入安装步骤）**：已安装 1.0.3 的 `app.asar` 是 **t11 之前的旧卫生体积**（≈186.7 MB）⇒ 覆盖安装 1.0.4 后应**降到 ≈25 MB** 且 `verify-asar.mjs` 四项归零（`scripts/**`=0 / `.devdata/**`=0 / `src/**`=0 / `*.test.*`=0）。这条把 t11 的打包卫生**验证延伸到用户机器上的真实包**（此前只在构建产物上验过）。

### §8.5 归属确证（记录在案、不追责）

被误停的那个 dev 实例 = **t31（ai-tools）** 的：dev 日志全天仅 3 次 `update feed=(none)`，其中 **`11:37:26.618Z`** 正是该实例启动时刻，而 `(none)` 只可能来自 t22/t27/t31 的"旧配置升级路径"夹具；`scripts/**` 中唯一能起实例的 `verify-crash-capture.mjs` 的输出文件 mtime 为 `18:57:25`（早 40 分钟）。**captain 已裁定记录、不追究。**

## §9 观察与 backlog 候选（**均不判缺陷**，发布后评估）

> 本节按 captain 要求单列"产品侧观察"，**不作为 finding**，不影响 t41 的任何通过结论。

### §9.1 迷你窗歌词时钟只随**引擎事件**推进（观察）

**现象（运行期实证，§3sexies）**：迷你窗的歌词时钟由主进程转发的**引擎事件**（`mini:state`）驱动。因此当播放器处于**暂停**态、而 UI 或代码在渲染进程里只改 store 的 `currentTime`（`player.setState({currentTime})`）时，**不会产生推送**，迷你窗会**冻结在最后一次推送的时刻**（现场：主窗已到 15.4，迷你窗仍停在 3.75）。
**可观测后果**：暂停态下 `seek`/拖拽进度条后，迷你窗的歌词高亮**可能不刷新**，直到恢复播放。
**为何不判缺陷**：① 正常用户路径（播放中）不受影响 —— 播放时引擎持续推送，迷你窗与主窗逐步一致（4/4，§3quinquies 与 §3sexies 各一组）；② "暂停时是否应刷新迷你窗歌词"属**产品语义选择**，非崩溃/数据错误；③ 修复成本与风险（给 store 变更加推送 = 触碰主进程 IPC 频率）显著高于当前收益。
**若将来要改**：在 `mini:state` 之外补一条**显式**的 `currentTime` 变更推送（或让迷你窗订阅主窗的 store 快照），并加一条"暂停 + seek 后迷你窗高亮更新"的回归用例。
**取证时的应用方式（已采纳）**：钉钟到 **≈14.7–15.0**（`seek` + 短 `play` 使其推送、随后立即 `pause`），此后**只翻转 offset、不再 play-nudge** —— offset 变化经 `storage` 事件即触发两窗重算；每跑完都做**存活三查**（§3sexies 已记录该修法的成败对照）。

### §9.2 `diag-*.mjs` 一族的 `#mini` 主目标坑（backlog）

**问题**：部分脚本用内联匹配挑主窗口（`t.url.includes('localhost:5173')` 或 `/localhost:5173\/$/`），**未排除 `#mini`**；而 `#mini` 目标**没有 `window.__nebula`** ⇒ 迷你窗开着时脚本可能挂起或失败（"只在迷你窗打开时才出现的假故障"）。
**实测计数**（逐文件扫描）：**有风险 22 个**（19 个 `diag-*.mjs` + `e2e.mjs` + `probe-settings-readmerge.mjs` + `probe-transcode.mjs`）；另有 8 个内联匹配但已带 `#mini` 守卫；**21 个已走共享 `mainTarget()`**（全部 `verify-*`）。
**建议方案**（一处小重构，而非 22 处散点补丁）：风险脚本统一 `import { cdp, mainTarget, targets } from './verify-lib.mjs'`，同时白得"启动期 boot 轮询 + 超时保护"。
**为何不在本轮做**：该族已被 t11 **排除出安装包**、不面向用户；我的取证全部走共享 `mainTarget()`，当前结论不受影响；打包前引入 22 文件改动收益不成比例。

### §9.2b `scripts/probe-media-roots.mjs:128` 的**空对照**（backlog，与 §9.2 同批）

`out.controlInsideRoot = await tryImg(mediaUrl(track.path))` —— 用 `<img>` 加载 **FLAC 音频**，该"对照"**必然失败**，等于没有对照。
**归因（captain 要求写清）**：这是**探针 bug，不是产品信号**，**不得**被读成"根内也被拒"；该产物的真正正向对照是 `trackLoad`（`<audio>` → `metadata:5`）与 `coverLoad`（`<img>` → 512），二者成立 ✓。
**影响面**：仅 `t13-media-roots.json` 的 `controlInsideRoot: blocked` 一项；其余条目（`settingsJson` / `pngOutsideRoots` / **`pngViaDotDotIntoRoots: loaded`** / `traversal` / `txtBeside`）不受影响。
**裁定（captain）**：**现在不改** —— `scripts/**` 已被 t11 排除出安装包、与发布产物无关，且 t44 之后不再引入非必要写入。**建议修法**：改为加载一个根内真实图片（如 `<userData>/covers/*.png`），或直接删除该字段。

### §9.3 「R2-SUPPLEMENT 重取版」引用点

`.devdata/t13-r2-evidence/R2-VERIFICATION-SUPPLEMENT.md`（v3）是本报告在 **t25 通道**上的对应件（t25 为终态 failed，captain 裁定**不重开**、以引用方式并入）：
- 其 **§2** = F3 反面 **6/6**（强隔离用例：根外真实 mp3 与 `..` 绕出均被拒 ⇒ 只能归因根集判定；两项正向对照证明探针能报成功）；
- 其 **§3** = A1 **7/7 重取版**（钉钟 14.95 + offset-only 翻转；含"时钟由引擎事件驱动"的机理与 **§9.1** 的观察）；
- 其 **§7.1** = `diag-*.mjs` 主目标坑的完整风险清单（对应本节 §9.2）。
**锚点限定（保留，勿删）**：该轮 `t25-pre 0b030814…`（73 文件）→ `t25-post 3073167e…`，**运行期只有两个测试文件变化**（`lyricsOffset.test.ts`、`recommend.test.ts`），所测生产文件逐字节未变 ⇒ 该文件**不声称"冻结树取证"**；而本报告的运行期证据取自**真正的冻结树 `f3af2602…`**。

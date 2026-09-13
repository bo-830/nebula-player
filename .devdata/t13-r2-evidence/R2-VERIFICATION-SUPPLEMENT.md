# R2 验证补充（窄口径）：F3 越权反面 + A1 迷你窗偏移 —— **两项均通过**

- 验证人：**verifier**；窗口：本地 **19:50:31 – 19:56:04**（UTC 11:50:31 – 11:56:04），共两轮实例
- **任务记录状态（必须先说）**：`claim_task t25` 被框架拒绝 —— `Error: task status cannot move from "failed" to "claimed"`（本会话第 5 次遇到同一终态规则）。**本报告暂无任务记录**，请 captain 重开 t25 或新建任务挂载；内容与方法学不因此打折。

## §0 方法学（captain 口径 + 已落 `METHOD-probe-exitcode-vs-liveness.md`）

| 问题 | 判据 | 本次实测 |
|---|---|---|
| 探针成功与否 | **落盘 JSON 是否完整** | 两份 JSON 完整落盘（`t25-f3-rejections.json`、`t25-a1-mini-offset.json`） |
| 实例是否存活 | CDP `/json/version` + `electron` 进程数 + `5173` 监听 | 每次探针跑完立即三查，**四次全部存活** |
| 退出码 | **不作判据** | 本报告记录但明确不参与判定（`0xC0000409` = libuv 收尾断言） |

**实例纪律（自起自关，未替他人清场）**
| 轮次 | 启动方式 | PID（npm） | 就绪 | 收尾（我本人） | 结果 |
|---|---|---|---|---|---|
| 第 1 轮 | `Start-Process npm.cmd run dev -PassThru` | **17728**（19:50:31） | 2 s | `taskkill /PID 17728 /T /F` → 13 进程终止 | **procs=0，四端口 FREE** |
| 第 2 轮（A1 重取） | 同上 | **4660**（19:55:09） | 2 s | `taskkill /PID 4660 /T /F` → 3 进程终止 | **四端口 FREE**（残留 2 个 node 属他人 t37b/eslint，未动） |

启动日志（stdout）均含 `[main] window loaded` 与 `[main] probe {"root":1,"hasApi":true,…}` —— 这两行只进 stdout，不落应用日志（见 `LOG-ANALYSIS-dev-vs-packaged.md` §2）。

## §1 冻结锚点与运行期漂移（规则 B）

| 打点 | 聚合 sha1 | 文件数 | capturedAt |
|---|---|---|---|
| `t25-pre` | `0b03081425f2587dc65b9faa0156e5297ec270a0` | 73 | `11:50:31.810Z` |
| `t25-post` | `3073167eb75135bf8700c4e40ca9a9f7dd037348` | 73 | `11:53:33.500Z` |
| `t25b-post` | `ed32b4552201d62b02ed60d17494d0bed94f0e68` | 73 | `11:55:46.566Z` |

**漂移界定（逐文件 sha1 对比，非"可能变了"）**
- 第 1 轮期间（`t25-pre → t25-post`）：仅 **2 个测试文件**变化（`lyricsOffset.test.ts`、`recommend.test.ts`）；**所测生产文件全部逐字节未变**（`protocol.ts f14aee0e5cc4`、`ipc.ts 58c2b55ce5fb`、`index.ts 18ef7c49c2eb`、`store.ts 7efc2b632049`、`decodeService.ts df1c81800a0d`、`mediaFormats.ts b14e7b9dead4`、`LyricsPanel.tsx 32f8656d5f1b`、`lyricsOffset.ts a25cfd5642c2`、`MiniPlayer.tsx 6b0634147aa8`）。
- 第 2 轮期间（`t25-post → t25b-post`）：`MiniPlayer.tsx 6b0634147aa8 → 39397c84c62e`、`miniLyricsDedup.ts 8ff6b3bd9ed8 → 63fa32f19704`、`lyricsOffset.test.ts → 07b21938189c`。
  **时间戳判读**：`miniLyricsDedup.ts` mtime = **19:55:21**（= 我探针落盘那一秒）、`MiniPlayer.tsx` = **19:56:04**（我已关实例之后）⇒ **我的 A1 取证对应的是它们改动前的版本**（`MiniPlayer 6b0634147aa8` / `miniLyricsDedup 8ff6b3bd9ed8`）。
- ⇒ 本节两项结论对**所测版本的这些生产文件**有效；**但整树未冻结**（73 文件里有测试文件与迷你窗路径文件在动），故**不声称"冻结树上取证"**；`MiniPlayer.tsx`/`miniLyricsDedup.ts` 的最终版本必须在 **t35** 上复跑 A1。

## §2 项目 1 — F3 反面（越权路径被拒）：**通过（6/6）**

命令：`node scripts/verify-f3-rejections-lite.mjs`（新写的**轻量**探针：只用 `new Audio()` / `new Image()`，**不播放、不建图谱、禁用 `fetch(media://)`**）
落盘：`t25-f3-rejections.json`，`capturedAt 11:50:51.378Z`，**`allPass = true`**
**存活三查（紧接探针）**：CDP UP ✓ ｜ procs = 7 ✓ ｜ `[::1]:5173` + `127.0.0.1:9222` LISTENING ✓

| 用例 | 路径 | 扩展名可服务？ | 在根集内？ | 实测 | 判定 |
|---|---|---|---|---|---|
| A 对照 | `.devdata\test-music\song-a.mp3` | ✓ | ✓ | `loadeddata`, `readyState=4`, `duration=8`, `error=null` | **可播 ✓** |
| B | `.devdata\t13-r2-evidence\lure.mp3`（**真实 mp3**） | ✓ | ✗ | `error`, `readyState=0`, `errorCode=4` | **拒绝 ✓** |
| C | `…\test-music\..\..\t13-r2-evidence\lure.mp3`（**同一真实 mp3，走 `..`**） | ✓ | ✗（normalize 后越界） | `error`, `readyState=0`, `errorCode=4` | **拒绝 ✓** |
| D | `.devdata\user\settings.json`（**非白名单扩展名**） | ✗ | ✗ | `error`, `errorCode=4` | **拒绝 ✓** |
| E | `resources\icon.png`（**根外真实 png**） | ✓（图片） | ✗ | `complete=true` 但 `naturalWidth=0` | **拒绝 ✓** |
| F 图片对照 | `.devdata\user\covers\f1da4b02ccf77fda8461.png` | ✓ | ✓ | `load`, `naturalWidth=512` | **可加载 ✓** |

**隔离设计（本节关键）**：B 与 C 指向**同一个真实、扩展名可服务的 mp3**，C 只是从已扫描目录用 `..` 绕出 ⇒ **C 的拒绝不能归因于扩展名白名单，只能归因于根集/包含性判定**。D 覆盖"非白名单扩展名"、E 覆盖"根外真实图片"，A/F 为音频与图片的**正向对照**（证明拒绝不是探针自身故障）。
⇒ t26 里记为「F3 反面未通过（实例死亡）」的那项，**本次按新口径重取并判通过**；旧措辞已更正为"探针未产出证据（存活性未单独测量）"。

## §3 项目 2 — A1 迷你窗偏移：**通过（7/7）**

命令：`node scripts/verify-a1-mini-offset.mjs`；落盘 `t25-a1-mini-offset.json`，`capturedAt 11:55:21.904Z`，**`allPass = true`**
**存活三查（紧接探针）**：CDP UP ✓ ｜ procs = 8 ✓（含迷你窗）｜ 两端口 LISTENING ✓
**证据来源**：**迷你窗自己的 CDP target**（`.mini-lyric-line.active` DOM + 该窗口的 `localStorage`），不是主窗。

**时钟被证明冻结在同一值（14.95），三步完全相同**，因此差异只能来自 offset：

| 步骤 | offset | 主窗 active | **迷你窗 active** | 迷你窗 localStorage |
|---|---|---|---|---|
| 1 | 0 | 我在城市的边缘 轻声哼唱 | **我在城市的边缘 轻声哼唱** | `{"d9c1…":2.5}` |
| 2 | **+0.5** | 风把思念 吹向远方 | **风把思念 吹向远方** ← **跨行** | `{"d9c1…":2.5,"aee944…":0.5}` |
| 3 | 0 | 我在城市的边缘 轻声哼唱 | **我在城市的边缘 轻声哼唱** ← **回退** | `{"d9c1…":2.5}` |

（`main.time` 三步均为 **14.95**；阈值 = 14.95 + 0.12 + offset → 15.07 命中行 11.00、15.57 命中行 15.50。）

**7/7 断言**：主窗 `0→+0.5` 跨行 ✓、`+0.5→0` 回退 ✓；**迷你窗 `0→+0.5` 跨行 ✓**、`+0.5→0` 回退 ✓；迷你窗与主窗**逐步一致** ✓；迷你窗 `localStorage['nebula.lyricsoffset']` 命中主窗写入 ✓；迷你窗渲染出歌词行（`lines=3`、`title=长测试曲`）✓。

**判別参数更正（采纳 captain 的更正并复述）**：原 `seek(13.5)±0.5` 的三条阈值 13.12/13.62/14.12 **全落在 `[11.00,15.50)`**，不可判別；本次用的是 `currentTime≈14.95`：`offset 0 → 15.07`（行 11.00）vs `offset +0.5 → 15.57`（行 15.50）。

**关键机制发现（写入 t35 复用）**：迷你窗的时钟由主进程转发的**引擎事件**驱动 —— `engine.pause()` 之后在渲染进程里 `setState({currentTime})` **不会推送**，迷你窗会冻结在最后一次推送的时刻（现场实证：主窗 15.4 时迷你窗仍停在 3.75；此时 0/±0.5 的高亮不动是**正确行为**）。
⇒ 正确做法：**先把时钟钉进跨行窗口**（`seek` 到 14.7 + 短 play 让它推送、立刻暂停），**随后只翻转 offset、不再 play-nudge**（offset 变化经 `storage` 事件即触发两窗重算）。每次 nudge 会让时钟前进约 0.5 s，而 ±0.5 的跨行窗口只有 0.5 s 宽 —— 这正是先前 4 次尝试失败的原因。
**尝试次数如实**：A1 共 5 跑；前 4 次分别是我的探针 bug（`json()` 误用、模板字符串里写反引号）、设计缺陷（先暂停后开迷你窗）、钉钟过冲，**没有一次是环境故障**，且每跑完实例都存活。

## §4 环境注记（captain 要求写入）

1. **probe / 实例顺序约束**（audio-engine 实测，我独立复现过同类现象）：F1/F7 这类 **store 探针必须在 electron 关闭之后跑** —— Chromium 会锁 `.devdata/user/Network/Cookies`，导致 vite watcher `EBUSY` 崩溃。① 我此前给 Vite SSR 加载器加 `watch:null, hmr:false` 正是规避同一把锁；② 正确顺序 =「先跑需要实例的取证 → 关实例 → 再跑 store 探针」。
2. **判成功看落盘 JSON 完整性 + 实例存活三查，不看探针退出码**（`0xC0000409` = Node 收尾关闭共享 WebSocket 的 libuv 断言，与 Electron 应用无关）。已在本报告 §0 全量执行。
3. **`MediaImage` 假阴性口径（§A9/§A10，captain 采纳）**：根因不是词表而是**通道选错** —— 该警告由 Chromium 产生、**不经 renderer `console`**，只走 CDP `Log` 域；`index.ts:242-243` 只转发 renderer console 的 `level>=1`，故 app 日志交叉印证属**同一盲区**。**该警告消失 = 修复；仍存在 ≠ F3 失败**（MediaSession artwork 仅接受 http/https/data/blob，只影响 OS 级封面）。

## §5 结论

| 项 | 结论 |
|---|---|
| F3 反面（越权路径被拒） | ✅ **通过（6/6）**，含"同一真实 mp3 走 `..` 被拒"的强隔离用例 |
| A1 迷你窗偏移（本轮目标） | ✅ **通过（7/7）**：跨行判別 + 回退 + 两窗逐步一致 + 迷你窗 `localStorage` 直读 |
| 状态判据 | ✅ 全程按"JSON 完整性 + 实例存活三查"，不看退出码 |
| 实例收尾 | ✅ 两轮均由我本人关闭；**端口全 FREE**，`procs=0`（第 2 轮残留的 2 个 node 属他人 t37b/eslint，未动） |
| 整树冻结 | ⚠️ **未满足**：运行期有测试文件与 `MiniPlayer.tsx`/`miniLyricsDedup.ts` 变化 ⇒ **A1 必须在 t35 上以最终版本复跑**（版式与判別参数可直接复用本报告 §3） |
| 未闭合项 | `--sustained` 12 秒表、迷你窗 `storage` 事件数组（按 captain 裁定 (A) 收口，**不构成失败项**） |

## §6 并列裁定、事实更正与锚点更正（按 captain 本地 19:5x 裁定写入）

### §6.1 「实例消失」= 环境/基础设施（未定性）——两类记录**并列保留**

采纳 captain 裁定：**不能用一个成员的反证去推翻另一个成员的原始记录**。我的"取证期间实例消失"记录与 audio-engine 的"探针跑完实例仍 CDP UP、electron=6"**同时成立**；**探针退出码对双方都是噪声**（他的是 libuv 收尾断言，我这侧亦非该码），**不得互为解释**。
⇒ 归类：**dev 实例取证期间消失 = 环境/基础设施现象（未定性）**；不判产品缺陷、也不写"已解释"；**唯一定性台仍是 t9/t39 打包态长跑**。

### §6.2 三件套记录（已按此补齐本轮两次取证）

| 轮次 | ① 探针退出码 | ② electron 进程数（跑完即查） | ③ 应用日志尾部 `[error]` 行 |
|---|---|---|---|
| 第 1 轮（F3） | `verify-f3-rejections-lite.mjs` exit **0** | **7**（+ CDP UP、5173/9222 LISTENING） | **0 条**（窗口 `11:50:34Z` 起，仅 boot + `services initialized` 两行） |
| 第 2 轮（A1） | `verify-a1-mini-offset.mjs` exit **0** | **8**（含迷你窗；CDP UP、两端口 LISTENING） | **0 条**（窗口 `11:55:11Z` 起，同样仅两行） |

**附加一条伴生观测（不写成成因）**：两轮 stderr 均有 `Error: net::ERR_CONNECTION_REFUSED`（`SimpleURLLoaderWrapper` 栈）—— 即 **mock 更新服务 `8888` 未运行**时 dev 的更新检查被拒；应用**未退出**（两轮探针全程存活，且实例由我本人关闭）。与既有定位一致：**缺键缺陷真实但 `trim` 异常不杀进程**；"崩溃时 feed 不通"只作**伴随现象**记录。

### §6.3 两条事实更正（我核对了自己的原文）

1. **「dev 日志零 error」——我不曾这样写，原文即已是分层的**：我在 `LOG-ANALYSIS-dev-vs-packaged.md` §5 的统计表写的是 **`[error]` = 30（全部 `[renderer] [vite]` HMR 瞬态）**，同时 **`uncaughtException` / `unhandledRejection` = 0**、`[warn]` = 0；给 captain 的消息也是"全天 `uncaughtException`=0、`[warn]`=0、30 条 `[error]` 全是渲染态 vite HMR 瞬态"。⇒ 精确表述与 captain 的更正**一致**，无需改判；本报告已按"0 uncaughtException"口径复述。
2. **「日志无异常」只在 dev 成立 —— 与我 §6（原文）一致**：`LOG-ANALYSIS-dev-vs-packaged.md` §6 记录的正是**打包态 7 条 `uncaughtException: TypeError: … reading 'trim'`**（`02:38:33 / 03:15:12 / 03:17:23 / 03:51:01 / 04:36:35 / 07:15:10 / 10:43:37`，前 5 次来自已安装 1.0.2/1.0.3，后 2 次来自 `dist\win-unpacked` 的 `index.js:1453:47`），且修复后 7 次 boot 零异常。⇒ **我从未把 dev 结论外推到打包态**；差异正是 t22/t23 所修的缺键缺陷。

### §6.4 锚点归属更正

- `src/main/index.ts` `13562 B / 10:43:10Z / dabd3b68d59e` 包含 **t16 + t18 + t21 + t23 四次写入**（我此前只写 t16+t18，属归属不全，已更正）。
- 新锚点：**`src/main/store.ts`（t22 写入）`7efc2b632049 @ 10:51:12.879Z`**（本报告 §1 已列，现明确标注其归属）。

### §6.5 关于 captain 引述的"我这两次记录"的出处核对（如实）

我在自己的证据目录全文检索 `ECONNREFUSED` 与 `180000`：
- `ECONNREFUSED 127.0.0.1:9222（退出码 1）` 命中 **`.devdata/t13-evidence/t27-ai-tools-readonly-checks.txt`** 与 `t27-probe-attempt-by-ai-tools.txt`（19:32，**t27 = ai-tools 的任务**）；
- `evaluate timed out after 180000ms` 在 `.devdata/**` 无我的产物命中（唯一文本命中在 `user\Cache\Cache_Data` 的 Chromium 缓存块里）；
- 我这侧**确有**的形态是 `METHOD-probe-exitcode-vs-liveness.md` §2 的 A–D/G（原措辞"实例死亡/消失"，依据仅为"探针未落盘/退出码非零"）与 F（`0xC0000409` + `9222` 不可达）。
**若那两条来自我更早（上下文压缩前）的口头记录、未落盘**，我检索不到、也不否认；但**无论归属如何，它们同样不是 `0xC0000409`**，故 §6.1 的并列裁定与我的结论一致：**退出码不作任何一方的证据**。

**补充：工作区级检索结果（20:36，扫描范围 = `.devdata/**` 下 `*.log/*.txt/*.json/*.md/*.out`、排除浏览器缓存目录、单文件 <3 MB，共 635 个文件）**

| 记录 | 命中位置 | 归属判定 |
|---|---|---|
| `ECONNREFUSED 127.0.0.1:9222`（exit 1） | `.devdata/t13-evidence/t27-ai-tools-readonly-checks.txt:27`、`t27-probe-attempt-by-ai-tools.txt:4,14` | **t27 = ai-tools 的产物**（不是我的、也不是 t21 的） |
| `evaluate timed out after 180000ms`（exit 0） | **唯一命中 = 本文件 `:125`（我在引用 captain 的说法）** | **无任何可引用的产物** |
| `0xC0000409` / `-1073740791` | 未在上述范围内命中（另见 `.devdata/t6-evidence/T6-LYRICS-OFFSET-CORRECTION.md:86` 的早期文字记录） | 我的 METHOD §2 表 F |

**与 captain 消息中"那两条来自 quality 的 t21 两轮（`t21-playback.log`/`t21-playback2.log`）"不符**：这两个文件名在 `.devdata/**` 中**不存在**（同类仅 `.devdata/build-t21.log`、`.devdata/cors-playback.log`、`.devdata/cors-playback2.log`，且它们**不含**上述任一字符串）。
⇒ 结论不变（**两者都不是 `0xC0000409`**，并列裁定照旧），但**出处应按上表更正**：一条属 t27，一条在磁盘上无产物。**检索范围已如实给出**，若 captain/quality 手上有范围外的落盘位置，请给出路径，我立即复核并改判。

## §7 非阻塞 backlog（不在 1.0.4 范围，发布后从容处理）

### §7.1 `diag-*.mjs` 一族的 `#mini` 主目标坑（captain 裁定：本轮不修）

**问题**：部分脚本用**内联**匹配挑选主窗口（`t.url.includes('localhost:5173')` 或 `/localhost:5173\/$/`），**未排除 `#mini` 窗口**。当迷你窗已打开时，`list.find(...)` 可能先命中 `http://localhost:5173/#mini` —— 而**该 target 没有 `window.__nebula`**，脚本会在 `awaitPromise` 上挂起或直接失败。这是一类"只在迷你窗开着时才出现"的假故障。

**实测计数（本地 20:0x，逐文件全文扫描）**

| 类别 | 数量 | 说明 |
|---|---|---|
| **有风险**：引用 `localhost:5173`、**不**走共享库、**无** `#mini` 守卫 | **22** | 19 个 `diag-*.mjs` + `e2e.mjs` + `probe-settings-readmerge.mjs` + `probe-transcode.mjs` |
| 内联匹配但**已带** `#mini` 守卫 | 8 | `diag-ai-queue / diag-autonext / diag-chain / diag-mini-lyric / diag-modes / diag-queue-ctx / diag-recommend / diag-v3` |
| **已走共享 `mainTarget()`**（`verify-lib.mjs`，内含 `type==='page' && url.includes('localhost:5173') && !url.includes('#mini')`） | 21 | 全部 `verify-*` 探针 + 两个新探针 |

**建议方案（不是 22 处各打一个补丁）**：把风险脚本统一改为 `import { cdp, mainTarget, targets } from './verify-lib.mjs'`，即**把主目标选择收敛到单一实现**；顺带它们便自动获得"启动期 boot 轮询"（`typeof window.__nebula === 'object'`）与超时保护 —— 后者正是"未启动的 renderer 让 `awaitPromise` 挂起"这一坑的通用解。**一处小重构，而非 22 个文件的散点改动。**
**为何不在本轮做**：① 该族已被 t11 **排除出安装包**、不面向用户；② 我的取证全部走共享 `mainTarget()`，**当前结论不受影响**；③ 打包前引入 22 个文件的改动，每轮都要再过一次验证，收益不成比例。



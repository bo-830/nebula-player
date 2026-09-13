# t42 — r3 正式审查报告（NEBULA Player 1.0.4 发布前终审）

- 审查人：reviewer（独立评审；**未修改任何 `src/**` / `scripts/**` 实现代码**）
- 被审对象：r3 修复波 **t33**（R1+R3）/ **t34**（R2+R4(b)(d)）/ **t36**（R4(a)）/ **t37**（R4(c)）/ **t40**（mediaRoots 抽取+不变量）/ **t44**（A2 共享模块+真实回归），及独立验证 **t41**
- 本轮一次性给出 **verdict**（见 §7），并逐条回应 captain 指定的 10 项裁决

## 0. 第 0 步（实时退出码 + 时间戳 + 现场重算锚点）

| 项 | 值 |
|---|---|
| 第 0 步时刻 | **2026-09-12T20:26:56+08:00**（本地）/ `12:26:56.299Z` |
| 现场重算锚点（`snapshot-fingerprint.mjs --label t42`） | **`f3af2602396eb2da5feb3469005f0b1a45da10c2`**，**76 文件**，newest src mtime `2026-09-12T12:13:26.648Z` |
| 与 t41 落盘锚点比对 | **逐字相同**（t41 §5 冻结声明同为 `f3af2602…` / 76 文件）⇒ **同树成立**，未出现 r2→r3 的变化 |
| 门禁（`verify-lint-tests.mjs --label t42`，stamp `12:26:57.841Z`）**逐项值** | `lint.exitCode=0`、`lintJson.totalErrors=**0**`、`totalWarnings=**1**`、`filesWithErrors=**0**`（`lintErrorFiles` 空）、`typecheck:node=**0**`、`typecheck:web=**0**`、`tests.exitCode=**0**`、`Test Files **14 passed**`、`Tests **141 passed** / failed 0` |
| 我自己的 `eslint --no-cache --format json .` | **75 文件 / 0 error / 1 warning**（唯一 warning = `TrackList.tsx:42`，已接受）⇒ 范围「`src/**` + 根配置」 |
| 我自己的 `npm.cmd test -- --reporter=dot`（独立复跑） | **exit 0 / 14 files / 141 passed**（逐文件：sleepTimer 20、mediaRoots 9、recommend 6、miniLyricsDedup 8、lyricsOffset 17、search 9、mediaFormats 6、format 4、queue 9、lrc 9、llmClientToolIds 4、scanner 12、playerStoreSleep 15、chatConfirm 13）；与 t41 的受制裁资产计数**逐一吻合**，且媒体格式面从「6 真 + 5 复刻」变为「6 + 8 真」 |
| 冻结复核（取证结束时重算，`--label t42-post`，`12:32:02Z`） | 仍为 **`f3af2602…` / 76 文件** ⇒ **我的全部取证都在同一棵冻结树上完成**（步首 12:26:56Z 与步末 12:32:02Z 一致） |
| 基线比对 | 118 tests（r2）→ **141**；11 files → **14**。**无下降** ✓ |
| 门禁读法（裁决 10） | 采信：`scripts/verify-lint-tests.mjs` **无 `process.exit`**（末行 `writeFileSync`，`:218`）⇒ 其自身退出码恒 0，**只有 summary 的逐项值有效**。t41 报的 0/0/0/0 + 141 passed 与我复跑一致 |

## 1. captain 指定 10 项裁决（逐条：采纳 / 不采纳 + 理由）

### 裁决 1 — R1 BLOCKER 是否真闭合：**采纳「已闭合」**
证据链（三方独立）：
- **代码**：`mediaRoots.ts:57` `pending: Promise<string[]> | null` 取代布尔闩锁；`get()`（`:81-90`）把**同一个 promise** 交给所有并发调用者，并以 `if (pending === promise)` 守卫防止陈旧 populate 覆盖；`set()`（`:92-95`）/`refresh()`（`:97-100`）可整体替换/重算（**不再是 write-once**）；`staticRoots` 是**函数**（`:28`，populate 时才求值，兼容 dev 的 `app.setPath('userData', …)` 晚于模块加载）。`protocol.ts:145` 在包含性判定**之前** `await roots.get()`；`setMediaRoots()`/`refreshMediaRoots()` 导出（**不再是死代码**）；`ipc.ts:114-115` 在扫描后 `await flush()` → `await refreshMediaRoots()`。
- **单测不变量（t40，9 例）**：`mediaRoots.test.ts:14` 四个并发 `get()` 必须都拿到**已填充**集合且同一数组；`:80` 首次 populate 后**新增目录经 refresh 生效**；另有 `:41/:66/:94/:108/:119/:141` 覆盖只读库一次、懒求值、丢弃已消失目录、`set()` 可见、in-flight `set()` 胜出等。
- **运行期判别（t41 §3sexies）**：从未扫描过的新目录 → 扫描**前**被拒（`error/code 4`）→ `libraryScan` 曲库 7→8 → 扫描**后立即**可播（`loadeddata/duration 8`），+500/2000/5000ms 与再扫均可播 → 收尾 `libraryRemove` 复原 7。
- **判别方法有效性（我独立判定）**：`?n=<nonce>` **成立** —— ①应用侧 `pathFromRequest` 只用 `new URL(url).pathname`（查询串对服务端完全透明，我已在 r2 与本轮两次核过该函数）；②nonce 使 URL 在浏览器侧成为**新资源**，规避了「同 URL 复测」的缓存/失败态粘滞（t41 自曝第一版探针正是因此假阴性，改用 nonce 后得到干净判别）；③更关键的是该构造**自带 A/B 对照**：同一个新鲜文件、同样是 nonce 新 URL，唯一变量是**根集合是否已包含该目录**（扫描前后），因此「前拒后放」只能由根集合变化解释。
- **并发封面（R1 判别性第二项）**：4 路并发 `<img>` 全部 `load / w=512` ✓。t41 如实声明「主窗首屏可能已预热封面、CDP 侧无法消除」，并把**冷启动空集合窗口**交给确定性单元不变量（`mediaRoots.test.ts:14`）+ `protocol.ts:145` 的 await 钉住 —— 我认可这一分层：运行期给出端到端可用性，单测给出并发窗口的确定性保证。**采纳闭合**。

### 裁决 2 — R2 是否足以证明 400 后门关闭：**采纳「已闭合」**
- **代码（我自己核过）**：`llmClient.ts` 有 `fallbackToolCallSeq` + `FALLBACK_TOOL_CALL_PREFIX='call_auto_'`，两条路径都用**进程内唯一**回退 id（`:198`、`:213`），且返回值统一过 `withUniqueToolIds(...)`（`:193`、`:210`，含 `while (seen.has(id))` 去重）；`chatStore.ts:442` 在工具循环入口调用 `dedupeToolCalls(incomingToolCalls)`（`:411` 定义）⇒ **双层防护**（铸造层 + 消费层）。
- **运行期（t41 §3septies）**：mock 网关三链路 `errors400` 均为 `[]`；确认路径 park → 确认后歌单 2→1；取消路径歌单不变且回填「用户已取消该操作…」；transcript 显示第 2 轮 = 第 1 轮 + `assistant.tool_calls(call_rm_1)` + `tool(call_rm_1)` ⇒ **每个 `tool_call_id` 恰一条 tool 回复、上一轮 tool 消息未被覆盖**；非破坏性链 `search→search→play` 自动执行。
- **互补覆盖**：t41 如实说明 mock 链与「同一工具两轮调用 + 供应商省略 id」互补，后者由 `llmClientToolIds.test.ts`（4 例）在单测层覆盖。
- **残留（我判定为 LOW，非阻塞，见 §5-B10）**：`llmClient.ts:174` 仍是 `const i = tc.index ?? 0` —— 供应商省略 `index` 时并行调用会被合并进槽 0（id/name/args 拼接）。合并后经 `withUniqueToolIds` 仍是**合法消息序列**（不会 400），但该次调用大概率落到「未知工具」，属**既有**健壮性缺口。**不构成本轮 blocker**，建议进 backlog。

### 裁决 3 — R3 `will-redirect` 只有静态矩阵：**判定「不构成阻断性缺口」，采纳为「代码路径保证 + 记录为证据缺口（LOW）」**
- 代码：`index.ts:152-166`，同一个 `guard` 注册到 `will-navigate`（`:159`）与 **`will-redirect`（`:165`）**，白名单是**同一份** `isAppPage`；`:160-164` 注释写明动因（`will-navigate` 是主帧作用域、不覆盖重定向，否则可信源的一次 302 就能把外部页拉进 `sandbox:false` + 完整 `window.api` 的渲染器）。判定矩阵覆盖：dev 5173/127.0.0.1:5173/5174 **放行**（不误伤 HMR）、外部 https **拒绝并记日志**、打包态 `file:` 前缀外 **拒绝**、`media://`/自定义 scheme/不可解析 **拒绝**、`window.open` **一律 deny**（http/https 交 OS 浏览器并 settle promise）。
- **为何不构成阻断缺口**：①`will-redirect` 是可 `preventDefault()` 的 Electron 事件，属**代码路径保证**，且与 `will-navigate` 共用同一判定函数，逻辑面不依赖时序；②威胁面为 **dev 模式**（打包态加载 `file://`，不存在可被外部 302 接管的导航源），而 dev 来源是本机 electron-vite；③要拿到运行期证据需架一个**会 302 的重定向服务器**并驱动应用导航 —— 属额外的实例工装，对 1.0.4 的发布风险贡献极低。
- **记录为证据缺口（LOW，进 backlog）**：建议下一轮补一条 E2E（本地起 302 服务器 → 断言导航被拦、日志出现 `[security] blocked navigation`）。另有界注意：dev 端口若被 5175 等白名单外端口接管，该重定向会被拒（t41 §3ter.2 已如实标注）。

### 裁决 4 — R4(a)–(d) 证据强度与「证据分层」：**采纳「已闭合」，并明确不接受把副本证明说成真实变异**
- **F5（R4c）**：真实变异来自 **audio-engine**（`MiniPlayer 8A219676275A` → `5BBC4BBE9941` → 还原；vitest **exit 1 / 16 passed / 1 failed**，失败用例唯一）与 **quality**（窗口 A，`1 failed | 16 passed`），且**captain 只读核验哈希一致**；**t41 自己那一路是「忠实复刻 + 副本取反」**（契约把 `src/**` 列 outOfScope），其结论是：真实面板 guard PASS（heads = `currentTime + 0.12 + offset`、`display + 0.12 + offset` ×2），副本取反 → 三个 head 全 null → **回退断言 `expect(inlineArithmetic).toHaveLength(0)` 失败（计数 2）**。
- **我的判定**：该组合**满足 R4(c)**，理由：①真实变异确实做过、且有两方独立记录与 captain 的哈希核验；②副本一路复刻的是**同一 OFFSET_TERM / 同一三个 head / 同一三条 expect / 同一回退分支**，因此它证明的是**断言逻辑的判别力**，而真实变异证明的是**这些断言确实咬住真实文件**；③我本人复核了 test 断言与两组件公式的对应（见 §1 裁决 4 附）与「取反必然不匹配 OFFSET_TERM（要求 `+`）」。**但必须明确写成「副本证明 ≠ 真实变异」**，不得混同（t41 §4 注 1 已如实声明，我采纳其写法）。
- **R4(a) F7(b)**：`playerStoreSleep.test.ts:267` 为新判别性用例（多轨 `['a','b','c'] + index 1 + mode:'one'`），`:299` 保留单轨非回归面；`sleepTimer.ts:121` 是 `queue`+`one` 的唯一 stop 分支，删除即落 `:122-124` 返回 `advance` ⇒ 该用例必失败（t36 提供作者侧变异：改空块 ⇒ 用例失败；还原后 SHA256 一致、15/15 复绿）。
- **R4(b) A2**：`MiniPlayer.tsx:8-11` 从 `../lib/miniLyricsDedup` 导入、`:57` 调 `claimLyricsRequest(claimed, id)`；`miniLyricsDedup.test.ts` 导入**同一生产模块**；t44 的作者侧变异证明「改回永远 claim ⇒ 测试变红」。**测试侧复刻已被移除**（见裁决 5）。
- **R4(d)**：`recommend.test.ts:70` 已改为**精确分数**断言（播放过 4.0 vs 未播 7.6，并注明惩罚弱化为 −0.1 会得 5.7 ⇒ 失败）；旧断言靠标题 tie-break 通过的问题已消除。

### 裁决 5 — t44 的 `mediaFormats.test.ts` 11 → 6：**采纳「只删了复刻」（合法）**
- 现状（我自己读的）：`mediaFormats.test.ts` 仅剩 **6 个** `needsConvert` 用例（`:5/:11/:16/:22/:28/:34`），**原「mini window lyrics dedupe (A2 rule)」5 条复刻用例已全部移除**。
- 迁移去向：新增 `src/renderer/src/lib/miniLyricsDedup.ts`（2510 B，纯 TS）+ `__tests__/miniLyricsDedup.test.ts`（5073 B），且 `MiniPlayer.tsx` 导入**同一**生产函数 ⇒ 该规则现在由**真实回归测试**驱动，而非测试侧镜像。
- **是否删掉了真实断言**：否。被删的 5 条在原文件里断言的是**测试本地 `newWindow()` 复刻**的 `fetches/painted`（我在 r2 的 R4(b) 已判定其为假验证）；对应的**真实**断言以更小的形式存在于新模块测试中。
- **总数未降**：11 files/118 tests → **14 files/141 tests**（我复跑确认）。

### 裁决 6 — 见证层「null 即通过」与「取证用例不可删」原则：**采纳为「可接受的发布后 backlog」，但需精确表述**
`lyricsOffset.test.ts:282-340` 的 witness 守卫：读两组件源码，用 `OFFSET_TERM = '((?:[A-Za-z_$0-9.][\w$.]*\s*\+\s*)*offset)(?![\w$])'` 匹配「至少一个 `+` 之后的 offset」。**取反 ⇒ 不匹配 ⇒ head 为 null** ⇒ 进入 `:321-330` 分支：
```
if (heads.some((h) => h === null)) {
  const inlineArithmetic = [lyricsPanel, miniPlayer].filter((f) => f.includes('offset') && f.includes('0.12'))
  expect(inlineArithmetic).toHaveLength(0)   // ← 取反后两文件仍含 offset+0.12 ⇒ 断言失败
  console.warn('…re-point this witness at the shared helper')
  return
}
```
- **我的判定**：这条 `null` 路径**不是无条件静默通过** —— 它只在「两面板都不再内联 offset 算式」时才可能通过（即已改为委托共享 helper，届时该断言 `toHaveLength(0)` 仍会拦住「残留内联算式」的情形）。**真正的取反**（`+ offset → - offset`）会因文件仍含 `offset` 与 `0.12` 而**失败**，t41 的副本实验正是这一结论（计数 2）。
- **残留风险（LOW，进 backlog，与 captain 的 1.0.4 不修裁定一致）**：若将来把面板重构为「调用共享 helper 且 .tsx 中不再出现 `0.12`/`offset` 字面量」，该 witness 会走 null 路径并仅打印警告 ⇒ 需**同步把见证点改指共享 helper**。当前树两面板均内联，故有效。
- 「vitest 纯 node 无 jsdom ⇒ 无法 import `.tsx`」这一约束确实存在，因此「模块级测试守语义 + 源码级见证守调用点」是**互补**而非重复；我认可这一分层，1.0.4 不做面板重构。

### 裁决 7 — 污染窗口与证据完整性：**采纳 verifier 的处置「充分」，并附一条我实测到的加强理由**
- 事实：窗口 A（`12:17:03Z–≤12:17:31Z`，quality，`MiniPlayer.tsx`）与窗口 B/C（audio-engine，`LyricsPanel.tsx` + `MiniPlayer.tsx`，时刻未取到）是**变异实验的临时写入**；captain 的窗口关闭锚点为 `12:23:16Z`（`MiniPlayer=8A219676275A` / `LyricsPanel=32F8656D5F1B`）。
- **我实测到的关键点（加强「按内容哈希取样」而非「按时刻比对」的正当性）**：当前磁盘上 `MiniPlayer.tsx` 的 **mtime = 20:10:42 本地 = 12:10:42Z**，**早于**其被声称参与变异的 12:17 窗口，而**内容哈希 = `8a219676275a`**（与关闭锚点一致）。⇒ **mtime 在本仓不可作为「是否被改动过」的证据**（变异+还原可能保留/回写 mtime）。反之，**内容哈希 + 聚合哈希**才是可靠原始量。
- 因此：verifier 以「取样时记录当时两面板 sha1」取代时刻比对，**方向正确且是可行范围内最强的手段**；再加我把 `src/**` 聚合 sha1 在 t41 窗口前后与**我自己的 12:26:56Z 重算**三方对齐（均为 `f3af2602…`），可判定：**任何可能的临时变异都已按字节还原**，运行期结论所依据的代码与发布代码一致。
- **信任边界（如实声明，非缺陷）**：哈希记录的正确性依赖记录者**取样时点的诚实性**（无法事后独立复算），故此层是「信任 + 交叉印证」，最终由 **t43 打包态长跑**兜底。

### 裁决 8 — 同树原则：**采纳，t41 做到了**
- t41 §5 明确 `t41-run2-pre f1899dcb…` → 窗口 → `f3af2602…`（76 文件）；§3quinquies 给出**漂移界定**：窗口内只有 `miniLyricsDedup.ts`（t44）变化，且列出**运行期相关文件逐字节相同**（`protocol 28a7dc33ad52`、`mediaRoots da4fd2c14a4a`、`ipc 58c2b55ce5fb`、`index 18ef7c49c2eb`、`mini ec39b42b3172`、`audioEngine e01f4c0d66d5`、`MiniPlayer 8a219676275a`）。
- **r2 树证据未被跨树顶替**：t26 的 r2 缺口仍标为 r2 树；A1 在 r3 树**重跑**（§3sexies：针对 `MiniPlayer 8a219676275a`，时钟冻结 14.95，offset 0→+0.5→0 跨过 15.50 行并回退，两窗逐步一致，迷你窗直读 `localStorage` 命中），并**明确作废旧轮产物**（「上一轮 20:05 产物按规则声明作废，以本文件为准」）。⇒ 本条**采纳**，无跨树顶替。

### 裁决 9 — 两处 attribution 更正：**采纳**
- ①**t40 的 owner 是 quality**（面板：`t40 [completed] → quality`；产物 `src/main/mediaRoots.ts` + `src/main/__tests__/mediaRoots.test.ts`，含倒退实验 5 failed / 4 passed）。凡把该产物记到 verifier 名下的清单均属误记。
- ②**字节重复的证据对不得并列引用为两路独立证据**：`t22-readmerge-proof.txt ≡ t29-readmerge-probe-live.txt`（`649974d53f70`）、`t22-verify-settings-backup.json ≡ t31-settings-backup-before-fixture.json`（`c92586a029b6`）—— 属**同一次测量的两个副本**。（哈希由 captain 给出，我在 §1 附注中不将其计为独立路数。）

### 裁决 10 — 门禁读法：**采纳**
见 §0 表：只读逐项值，**不采信 runner 自身退出码**；`lintErrorFiles=0`、`lintJson.totalErrors=0`；基线 14 files / **141 passed 不得下降**（t41 与我复跑一致）。

## 2. findings 逐条闭合对照（承接 r2 的 F1–F14 / A1–A10 / R1–R15）

| r2 编号 | 内容 | r3 状态 | 依据 |
|---|---|---|---|
| **R1（BLOCKER）** | allowedRoots 闩锁 + 死刷新入口 | **已闭合** | 裁决 1（代码 + 9 例不变量 + 运行期前拒后放 + 并发封面） |
| **R2** | llmClient 回退 tool id 撞车 | **已闭合**（残留 LOW：`index ?? 0` 合并，见 §5-B10） | 裁决 2 |
| **R3** | 缺 `will-redirect` | **已闭合（代码路径）**；运行期证据缺口记 LOW backlog | 裁决 3 |
| **R4(a)** | F7(b) 用例恒真 | **已闭合** | 裁决 4 |
| **R4(b)** | A2「单测」为测试侧复刻 | **已闭合** | 裁决 4 + 裁决 5 |
| **R4(c)** | F5 符号无守卫 | **已闭合** | 裁决 4（真实变异 + 副本） |
| **R4(d)** | `recommend.test.ts` 两条既有空转 | **已闭合** | 精确分数断言（4.0 vs 7.6） |
| **R5** | 转码缺「产物非空」后置校验 | **仍开放（既有，LOW/MED）→ backlog** | 未在 r3 范围内（captain 列为可选） |
| **R6** | 转码临时名不唯一 + `fs.rm` 删并发产物 | **仍开放（既有）→ backlog** | 同上 |
| **R7** | `store.ts` 写链一次失败即永久污染 | **仍开放（既有）→ backlog** | 同上 |
| **R8** | 包含性无 `realpath`（符号链接逃逸） | **仍开放（LOW）→ backlog** | 未在本轮范围 |
| **R9** | `rel.startsWith('..')` 过宽（`..name` 合法文件被拒） | **仍开放（LOW）→ backlog** | 未在本轮范围 |
| **R10** | 无 `st.isFile()` 门 | **仍开放（LOW）→ backlog** | 未在本轮范围 |
| **R11** | 解码缓存键不含 mtime/size | **仍开放（LOW，既有）→ backlog** | 未在本轮范围 |
| **R12** | store 叶子默认值无 `typeof` 校验 | **仍开放（LOW）→ backlog** | 未在本轮范围 |
| **R13** | park 期间叙述不可见 / `finalText` 死字段 | **仍开放（LOW）→ backlog** | 未在本轮范围 |
| **R14** | 错误重试静默清 track 定时器 / 注释与代码矛盾 | **仍开放（LOW）→ backlog** | 未在本轮范围 |
| **R15** | 其余信息项（`__proto__` 键、suffix range、host 未校验、ADS 形态、注释过期、弱断言） | **仍开放（LOW）→ backlog** | 未在本轮范围 |
| **F1–F8/F13/F14、A2/A3、F9–F12** | r2 已闭合项 | **保持闭合**（本轮未见回退） | t41 质量门 + 我复跑 |
| **A1** | 迷你窗偏移同步判别性 | **已闭合（r3 树重跑 7/7）** | 裁决 8 |
| **F3 反面** | 越权被拒 | **已闭合（r3 树 6/6）** | 裁决 8 + t41 §3quinquies/§3ter |
| **P0（缺键崩溃）** | 读取期递归补键 | **保持闭合**（§3.1 双路 + t31 现场 exit 0） | 前轮 + t31 |
| **AAC/APE 转码** | `-f mp4`/`-f wav` | **保持闭合**（分支级 12/12 + t41 §3bis 运行期整链） | 前轮 + t41 |
| **进程级死亡** | `0xC0000409` | **仍未闭合**（环境/基础设施） | t41 §3quinquies 并列裁定；**以 t43 打包态长跑为唯一判定台** |

## 3. 新回归评估（逐面）

**越界核对（r3 差异清单）**：t41 §1 给出 `r3 vs r2` 的**逐文件 sha1 对比** —— 新增 3（`mediaRoots.ts`、`mediaRoots.test.ts`、`llmClientToolIds.test.ts`）+ 修改 12（`protocol/index/ipc/llmClient/chatStore/MiniPlayer/recommend/recommend.test/mediaFormats.test/chatConfirm.test/lyricsOffset.test/playerStoreSleep.test`），**全部可归属到 t33/t34/t36/t37/t40**，无未归属文件；`decodeService.ts` 两侧同为 `df1c81800a0d`（t24 的 `-f` 修复未被触碰）。⇒ **本轮无越界改动**。

| 面 | 结论 | 依据 |
|---|---|---|
| 播放队列 | 无新回归 | 质量门 141 tests 全绿；F1 回绕（t41 复跑通过；我方 r2 探针输入未变） |
| 歌词 / 迷你窗 | 无新回归 | F5 见证守卫 + A1 r3 树 7/7 + 迷你窗关闭存活 4/4 |
| AI 消息序列 | 无新回归 | R2 三链路 0×400 + `llmClientToolIds` 4 例 |
| 媒体链路 / 频谱 | 无新回归 | F3 反面 6/6、`--sustained` 12/12、5 格式 `anonymous` 有信号而 `unset` 对照 0 |
| 打包面 | 无新回归（待 t43 实证） | `electron-builder.yml` 未变（mtime 07:12:31Z）；asar 复核与 `/S` 覆盖安装属 t43 范围 |
| 包含性/白名单语义 | **未退化** | `protocol.ts:145-151` 仍「先 `await roots.get()` → 403 → 白名单 404」；`isInsideRoots` 仍用 `relative()` + `..`/绝对逃逸判定 |
| 扫描→刷新接线 | **正确且顺序有据** | `ipc.ts:114-115`：先 `await svc.library.flush()`（库是 400ms 防抖持久化，先刷新会读到尚未含新曲的 `library.json` 而成为 no-op）→ 再 `await refreshMediaRoots()`；注释已写明理由 |

## 4. 是否存在新的空转/假验证

- **本轮新增/改造的用例**：F7(b) 多轨+one（t36）、A2 共享模块（t44）、F5 源码见证（t37）、mediaRoots 9 例（t40）、recommend 精确分数（t34）—— 逐条按「回退即失败」核验，**未发现会产生错误绿灯的判定缺陷**。
- **已消除的假验证**：`mediaFormats.test.ts` 的 5 条测试侧复刻（裁决 5，逐名核对后确认**全部迁移为真测试或真断言**，无真实断言被删）；`recommend.test.ts:74/:77-83` 两条既有空转（裁决 4 R4(d)）。
- **独立空转扫描结果（我方只读审计 + 我本人复核）**：
  | id | 位置 | 性质 | 级别 |
  |---|---|---|---|
  | **B14** | `MiniPlayer.tsx:56-57, :65` | **A2 的「规则」已具判别性（变异 C/D 均失败），但「组件接线」无测试覆盖**：把组件回退为「无条件 `setLines` + 不调 `claimLyricsRequest`」的旧写法，**14 files / 141 tests 全绿**。⇒ R4(b) 的**假验证（测试侧镜像）已真正消除**，但组件调用点仍无回归网。**当前产品行为正确**（代码读取 + t41 运行期证据均一致），故**非 blocker**；修复需 jsdom+testing-library 组件测试，或把「push→claim→accept」整段序列并入 `miniLyricsDedup.ts` 使组件成为纯调用方（属 1.0.4 之后的结构性改进） | 测试质量 MEDIUM（非阻塞） |
  | **B12（升级）** | `lyricsOffset.test.ts:321-330` | 见证守卫的 **null 逃逸路径**：仿真证明「把 grace 字面量 `0.12` 改名 + 两面板取反」或「把算式抽到 helper（即便 helper 内已取反）」都会**PASS(warn)** ⇒ 守卫在当前布局之外退化为空转。建议 `expect(heads).not.toContain(null)`（面板重构不在 1.0.4 范围，故未命中应视为**回归信号**而非豁免）；**当前树有效**（单侧与双侧取反均失败，已由真实变异 + 仿真双向证明） | 测试脆弱点 MEDIUM（非阻塞） |
  | **B13** | `lyricsOffset.test.ts:212-225 / :231 / :260` | 三个「符号」用例中有**两个只经测试本地镜像**（`activeIndexAt`/`activationInstant`），与刚被删掉的 A2 复刻属同类反模式；生产耦合仅 `:282` 一处（文本级） | 测试质量 MEDIUM（非阻塞） |
  | **B15** | `chatConfirm.test.ts:141` + `:154` | `const before = …trackIds` 是**活引用**，就地变异（splice/清空）检测不到 ⇒ 该用例「未改动」的语义有空隙 | 测试质量 MEDIUM（非阻塞） |
  | **B16** | `recommend.test.ts:124` | 仅断言「不存在」（`toBeUndefined()`）而无长度断言 ⇒ `recommendTracks` 返回 `[]` 也会通过 | 测试质量 LOW（非阻塞） |
  | **B17** | `llmClientToolIds.test.ts:72`、`sleepTimer.test.ts:184-186/:188-190`、`queue.test.ts:36`、`playerStoreSleep.test.ts:180/:209/:226-227` | 重复/被上位断言蕴含的点检（删掉或换独立输入） | 测试质量 LOW（非阻塞） |
  | **B18** | `playerStoreSleep.test.ts:47-50` | localStorage stub 只记录 value 不记录 key ⇒ 用**别的 key** 持久化检测不到 | 测试质量 LOW（非阻塞） |
  | **B19** | `llmClient.ts:174` `tc.index ?? 0` | 供应商省略 `index` 时并行调用合并（消息序列仍合法，调用退化） | 既有健壮性 LOW（非阻塞） |
  补充：全仓无 `it.skip`/`describe.skip`/`it.todo`/`.only(`；未发现不可达用例。
- **结论**：**无 blocker**。上述均为**测试质量/证据强度**问题（产品行为不受影响，当前代码在运行期已被 t41 独立取证），按 captain 的 1.0.4 口径进 backlog。

## 5. 非阻塞 backlog（**不写入 findings、不影响 verdict**）

| id | 项 | 性质 |
|---|---|---|
| B1 | `audioEngine.ts:410/429` `released` 标签代际差 1（仅诊断字段） | 既有/信息 |
| B2 | `audioEngine.ts:205/243-251` `unlock()` 无超时 | 既有 |
| B3 | `audioEngine.ts:161-179` `ensureGraph` 抛错路径元素被占用 | 既有 |
| B4 | CORP 后续候选（需全 `media://` 子资源加 `crossOrigin` + 5 格式/封面全量回归） | 已裁定后置 |
| B5 | `diag-*.mjs` 的 28 处 `#mini` 坑 | 工装 |
| B6 | MediaImage → `data:` 候选 | 优化 |
| B7 | 三个 CSS 文件不符合 prettier 默认格式（不在 lint 门禁内） | 信息 |
| B8 | `eslint.config.mjs` 的 `scripts/**` 目录级 ignore（可改 scoped 覆盖并保留 `no-unused-vars`） | 口径 |
| B9 | 测试侧弱断言（见 §4 末） | 测试质量 |
| B10 | **新增**：`llmClient.ts:174` `tc.index ?? 0` 在供应商省略 `index` 时合并并行调用（消息序列仍合法，但调用会退化） | 既有健壮性 |
| B11 | **新增**：R3 `will-redirect` 缺运行期 E2E（本地 302 服务器 → 断言拦截 + `[security] blocked navigation` 日志） | 证据缺口 |
| B12 | **新增**：`lyricsOffset.test.ts` 见证守卫的 null 路径需在「面板改委托共享 helper」时同步改指（否则退化为仅告警） | 测试脆弱点 |
| B13 | 迷你窗暂停态 seek 不刷新（captain 列入的既有项） | 既有 |
| B14 | `MiniPlayer.tsx:56-57/:65` **组件接线无测试覆盖**（A2 规则已具判别性，但把组件回退为旧写法仍 141/141 全绿）→ 建议 jsdom 组件测试，或把 push→claim→accept 整段并入 `miniLyricsDedup.ts` | 测试质量 MEDIUM（非阻塞） |
| B15 | `chatConfirm.test.ts:141/:154` `before` 为活引用 ⇒ 就地变异检测不到 | 测试质量 |
| B16 | `recommend.test.ts:124` 仅「不存在」断言、无长度断言 | 测试质量 |
| B17 | 重复点检：`llmClientToolIds.test.ts:72`、`sleepTimer.test.ts:184-190`、`queue.test.ts:36`、`playerStoreSleep.test.ts:180/:209/:226-227` | 测试质量 |
| B18 | `playerStoreSleep.test.ts:47-50` storage stub 不记 key | 测试质量 |
| B19 | `llmClient.ts:174` `tc.index ?? 0` 合并并行调用（消息序列仍合法） | 既有健壮性 |

（B12 见 §4：`lyricsOffset.test.ts:321-330` 见证守卫 null 逃逸路径，级别上调为 MEDIUM/非阻塞；B13 的同族项 `lyricsOffset.test.ts:212-225/:231/:260` 已在 §4 记为 MEDIUM。）

## 6. 未闭合开项

- **进程级死亡（`0xC0000409`）**：**仍未闭合**，归环境/基础设施（t41 §3quinquies「实例在取证期间消失」按并列裁定记账）。**唯一判定台 = t43 打包态长跑**（升级路径 ≥20s + 打包态冒烟）。**不构成本轮 blocker**。

## 7. verdict

**verdict = pass（0 blocker）**

判定依据（全部为可复核的现场取数）：
1. **锚点同树**：`f3af2602…`（76 文件）与我 12:26:56Z / 12:32:02Z 两次现场重算、以及 t41 §5 冻结声明**三方一致**；
2. **门禁逐项全绿**：lint 0 error / 1 warning、typecheck 0/0、tests 0（**14 files / 141 passed**），且我独立复跑 `eslint --no-cache`（75/0/1）与 `npm test`（141 passed）一致；
3. **r2 的 BLOCKER R1 已闭合**，且同时具备「结构级（缓存 Promise，任何并发调用者共享同一 populate）+ 确定性单测（`mediaRoots.test.ts:14` 并发不变量）+ 运行期判别（扫描前拒 / 扫描后即可播，cache-busted 对照）」三层证据；
4. **R2/R3/R4 逐条闭合**（R3 为代码路径保证，运行期 E2E 记 B11 证据缺口，非阻断）；
5. **未引入新回归**（队列/歌词/迷你窗/AI 序列/媒体链路/打包面逐面核对，§3）；
6. **未发现会产生错误绿灯的新假验证**；`mediaFormats.test.ts` 的 5 条测试侧复刻确认为「只删复刻、真断言已迁移」，总数 118→141 无下降；
7. 全部非阻塞项（B1–B19，含本轮新记的 A2 组件接线缺口、F5 见证逃逸路径）**均不影响产品行为**，且已按 captain 的 1.0.4 口径单列 backlog；
8. **进程级死亡（`0xC0000409`）** 仍为未闭合开项（环境/基础设施），唯一判定台 = **t43 打包态长跑**。

## 8. 提交后 addendum（R1 深审回话；**verdict 不变 = pass**，但含两条对 t43 的硬性提示）

提交 verdict 后，我方 R1 深审（拷贝级倒退实验 + 7 项对抗探针）回话，**结论与我的裁决一致：源码修订版里 BLOCKER 真闭合**，且给出量化证据：
- **拷贝级倒退**（`src/**` 未触碰，副本在 `.devdata/t7-review/roots-revert/`）：基线 9/9 通过；退回「布尔闩锁 + `refresh()` no-op」后 **5 failed / 4 passed**，五条失败断言分别落在：并发首次解析空集合（`:33 expected 0 to be greater than 0`）、扫描后目录缺失（`:91`）、二次扫描新目录（`:104`）、manual/in-flight 覆盖（`:137`）、未服务过即 refresh（`:148`）⇒ **判别力确凿**。
- **对抗探针**：64 个并发 `get()` → 仅 1 次读、返回同一已填充数组；`?n=` 服务端透明性由「从 `protocol.ts` 原样抽取 `pathFromRequest` 实跑」验证（`plain ≡ ?n=… ≡ ?n=…&x=1#frag`）。

**A-1（MEDIUM，对 t43 是硬性提示）—— `dist/win-unpacked` 仍是被打包的「旧代码」**
`dist/win-unpacked/resources/app.asar`（18:52:21）里仍是**旧闩锁实现**（`let rootsLoaded = false … ensureRoots(){ if (rootsLoaded) return; … }`，且**没有** `refreshMediaRoots`/`createMediaRoots`）；而 `out/main/index.js`（20:22:43）已含修复（promise 缓存 / `refreshMediaRoots` / handler 调用）。
→ **这不改变 verdict**（t42 审的是源码树；t43 契约本就要求 `build:win` **自建、不复用验证期 `dist/win-unpacked`**），但必须在 t43 里**显式验证**，否则会把 R1 的旧闩锁重新发出去。**建议 t43 加两条断言**：①构建后 `dist/**` 必须由本次 `build:win` 产出（比对时间戳/哈希）；②对**正式 asar** 内的 `out/main/index.js` 断言「**不含** `rootsLoaded`」且「**含** `refreshMediaRoots` 与 `createMediaRoots`」。**切勿从 `dist/win-unpacked` 取「已修复」证据。**

**A-2（MEDIUM，非阻塞）—— `libraryStore.flush()` 无写队列，可能让 `library:scan` 拒绝并使 refresh 落空**
`ipc.ts:114` 的 `await svc.library.flush()` 下游依赖一个**未串行化**的写：`LibraryService.flush()`（`libraryStore.ts:47-62`）没有像 `store.ts:140-153` 那样串 `this.writing`，于是 400ms 防抖定时器可能与 handler 的 flush **并发写同一个 `library.json.tmp`**，落败方 `rename` 得 ENOENT → `library:scan` invoke 拒绝 → **`refreshMediaRoots()` 不执行** → 新目录 403 直到重扫/重启（**与 R1 同症状的另一条路径**），UI 显示「扫描失败」。
- **性质**：**间歇性、可恢复（重扫即可）**，且**根因是既有实现**（r3 只在 `ipc.ts` 里 await 了 flush，未改 `LibraryService`）。同理 `mediaRoots.refresh()` 在库读取失败时会**整体替换**根集合（`populate` 的 `catch` 只保留静态根）⇒ 一次性读失败会让既有曲目中途 403（触发条件罕见：需要 library.json 不可读/解析失败）。
- **我的判定**：**medium、非 blocker**（产品在正常路径上确定可用；需要时序碰撞）。**建议**：①若要在 1.0.4 修——最小改动 = 给 `LibraryService.flush()` 加写队列 + 把 `refreshMediaRoots()` 包成 best-effort（try/catch + 记日志，使根目录刷新失败不致让扫描失败），修完需重走一轮验证；②若不修，请把「扫描在极窄时序下可能报失败、需重扫」记入 **1.0.4 已知问题**。

**其余（全部 LOW/信息，入 backlog）**：`mediaRoots.ts:83-88` 同步重入 `get()` 可绕过缓存（今日不可达，探针 P7）；`staticRoots()` 抛错会被缓存为**永久拒绝**（`:57/:67/:82`，实际不会发生）；`refresh()` 失败会清空库根（`:75-77/:97-100`）；403/404/416 分支未带 `Cache-Control`（`protocol.ts:147/150/160/168/175`，200/206 有 `no-cache`）；`setMediaRoots()` 仍是无调用方的死导出（`protocol.ts:50-52`，实际生效的是 `refreshMediaRoots`）。以上记为 **B20–B24**。

> **Verdict 复核**：以上无一项改变 pass 判定 —— A-1 属**打包产物陈旧**（t43 契约已覆盖，须显式验证）；A-2 属**间歇可恢复的既有竞态**（已升级为高优先 backlog 并给出最小修法与「记入已知问题」两条出路）。若 captain 选择在 1.0.4 内修 A-2，我建议**先暂缓 t43**、修完后以受控窗口重跑 R1 判别性（扫描即可播）再放行。

## 9. addendum 2（R2/R4 深审回话；**verdict 不变 = pass**，含一条对裁决 2 的精确化）

第二路深审用**拷贝级变异 + 真实模块探针**复核了 R2 与 R4，结论：**(2) F7(b) 与 (3) A2 真闭合**（F7(b)：删 `sleepTimer.ts:121` 恰好 1 例失败、`pause` 调用数 0；取反 3 例失败；A2：组件与测试经机器核验解析到**同一文件**，变异「总是认领」3 例失败、「总是绘制」2 例失败），**F5 三 head 与组件逐字符一致**（head[0..2] ↔ `LyricsPanel.tsx:78` / `MiniPlayer.tsx:89` / `:90`）。全套件 **14 files / 141 passed**（20:30:20，exit 0）。

**但 R2 的闭合需要精确化（对裁决 2 的修订，**级别仍为 medium/非阻塞**）**：
- **B-1（medium）跨轮「供应商自带 id 重复」仍会复现同类 400**。R2 的两层防护都是**每次响应 / 每轮内**的：`withUniqueToolIds`（`llmClient.ts:38-46`）只去重**同一次响应内**的重复 id；`chatStore.dedupeToolCalls`（`:411-420`，在 `:442` 应用）只作用于**本轮**的公告。于是若某网关**按响应重新编号**（`call_0`/`call_1` 风格），第二轮再次公告 `call_0` 时，`replaceToolMessage`（`:383-395`，`:388` 取**第一个**匹配）会**覆盖第一轮的 tool 回复** → 请求里出现「两条公告、一条回复」→ 旧 400 形态复现。真实模块探针（真 `llmClient` 喂真 `chatStore`，仅 IPC 打桩）实测：`ids = ["call_0","call_0"]`，最终请求 2 条公告但 `toHaveLength(2)` 得 1；换唯一 id 的对照通过。
  → **性质**：**既有设计**的残留（t3 的 `replaceToolMessage` + 每轮去重），**非 r3 引入**；触发需「跨轮重复 id」的网关（主流 OpenAI/DeepSeek 每次生成唯一 id，通常不触发）。**最小修法**：把 id 唯一性提升到 **run 级**（在 `completeToolCalls` 里维护 `seen`，对已公告过的 id 先铸造新 id 并**同时**改写 assistant 的 `tool_calls` 与本条 `tool` 回复），或在该情形下改为**追加**而非替换。
  → **我的处置建议**：默认**记入 1.0.4 已知问题 + backlog**（provider 条件性、非回归）；**若你们的 AI 目标网关属于「按响应编号」这一类，则应在 t43 之前修**（修完需重跑一轮 AI 链路的判别性验证）。请 captain 按目标环境决定。
- **B-2（low→medium）省略 `index` 的并行调用会被合并**（我在 t14 已记 R2 附带项、本轮 B19）：真实模块探针实测一次 delta 内两个无 `index` 调用 → 合并为**一条** `name="search_musicplay_tracks"`、args 拼接的坏调用（`[probe A1/A2]`）；带 `index` 的对照正常。**消息序列仍合法**（该坏调用会有恰一条回复），故只影响该次调用成败。**最小修法**：`tc.index` 缺失时按本 delta 的位置槽分配，并补一条「`?? 0` 会失败」的回归用例。
- **B-3（medium，测试脆弱性，与 §8 B12/C 同源）**：`lyricsOffset.test.ts:321-330` 的静默通过路径已被**影子树证明**：即便两个面板改为委托 `activeTime(...)` **且 helper 内把符号写成 `time + 0.12 - offset`**，套件**仍 17 passed**。⇒ 视觉/语义上的「F5 已钉住」只在**当前内联布局**下成立。修法同 B12（`expect(heads).not.toContain(null)` 或把 witness 指向 helper）。
- **B-4（low）**：`lyricsOffset.test.ts:209-225/:231-280` 的数值断言是**测试本地镜像**（自造 `GRACE` + `activeIndexAt`），永不会因生产改动失败（同 §4 的 B13）。
- **B-5（low，既有）**：`chatStore.ts:163-174` + `:538-543` —— `baseHistory` 已含本轮用户气泡，`runFrom` 又前置 `resume.userLlm` ⇒ **每次请求发送两遍用户消息**（探针 C 实测两条相同 user），属**既有**（t7 已记录），仅浪费 token / 可能触发严格角色交替网关。

**裁决 2 的最终措辞**：R2 的**回退 id 撞车（供应商省略 id）已闭合且有判别性用例**；但「供应商自带 id 跨轮重复」这一**子情形**仍会复现同类 400（**既有设计残留**），连同 `index ?? 0` 一并记入 backlog 并给出最小修法 —— **均不构成 blocker，verdict 维持 pass**。

## 10. addendum 3（证据完整性深审回话；**verdict 不变 = pass**，附「证据归档/表述」整改清单）

第三路深审专审 t41 报告的**证据完整性与 attribution**（不评产品行为）。**我先补自己的取数**：第三次现场重算（**`12:39:22Z`**，`--label t42-final`）**仍为 `f3af2602…` / 76 文件** ⇒ **源码树自始至终未动**，包括 verifier 在我提交 verdict 之后继续写证据的时段（其 `t41-f3refrozen-pre` 12:36:05Z 与 `-post` 12:36:34Z 亦同为 `f3af2602…`）。

### (1) 先记流程事实：证据语料在 verdict 之后仍在变

- `R3-VERIFICATION.md` 在审计期间被改写 **4 次**（12:31:31 → 12:33:04 → 12:35:27 → **12:36:43Z / 48903 B / sha1 `6b691ca96b18`**）；期间新增 `discrim/`（12:33:53–12:34:59Z）、`t41-f3refrozen-pre/post-snapshot.json`（12:36:05/12:36:34Z）、`t25-f3-rejections.json` 于 **12:36:21Z 被覆盖重跑**；`R2-VERIFICATION-SUPPLEMENT.md` 于 12:37:33Z（`a7bcf8162adc`）被重写——**而我的 §9.3 引用的正是它**。
- **判定**：属**归档纪律问题，不改 verdict**（src 未动；新增的是**同一 r3 树**上的补充证据；方向为增强）。→ **建议 captain 在放行 t43 前冻结并哈希证据目录**（至少上列 3 个文件），并让发布记录绑定该冻结版本。
- 同一路径覆盖**毁掉了更早运行**（`t25-f3-rejections.json` 12:12:18Z 版、r2 时代的 `t25-a1-mini-offset.json` 11:55 版、首个 `t41-mini-close.json`；`discrim/legacy-run.txt` 12:34:32Z 的失败运行——esbuild 因 CJK 注释含 `src/**/*.test.ts` 的 `**/` 提前闭合块注释而报错）。→ **建议**改用带版本的文件名，失败运行保留不覆盖。

### (2) 对深审「HIGH」各项的裁定（**均不构成 blocker**）

| 项 | 深审意见 | 我的裁定 |
|---|---|---|
| **§5「本轮全部运行期证据取自同一棵冻结树」表述过宽** | 与其自身 §3bis（`75641d69→e7756117`）、§3quinquies（`f1899dcb→f3af2602`）冲突；§3septies（12:22:41–12:24:37Z）落在所引区间之外 | **采纳为表述缺陷**：逐窗口证据本身是按窗口给的（§3quinquies 有逐文件逐字节清单），且**树的冻结由我四次重算独立成立**（12:26:56 / 12:32:02 / 12:39:22 均 `f3af2602…`）⇒ 不影响裁决 8。**建议**改为逐窗口树表，并为 §3septies 引 `t41-post-r4c`/`post-r4c2`/`frozen-final2`（三者均 `f3af2602…`） |
| **A1 采样时未记录面板哈希** | 产物无 hash 字段；窗口 B/C 无时刻；关闭锚点 12:23:16Z 晚于 A1 取样 12:20:32Z | **可由内部一致性解决，采纳为「归档待补」**：四次变异**只把 `MiniPlayer.tsx` 的 `<` 分支改成 `- offset` 1–3 秒**，而 A1 的判别断言正是「mini 高亮跨过 15.50 行」——若取样落在变异窗口内，`+0.5` 会取到**相反方向**（停在 11.00 行）而**断言必失败**；实测为期望方向 PASS（0→+0.5→0 往返）⇒ 取样时面板必为未变异版本（D 窗口 ≤12:20:22，样本 12:20:32 完成）。**待补**：探针输出记录取样时两面板 sha1 |
| **§3septies 的 R2「确认/取消」两行无落盘产物** | `verify-ai-confirm.mjs` 不写盘；`mock-r2-log.json` 只有非破坏性链；`call_rm_1` 仅见于 r2 时代文件 | **采纳为证据归档缺口（高），但不推翻 R2 闭合**：R2 另有**判别性更强**的独立支撑——`llmClientToolIds.test.ts`（4 例，两路审计均验证「回退必失败」）、`chatConfirm.test.ts`（13 例，真 store，含多调用 F2 与取消路径；变异「去重关闭」→ 1 例失败）、真实模块探针。**建议**把探针输出落盘并改引，或将该两行降级标注为 r2 时代证据 |
| **F3 r3 矩阵少一条对照**（`..` 归一化回根内**必须 loaded**） | 该对照仅在 r2 产物 `t13-media-roots.json:16-19` | **采纳为证据待补（中）**：r3 6/6 仍含**关键**对照（根外**可服务扩展名**真 mp3/png 被拒），包含性另有代码依据 ⇒ 不影响裁决；建议在 r3 补该正对照 |
| **§3bis 的 50382B / `ftypisom` / ffprobe 回读无 r3 产物** | 数值仅见于 r2 时代 `t24-transcode-branches.json` 与 `T24-AAC-INDEPENDENT.md` | **采纳为证据待补（中）**：`t41-decode-cache-serve.json`（12:12:18Z）已证明该缓存文件可被 `<audio>` 加载；建议把 size/首字节/ffprobe 行 dump 进 r3 证据文件 |
| F5 变异未记录所读真实面板哈希 / `§3quinquies 4/4` 实为 5 条 / §7.2 指针指错文件 | 三项小瑕 | **采纳（低）**：补输入哈希、改 5/5、修正指针（活的正面引用在 `T26-VERIFICATION.md:75` 与 `R2-VERIFICATION.md:101`） |
| 门禁数字 / attribution / 重复文件 | `summary-t41.json` 逐项与 R3 一致；`mediaRoots.*` 三处均记 **t40**（未见误记）；两对字节重复文件 sha1 一致 | **确认无误**；附注：`npm run lint` 项用 `eslint --cache .`，0-error 的权威来自独立 `--no-cache` JSON 项（两者一致） |
| 正面记录 | 被承认为假阴性的 `t41-r1-runtime.json`（allPass=false）保留并如实声明；修正版带 nonce 序列 | **认可**：符合我要求的「保留失败证据」实践 |

### (3) 结论与对 t43 的建议

- **verdict 维持 pass（0 blocker）**：以上均为**证据归档/表述**问题；**源码树在四次独立重算下始终为 `f3af2602…`**，且 R1/R2/R3/R4 的闭合结论**不依赖被质疑的那几句表述**（R1 = 代码 + 单测不变量 + 运行期前拒后放；R2 = 判别性单测 + 真实模块探针；A1 = 内部一致性；F3 = 关键对照 + 代码依据）。
- **建议放行 t43 前做三件小事**：①**冻结并哈希证据目录**（`R3-VERIFICATION.md`=`6b691ca96b18`/48903B/12:36:43Z、`R2-VERIFICATION-SUPPLEMENT.md`=`a7bcf8162adc`、本报告最终版本）；②**补落盘**：AI 确认探针输出、A1/F5 取样时面板哈希、F3 的 `..` 正对照、AAC 产物的 size/首字节；③**改表述**：§5 逐窗口树表、`4/4`→`5/5`、修正 `T26-GAPS-CROSSREF.md:54` 指针。
- **对 t43 的硬性提示不变**（§8）：**必须重新 build 并对正式 asar 断言「不含 `rootsLoaded`、含 `refreshMediaRoots`/`createMediaRoots`」**；`libraryStore.flush()` 写队列竞态二选一（修 or 记已知问题）。

## 11. addendum 4：工装事实 / 证据口径（captain 统一措辞）+ **A-1 已由新构建闭合（我实测）**

### (1) **A-1（陈旧的 `dist`）现已闭合** —— 我用 asar 提取实测

- 我实测：`dist/win-unpacked/resources/app.asar` **已于 `2026-09-12T12:39:41.245Z` 重新构建**（26,305,579 B，sha1 `d45d823ff49c`；旧的 10:52:21Z / 26,290,359 B 版本已被替换），`out/main/index.js` 为 `12:39:19.623Z`（58,007 B，sha1 `100ece8ac69e`）。
- **我从这份新 asar 里提取 `out/main/index.js` 并逐项计数**（脚本 `.devdata/t7-review/check-fresh-asar.mjs`，产物 `.devdata/t7-review/dist-asar-main-index.js`）：

| 断言 | 期望 | 实测 |
|---|---|---|
| 旧闩锁符号 `rootsLoaded` | **0** | **0** ✓ |
| `createMediaRoots` / `refreshMediaRoots` / `isInsideRoots` / `SERVABLE_EXTS` | ≥1 | 2 / 2 / 2 / 2 ✓ |
| promise 缓存形态 `pending = promise` | ≥1 | **1** ✓ |
| R3 守卫 `will-redirect`、ACAO、`DEV_ORIGINS` | ≥1 | 1 / 1 / 2 ✓ |
| R2 id 前缀 `call_auto_` | ≥1 | **2** ✓ |

⇒ **`PACKAGED-FIX-PRESENT = true`**：**重新构建后的正式产物已含 R1/R2/R3/F3 四处修复，不再含旧闩锁**。故 §8 的 A-1「必须先重新 build 并校验正式 asar」**已被实际构建与我的校验满足**（若 t43 后续再构建，请对最终 asar 重跑同一断言：旧符号计数必须仍为 0）。

### (2) 工装事实（captain 转达，我已独立核对）

- **`verify-lint-tests.mjs:31` 硬编码 `const outDir = '.devdata/t6-evidence'`**（我核到 `:31`，且 `:42` 拼 `logFile`、`:196` 写 `summary-${label}.json`）⇒ 我用 `--label t42` 的产物**落在 `.devdata/t6-evidence/`**（实测存在 `summary-t42.json` / `lint-t42.log` / `tests-t42.log` / `eslint-json-t42.log` / `typecheck-*-t42.log`，mtime 12:27:08–12:27:28Z）。**这是预期行为，不构成「label 产物缺失/错位」**；我的报告引用路径与之一致。
- **脚本自身恒 exit 0**（无 `process.exit`）⇒ 只读逐项值；与本报告 §0/§9 的判据 1/10 一致。

### (3) 证据口径（统一措辞，采纳）

- **不得并列计两次**：`t22-readmerge-proof.txt ≡ t29-readmerge-probe-live.txt`（`649974d53f70`）、`t22-verify-settings-backup.json ≡ t31-settings-backup-before-fixture.json`（`c92586a029b6`）**逐字节相同**。统一表述：**「由 audio-engine 独立复验一次；同一份文件在 `t22-*`/`t29-*`/`t31-*` 三处出现，不构成第二路独立证据」**。（我方深审已独立算出同两组 sha1，见 §10(2)。）
- **归属 erratum（采纳）**：① **t40 = quality**（`mediaRoots.ts` + `mediaRoots.test.ts`，含 `da4fd2c14a4a → 72e099be1453 → 还原` 的判别性实验）；verifier 只承担 **t41**。② `protocol.ts` 的 r3 归属记为 **t33(quality) → t40(quality)**；引用以 **`protocol.ts 28a7dc33ad52` + `mediaRoots.ts da4fd2c14a4a`** 为准，且 `rootsLoaded=0 / rootsPromise=0 / normalizeRoots=0 / createMediaRoots ×2` ⇒ **t33 的闩锁修复未被回退，只是实现搬进 `roots.get()`**（我在 §1 裁决 1 读到的正是 `pending` promise 缓存；我方 ripgrep 复核：`src/main/**` 内 `rootsLoaded=0`、`createMediaRoots=15`（含测试）、`refreshMediaRoots=4`、`normalizeRoots=0`、`rootsPromise=0`、`pending=5` —— 与 captain 口径一致）。
- **mtime 引用规则（采纳）**：任何**历史** mtime 只能引自**冻结产物**并注明来源，**不得人工换算**。本报告中的 mtime 均为**我方实测**并已注明来源与时刻（`Get-Item` / `snapshot-fingerprint.mjs` / asar 读取，2026-09-12T12:26–12:41Z）；例如 r2 的 `protocol.ts` 权威 mtime = **`2026-09-12T09:14:11.239Z`**（size 8265、sha1 `1b076de5cacc`，来源 verifier 快照 `t26-frozen-snapshot.json`）；我方当前实测 `protocol.ts` = `11:58:33.122Z` / 8257 B / `28a7dc33ad52`（r3 版），`mediaRoots.ts` = `11:58:03.826Z` / 4172 B / `da4fd2c14a4a`。

**结论**：以上均**不影响 verdict（维持 pass）与 GO**；A-1 反而由新构建 + 我的 asar 提取校验**转为已闭合**。

## 12. 审议所钉的 revision（回应 captain「证据文件被改写」提示）

### (1) 我实际依据的 revision（size + sha1，按你的要求记录）

| 项 | 值（我实测，来源：`Get-Item` + `Get-FileHash`，时刻 `2026-09-12T12:41Z`） |
|---|---|
| 文件 | `.devdata/t13-r2-evidence/R3-VERIFICATION.md` |
| **size** | **48,903 B** |
| **sha1** | **`6b691ca96b18d8d14ddf28139c0185ff58ec5bb0`** |
| mtime | `2026-09-12T12:36:43.253Z` |
| 章节 | §0–§6 + §3bis / §3ter / §3quater / §3quinquies / §3sexies / §3septies（与你描述一致） |

**⚠️ 与你描述的一处出入（事实性，供交叉确认）**：你写「文件现为**约 34.4 KB**」——那对应的是**更早的 12:28:04Z revision**（34,433 B）。verifier 之后又写了 4 次，最终为 **48,903 B / `6b691ca96b18`**（我方只读深审独立观察到 12:31:31→12:33:04→12:35:27→12:36:43Z 四次改写）。**我钉住的正是最终 revision**，故不存在「按旧 revision 判新内容」的问题。

### (2) 你列出的四处改动点——**都在我据此下 verdict 的这一 revision 中**（我已逐条 grep 复核）

- ① `L1`：`# R3 终版验证（t41）—— **已完成：11/11 项全部通过**` ✓（全文**无** `9/11` 命中 ⇒ 我**从未**把「9/11、2 项未复跑」当作开放项；报告与 output 均按 **11/11** 表述）
- ② `L187`：`### §3ter.3 R4 — 三类空转的判別性（**最终结论见 §3septies：四项全部通过**；本小节为当时的结构级初核）` ✓
- ③ `L352`：`### 未闭合项 → **现已全部闭合**（R2 运行期与 R4 判別性均见 §3septies）` ✓
- ④ `L367`：`## §6 环境与工具链注记` ✓

### (3) 时间线与影响（如实）

- 我提交 t42 verdict 的时刻约为 `12:36:3x`；`R3-VERIFICATION.md` 的**最后一次**写入是 `12:36:43.253Z`（**比我提交晚约 10 秒**），此后**无新写入**（我在 12:39:22Z 与 12:41Z 两次核到同一 size/sha1/mtime）。
- 该次（及此前数次）改动的内容**全部是增强/措辞**（11/11、§3ter.3 指向、未闭合项→已闭合、§6 注记、以及新增 §3sexies/§3septies 的运行期证据），**没有一条与我 §1 的裁决相冲突**；且四个闭合结论（R1/R2/R3/R4）**另有我本人的直接复核与三路独立深审支撑**（见 §1、§8、§9、§10）。
- ⇒ **verdict 维持 pass**；无需重判。若后续 verifier 必须再改该文件，请按你的要求**附新 sha1** 并知会我，我会以新 revision 复核**是否有与已下结论冲突的改动**（若有冲突，我会立即发 addendum 并建议暂缓 t43）。

## 13. 收口台账与四项处置结论（响应 captain 最后一条）

### (1) 冻结复核（我实测，两次）

| 时刻 | size | sha1 | mtime |
|---|---|---|---|
| 12:41Z（钉版时） | 48,903 B | `6b691ca96b18d8d14ddf28139c0185ff58ec5bb0` | `12:36:43.253Z` |
| **本次复核** | **48,903 B** | **`6b691ca96b18d8d14ddf28139c0185ff58ec5bb0`（未变）** | **`12:36:43.253Z`（未变）** |

⇒ **该报告在我提交 verdict 之后无任何写入**，冻结成立；无需回报「文件又变了」。

### (2) 台账口径（采纳 captain 的权威表，非转述）

```
t33 completed (attempt 2, quality)      t34 failed (attempt 1, ai-tools)
t36 completed (attempt 2, ui-features)  t37 completed (attempt 4, quality)
t40/t41/t44 completed · t42 in_progress(我) · t43 pending
```
- verifier 数轮消息中的「t33/t34/t36/t37 四连 failed」是**过期面板快照导致的文书错误（clerical error）**：**不是证据缺陷**，**不下调证据完整性判定**，**不作为 blocker**；t41 的取证不依赖这些任务状态字段。
- **我另核实：该错误并未进入 `R3-VERIFICATION.md`** —— 我 grep 到的 t33/t34/t36/t37 全是**归属用途**（`protocol/index` ← t33、`llmClient/chatStore/MiniPlayer/recommend/`两处测试 ← t34、`playerStoreSleep.test` ← t36、`lyricsOffset.test` ← t37），与权威台账**完全一致**；L91 关于「claim 时 t34/t37/t40 为 in_progress」是**历史陈述**（claim 当时确实如此），非状态断言。**故该报告无需为此改动**，与 captain 的处置一致。
- 引用口径：一律用上表。

### (3) 四项处置结论（均已在报告中定稿）

| # | 要求 | 结论 | 位置 |
|---|---|---|---|
| 1 | **报告 size + sha1（钉版）** | **48,903 B / `6b691ca96b18d8d14ddf28139c0185ff58ec5bb0` / mtime `2026-09-12T12:36:43.253Z`** | §12(1)、§13(1) |
| 2 | **污染窗口表处置** | **采纳**：四次变异**只动 `MiniPlayer.tsx` 一处 `<` 分支 1–3 秒**且逐字节复原；`LyricsPanel.tsx` **全程零写入**（我实测其 mtime 仍 `08:54:42Z`，与 captain 三证一致）；并集 `12:17:03–12:17:31Z` 是唯一「歌词链路」污染窗口。verifier 以**取样时内容哈希**取代时刻比对**方向正确**，且我另实测证明 **mtime 在本仓不能作为稳定性原始量**（`MiniPlayer.tsx` mtime `12:10:42Z` 早于其变异窗口，内容哈希才是可靠量）。**A1 的 12:20:32Z 样本另由内部一致性自证**（变异若覆盖该样本，`+0.5` 必呈相反方向而断言必失败；实测为期望方向 PASS） | §1 裁决 7、§10(2) |
| 3 | **同树原则处置** | **采纳且已核**：r2 证据未被跨树顶替（r2 的 F3 部分被显式降级为「r2 补充」；A1 在 r3 树重跑并作废旧产物）；**树冻结由我四次独立重算成立**（`12:26:56 / 12:32:02 / 12:39:22` 均 `f3af2602…`，76 文件）。唯一需修正的是 §5 的**表述过宽**（与其自身 §3bis/§3quinquies 的窗口区间及 §3septies 区间不符）→ **表述缺陷，非证据缺陷** | §1 裁决 8、§10(1)(2) |
| 4 | **t40 = quality 归属 erratum + 双重计入措辞** | **均采纳**：①`mediaRoots.ts` + `mediaRoots.test.ts` 归 **t40/quality**（含 `da4fd2c14a4a → 72e099be1453 → 还原` 判别性实验），verifier 只承担 t41；`protocol.ts` 的 r3 归属记 **t33(quality) → t40(quality)**，引用用 `protocol.ts 28a7dc33ad52` + `mediaRoots.ts da4fd2c14a4a`，且 `rootsLoaded=0 / normalizeRoots=0 / createMediaRoots ×2` ⇒ **闩锁修复只是搬进 `roots.get()`，未被回退**（我 ripgrep 复核一致）。②证据口径统一为「**由 audio-engine 独立复验一次；同一份文件在 `t22-*`/`t29-*`/`t31-*` 三处出现，不构成第二路独立证据**」（两组字节重复文件我已独立算得同 sha1） | §9、§10(2)、§11(3) |

### (4) 一处流程说明（关于「verdict 须包含 size+sha1」）

t42 的任务记录是**终态、不可改写**的：我提交 output 时尚未收到钉版要求，故**任务记录的正文不含该 size+sha1**。钉版信息已落在**本报告 §12(1)/§13(1)**（权威位置），并在给 captain 的消息中给出。若需它进入**发布记录**，建议在 **t43** 的验收里引用本节（或在 captain 的台账中登记）——我这一侧没有可用的工具去修改已终态的任务 output。

## 14. 第二次「漂移」提示的实测答复：**文件其实未变，§8/§9 已在所钉 revision 内**

captain 提示「verifier 在冻结令之后又追加了 **§8**，现为 §0–§8」。**我实测的结论与此不同**：

| 项 | 我实测（`Get-Item` + `Get-FileHash`） | 与 §12 钉版比对 |
|---|---|---|
| size | **48,903 B** | **完全相同** |
| sha1 | **`6b691ca96b18d8d14ddf28139c0185ff58ec5bb0`** | **完全相同** |
| mtime | **`2026-09-12T12:36:43.253Z`** | **完全相同** |

- **当前 revision 的章节为 §0–§9**（我逐条列出标题确认）：除 §0–§6 与 §3bis…§3septies 外，**§7 勘误与证据链交叉引用、§8 打包态交接注记、§9 观察与 backlog 候选** 都**已经在这一版里**（**§8** 起于 `L400`，含 §8.1–§8.5）。
- **四处关键标记行号未变**（`L1` 11/11、`L187` §3ter.3 指向、`L352` 未闭合项→已闭合、`L367` §6）⇒ 我据以裁决的**证据小节内容未发生位移或改写**；其中 `§3ter.1`（`L133`）在我早前读取时为「静态通过」，现文本为「**静态通过 + 判別性已直接演示**」——属**同一次（12:31–12:36Z 之间）的增强**，也被我的钉版覆盖。
- ⇒ **不存在「第二个新 revision」需要重新钉版**：我据以判断的 revision 就是当前 revision（48,903 B / `6b691ca96b18…`）。若 verifier 认为自己在 12:36:43Z 之后还写过 §8，那么**那次写入未落盘**（或发生在该时刻之前）；两种情形都不影响结论。

### §8/§9 的处置（按 captain 要求）

- **§8 是给 `t43` 的交接注记，不是本次审议证据** —— 我对 R1–R4 的裁决**没有引用 §8**（依据是 §3ter / §3quinquies / §3sexies / §3septies / §3bis 与原始产物 JSON），因此 §8 的内容（旧配置即旧形状、BEFORE 对照不得冒充新证据、启动期判据归档为未定性、t43 只读预检、被误停实例归属 t31）**不参与**本轮 verdict，也不需要我复核。
- **§9 是「观察与 backlog 候选（均不判缺陷）」** —— 与我 §5 的 backlog 一致（§9.1 迷你窗歌词时钟只随引擎事件推进 ↔ 我的 B13；§9.2 `diag-*.mjs` 的 `#mini` 主目标坑 ↔ B5；§9.3 R2-SUPPLEMENT 重取版引用点 ↔ 我 §9/§10 的引用提醒）。**同样不作为修复/验证证据**，仅作 backlog 收录。

### 台账复核（再次）

`t33` / `t36` / `t37` = **completed**、`t34` = **failed**（captain 权威表）。我在当前 revision 内 grep `t33|t34|t36|t37|failed|未通过`：命中项**全部是归属用途**（`protocol/index` ← t33；`llmClient/chatStore/MiniPlayer/recommend/两处测试` ← t34；`playerStoreSleep.test` ← t36；`lyricsOffset.test` ← t37）或**测试计数**（`Tests 5 failed | 4 passed (9)`、`0 failed`），**没有任何一处把 t33/t36/t37 说成 failed**；`L91` 的「claim 时 t34/t37/t40 为 in_progress」是**历史陈述**。⇒ **无 clerical error 需更正、不下调证据完整性、不作 blocker**。

### 结论

**verdict 维持 pass（0 blocker）**；钉版 = **48,903 B / `6b691ca96b18d8d14ddf28139c0185ff58ec5bb0` / `2026-09-12T12:36:43.253Z`**；四项处置结论（污染窗口、同树原则、t40=quality、双重计入措辞）见 §12/§13，**均无变化**。

## 15. 最终收口：漂移清单映射、§7–§9 处置、§9.3 诚实限定的**独立复核**

### (1) 漂移清单与我钉版的关系（按 captain 的简化处理）

captain 列出的四次漂移：① 文字修订（`9/11`→`11/11`、§3ter.3 加注、未闭合项改标、`§6`）→ ② `§7` 勘误与证据链 → ③ `§8` 打包态交接注记 → ④ `§9` 观察与 backlog 候选。

**我这四次全部覆盖在同一个 revision 内**：我钉住的 `48,903 B / 6b691ca96b18… / 12:36:43.253Z` 一版**已含 §0–§9**（我逐条列出标题确认：§7 起 `L376`、§8 起 `L400`、§9 起 `L443`）。我方并行只读深审另观察到该文件在 `12:31:31 → 12:33:04 → 12:35:27 → 12:36:43Z` 被写了 4 次，最终值即上述钉版。
⇒ 表述为：**「审议期间该文件被修订 4 次，本 verdict 基于最终版（§0–§9）」**；此后无写入（我在 12:39:22Z / 12:41Z / 本轮共三次核到同一 size+sha1+mtime）。

### (2) `§7`/`§8`/`§9` 与文字修订的处置（采纳 captain 裁定 1）

- 三者均属**交接 / 勘误 / backlog / 观察**，**不是** R1–R4 的审议证据 ⇒ **不据其判「证据被替换」或「证据不足」**。
- 我对 R1–R4 的裁决依据仍是 **§0–§6 与 §3bis / §3ter / §3quater / §3quinquies / §3sexies / §3septies** + 原始产物 JSON（`t41-r1-runtime*.json`、`t25-a1-mini-offset.json`、`t25-f3-rejections.json`、`t41-aac-chain.txt`、`summary-t41.json` 等）；`§8` 的衔接内容（旧配置即旧形状、BEFORE 对照不得冒充新证据、启动期判据归档为未定性、t43 只读预检、被误停实例归属 t31）留给 t43。
- **不回滚**（同意 captain 裁定 4：回滚只会造成第四次漂移）。

### (3) `§9.3` 的诚实限定 —— **我独立复核并采纳**

我直接比对了两份快照 `t25-pre-snapshot.json` 与 `t25-post-snapshot.json`：

| 快照 | 聚合 sha1 | 文件数 | capturedAt |
|---|---|---|---|
| `t25-pre` | `0b03081425f2587dc65b9faa0156e5297ec270a0` | 73 | `2026-09-12T11:50:31.810Z` |
| `t25-post` | `3073167eb75135bf8700c4e40ca9a9f7dd037348` | 73 | `2026-09-12T11:53:33.500Z` |

逐文件比对：**恰好 2 个文件变化、无增删** ——
- `src/renderer/src/lib/__tests__/recommend.test.ts`：`4971dc0ac834 → fceff3405d11`
- `src/renderer/src/lib/__tests__/lyricsOffset.test.ts`：`704cfb9cf46b → d93df95ef8ac`

⇒ **`R2-VERIFICATION-SUPPLEMENT.md` 的取证窗口不是冻结树，故不得声称「冻结树取证」**（其自身也已在文中限定，我 §10(1) 亦已引用过该限定）；**而 t41 的运行期证据取自真正的冻结树 `f3af2602…`（76 文件）**——两者**分开表述**，这正是同树原则的正确应用。**采纳**。

### (4) 最终状态

- **verdict = pass（0 blocker）**，依据钉版 **48,903 B / `6b691ca96b18d8d14ddf28139c0185ff58ec5bb0` / `2026-09-12T12:36:43.253Z`**（含 §0–§9）。
- **四项处置无变化**：污染窗口表（A/A′/B′/C/D，`LyricsPanel` 无窗口，mtime `08:54:42Z` 佐证）、同树原则（r2 证据未跨树顶替；树冻结由我四次重算成立）、**t40 = quality** 归属 erratum、**双重计入统一措辞**。
- **权威台账**：`t33/t36/t37 completed、仅 t34 failed`；报告内无相反表述（命中项均为归属或测试计数）⇒ clerical 更正项已归档。
- **对 t43 的两条硬性提示**：① 重新 build 后对**最终 asar** 断言 `rootsLoaded = 0` 且含 `createMediaRoots`/`refreshMediaRoots`（脚本 `.devdata/t7-review/check-fresh-asar.mjs`；当前构建已通过，实测 `PACKAGED-FIX-PRESENT = true`）；② `libraryStore.flush()` 写队列竞态二选一（修 or 记已知问题，§8 A-2）。
- **未闭合开项**：仅「进程级死亡（`0xC0000409`）」按环境/基础设施单列，唯一判定台 = t43 打包态长跑。

## 16. addendum 5：第四次漂移（`§3ter.1` 判别性演示）—— **我自跑复现，结论采纳并回填 R1**

### (1) 钉版说明（第四次漂移已被我钉版覆盖）

captain 报的第四次漂移是 `§3ter.1` 由「静态通过」升级为「**静态通过 + 判別性已直接演示**」并附 `discrim/` 证据目录。**该内容已在我钉版之内**：我在 §14 已记录钉版中 `L133` 的标题即为「静态通过 + 判別性已直接演示」，且 `discrim/` 产物时间戳为 `12:34:03–12:34:59Z`，**早于**我钉版的 `12:36:43.253Z`。⇒ 表述：**「审议期间该文件共漂移 4 次，本 verdict 基于最终版 `48,903 B / 6b691ca96b18… / 12:36:43.253Z`（含 §0–§9）」**，无需再次钉版。

### (2) 我独立复核该演示的**工装**（逐项）

| 项 | 我的复核结果 |
|---|---|
| `discrim/legacy-mediaRoots.ts`（2899 B, 12:34:47Z） | **忠实还原修复前语义**：`L34` 注释「缺陷 ①：布尔闩锁（而不是缓存 Promise），且在任何 await 之前置位」；`L54` `populated = true // ← 闩锁先置位，再 await（缺陷本体）`；`L63-64`「缺陷 ②：write-once —— refresh 不重新派生」`const refresh = async () => allowed` |
| `discrim/mediaRoots.legacy.test.ts`（5393 B） | 与仓库 `src/main/__tests__/mediaRoots.test.ts` 做 `Compare-Object`：**仅 import 一行不同**（`./legacy-mediaRoots` ↔ `../mediaRoots`），其余逐字相同 |
| `discrim/vitest.config.ts`（481 B） | 独立 `include: ['**/*.legacy.test.ts']` + `root: __dirname` ⇒ **不参与仓库门禁**（`npm test` 的 include 只收 `src/**`），与实际一致（我自跑 `npm test` = 14 files / 141 passed，mediaRoots 9/9 绿） |

### (3) 我**自己跑**该演示（captain 建议的"自跑或抽验"，我选择自跑）

命令：`npx.cmd vitest run --config .devdata/t13-r2-evidence/discrim/vitest.config.ts --reporter=verbose`（我方日志 `.devdata/t7-review/t42-discrim-rerun.log`）
⇒ **`Test Files 1 failed (1)` / `Tests 5 failed | 4 passed (9)`**，与 captain 转述**完全一致**；失败项与两处缺陷一一对应：

- **① 并发/闩锁（1 例）**：`resolves EVERY concurrent first call to the fully populated set` **×**
- **② write-once / 刷新（4 例）**：`applies a folder that only appeared after the first population` **×**、`can be replaced again and drops directories that are gone` **×**、`a set() during an in-flight populate wins over that populate` **×**、`refresh() records the library even when nothing was served yet` **×**
- 仍绿的 4 例正是旧实现也满足的不变量（只读库一次、库不可读回退静态根、`staticRoots` 懒求值、`set()` 对后续 `get()` 可见）——**说明这不是"全红"式伪证**

### (4) 回填 R1 结论（采纳 captain 的处理，并给出三线收敛）

**R1（原 BLOCKER）的不变量层现有三条互相独立的复现线，数字一致（9 绿 vs 5 失败）：**
1. **t40 作者侧真实变异**（`da4fd2c14a4a → 72e099be1453 → 还原`，含哈希三段）；
2. **我方 R1 深审的拷贝级倒退**（`.devdata/t7-review/roots-revert/`：基线 9/9，退回闩锁+no-op refresh 后 5 failed/4 passed，失败断言 `:33 :91 :104 :137 :148`）；
3. **本轮我自跑的 `discrim/` 演示**（上表：5 failed | 4 passed，失败项与缺陷一一对应）。

⇒ **在 §1 裁决 1 的 R1 结论中补记**：**「另有一份独立证据目录内的倒退演示（`.devdata/t13-r2-evidence/discrim/`：忠实还原修复前语义的副本 + 逐字测试副本 + 独立 config），我自跑得 `5 failed | 4 passed`，与作者侧变异和我的拷贝级倒退数字一致」**。

### (5) 同节附带的 `protocol.ts` 对外行为核对（我此前已独立核过）

`§3ter.1` 另附「对外行为逐字未变」的逐行核对：400/403/404 均带 `CORS_HEADERS`、`isInsideRoots` 仍为 `resolve`+`relative`、`SERVABLE_EXTS` 白名单→404、**先包含性(403) 后白名单(404)**、**从不送字节**；`index.ts` 的 `corsEnabled` + `protocol.ts` 的 ACAO + `audioEngine.ts:113` 的 `crossOrigin='anonymous'` 三件套齐备；**全仓无 CORP 响应头**（仅注释提及）。—— 以上均与我 t14/t42 的独立核对一致（§1 裁决 3、§8、§11），**无变化**。

### (6) 最终结论（不变）

**verdict 维持 pass（0 blocker）**；钉版 = **48,903 B / `6b691ca96b18d8d14ddf28139c0185ff58ec5bb0` / `2026-09-12T12:36:43.253Z`（含 §0–§9，共漂移 4 次）**；四项处置与两条 t43 提示同 §13/§15。

## 17. 文件指纹登记 + A-2 非阻塞依据（回应 captain 收尾）

### (1) 两份文档的最终指纹（供发布记录引用）

| 文档 | size | sha1 | mtime (Z) |
|---|---|---|---|
| `.devdata/t13-r2-evidence/R3-VERIFICATION.md`（**被审方报告**，钉版） | **48,903 B** | **`6b691ca96b18d8d14ddf28139c0185ff58ec5bb0`** | `2026-09-12T12:36:43.253Z` |
| `.devdata/t7-review/T42-R3-REVIEW.md`（**本审查报告**，§0–§17） | **67,617 B** | **`0d9b409245d0672531c801bc921b4361f9b3bfa2`** | `2026-09-12T12:46:16.131Z` |

（R3 的钉版复核与 §12/§14/§15/§16 一致：`48,903 B / 6b691ca96b18… / 12:36:43.253Z`，无新写入。）

### (2) A-2（`libraryStore.flush()` 写队列竞态）—— **我不主张它是 blocker**（附 severity 依据）

captain 裁定「1.0.4 内不修、记已知问题 + 下版首要修复项」，**我认可**。severity = **medium（非 blocker）**，依据：

1. **非本轮回归**：根因在既有的 `LibraryService.flush()`（无写队列；`store.ts` 早有 `this.writing` 链作对照），r3 只在 `ipc.ts` 里 await 了 flush，未改 `LibraryService`；
2. **不损坏数据**：写入仍是 `writeFile(tmp) + rename` 原子序列，落败方只得到 `ENOENT`（`library.json` 内容要么是旧要么是新，不会半写）；
3. **可恢复且有绕行**：用户重扫一次即恢复（症状 = 极窄时序下「扫描失败」+ 新目录暂时 403）；
4. **触发条件为时序碰撞**（400ms 防抖定时器恰与 handler 的 flush 重叠），非确定性命中——与 R1 的**确定性**回归有本质区别（后者 100% 命中「新增目录后播放」）；
5. **代价对比**：修它须改 `src/**` ⇒ **会使刚通过的 t42 判定与 76 文件冻结锚点 `f3af2602…` 失效**，需再跑一轮验证 + 审查；而六项改进本身不受影响。

⇒ **维持 verdict = pass；不建议因此暂缓 t43。** 建议按 captain 的处置：①verifier 在 t43 output 写明「症状 + 根因 + 绕行（重扫）」；②列为下版首项，最小修法 = `LibraryService.flush()` 加写队列 + `refreshMediaRoots()` 包 best-effort（try/catch + 日志）。

### (3) 审计状态更正（避免 captain 空等）

**四路并行只读审计已全部回话**，无「两路未回」：①R1/机理与拷贝级倒退（→ 已并入 §8，并在 §16 由我自跑 `discrim/` 复现 5 failed | 4 passed）；②R2/R4 判别性与空转复算（→ §9）；③t44 迁移 + 全库空转扫描（→ §4 的 B14–B18）；④t41 证据完整性与 attribution（→ §10）。⇒ **我手上没有待回审计，也没有待发 addendum**；若后续出现 blocker 级反证，我会立即发送并请 t43 暂停（尤其 `/S` 安装前）。

### (4) A-1 与 t43 三条断言的对齐（供 verifier 直接照抄）

captain 给 t43 的三条断言与我 §8/§11 的建议一致；**其中第 ② 条在当前已构建产物上已可满足**（我实测，脚本 `.devdata/t7-review/check-fresh-asar.mjs`）：

- asar = `12:39:41.245Z` / 26,305,579 B；解包 `out/main/index.js` 命中计数：**`rootsLoaded = 0`**、**`createMediaRoots = 2`**、**`refreshMediaRoots = 2`**、`isInsideRoots = 2`、`SERVABLE_EXTS = 2`、`pending = promise = 1`、`will-redirect = 1`、ACAO = 1、`DEV_ORIGINS = 2`、`call_auto_ = 2` ⇒ **`PACKAGED-FIX-PRESENT = true`**。
- ⚠️ 仍应按 captain 的要求**证明 `dist/**` 由本次 `build:win` 产出**（构建前后 mtime + 关键文件 sha1）；若 t43 再构建一次，请以**最终** asar 重跑同一断言。

## 18. 收尾裁定归档 + 一处事实更正（网关配置）

### (1) 归档：captain 的裁定（我的处置意见已在其上）

| 项 | 裁定 | 归档位置 |
|---|---|---|
| **B-1**（R2 id 唯一性只到每响应/每轮；跨轮重复 id 会复现同类 400） | **1.0.4 内不修** → 记「1.0.4 已知问题 + 下版首项」（症状/触发条件/绕行：换唯一 id 网关或重试）；与我给的默认方案一致 | §9 末 + 本节 |
| **A-2**（`libraryStore.flush()` 写队列竞态） | **1.0.4 内不修** → 已知问题 + 下版首项（最小修法：flush 写队列 + `refreshMediaRoots()` best-effort） | §8 A-2、§17(2) |
| **B-2**（`llmClient.ts:174` `tc.index ?? 0` 合并无 index 的并行调用） | 低优先 backlog（消息序列仍合法，仅该次调用成败） | §9、§5-B19 |
| **F5 见证层静默通过（影子树证明）** | 低优先 backlog；修法 `expect(heads).not.toContain(null)` 或把 witness 指向 helper | §9-B3、§17(3) |
| **B-4 / B-5** | 低优先 backlog（数值镜像断言；每次请求重复发送用户消息，属既有） | §9-B4/B5 |
| **R2/R4 三条正面结论**（F7(b) 删 `sleepTimer.ts:121` 恰 1 例失败于 `playerStoreSleep.test.ts:277`；A2 组件与测试解析到**同一文件** `miniLyricsDedup.ts`；F5 三 head 与 `LyricsPanel.tsx:78` / `MiniPlayer.tsx:89/:90` 逐字符一致） | **captain 全部采纳** | §9 |

**审计状态（再次确认）**：四路并行只读审计**已全部回话**（①R1 机理+拷贝级倒退 → §8/§16；②R2/R4 判别性 → §9；③t44 迁移+全库空转扫描 → §4 B14–B18；④**t41 证据完整性/attribution → §10**，即 captain 所问的「第 3 路」）。⇒ **无待回审计、无待发 addendum**；出现 blocker 级反证时我会立即发送并建议暂缓 t43（尤其 `/S` 安装前）。

### (2) ⚠️ 事实更正：当前 dev `settings.json` 的 `api.baseURL` **不是 DeepSeek，而是本地 mock**

captain 在 B-1 依据里写「settings.json 的 `api.baseURL` 指向 DeepSeek」——**与当前文件不符**。我实测：

| 项 | 实测值 |
|---|---|
| `.devdata/user/settings.json` | 394 B / sha1 **`c92586a029b6c85356b9840d3b284a9544626cd2`** / mtime `2026-09-12T11:11:07.443Z` |
| `api.baseURL` | **`http://127.0.0.1:9998/v1`**（t41 R2 取证所用的 **mock 网关**） |
| `api.model` | `deepseek-v4-flash`；`hasKey=true`、`keyMode=enc`（密文在文件内） |
| `general.updateURL` | `http://127.0.0.1:8888/`（已按 t22/t31 的夹具复原流程恢复 ✓） |
| 与既有产物的关系 | 该文件与 `t22-verify-settings-backup.json`、`t31-settings-backup-before-fixture.json` **sha1 完全相同**（即那对「字节重复」产物就是这份 live 配置的副本） |

**影响评估（结论不变）**：
- **对发布无影响**：该文件位于 **dev-only** userData（`is.dev` → `join(process.cwd(), '.devdata', 'user')`），而 `.devdata/**` 已被 t11 排除出安装包（asar 内 `.devdata` 条目 = **0**）；**代码默认值仍是 `baseURL: ''`**（`settings.ts:20`），不会把 mock 地址带进发布物。
- **对 B-1 裁定无影响**：B-1 是否触发取决于**用户实际网关**是否「按响应重新编号」；DeepSeek 每次生成唯一 id ⇒ 默认不触发（与我 §9 的判定一致）。但**依据的措辞需更正**：当前 dev 文件指向本地 mock（AI-confirm 取证残留），「DeepSeek」应表述为**目标/用户配置**而非「settings.json 现值」。
- **一条 dev 环境提示（非发布问题）**：mock 9998 现已不在运行 ⇒ 该 dev 实例上的 AI 功能会直连失败；若要继续在 dev 里做 AI 链路验证，请把 `baseURL` 改回真实网关或重启 mock。**建议**：由 verifier 在 t43/收尾时顺手恢复（或明确记录该 dev 残留）。

### (3) 最终状态

**verdict = pass（0 blocker）**；钉版与指纹同 §17(1)（被审报告 48,903 B / `6b691ca96b18…` / `12:36:43.253Z`；本报告见 §17 与本节末尾的更新值）。**唯一未闭合开项** = 进程级死亡 `0xC0000409`（环境/基础设施；判定台 = t43 打包态长跑）。

## 19. 冻结清单之后的追加登记（captain 要求在报告中注明）

**冻结时点**：`2026-09-12T12:40:48Z`（captain 写入 `.devdata/RELEASE-EVIDENCE-FREEZE.md`：458 文件 / 聚合 `47c0b2665e0dc1ee767b1ae4fd242191f32f150e`）。该清单把**本报告钉在** `2458ad5e…` / **44,583 B**（即冻结那一刻的版本）。

**冻结之后本报告的全部追加（均为「尾部追加」，未删改任何冻结前文本）**：

| 段 | 内容 | 说明 |
|---|---|---|
| **§11** | 工装事实（`outDir` 硬编码属预期）+ 证据口径（双重计入措辞、t40=quality、mtime 引用规则）+ **A-1 由我实测闭合（asar 提权计数 `PACKAGED-FIX-PRESENT = true`）** | 冻结后追加 |
| **§12** | 钉版：`R3-VERIFICATION.md` = 48,903 B / `6b691ca96b18…` / `12:36:43.253Z`；四处改动点逐条复核 | 冻结后追加 |
| **§13** | 权威台账归档（t33/t36/t37 completed、仅 t34 failed）+ 四项处置结论 | 冻结后追加 |
| **§14** | 第二次「漂移」提示的实测答复（文件实为未变、§8/§9 已在钉版内） | 冻结后追加 |
| **§15** | 漂移清单映射、§7–§9 处置、**§9.3 诚实限定的独立复核**（t25-pre/post 逐文件比对 = 恰好 2 个测试文件变化） | 冻结后追加 |
| **§16** | 第四次漂移（`§3ter.1` 判别性演示）—— **我自跑 `discrim/` 复现 5 failed \| 4 passed**，并回填 R1 结论 | 冻结后追加 |
| **§17** | 文件指纹登记 + A-2 非阻塞依据 + 审计状态更正 + A-1 与 t43 三条断言对齐 | 冻结后追加 |
| **§18** | captain 裁定归档（B-1/A-2/B-2/F5 见证层/B-4/B-5）+ **网关配置事实更正** | 冻结后追加 |
| **§19** | 本节 | 冻结后追加 |

**沿路实测值（供清单做 delta 用）**：
- `12:46:16.131Z`：**67,617 B** / `0d9b409245d0672531c801bc921b4361f9b3bfa2`（含 §11–§16）
- `12:48:14.742Z`：**75,373 B** / `edd3e09b0c11e3d2a07fa1738c0efacb2f427c89`（含 §17–§18）
- 加入本节（§19）后的最终值：**见下方「最终值」行**（本节写入后由一次尾追加登记）

**性质声明**：冻结后我对本报告的每一次写入都是**在该文件末尾追加新章节**（`old_string` = 上一节最后一行，`new_string` = 该行 + 新章节），**未改动、未删除冻结前（§0–§10）的任何文本** ⇒ 冻结版本的内容完整保留为最终文件的**前缀**。因此：
1. 清单中本报告的 `sha1/size` 与聚合值 `47c0b266…` 已被**取代**（仅因这份**我自己的**报告追加；verifier 侧被钉的产物我逐项核对仍与清单一致）；
2. 建议 captain 在清单追加一行 delta：`T42-R3-REVIEW.md: 2458ad5e…(44,583 B, 12:40:48Z 冻结) → <最终值>(纯追加 §11–§19)`，或在发布报告「勘误/例外」节记录这一处例外（不影响任何结论）；
3. **我至此停止写入本报告**（除法定的最终值登记外不再追加）。

**最终值的记录方式（避免自指循环，最后一次修正）**：把本文件自身的 sha1 写进本文件，会让 sha1 再变一次 ⇒ 本文件内**不嵌入"最终值"**（否则永远滞后一步、且不可自证）。**权威最终值 = captain 侧只读取一次并记入清单 delta 行**；我在给 captain 的消息中已给出停止写入后的实测值（`size/sha1/mtime` 三件套）。
**本节为我对本报告的最后一次写入**；此后任何差异都应与该消息/清单比对。§19 上方两张表登记的**沿路实测值**（67,617 B @12:46:16.131Z / 75,373 B @12:48:14.742Z）仍然有效，可用于证明"冻结后只有本报告被追加"。

---

## 20. addendum 6：t43 `package.json` 事故的独立复核（captain 指定；**verdict 不变 = pass**）

> §19 末句曾声明「我至此停止写入本报告」。本节是 **captain 的明确指示**（「完成后写进 `T42-R3-REVIEW.md`，新开一节即可，如 §20」）⇒ 该自我约束按指示**解除一次**；本节仍为**尾部追加**，§0–§19 任何文本未改。
> **边界遵守**：未修改 `package.json`、未触碰任何 `src/**`；**未重跑 `build:win`**（避免替换已校验/已安装的 1.0.4 产物）；写入仅落在 `.devdata/t7-review/**` 与 `%TEMP%`。唯一仓库根副作用 = 我自跑 `npm run lint` 生成的 `.eslintcache`（30,883 B @13:02:48Z），**已删除复原**；gates 前后 `package.json` 的 size/sha1/mtime 三值完全一致（`2123` / `c2fdc56b4a30f652d43a862a0123f951accad893` / `12:52:21.7635747Z`）。
> **性质**：这是**发布流程事故**，不是代码缺陷 ⇒ 我**不**把它写成 R1–R4 的 blocker，**verdict 维持 `pass`**。

### (1) 四组数据：**全部复现**（我实测，未采信 captain 数字）

| 对象 | 我的实测（`Get-Item` + `Get-FileHash -Algorithm SHA1`） | captain 值 | 复现 |
|---|---|---|---|
| **现文件**（仓库根 `package.json`） | `2123` / `c2fdc56b4a30f652d43a862a0123f951accad893` / mtime=**ctime** = `2026-09-12T12:52:21.7635747Z` | `2123` / `c2fdc56b…` / `12:52:21.763Z` | ✅ 一致（ctime 相同 ⇒ 新建/复制，非移动回位） |
| **事故前原件（1.0.4）** = `t42-final-snapshot.json:113-118` | `mtime 2026-09-12T12:38:57.208Z` / `2123` / `225554572a8b` | 同左 | ✅ |
| **升版前原件（1.0.3）** = `t26-frozen-snapshot.json:113-118`、`t41-post-r4c2-snapshot.json:113-118`（两份**逐字节同条目**） | `2026-09-12T04:25:19.798Z` / `2123` / `65654a4d1e48` | 同左 | ✅ |
| **判别实验**（`1.0.4`→`1.0.3`，`%TEMP%` 计算，未写回仓库） | `2123` / `376504a6bf12dd93bb1eeda1982e58f35bdcecb3`；与现文件仅 **1 个字节**不同（0-based offset **47** = 版本号末位 `4`→`3`）；无 BOM、末尾有换行 | `376504a6bf12dd93bb1eeda1982e58f35bdcecb3` | ✅ |

**两处引用口径差异（仅文件名/标签，不影响数值）**：
1. `.devdata/` 下第三份日志的真实文件名是 **`t31-final-fp.log`**（不存在 `t31-final-fingerprint.log`），且三份日志内部的 `label` 是 **`t29-pre` / `t29-post` / `t29-final-check`**（`capturedAt` = `11:36:11.785Z` / `11:38:45.033Z` / `11:39:26.610Z`，同批 `srcAggregateSha1 b7ea6c85…`）。我逐份读出 `package.json 2026-09-12T04:25:19.798Z 2123 65654a4d1e48`，与第三行数据**一致**。
2. 附：`%TEMP%\pkg-flip.json`（`12:53:51.991Z`, 2123 B）的 sha1 = `376504a6bf12…`，与我本次独立重算**完全相同** ⇒ 判别实验是**两方独立同值**；但两者都从**恢复件**派生，故它本身不能反推原件。

### (2) 先校准口径（否则「12 位前缀」比较无判别力）

snapshot / fingerprint 里的 `sha1` 字段 = **sha1 十六进制截断 12 字符**。我用三个**未被本轮改动**的文件现场校准：`src/renderer/index.html` → `5e515ae85c5c36981f761b3fb99097ae032f5f18`（快照条目 `5e515ae85c5c`）、`electron-builder.yml` → `6f2319867dd299a3d8a7667870e2e4d184a82f56`（条目 `6f2319867dd2`）、`src/main/settings.ts` → `55cb49caa96597e5c81a8fdb1e04288571abc29c`（t31 日志 `55cb49caa965`）⇒ 12 位前缀比较是**有效的不等判定**（48 bit）。

### (3) 问题①：**四组数据全部复现**，无任何数值不一致（仅上面两处文件名/标签口径差异）

### (4) 问题②：**「恢复件与原件同尺寸但内容不同 ⇒ 至少一处字节级差异、本地不可恢复」——成立**；但我用新证据把「不可证范围」**显著收窄**

**(a) 可能的替代解释 — 逐条排除**

| # | 候选解释 | 我的检验 | 判定 |
|---|---|---|---|
| 1 | 快照条目**口径不同**（不是 sha1 前缀） | 三个未改动文件现场校准完全吻合（见 (2)） | **排除** |
| 2 | t42 条目其实是**升版前**文件 | 升版前条目 `65654a4d1e48` @`04:25:19.798Z` 与 t42 条目 `225554572a8b` @`12:38:57.208Z` **同时存在**；t42 条目 mtime 正是升版动作时刻，其快照于 `12:39:22Z`（事故前）写入后未再改 | **排除** |
| 3 | 本机**另有原件副本** | 穷举：仓库内（排除 `node_modules`）**2123 B 的文件只有现 `package.json` 一个**，全仓名为 `package.json` 的文件也只有它；`%TEMP%`（深度 ≤3）2123 B 文件只有 `pkg-flip.json`（captain 判别实验 12:53:51Z）与我的变体（12:59:34Z）——**两者都是事故后从恢复件派生的** | **排除** |
| 4 | 恢复过程留下**中间件** | `%TEMP%\t43-recover\` 只有一个 536 B 的 `package.json`（sha1 `e9c3cae381d2…`）= 从 asar manifest 复制的**参考件**，非原件 | **排除** |

⇒ 差异内容**在本机无副本可取**。**未尝试**特权/取证级恢复（VSS 卷影 / 扇区级）：本会话审批已被禁用，且远超评审范围 —— 如实声明为我的复核边界。

**(b) 新证据（本节主要增量）：asar 内的 manifest 是原件的「无损投影」**

代码依据（`node_modules` 内，我逐行读过，非推测）：
- `app-builder-lib@26.15.3` `out/fileTransformer.js:28-53` —— `createTransformer` 对**应用自身**的 `package.json` 走 `modifyMainPackageJson`；`:88-106` → `:59-87`（`cleanupPackageJson`，`isMain: true`）。
- `isMain` 分支的**删除集合是封闭的**：`_*` 前缀键、`ignoredPackageMetadataProperties`（`:59` = `dist, gitHead, build, jspm, ava, xo, nyc, eslintConfig, contributors, bundleDependencies, tags`）、`scripts`、`keywords`、`devDependencies`、`babel`（仅当 `dependencies` 无 babel 项）；随后以 **`JSON.stringify(data, null, 2)`** 输出、无末尾换行。
- `out/util/packageMetadata.js:11-19`（`readPackageJson`）只额外删 `readme`。
- `electron-builder.yml`（我通读 48 行）**无 `extraMetadata`**，也未把 `removePackageScripts` / `removePackageKeywords` 设为 false ⇒ 默认删除生效；产物侧自证：asar 内该文件 **536 B、无末尾换行**，正是 `JSON.stringify(…, 2)` 的形状。

**实测推论**：
1. asar manifest 的键 `[name, version, description, main, author, homepage, dependencies]` 与键序 = **原件键集的投影**。我实测 **`JSON.stringify(恢复件[这 7 个键], null, 2)` 与 asar manifest 逐字节相同**（两者 sha1 均为 `e9c3cae381d2abb5860d8e466ba249ac6f80b480`）⇒ 这 7 个字段（**值 / 键序 / 规范序列化形下的格式**）在恢复件中**可证为忠实**。
2. 恢复件的键集 = asar 键集 **+ 恰好 `{scripts, devDependencies}`**（`keysOnlyInAsar = []`，`keysOnlyInRepo = [scripts, devDependencies]`）⇒ 恢复件**没有多出任何字段**；`dependencies` 与 asar manifest **8/8** 一致、与 lock 根条目 **8/8** 一致；`devDependencies` 与 lock 根条目 **22/22 名称+范围完全一致**。
3. ⇒ **erratum §5「不可证：原件是否额外含 `private` / `license` / `engines` 等字段」过于悲观**：这些键**都不在删除集合内** ⇒ 原件若含之，asar manifest 必然包含 ⇒ **asar manifest 不含它们 = 原件不含它们**（正面证据）。同理可排除 `type` / `repository` / `bugs` / `funding` / `os` / `cpu` / `packageManager` / `workspaces` / `optionalDependencies` / `peerDependencies` / `overrides` / 内联的 `vitest`·`prettier`·`lint-staged` 配置等。
   **真正不可证的残余只剩 4 类**：① `scripts` 的 15 条命令串（在删除集合内，**无任何字节 oracle**）；② `devDependencies` 的 22 条范围串（同上；lock 根条目 22/22 一致是**强佐证**，但该 lock 根 `version = 1.0.0 ≠ 1.0.4` 证明它**确已陈旧于清单**，故「一致」≠「证明」）；③ `keywords`（删除集合内；对构建/运行**零影响**）；④ `build`（属 ignored 集合；已由 `electron-builder.yml` + 事故前成功构建独立排除）。
4. **判别实验的加强读法**：`376504a6bf12… ≠ 65654a4d1e48`（升版前原件）⇒ 在「升版=仅替换版本号」这一（未证）前提下，差异**不止版本号一处**。这与推论 1 并不矛盾：投影只覆盖那 7 个字段，故差异必然落在 `scripts` / `devDependencies` / 或投影之外的格式细节上。

⇒ **② 结论：赞成 captain 的判断**（同尺寸、不同内容 ⇒ 至少一处字节级差异、本地不可恢复）。**唯一建议**：把 erratum §5 的「不可证」表述从「原件是否额外含 `private`/`license`/`engines` 等字段」改成上面的 **4 类残余清单** —— 更准确，也更利于下一版交接。

### (5) 问题③：发布影响 —— **可判定未受影响**（附一处时间线读法更正）

我的实测时间线（全部 `LastWriteTimeUtc`）：

| 时刻（UTC） | 对象 | 值 |
|---|---|---|
| `12:39:19.6237Z` / `.6518Z` | `out/main/index.js` / `out/preload/index.js` | 58,007 B / 4,175 B |
| `12:39:22.3160Z` | `out/renderer/**`（js 820,748 B / css 36,916 B / html 548 B） | 渲染产物完成 |
| `12:39:41.2451Z` | `dist/win-unpacked/resources/app.asar` | 26,305,579 B / sha1 `d45d823ff49c8a535836ddc8efe4e4b47bef15f6` |
| `12:39:41.9703Z` | `dist/win-unpacked/nebula-player.exe` | 211,232,768 B / sha1 `bfbd9909b7f64e29ee6a58df0df5cb2348bca388` |
| `12:40:14.4996Z` | `dist/nebula-player-1.0.4-setup.exe` | 118,119,624 B / sha1 `b369808389f0fa62e9d4dedc775995e23f8c5840` |
| `12:40:20.587–.612Z` | blockmap / `builder-debug.yml` / `latest.yml` | **最后一批构建输出** |
| **`12:41:06.303Z` → `12:41:08.935Z`** | **事故窗口**（`.devdata/release-evidence/` 三个 asar 提取件的 mtime：`asar-out_main_index.js` / `asar-out_renderer_assets_index-Cdfx1hqQ.js` / `asar-package.json`，**我实测**） | 与 captain 的 `12:41:08Z` 一致 |

1. **全部构建产物早于事故窗口**（最晚 `12:40:20.612Z`，早 **45.7 s**；按事故点 `12:41:08Z` 计 ≈48 s）。我另外穷举验证：`dist/win-unpacked` 下 **0 个**文件晚于 `12:41:08Z`（最新 = `12:39:41.970Z`），`out/` 最新 = `12:39:22.316Z` ⇒ **事故后没有任何重新构建**。这一点很关键：若有事后构建，新产物就会携带**无法证真**的 `scripts`/`devDependencies`。
2. **安装内容 = 事故前产物（逐字节，我独立复现 captain §4.2）**：安装副本 `%LOCALAPPDATA%\Programs\nebula-player\resources\app.asar` = 26,305,579 B / sha1 `d45d823ff49c8a53…`，与 `dist` 内 asar **同值**；其内嵌 manifest 亦为 536 B / `e9c3cae381d2…` / `version 1.0.4`（我用 **asar 头表直读**，刻意**不用** `extract-file`）⇒ 用户机器上运行的即已校验产物。
3. ⚠️ **一处时间线读法更正（不影响结论）**：erratum §4.1 把「`/S` 安装 `12:40:08Z`」列在 `app.asar` 与 `setup.exe` **之间**，读起来像“安装早于 setup 产物”。实测：`12:40:08.0000000Z` 是**安装包写入目标文件时携带的时间戳**（整数秒、无亚秒位 = 安装包内嵌值），而**真正的安装写入时刻**看 NTFS CreationTime：`nebula-player.exe` = `12:41:53.699Z`、`app.asar` = `12:41:54.178Z` ⇒ **安装动作发生在事故点之后**。这不削弱「发布产物未受影响」，但正确论证应是「**产物先于事故完成** + **安装内容与产物逐字节相同**」，**不应**把安装步骤列入“早于事故的产物”。建议 §4.1 改为：`out 12:39:19–12:39:22Z → app.asar 12:39:41Z → setup.exe 12:40:14Z → latest.yml 12:40:20Z →（事故 12:41:08Z）→ 实际安装 12:41:54Z；安装内容 sha1 与事故前产物一致`。
4. **「恢复后四条脚本实跑 0 error / 141 passed」是否足以支撑「功能可用、逐字节保真不可证」？—— 足够，且我把它加强为三条**：
   - (i) **证据确在恢复之后**：`t6-evidence/summary-t43.json` 的 `stamp = 12:52:47.937Z`，逐日志 mtime = `lint 12:52:51.962Z` / `eslint-json 12:53:02.937Z` / `typecheck-node 12:53:05.571Z` / `typecheck-web 12:53:09.776Z` / `tests 12:53:12.229Z` —— **全部晚于**恢复件落盘 `12:52:21.763Z`；summary 内 `lint.exitCode = 0`（命令行可见 `eslint --cache .`）、`totalErrors = 0` / `totalWarnings = 1`、typecheck node/web `0`、tests `exitCode 0` / `14 files` / `141 passed` / `0 failed`。
   - (ii) **我在现树上独立重跑四条**：`LINT_EXIT=0`（0 error / 1 warning）、`TCNODE_EXIT=0`、`TCWEB_EXIT=0`、`TEST_EXIT=0`（14 files / 141 passed）；npm 头行打印 **`nebula-player@1.0.4`** ⇒ 恢复件**身份正确且能驱动工具链**；两次运行前后 `package.json` sha1 均为 `c2fdc56b…`（无副作用）。
   - (iii) **可证真范围正好覆盖被实跑的那 4 条**：`lint` / `typecheck:node` / `typecheck:web` / `test` 的**命令串就是恢复件的字符串**，四条全绿 ⇒ 15 条脚本中**至少 4 条**端到端可用；其余 11 条（`format / icons / start / dev / build / postinstall / build:unpack / build:win / build:mac / build:linux`）**未实跑**，`build:win` 是**刻意**不重跑 ⇒ 「脚本可构建」只能沿用**事故之前**的那次成功构建作为证据（该证据有效：构建发生于 `12:39–12:40`，消费的正是 `225554572a8b` 那份原件）。
   - **推荐对外措辞**（与 erratum §6 结论一致；仅建议引用时**不要合并成“已完全恢复”**）：**「1.0.4 产物已校验并静默覆盖安装；四条门禁在恢复件上实测可用；事故仅影响仓库根 `package.json` 的字节保真（7 个字段已证忠实，`scripts`/`devDependencies`/`keywords` 不可逐字节证真），不影响本次发布」**。
5. 一处**非阻塞**小事实（供交接记录，不必整改）：现树 **无 `.eslintcache`**，而 t43 的 `npm.cmd run lint`（= `eslint --cache .`，`summary-t43.json` 可见其命令）在 `12:52:47` 跑过；我实测该命令**会**生成 `.eslintcache`（我这次生成 30,883 B @`13:02:48Z`，已删除复原）⇒ 该缓存文件在 `12:53` 之后由某一步清掉了。**不影响 lint 结论**（同一份清单上我已独立复跑 `exit 0`）。

### (6) 本节新增的探针与原始产物（可复跑，均在 `.devdata/t7-review/`）

| 探针 | 用途 |
|---|---|
| `pkg103-variant.mjs` | 版本回翻哈希（字节级最小改动，输出仅到 `%TEMP%`，自校验「仅 1 字节不同」） |
| `asar-header-pkg.mjs` | **不经 `extract-file`**、直接解析 asar 头表读取 `package.json`（对 `dist` 与**已安装** asar 各跑一次，避免重演事故） |
| `manifest-projection-compare.mjs` | 投影定理实测：7 字段逐字节一致、`keysOnlyInRepo`/`keysOnlyInAsar`、依赖与 devDeps 的 **asar×lock×恢复件**三方比对 |

### (7) 最终性质声明

- 本节**不改变 verdict**：仍 **`pass`（0 blocker）**；该事故按 captain 裁定属**发布流程事故**，已入交接与教训，**不写入 findings**、不影响任何 R1–R4 结论。
- 本报告**再次被追加**（§20）⇒ `size/sha1` 再次变化；沿用 §19 的约定：**权威最终值由 captain 侧只读登记**，本节同样**不内嵌自身 sha1**（避免自指循环）。

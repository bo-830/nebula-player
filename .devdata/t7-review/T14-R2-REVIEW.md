# t14 — r2 正式审查报告（NEBULA Player 1.0.4 发布前）

- 审查人：reviewer（独立评审；**未修改任何 `src/**` / `scripts/**` 实现代码**）
- 被审对象：t13 及其后的修复波（t16–t24）+ verifier 侧 t15/t25/t26
- **verdict = needs_revision（1 条 BLOCKER，见 R1）**

## 0. 锚点与第 0 步（实时退出码 + 时间戳）

| 项 | 值 |
|---|---|
| 第 0 步执行时刻 | **2026-09-12T19:26:00+08:00**（本地）/ `2026-09-12T11:26:01Z` |
| src 聚合 sha1（我现场重算） | **`b7ea6c857054a8890952608fa9d50ed9e94ff759`**，71 文件，最新 src mtime `2026-09-12T10:58:00.199Z` |
| 与 captain 锚点比对 | **完全一致** → 我与 t15/t25/t26 审的是同一棵冻结树 |
| `node scripts/verify-lint-tests.mjs --label t14` | lint **exit=0**（0 error / 1 warning）、typecheck:node **0**、typecheck:web **0**、test **exit=0（11 files / 118 tests）**、lintErrorFiles=0 |
| 我独立复跑 `npx.cmd eslint --no-cache --format json .` | **files=70，errors=0，warnings=1**（唯一 warning = `TrackList.tsx:42`，已接受）→ 口径按 §7.9：**范围 = `src/**` + 根配置** |
| 受制裁资产 | 每文件用例数均**上升**：chatConfirm 9→**11**、playerStoreSleep 8→**13**、mediaFormats 6→**11**（mini 去重 A2 用例落在此文件） |
| 我的 F1 复现探针 | `.devdata/t7-review/queueWrap.review.test.ts`：**6/6 通过**（在 r1 的坏树上曾 3/6 失败）→ 回绕语义确实恢复 |
| mock 网关自检 | `node scripts/mock-llm-confirm.mjs --selftest` → **11/11 passed**（含「多调用轮缺 tool 回复」等 F2 反例） |

## 1. 结论

| 项 | 判定 |
|---|---|
| F1 列表循环回绕 | **已闭合**（代码 + 探针 + 新用例三重证据） |
| F2 多 tool_calls 消息序列 | **基本闭合**，但存在**残余漏洞 R2**（供应商省略 tool id 时会复发 400） |
| F3 路径包含性/白名单/不返字节 | 四项验收**已实现**；**但引入了 1 条 BLOCKER（R1）** |
| F3 导航守卫 | will-navigate + setWindowOpenHandler 已落地且严格；缺 `will-redirect`（R3，medium） |
| F4/F5/F6/F7/F8/F13、A2/A3 | **全部闭合**（逐条证据见 §3） |
| P0 缺键崩溃 | **根治已核实**（读取期递归补键；只读夹具实验物理排除「写入期补键」） |
| AAC/APE 转码 | **已核实修复**（显式 `-f mp4`/`-f wav`、原子 rename、0 字节缓存不被接受） |
| 新的空转断言 | **出现了 1 条（R4）**：F7(b) 的新用例因队列仅 1 首而恒真，`sleepTimer.ts:121` 被删也能过 |
| 进程级死亡 | 仍是**未闭合开项**（非本轮 finding；t15 `window-all-closed` 实验 + t9 打包态长跑为准） |
| **总体** | **needs_revision** —— R1 必须修，R2/R3/R4 建议同轮修（均为小改动） |

## 2. Findings（结构化）

### R1 · BLOCKER · `src/main/protocol.ts:51-52`（+ `:36-41`、`src/main/decodeService.ts:72`）
**`ensureRoots()` 用布尔闩锁把「可服务根目录集合」钉死在进程内的第一次请求上，而唯一的刷新入口 `setMediaRoots()` 是死代码（全仓 0 调用）。**

```ts
50  async function ensureRoots(): Promise<void> {
51    if (rootsLoaded) return
52    rootsLoaded = true            // ← 先闩锁，await 之后才赋值 allowedRoots
56    const raw = await fs.readFile(join(p.userData, 'library.json'), 'utf-8')
...
65    allowedRoots = Array.from(roots)
```
`setMediaRoots` 只有定义（`:36-41`），`library:scan`（`ipc.ts:95-98` → `library.scanRoots`）完成后**不会**更新媒体根目录。

**两种用户可见后果（同一根因）**：
1. **确定性**：会话中新增/扫描的目录在重启前**无法播放**。首次媒体请求（启动时列表封面任意一张 `<img src="media://…">` 即触发）就把根目录钉死为当时的 `library.json` 快照；之后用户添加文件夹 → 扫描入库 → 播放其中任意一首 `.mp3/.wav/.flac/.ogg/.opus/.m4a`：`decodeService.ts:72` 对 DIRECT_EXTS **返回原始文件路径**的 `media://` URL → `isInsideRoots` 为 false → **403**（仅 `.ape/.aac` 因转码产物落在 `decode-cache` 根内而幸免）。渲染进程刷新无效，**必须重启应用**。
2. **竞态**：闩锁在 `await` **之前**置位，`allowedRoots` 在 await 之后才赋值。冷启动时的封面并发请求（第 2..N 个）会看到 `rootsLoaded===true` 且 `allowedRoots===[]` → 一律 **403**，直到 library.json 读完。t26/t13 的验证路径都是「先播放音频再取封面」，因此恰好绕开了这一窗口（首次媒体请求是单发而非并发的封面流）。

**requiredFix（最小改动，二选一或并用）**：
- 把闩锁改成**缓存 Promise**（`rootsPromise ??= populate()` 并 `await` 它），消除 `[]` 窗口；**并且**
- 让根目录集合可刷新：在 `library:scan` 完成后调用 `setMediaRoots(...)`（或按 `library.json` 的 mtime 记忆化重算），否则扫描后仍需重启。
- 建议同时补一条回归用例：扫描后新目录内文件的 `media://` 请求必须 200。

**file/line**：`src/main/protocol.ts:36-41, 50-66, 146`；`src/main/ipc.ts:95-98`；`src/main/decodeService.ts:72`。

### R2 · MEDIUM（F2 残余） · `src/main/llmClient.ts:164`（+ `:176`、`:142`）
**供应商不返回 tool_call id 时，回退 id 是确定性的，会撞车并破坏 F2 不变量。**
`id: c.id || \`call_${c.name}\``（SSE 路径）与 `id: tc.id ?? \`call_${i}\``（非流式路径）在同一会话内会重复：同一工具在**两轮**中调用即得到同一 id，`replaceToolMessage`（`chatStore.ts:388` 的 `findIndex`）会**覆盖上一轮**的 tool 消息，于是最新 assistant 的 tool_calls 无人应答 → 又回到 HTTP 400（正是 F2 要消灭的故障）。附带：`:142` `const i = tc.index ?? 0` 在供应商省略 `index` 时会把并行调用合并成一条坏调用。
**requiredFix**：回退 id 改为进程内唯一（如 `call_${name}_${++seq}`）；`completeToolCalls` 内对重复 id 做防御性去重（同时改写 assistant.tool_calls 与 tool 消息）；`index` 缺失时用单调计数器而非 0。

### R3 · MEDIUM · `src/main/index.ts:153-159`
**导航守卫缺 `will-redirect`。** 已装 `will-navigate`（主框架）与 `setWindowOpenHandler`，但 `will-redirect` 是独立事件（Electron typings 39.8.10 明确：`will-navigate` 是主框架导航，`will-redirect` 需单独 preventDefault）。dev 下 `DEV_ORIGINS` 信任 `localhost:5173/5174`（`is.dev = !app.isPackaged`，不校验该端口的归属进程）：被占用的端口或任何重定向都能把一个外部页面载入应用窗口，而该窗口上挂着完整 `window.api`（`preload/index.ts:134-139`，两个窗口均 `sandbox:false`）。
**requiredFix**：`contents.on('will-redirect', (e, url) => { if (!isAppPage(url)) e.preventDefault() })`；建议顺带补 `will-frame-navigate` 与 `will-attach-webview`（当前被 CSP `default-src 'self'` 与「渲染层无 innerHTML」双重缓解，属纵深防御）。

### R4 · MEDIUM（测试有效性，共 3 处）——接受准则③「新的空转断言」的直接答案

**(a) F7(b) 的新用例恒真** · `src/renderer/src/lib/__tests__/playerStoreSleep.test.ts:258-268`
**F7(b)（'one' 模式 + 队列定时器）的新用例是空转的**：队列只有 `['a']`（`:260`），`sleepTimer.ts:122` 的 `singleTrack` 分支（以及 `:123` 的 `0 >= 1-1`）已经返回 `'stop'` → **把 `sleepTimer.ts:121`（F7(b) 的那一行）删掉，用例仍然通过**；多轨队列 + `mode:'one'` 的组合在全仓**没有任何用例**（`armQueueEnd()` 的每次使用都配 `list` 或 1 首队列）。
**requiredFix**：新增一条「3 首队列 + `mode:'one'` + `armQueueEnd` → 首曲自然结束即停并清 sleep」的用例（或直接断言 `shouldStopOnEnded({playMode:'one', queueLength:3, endedIndex:0})`），使其在删除 `sleepTimer.ts:121` 后失败。

**(b) A2 的「单测」是测试侧复刻，不覆盖真实组件** · `src/main/__tests__/mediaFormats.test.ts:59-141`（"mini window lyrics dedupe (A2 rule)"）
该文件**不 import `MiniPlayer.tsx`**，而是在测试里自己 newWindow() 复刻了 `claimed`/`wanted`/绘制门（`:61-96`）并断言测试本地的 `fetches`/`painted`。把 `MiniPlayer.tsx:54`（`if (claimed.current === id) return`）与 `:63`（newest-wins 判断）改回旧写法，**5 条用例全绿** → **A2 在生产代码中已修好，但没有任何真实测试覆盖它**，这份「证据」是模拟的。
**requiredFix**：要么把去重逻辑抽成纯函数（如 `miniLyricsDecision(claimed, wanted, incomingId)`）由生产代码调用并直接单测；要么明确标注这些用例只测「规则」而非组件，并在 r2 报告里不将其计为 A2 的验证证据。

**(c) F5 的符号约定仍无任何回归守卫** · `LyricsPanel.tsx:78/:204`、`MiniPlayer.tsx:87`
激活公式只存在于两个组件内（无组件测试），`lyricsOffset.test.ts` 只钉住存储/步长/格式化。把两处 `+ offset` 改成 `- offset`，**整套 114→118 用例仍全绿** → F5 那类「方向反了」的缺陷可以再次无声回归。
**requiredFix**：把激活判定与点击 seek 目标抽成 `lyricsOffset.ts` 的纯函数（如 `activeLineIndex(lines, currentTime, offset)` / `seekTargetFor(line, offset)`），由两个组件共同调用并单测方向。

**(d) 两处既有空转用例（非本轮引入）** · `src/renderer/src/lib/__tests__/recommend.test.ts:74`、`:77-83`
`:74`「惩罚最近播放」实际靠标题 tie-break 通过（`rock1`/`rock2` 同分，`recommend.ts:126` 用 `localeCompare` 定序）→ 删掉 `recommend.ts:120` 的 `score -= 1.8` 仍通过；`:77-83`「无历史时回退最新入库」永远走不到它命名的回退分支（`stats={}` 时每首都拿 `+2.6` 新奇度，`scored.length>0`，`recommend.ts:129-135` 不可达），`reason === '新入库'` 其实来自 `:113`。
**requiredFix**：前者断言分数差或直接测 `scoreTrack`；后者构造 `scored.length === 0` 的输入（或删掉不可达分支）。既有问题，建议随同轮小改一并处理。

### R5 · LOW · `src/main/protocol.ts:115`
包含性判据 `!rel.startsWith('..')` 过宽：`relative('C:\\music','C:\\music\\..hidden.mp3') === '..hidden.mp3'` → 合法文件/目录名以两个点开头时被 **403**。
**requiredFix**：`rel !== '..' && !rel.startsWith('..' + sep)`。

### R6 · LOW · `src/main/protocol.ts:154-162, 182, 196`
无 `st.isFile()` 门：根目录内名为 `*.mp3` 的**目录**能通过白名单与 `stat`，随后以该目录的 `size` 提交 200/206 响应头，再在流阶段报 `EISDIR`（不会崩进程，但会产生一个「头正确、体报错」的响应）。
**requiredFix**：`if (!st.isFile()) return 404`；并在流 error 路径上直接销毁响应。

### R7 · LOW · `src/main/protocol.ts:109-117`（vs `:157/182/196`）
包含性只是**词法**判定，未做 `realpath`：根目录内指向外部的符号链接/联接点（`mklink /J`）会让契约外文件通过校验并被读取。
**requiredFix**：对 `target` 与各 `root` 做 `fs.realpath` 后再比较（realpath 失败即拒绝）。

### R8 · LOW · `src/renderer/src/stores/chatStore.ts:483-489` + `src/renderer/src/components/ChatPanel.tsx:63-70, 95, 202-217`
park 期间 `streamRaw=''` 且 `busy=false`，于是模型在暂停前说的那段话在**确认条出现的同时从界面消失**（`PendingConfirm.finalText` 写了但全仓无人读）；`abort()` 在 parked 分支不 finalize（叙述被丢弃），而 UI 在 parked 时只暴露「确认/取消」，唯一的停止按钮需 `busy`。
**requiredFix**：确认条内渲染 `pendingConfirm.finalText`（或 parked 期间保留 streamRaw 可见）；parked `abort()` 走 finalize。

### R9 · LOW · `src/renderer/src/stores/playerStore.ts:198-209, 462-467`
内部错误重试调用 `get().next()`（`manual` 默认 true），于是**解码/播放失败会静默清掉已武装的 'track' 定时器**（`clearSleep(true)` 无提示），并被当作「用户主动切歌」。
**requiredFix**：这些内部重试改为 `next(false)`（与 `handleEnded` 一致），或显式 `clearSleep(false)` 并提示。

### R10 · LOW · `src/renderer/src/stores/playerStore.ts:263-267`
注释与代码矛盾：注释称「armed 'queue' timer 不会封顶 index」，但 `sleepStop ? Math.min(...)` 正是封顶；在末位按下一曲会**重播同一首**（index 不变、音频从头开始）。
**requiredFix**：修注释，或在末位把「队列已结束」显式化（不改 index + 提示）。

### R11 · LOW（既有，非本轮引入） · `src/renderer/src/stores/chatStore.ts:163-174` vs `:513`
每次请求都把用户消息发**两遍**：`baseHistory` 末尾已含 `userMsg`，其后又追加 `userLlm`。
**requiredFix**：`history.slice(0, -1).slice(-HISTORY_LIMIT)`，或去掉 `userLlm`。

### R12 · LOW · `src/main/store.ts:140-153`
`flush()` 失败会让 `this.writing` 永久处于 rejected 链上：此后所有 `persist()`/`flush()` 立即失败且以 `void` 调用（未处理拒绝，依赖 t21/t23 的全局兜底），磁盘配置在本会话内不再更新。质量方的只读夹具实验正是这一状态（应用存活，但不再写盘）。
**requiredFix**：`this.writing = this.writing.catch(() => {}).then(...)`，或每次写入重建链。

### R13 · LOW（信息/纵深） · 其他
- `src/main/protocol.ts:168-171`：suffix range（`bytes=-500`）被解析成 `0-500`（应取尾部），多段 range 只服务第一段。
- `src/main/protocol.ts:101-106`：未校验 host（`media://evil/<b64>` 也接受）、未校验 base64url 规范字符（`Buffer.from` 会静默丢弃非法字符）；当前均 fail-closed。
- `src/main/protocol.ts:150`：形如 `file.txt:secret.mp3` 的 NTFS 流选择子能通过白名单（本机只读环境无法验证 `fs.stat` 是否绑定到流）。
- `src/main/index.ts:98-103`：dev 信任列表硬编码，未取 `ELECTRON_RENDERER_URL`（偏严，非暴露面）。
- 三个 CSS 文件不符合 prettier 默认格式（不在 lint 门禁内）；`TrackList.tsx:42` 唯一 warning；`scripts/gen-icons.mjs` 因目录级 ignore 不再被 lint —— 均为信息项。

## 3. finding 闭合对照表

| id | 内容 | 状态 | 证据（我亲自复核） |
|---|---|---|---|
| **F1** | 列表循环回绕被删 | **已闭合** | `playerStore.ts:265-267` 恢复 `(index+1) % len`；我的探针 6/6；新用例 `playerStoreSleep.test.ts:232/242/250`（已 seed 库 map，非空转） |
| **F2** | 一轮多 tool_calls 缺 tool 回复 → 400 | **基本闭合（残余 R2）** | `chatStore.ts:440-497` 循环继续 + 占位回填 + `answerToolCall` 同步 `pendingResume`；mock `--selftest` 11/11；新用例 `:354` 断言每 id 恰一次、末位调用未执行且未建歌单、恰 3 条 tool |
| **F3** | 越权读取 + 白名单 + 不返字节 | **已实现，但引入 R1** | `protocol.ts:108-117` 包含性（Windows 前缀/大小写/UNC/`\\?\` 均 fail-closed）、`:150` 白名单在两条取字节分支之前、`:142/148/151/161` 全部 `Response(null)` 无体无长度、均带 CORS 头；CORP 确认不存在且注释写明；`ACAO` 维持 `*` 并注释理由 |
| **F3-nav** | 导航/开窗守卫 | **部分（缺 R3）** | `index.ts:139/154/170` 单点安装，dev 精确 origin、打包态 `pathToFileURL` 前缀（`renderer-evil/` 不匹配、`%2e%2e/` 被规范化）；`window.ts` 已无自装 handler/`shell` |
| **F4** | 恢复轮无文本即丢叙述 | **已闭合** | `chatStore.ts:346` `setState({streamRaw: seed})`；用例 `chatConfirm.test.ts:402` 删掉 seed 即失败 |
| **F5** | 偏移文案反向 | **已闭合** | `LyricsPanel.tsx:160/165/180` 文案与实现方向一致（正=提前）；`lyricsOffset.ts:8-13` 与两组件公式的**符号未动** |
| **F6** | confirm() 抛错锁死面板 | **已闭合** | `chatStore.ts:222-240` try/catch + `finishRun`（busy 复位）+ `handleRunError`；循环内调用同样有 try/catch（`:450-462`） |
| **F7** | 定时器与模式交互 | **已闭合（R4 仅测试未钉住）** | (a) `playerStore.ts:248` 只清 'track'；(b) `sleepTimer.ts:118-121` 'one' → stop；(c) shuffle 死分支已删并注释（`:250-259`） |
| **F8** | 三条 index 断言空转 + `:186` 键集合锁死 | **已闭合** | `playerStoreSleep.test.ts:89-95` seed 了库 map；`:186` 附近改为断言「不含 sleep/deadline」；新增 3 条回绕用例（我的探针独立复现同结论） |
| **F9/F10/F11** | t6 报告勘误 | **已闭合** | `T13-ERRATA.md`；我核对了三处更正（MediaImage 假阴性+代码级错因、无 CORP、`protocol.ts:90` 按 t5 `--fix` 批次的**中性表述**） |
| **F12** | `protocol.ts:90` `let→const` | **维持信息项** | 现为 `const`、语义等价；provenance 按 captain 裁定的中性表述（无法确证，非 finding） |
| **F13** | `sleepFiresOnEnded` 死导出 | **已闭合** | 全仓仅剩测试里的一句移除说明（`sleepTimer.test.ts:170`） |
| **F14** | 测试文件归属 | **已闭合** | captain 已登记为受制裁产物 |
| **A1** | 迷你窗偏移同步缺判别证据 | **转 t15 取证（环境受阻）** | 按 captain 裁定记「通过（机制替代证据）」，不计 finding |
| **A2** | MiniPlayer 闭包去重 | **已闭合** | `MiniPlayer.tsx:21-67` 改 `claimed`/`wanted` ref（一次 fetch + newest-wins），并有 5 条单测（`mediaFormats.test.ts` 内） |
| **A3** | `needsConvert` 死导出 | **已闭合** | `decodeService.ts:70` 真调用点；`fileExt`（`:25-28`）与 `needsConvert` 同一取扩展名规则 |
| **A8** | `LyricsPanel.tsx:66` 依赖 `[current]` | **接受不修** | 按 captain 裁定记已接受 |
| **P0** | 旧配置缺 `updateURL` → 8s `undefined.trim()` | **根治已核实** | `store.ts:98-112` 读取期 `mergeWithDefaults` 后 `this.data = merged`，仅当真补过键才 `flush()`；递归合并、数组/`null` 视为叶子、`__proto__` 不落地；非 8s 定时器兜底（`index.ts:50-55` 全局 handler） |
| **AAC/APE** | 转码产物 `.tmp` 无法推断封装 | **已核实修复** | `decodeService.ts:92-95` 显式 `-f mp4` / `-f wav`；`:79` 只接受 `size > 0` 的缓存；`:98/106` 原子 rename 保留；`:99-108` m4a 失败回退 wav |
| **进程级死亡** | — | **仍未闭合** | 归 t15 `window-all-closed` 实验 + t9 打包态长跑（非本轮 finding） |

### R14 · MEDIUM · `src/main/decodeService.ts:96-98`（+ `:105`）
**转码缺少「产物非空」后置校验**：`await runFfmpeg(...)` 后直接 `fs.rename(tmp, out)`，**从不 stat 产物**；ffmpeg 以 0 退出但产出 0 字节/截断文件时，坏产物被写进缓存并**在同一次调用内**返回给渲染进程（`:111`）；`:79` 的 `st.size > 0` 只保护**后续**调用。
**requiredFix**：`:98`（与 `:106`）之前加 `const st = await fs.stat(tmp); if (st.size === 0) throw new Error('转码输出为空')`。
（性质：**既有**，非 t24 引入；t24 修的是容器推断根因，已核实。）

### R15 · MEDIUM · `src/main/decodeService.ts:85-86`
**临时文件名不唯一 + `fs.rm(tmp,{force:true})` 会删掉并发请求正在写的产物，且无 in-flight 去重**。同曲并发解码（如 `App.tsx:166 resumeIfSaved` 与 `TrackList.tsx:179` 双击 `playTracks` 撞车）时两个 ffmpeg 写同一路径：Windows 上落败方 `fs.rename` 多为 EPERM/EBUSY → `.ape` 直接抛「无法播放」，`.aac` 落入 wav 回退并在 `wavTmp` 上再次相撞；极端交错下可能发布撕裂的非空文件（再由 R14 的口子长期服务）。
**requiredFix**：`tmp` 用 `out + '.' + process.pid + '.' + (counter++) + '.tmp'`（去掉预清理 `rm`），或在 `ensurePlayable` 用 `Map<out, Promise>` 做 in-flight 去重。
（性质：**既有**，非 t24 引入。）

### R16 · MEDIUM · `src/main/store.ts:146-152`（+ `:108-111`）
**一次写失败会永久污染 `this.writing` 链**：`this.writing = this.writing.then(task)` 之后再无恢复路径，其后所有 `persist()`（`:135`）立刻拒绝且以 `void flush()` 调用（未处理拒绝，仅被 t21/t23 的全局 handler 记录），**本会话内设置/歌单/聊天不再落盘**；`init()` 的修复写失败还被 `catch {}` 静默吞掉。r2 让这条在升级路径的启动期就可触发（`:108`）。
**requiredFix**：`this.writing = this.writing.then(task, task)`（或在 catch 中重建链）并给 `init()` 的修复失败补日志。

### R17 · LOW（既有/纵深） · 其余
- `src/main/protocol.ts:109-117`：包含性为**词法**判定，未 `realpath`；根内的符号链接/联接点可指向外部并被服务（medium-low）。
- `src/main/protocol.ts:115`：`rel.startsWith('..')` 过宽 → 合法 `..name` 被 403。
- `src/main/protocol.ts:154-162`：无 `st.isFile()` 门；名为 `*.mp3` 的目录会以 200/206 提交响应头后再报 `EISDIR`。
- `src/main/protocol.ts:168-171`：suffix range（`bytes=-500`）被解析为 `0-500`；多段 range 只服务第一段。
- `src/main/protocol.ts:101-106`：未校验 host（`media://evil/<b64>` 亦接受）与 base64url 规范字符（当前 fail-closed）。
- `src/main/protocol.ts:150`：形如 `file.txt:secret.mp3` 的 NTFS 流选择子可通过白名单（本机只读环境无法证伪）。
- `src/main/decodeService.ts:30-34`：缓存键不含 `mtime|size` → 源文件就地替换后最长 7 天仍服务旧解码产物（同仓 `waveformService.ts:21` 的做法是对的）。
- `src/main/store.ts:56-60`：叶子默认值无 `typeof` 校验（文档声称 type integrity）；`"updateURL": 123` 会绕过 `index.ts` 的兜底直达 `SettingsModal.tsx:408/414/502` 的 `.trim()`。
- `src/main/store.ts:71-73`：JSON 中的自有键 `__proto__` 会走继承 setter（返回对象原型被替换、键在 `JSON.stringify` 时丢失），`constructor`/`toString` 等被 `!(key in out)` 丢弃（无全局污染）。
- `src/main/index.ts:299-305`：注释仍称「store.ts 只做顶层合并」，r2 后已不成立。
- `src/renderer/src/lib/lyricsOffset.ts:8-9`：文档措辞易读反（把「正偏移造成的结果」写成「early-coded LRC 的典型情形」）；`LyricsPanel.tsx:165` 用 U+2212 而读数用 ASCII `-`。
- 测试侧弱断言（非空转、可改进）：`playerStoreSleep.test.ts:180/:209` 恒真；`:212` 的 storage stub 只记 value 不记 key（换 key 持久化检测不到）；`recommend.test.ts:88` 仅断言「不存在」；`chatConfirm.test.ts:141` 的 `before` 是活引用（就地变异回归测不出）；`sleepTimer.test.ts:184-190` 与 `:150-159` 重复；`queue.test.ts:36` 与 `:35` 重复；A3 的判定无任何测试导入 `decodeService`。

### R18 · 正面确认（本轮修复的正确性，我均已亲自复核）
- F1/F2/F4/F5/F6/F7/F8/F13、A2/A3 在**生产代码**中均已正确落地（见 §3 对照表）；
- F8 三条新回绕用例**具有判别性**（去掉 `% queue.length` 会让 index=3 越界 → index 停在 2 → 断言失败）；我另用带真实 `window.api` stub 的探针独立复现了同一结论；
- P0 为**读取期根因修复**（非掩盖），AAC/APE 的 `-f` 修复有运行期产物佐证（缓存中的 `.m4a` 头部为真实 MP4 `ftyp`）。

## 3.1 P0（旧配置缺 `updateURL`）——「根治 vs 兜底」的双路独立证据（补充纳入）

**结论不变：读取期合并是根因修复，t21/t23 的 `?? ''` + try/catch 只是防御层。** 除我自己的代码复核外，现有两路**互相独立**的运行期证据，结论一致：

| 路 | 来源 / 类型 | 方法（决定性之处） | 结果 |
|---|---|---|---|
| ① | **quality 的只读夹具实验**（captain 转达，已在 r2 判据中） | 把 `%APPDATA%\nebula-player\settings.json` 设为**只读**后启动修复版打包体 → `init()` 的 `flush()` 写入被**物理阻断**（mtime 仍为旧值、`updateURL` 未落盘） | t=10/20/30s 均 5 进程存活、`reading 'trim'` 异常增量 0 → 缺键**不可能**来自写入期 ⇒ **物理排除**「写入期补键」 |
| ② | **实现方（audio-engine）独立只读验证**，captain 转达 | 见下（代码位置 + 新探针 `scripts/probe-settings-readmerge.mjs` + 升级路径 5 项取证） | 启动后 `getPublic().general.updateURL` 是**空字符串**（`typeof === 'string'`、`.trim()` 安全）⇒ 8s 定时器读到的是 string |

**② 的细节（我已逐项复核）**
- 代码位置：`store.ts:100/103/104` —— `await fs.readFile` → `mergeWithDefaults(this.cloneDefaults(), parsed, added)` → `this.data = merged`，**读盘后立即合并，早于任何 `get()`**；`mergeWithDefaults`（`:54-91`）为通用递归合并。
- 运行期探针（只读，需 dev 实例）：`scripts/probe-settings-readmerge.mjs` 通过 CDP 调用 `window.api.settingsGet()`，输出 `{ hasUpdateURLKey: true, updateURLValue: "\"\"", typeofUpdateURL: "string", trimSafe: true, generalKeys: [6 键含 updateURL] }`（证据文件 `.devdata/t13-evidence/t22-readmerge-proof.txt`）。
  **非循环论证的核验（我做的）**：`SettingsService.getPublic()`（`settings.ts:47-58`）是**直通投影**（`general: s.general`，无 `?? ''`、无默认值拼装）⇒ 探针看到的 `""` **只能**来自 store 的合并结果，因此这条证据确实指向读取期合并，而**不是**投影层的默认值。
- 升级路径 5 项取证（夹具 = 1.0.2 时代形状：`general` 仅 5 键、无 `updateURL`，`JSON.stringify` 写入、首字节 `123`、无 BOM）：① 真实升级路径（非首装）② t=5/10/15/20/25s 均 `electron=5` + CDP 在线、从未退出 ③ 日志**零** `uncaughtException`/`unhandledRejection`/`Cannot read properties of undefined` ④ 见上 ⑤ 修复前同形态 ~8.1s 抛 `TypeError: … reading 'trim'` → 修复后存活 25s 零异常。
- 夹具已恢复并复验：`settings.json`（394 B，mtime 19:26:26）**首字节 123、无 BOM、`updateURL` 原值 `http://127.0.0.1:8888/` 已回来**；实例已关（我实测 `Get-Process electron` = **0**，无残留）。证据目录 `.devdata/t13-evidence/`（实现方目录，非验收方目录）。

**决定性一点（请写入结论）**：因为补键发生在**读取期**，8 秒定时器的 `.trim()` 收到的是 **string**，即使**忽略** t21 的 `?? ''` 与该定时器的 try/catch 也**不会**抛 `undefined.trim()` ⇒ 这是「根治」而非「被兜底掩盖」的判据。captain 已另开 **t27（verification → audio-engine）**把该验证纳入正式记录。

> 备注：该补充证据与 **R1（用户可见的 BLOCKER）无关**，不改变 t14 的 verdict；它只强化了 P0 一栏的「已闭合」判定。另：② 的探针只有在**缺键夹具**下才具判别性（当前磁盘上的 settings.json 已恢复原值，直接复跑不再具判别力），故以已落盘的 `t22-readmerge-proof.txt` + 夹具恢复证据为准。

## 3.2 t26 两项「环境受阻」项的第三路补充证据（captain 转达；reviewer 逐项复核）

同一冻结树的证明：`T26-GAPS-CROSSREF.md` 用 8 个关键文件 sha1 与 t26 记录对齐；**我用自己的第 0 步快照独立复核**了其中若干项（`protocol.ts = 1b076de5cacc`、`decodeService = df1c81800a0d`、`window = 2806d7ab4233`、`audioEngine = e01f4c0d66d5`、`playerStore = 512e558ed3b2`、`MiniPlayer = a66cf9953912`）→ **全部一致**，且该文件自述了「聚合值不可直接比较（含/不含 `__tests__`）」的口径，属诚实声明。

**(1) F3 反面（越权被拒）→ 判定：通过（交叉证据）。** 证据 `.devdata/t13-evidence/t13-media-roots.json`（我逐字复核）：

| 请求 | 结果 | 判别意义 |
|---|---|---|
| 真实音轨 `song-c.flac`（`<audio>`） | `metadata:5`（加载） | 正常路径未破坏 |
| `covers` 目录内真实封面 | `loaded, w=512` | 封面未破坏 |
| **`<userData>/probe-outside-roots.png`（根外、但扩展名可服务）** | **refused** | **证明拦它的是包含性校验，而不是扩展名白名单** |
| 同一文件经 `…\user\..\user\covers\…`（归一化后回到根内） | **loaded, w=512** | 证明用的是 `resolve`+`relative` 归一化，而非字符串前缀 |
| `<userData>/settings.json`（含 API Key） | **refused** | 关键目标被拒 |
| `<library root>\..\..\..\..\Windows\win.ini` | **refused** | 跨盘穿越被拒 |
| 音轨旁的同目录 `.txt`（根内、非白名单） | **refused** | 白名单生效（负向对照） |

→ 该矩阵**同时**证明包含性与白名单各自都在起作用（两者有判别性对照），据此结案**通过（交叉证据）**，无需再跑会触发 `0xC0000409` 的重负载探针。

**(2) 跨源交叉确认：`decode-cache` 在允许根内** —— `src/main/protocol.ts:54` `new Set([resolve(p.covers), resolve(p.decodeCache)])`（我已复核该行）；t28 另用**真实 `needsConvert()`** 实测 `aac/AAC→'m4a'`、`ape/APE→'wav'`、6 个直放格式→`null`、`xyz/noext→null`。→ 这把 F3 的白名单与 t24 的 AAC/APE 修复接上了：否则**即使转码成功也播不出声**（产物在 decode-cache 内，必须可服务）。属正面确认。

**(3) A1（判别性迷你窗同步）→ 判定：通过（机制替代证据，保守写法）+ 一处证据出处更正。**
- **机制与代码面（我已复核）**：`MiniPlayer.tsx:5/:37/:87` 与 `LyricsPanel.tsx:48/:78` 同模块、同 key、同公式（`+offset`），主窗写 `localStorage['nebula.lyricsoffset']` → 机制成立。
- **可用的实测叙述**：verifier 的 `.devdata/t6-evidence/T6-LYRICS-OFFSET-CORRECTION.md` §2 记录了**两次跨行运行**（冻结 `t≈1.06`，offset `0→+2.1→+7.0`：mini `active` 由「夜幕低垂」→「远处传来」→「我在城市的边缘」，`lines` 1–2→3→3，复位回退），并明确更正了我 r1 提出的「原探针不可判别」一点。
- **⚠️ 证据出处更正（必须记录）**：`T26-GAPS-CROSSREF.md:54` 称「t26 自己的 `probe-lyrics-sync-crossing.json` 与之相符」，但**磁盘上该 JSON（`capturedAt 2026-09-12T10:40:37Z`，`t6-evidence/`）记录的是一次失败运行**：`mini.title` 始终为 `测试歌曲A`（不是被测的长测试曲）、`active: null`、`lines: 1`、`highlightChangedWithOffset: false`、`verdict.miniHighlightChanges: false`、`clickJump.error: "target line not found"`。也就是说：**被引用的那份原始 JSON 并不支持该结论**（应是早期快照被后一次失败运行覆盖）。
- **另一处未取证的断言**：crossref 称「迷你窗**收到 `storage` 事件**」，但 verifier 自己的附录 §2 已如实写明「**没有拿到那一份事件数组的成功快照**」（实例中途 `0xC0000409`）。因此「storage 事件数组」这一形态的证据**至今不存在**；机制证据是间接的（mini 高亮随偏移变化 + 同源模块 + 主窗写键）。
- **结论**：按 captain 给出的保守写法记为 **「通过（机制替代证据）」**，并**明确标注：独立运行取证受阻于环境，且被引用的 JSON 与叙述不符**；建议在实例稳定后（或 t9 打包态）用 `seek(13.5)`+±0.5 或从 mini target 直接读 `localStorage['nebula.lyricsoffset']` 补一份**单次、可复核**的快照，并把 crossref 的引用改为指向那次快照或删除该句。**不作为 blocker。**

## 4. 是否存在新的空转断言（F8 性质不得再现）

**是，出现 1 条**：R4（`playerStoreSleep.test.ts:258`）。其余新用例经逐条核查**均可在实现被回退时失败**：
`chatConfirm.test.ts:354`（删掉占位回填即失败）、`:402`（删掉 seed 即失败）、`:221/:275/:306/:334`（文本精确等值 + 单次出现 + tool 消息唯一 + park 守卫）、
`playerStoreSleep.test.ts:232/242/250/270`（均先设 index=2 或断言 sleep 模式，坏实现下会失败）。
两处**恒真但无害**的旧断言：`playerStoreSleep.test.ts:180`、`:209`（断言用例自设值；同用例另有 `pause`/toast 实断言）。
`expectEveryToolCallAnswered`（`chatConfirm.test.ts:32-42`）无法发现「同一条 assistant 消息内 id 重复」——这正是 R2 的场景，已在 R2 中要求补强。

## 5. 非阻塞 backlog（不写入 findings、不影响 verdict）

| id | 位置 | 说明 |
|---|---|---|
| B1 | `audioEngine.ts:410/429` | `released` 标签代际差 1（仅诊断字段；改动会让 t2/t10/t15 取证口径失配） |
| B2 | `audioEngine.ts:205/243-251` | `unlock()` 对永不 settle 的 `setSinkId` 无超时 |
| B3 | `audioEngine.ts:161-179` | `ensureGraph` 抛错路径元素被占用 |
| B4 | `protocol.ts` | 若上 CORP 需「全 `media://` 子资源加 `crossOrigin` + 5 格式与封面全量回归」单独立项 |
| B5 | `scripts/diag-*.mjs` | 28 处 `#mini` 坑（验工装，post-1.0.4） |
| B6 | `NowPlaying.tsx` / `protocol.ts` | MediaImage→`data:` 候选 |
| B7 | 三个 CSS 文件 | 不符合 prettier 默认格式（不在 eslint 门禁内） |
| B8 | `eslint.config.mjs:15` | `scripts/**` 目录级 ignore；后续可改为 scoped 覆盖并保留 `no-unused-vars`（`--no-ignore` 实测 scripts 78 error / 97 warning，其中 76 为 return-type） |
| B9 | R11/R12/R13 | 上述 LOW 项中标注「既有/纵深」者（重复用户消息、写入链污染、suffix range、host 校验、ADS 形态路径、dev 列表硬编码） |

## 6.1 r3 预置：执行纪律、GO 条件与必验清单

### (1) 执行纪律（2026-09-12 第二次更新：r3 审查最终落在 **t42**）

- **不要 claim 的作废任务**：`t9`、`t30`、`t32`、`t35`、`t38`、`t39`（面板上仍可见，但均已作废/被取代）。
- **r3 审查在 `t42` 上进行**（面板实测：`t42 [pending] attempt 0 → reviewer`，deps = `t41`）。纪律：**等 `t41`（r3 终版验证）completed 且收到 captain 的 GO 之后再 claim `t42`**；调度器若提前派发，照旧停手回报、不提交 verdict。
- **最终链**：`t34`/`t37`/`t40`（修复）→ **`t41`**（r3 终版验证，deps 留空 + 显式放行纪律）→ **`t42`**（我）→ **`t43`**（1.0.4 发布：升版 + `build:win` + `verify-asar.mjs` + `/S` 覆盖安装 + 升级路径长跑 + 打包态冒烟）。
- `t42` 的 acceptance 已写入本报告 §6.1 清单，并新增一项：**t40 的 `mediaRoots` 两条不变量必须先「退回旧实现」验证其判别性**。
- **t24 分支级口径**（t42 沿用）：修前 `4294967274`/0 B 与应用内上报退出码**完全一致**（构成因果链）、修后 `-f mp4` 50382 B（真 `mov`+AAC LC）/`-f wav` 532558 B（真 `wav`+pcm_s16le）；**不主张端到端**；APE 端到端未取＝环境限制；**不覆盖 R5/R6**（既有问题进 backlog）。

### (1b) ⚠️ r3 判定必须注意的一条状态语义（避免误判）

面板上 **`t33`（R1+R3）与 `t36`（R4(a)）都是 `failed`，但其自述交付物已完成、判别力已验证**：
- `t33`：R1 BLOCKER（`protocol.ts:44` 删布尔闩锁 → `rootsPromise`、新增 `normalizeRoots()`、刷新入口）与 R3 均已实现并做过运行时验证；判 failed 的原因是**契约门禁被 out-of-scope 文件阻塞**（lint 2 errors / typecheck 2-2 / tests 2 failed，来自其他成员 in-flight 文件）。
- `t36`：R4(a) 用例已改造为多轨 + `mode:'one'` + `armQueueEnd`，并以「删掉那行必失败」实证判别力；判 failed 同样只是门禁项来自他人文件。

→ **r3 我按「最新工作区 + t41 最终树证据」判定，不把上述 `failed` 直接读成「未修」**；但也**不接受仅凭自述**——判别性一律由我自己复现（回退实现即失败）。这是口径，不是对结论的预判。

### (2) GO 条件（第三次修订）

> **GO = `t41`（r3 终版验证）completed**（前置：`t34`/`t37`/`t40` 均 completed）→ 收到 captain 的 GO 后我 claim `t42`。
> `t9`/`t30`/`t32`/`t35`/`t38`/`t39` 一律作废，不计入任何条件。

### (2b) ⚠️ 锚点已换代（t42 第 0 步必须按新锚点比对）

| 锚点 | sha1 | 文件数 | 最新 src mtime | 定位 |
|---|---|---|---|---|
| r2 冻结树 | `b7ea6c857054a8890952608fa9d50ed9e94ff759` | 71 | `2026-09-12T10:58:00Z` | **仅历史**（t14 与 t15/t25/t26 那一轮用过，**不代表当前树**） |
| r3 进行中（`t25-final`） | **`60af497db89eda4266002fef53620e524b0e23c4`** | **74** | `2026-09-12T12:00:08.805Z` | r3 仍在写 → t42 只能以 **t41 落盘的最终锚点** 为准 |

**t42 第 0 步操作约定**：`node scripts/snapshot-fingerprint.mjs --label t42`（**必须带 label**，避免覆盖 verifier 在 `.devdata/t13-r2-evidence/` 下的既有快照文件），把 t42 现场值与我复跑时 t41 声明的锚点逐字比对；**若与 t41 记录不一致，先回报 captain、不开始审议**（说明树在我取证期间又被改动）。

<details><summary>[历史] 第二版 GO 条件（已被第三次修订取代）</summary>

> **GO 条件（第二版）= `t33` + `t34` + `t36` + `t37` 全部 completed，且 `t35` completed。** `t29`（坏契约，已 failed）与 `t32`（被 t35 取代）作废。

</details>

必验清单的承接关系（captain 已全部采纳我的 §6.1）：**R1 → t33**（verifier 在 **t35** 独立复跑）；**R2 + R4(b) + 两条既有空转 → t34**；**R3（含「不误伤 dev HMR 正常重定向」）→ t33**，由 t35 核；**R4(a) → t36**；**R4(c) → t37**；第 0 步口径与「R5/R6/R7 进 backlog、不计 findings」全部沿用。

### (2b) t24（AAC/APE 转码）—— 第三路**分支级**独立交叉证据（r3 记录用；我已逐项核对原始 JSON）

`.devdata/t13-r2-evidence/t24-transcode-branches.json`（capturedAt 2026-09-12T11:39:06Z；探针 `scripts/verify-transcode-branches.mjs`，19:38）：

| 检查 | 值 |
|---|---|
| 修前 m4a 分支（无 `-f`、输出 `.tmp`） | **exit=4294967274**、**0 B**、`Error opening output files: Invalid argument` |
| 修后 m4a 分支（`-f mp4`） | **exit=0**、**50382 B**；ffmpeg 自述容器 `mov`、`Audio: aac (LC) (mp4a)` |
| 修前 wav 分支（无 `-f`） | **exit=4294967274**、**0 B**、同一错误 |
| 修后 wav 分支（`-f wav`） | **exit=0**、**532558 B**；容器 `wav`、`Audio: pcm_s16le` |
| **因果性对照** | 修前 exit **4294967274** 与应用内上报的退出码**完全一致** |
| 静态核对 | `decodeService.ts:94/95/105` 三处 `-f`（`mp4` + `wav` + wav 回退），`.tmp` 命名保留（故 `-f` 必需） |
| 合计 | **12 项通过 / 0 失败**（`allPass: true`） |

- **独立性**：与 t24 作者侧证据方法不同（作者侧走运行期整链/缓存产物；此路走**分支级**真实 ffmpeg + 夹具 `tone.aac`（真 ADTS AAC））→ 互为独立交叉印证。
- **如实范围**：**不主张端到端**（运行期整链未取证，将并入 t35）；**APE 端到端未取**（本机 ffmpeg 无 Monkey's Audio 编码器），APE 仅以**同一 wav 参数向量**在分支级被证明。限制随证据一并声明，属诚实表述。
- **我的判定**：R5（缺「产物非空」后置校验）与 R6（临时名不唯一）**不因本证据改变**（本证据只证明「容器推断根因已修」，不覆盖后置条件与并发）→ 仍按**既有**问题处理（captain 列为可选，未修则进 backlog）。

### (2c) A1 的 r3 处置（captain 已采纳我的更正）

verifier 将在 **t35** 产出**全新单次快照**（新文件名，如 `t35-lyrics-mini-sync.json`），并在报告中**声明 `T26-GAPS-CROSSREF.md:54` 引用的那份 JSON 是失败运行、不得引用**，同时声明「迷你窗收到 `storage` 事件」**至今无成功快照**（机制证据仅为间接）。→ 我在 r3 将**按新快照判**，不再引用旧引用。

### (3) r3 必验清单（captain 采纳我的提议 + reviewer 补充）

1. **R1 判别性验收（最高优先）**：①会话中**扫描新目录后播放该目录内文件必须 200**（mp3/flac/wav/ogg/opus/m4a 至少各一）；②**冷启动并发封面请求全部 200** —— 必须构造「首批媒体请求即并发封面流」的情形（t26/t13 是「先播音频再取封面」才绕开了该窗口）；③确认 `ensureRoots()` 不再有「闩锁先于赋值」的窗口，且**刷新入口真的被调用**（`setMediaRoots` 不再死代码）或按 mtime 重算。
2. **R2 判别性**：回退 id 加进程内唯一后，构造「同一工具在两轮中被调用且供应商省略 id」——断言**上一轮的 tool 消息未被覆盖**、每个 `tool_call_id` 恰一条回复；并覆盖「同一条 assistant 内 id 重复」这一此前 `expectEveryToolCallAnswered` 测不到的情形。
3. **R3**：`will-redirect` 存在且对非 app 页面 `preventDefault`；dev 信任列表若改由 `ELECTRON_RENDERER_URL` 推导，需说明未设置时的行为。
4. **R4 三类空转是否真正消除（逐条判别性检查，不接受「用例变多」）**：
   - F7(b)：新增用例必须在**多轨队列 + `mode:'one'`** 下断言「首曲自然结束即停并清 sleep」；把 `sleepTimer.ts:121` 删除/取反后必须**失败**。
   - A2：测试必须**import 生产代码路径**（抽出的纯函数由 `MiniPlayer.tsx` 调用）；把 `MiniPlayer.tsx` 的 `claimed`/`wanted` 判断回退后必须**失败**；若仍是测试侧复刻则退回。
   - F5：符号约定必须被用例钉住（如 `+0.5` 时 `t=10` 行在 `currentTime≈9.4` 激活、`−0.5` 时在 `≈10.6` 激活）；把两处 `+ offset` 取反后必须**失败**。
   - 另核 R4(d) 两处**既有**空转（`recommend.test.ts:74` 靠 tie-break、`:77-83` 回退分支不可达）是否一并清理。
5. **第 0 步（t42 口径，已按 captain 两条判据更正）**：`node scripts/snapshot-fingerprint.mjs --label t42` 现场重算锚点（**带 label，勿覆盖 verifier 快照**）+ `node scripts/verify-lint-tests.mjs --label t42`（附时间戳）+ 我自己的 `npx.cmd eslint --no-cache --format json .`（范围 = `src/**` + 根配置）。
   **⚠️ 门禁只认逐项值（判据更正 1）**：`verify-lint-tests.mjs` **自身几乎总是 exit 0** —— 我在源码层面核实：该脚本**根本没有 `process.exit` 调用**，末行是 `writeFileSync(JSON.stringify({...}))`（`scripts/verify-lint-tests.mjs:218`）⇒ **"runner exit 0" 无判别力**。唯一可用的读法是落盘 summary 的**逐项值**，全部成立才算过：
   `lint.exitCode === 0` 且 `lint.errors === 0` 且 `lintErrorFiles.length === 0` 且 `typecheck.node === 0` 且 `typecheck.web === 0` 且 `tests.exitCode === 0` 且 `tests.failed === 0`，并与我自己的 `eslint --no-cache` 交叉核对。
   （我在 t14 引用的正是逐项值，故 t14 判定不受影响；但表述不再写「runner exit 0 = 门禁通过」。）
6. **遇红先按「文件归属」分组，再决定「等」还是「报」（判据更正 2）**：quality 本轮两次遇到他人 in-flight 文件的临时红（`MiniPlayer.tsx` 六个 `Property 'api' does not exist`，约 35s 后消失；`llmClientToolIds.test.ts:70` return-type error，约 20:04 自愈）。**门禁型 failed（t33/t36/t37）属此类** → 判定按**工作区实况**，不看任务状态字面。我复跑若遇红，先按 mtime + 文件归属表区分「他人中途态」与「本轮新增缺陷」：前者记录/等待，后者才进 findings。
7. **t40 的双保险要在 t42 自行复现**：R1 现有「运行期探针（t33）+ 单测不变量（t40）」两层。t40 的硬证据是**倒退实验**：把实现退回「闩锁 + `refresh()` no-op」→ 同一测试文件 **5 failed / 4 passed**，失败断言正是两条目标回归（`resolves EVERY concurrent first call…` → `expected 0 to be greater than 0`；`applies a folder that only appeared after…` → `expected ['C:\\music'] to include 'C:\\newdir'`）；哈希三段 `da4fd2c14a4a` → 倒退 `72e099be1453` → 还原 `da4fd2c14a4a`（`RESTORED-IDENTICAL: True`），文件内 `loaded = true`/`DEGENERATE` 零命中。→ **我会自己重做这条倒退实验**（不采信转录），并额外核一条已被用例钉住的陷阱：`mediaRoots.ts` 的 `staticRoots` **必须是函数而非数组**（dev 下 `app.setPath('userData', …)` 在本模块 body 之后执行，import 期求值会解析成**默认 userData**）。
8. **新回归面**：R1 若改为「每次请求重算/按 mtime 缓存」，需核并发与性能，且**不得**退化成「不再校验包含性」；R3 的 `will-redirect` 不得拦掉 dev HMR 的正常重定向。
9. **R5/R6/R7 若未修**：均属**既有**问题，按其性质记入 backlog，不计入 findings、不影响 verdict。
10. **最终链（2026-09-12 第三次更新）**：`t34`（已终态）+ `t40`（completed）+ **`t44`（待完成）** → `t41` → **`t42`（我）** → `t43`。

### (4) 其他移交项

- captain 已把我的 §3.1 `getPublic()` 直通投影判定转给验证侧作为「探针判别力前提」（缺键夹具 → 只读夹具三步的 AFTER 一步），并转达了「已恢复原值的 `settings.json` 直接复跑不再具判别力」。
- A1 的证据出处更正（`T26-GAPS-CROSSREF.md:54` 引用的 JSON 实为失败运行、storage 事件数组未取到）已在 §3.2 记档；r3 期间若补到单次可复核快照，请同步更新引用。

## 6. 复核方式（可复跑）

```powershell
node scripts/snapshot-fingerprint.mjs                 # 期望 srcAggregateSha1=b7ea6c857054a8890952608fa9d50ed9e94ff759, 71 files
node scripts/verify-lint-tests.mjs --label t14        # lint/typecheck/test 真实退出码
npx.cmd eslint --no-cache --format json .             # 范围=src/**+根配置：70 files / 0 error / 1 warning
npx.cmd vitest run --config .devdata/t7-review/vitest.review.config.ts   # reviewer 的 F1 回绕探针 6/6
node scripts/mock-llm-confirm.mjs --selftest          # F2 网关序列自检 11/11
```

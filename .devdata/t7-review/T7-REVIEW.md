# t7 — 独立审查报告（NEBULA Player 六项改进 · 本轮变更 + t6 验证证据）

- 审查人：reviewer（独立评审；**未修改任何 src/** / scripts/** 实现代码**）
- 审查对象：t1 / t2 / t3 / t4 / t5 的实现 + t6 的验证证据 + t10（t6 报告覆盖的频谱根因修复）
- 工作目录：`C:\博830\vibecoding\nebula-player`（**无 git 仓库** → 基线取自“已安装的 1.0.3”执行体）
- 基线方法：从 `C:\Users\34872\AppData\Local\Programs\nebula-player\resources\app.asar`（version 1.0.3，安装时间 09-12 12:28）提取 `out/renderer/assets/index-D_1iosaX.js` 与 `out/main/index.js` 作为**改造前**语义基线
- 本报告全部证据：`.devdata/t7-review/`（日志/探针原文可复核）

## 0. 结论

**verdict = needs_revision（不得进入打包）**

| 项 | 实现是否达成 acceptance | 结论 |
|---|---|---|
| t1 睡眠定时器 | 功能本体基本达成，但**顺带删除了列表循环的回绕语义** | **BLOCKER** |
| t2 频谱设备绑定 | 达成（setSinkId 生效、unlock 顺序修复、诊断字段齐全） | 通过（有 2 条遗留） |
| t3 AI 破坏性二次确认 | 单调用路径正确；**多 tool_calls 时会复发 400** | **BLOCKER** |
| t4 歌词偏移 | 功能与同步达成，但**UI 文案与实现符号约定相反** | MEDIUM |
| t5 单测 + ESLint | 独立复核：0 error / 1 warning、106 用例全绿、抽取无行为变化 | 通过（1 条越界披露） |
| t10 频谱根因（t6 覆盖） | 根因属实（CORS 清零）；但**引入了任意文件读取 + ACAO `*` 的安全面** | HIGH（安全） |
| 质量门 | `lint=0` / `typecheck:node=0` / `typecheck:web=0` / `test=0` 独立复跑全部通过 | 通过 |

> 质量门通过 ≠ 可发布：本次退回的两条 BLOCKER 都是**现有用例覆盖不到**的行为回归（见 F1/F2/F8），不是编译或测试失败。

## 1. 独立复跑的质量门（权威退出码）

`.devdata/t7-review/run-gates.mjs`（Node 直接 spawn `npm.cmd`，无 PowerShell 管道）：

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npm.cmd run lint` | **0** | 0 error / 1 warning（TrackList.tsx:42） |
| `npm.cmd run typecheck:node` | **0** | 通过 |
| `npm.cmd run typecheck:web` | **0** | 通过 |
| `npm.cmd test -- --reporter=dot` | **0** | Test Files 11 passed / Tests 106 passed |

额外强校验（绕开 `--cache`，排除缓存掩盖）：`npx.cmd eslint --no-cache --format json .` → **errors=0 / warnings=1**，
仅 `src/renderer/src/components/TrackList.tsx` 的 `react-hooks/incompatible-library`（TanStack Virtual 既有限制）。见 `eslint-nocache.json`。

## 2. BLOCKER

### F1 — 睡眠定时器改动删除了「列表循环」回绕，且与定时器无关（默认模式即受影响）

- 证据（当前代码）`src/renderer/src/stores/playerStore.ts:266-267`
  ```ts
  266    const lastIndex = Math.max(0, s.queue.length - 1)
  267    const nextIndex = Math.min(s.index + 1, sleepStop ? lastIndex : s.queue.length - 1)
  ```
  非空队列下 `Math.max(0, len-1) === len-1`，故三元表达式两个分支**完全等价** → `Math.min(index+1, len-1)` 恒定钳制。
  且 `sleepStop` 在能到达该行的路径上永不为真：`next()` 在 :246 已先清掉 ended 型定时器（manual），
  唯一的 `next(false)` 调用方 `handleEnded` 在 :389-400 已提前 return。
  **净效果 = 把 1.0.3 的回绕语义整段删掉了。**
- 基线对照（安装版 1.0.3 `out/renderer/assets/index-D_1iosaX.js:14105-14118`）
  ```js
  next: (manual = true) => { ... } else {
    nextIndex = (s.index + 1) % s.queue.length;      // ← 回绕
    if (!manual && s.mode === "one") return;
  }
  ```
- 运行期证明（reviewer 探针 `.devdata/t7-review/queueWrap.review.test.ts`，跑真实 store；日志 `probe-wrap.log`）
  - 队列 `['a','b','c']`、`index=2`、`mode='list'`、**未武装任何定时器**：
    - 自然结束 `handleEnded()` → `index=2`（期望 0）→ **末曲无限重播，队列再也回不到第 1 首**
    - 手动 `next()` → `index=2`（期望 0）
    - `mode='one'` 手动 `next()` → `index=2`（期望 0）
  - 同一探针中「queue 定时器中途前进 0→1」「末曲结束即暂停」仍通过 → 定时器本体没坏，坏的是原有回绕。
- 影响：`mode: 'list'`（默认值）+ UI 文案「列表循环」下，播完最后一首会永远重复最后一首。
- requiredFix：`const nextIndex = sleepStop ? Math.min(s.index + 1, s.queue.length - 1) : (s.index + 1) % s.queue.length`
  （或直接恢复 `(s.index + 1) % s.queue.length` 并删掉死分支）。

### F2 — AI 确认流：一轮多个 tool_calls 时，确认项之后的调用没有 tool 回复 → 复发 400

- `src/renderer/src/stores/chatStore.ts:390-428`
  ```ts
  390    for (const tc of toolCalls) {
  ...
  404      if (result.needsConfirm) {
   ...
  422        return true            // ← 循环在此中断，后面的 tool_calls 一条 tool 回复都没有
  423      }
  ```
  下一轮请求由 `:441-451` 用 `...resume.chain` 组装，于是链上是
  `assistant(tool_calls=[call_a, call_rm, call_b]) → tool(call_a) → tool(call_rm,'等待用户确认：…')`，
  **`call_b` 没有任何 tool 消息** → OpenAI 兼容网关必然 400（本轮的既定风险面）。
- 实现自述与代码不符：报告称「位于确认项之后的调用会以『等待用户确认』占位回填」——
  该占位只在**被 park 的那个 id** 上写入（`tools.ts:206-215` + `chatStore.ts:398`），后续 id 完全没有回填。
- 放大后果：`confirm()` 在 `:216-221` **先执行了真实写入**，随后 `runFrom` 因 400 抛错 →
  用户看到「⚠️ 无法获取 AI 回复」，但歌单已经被改。
- 为什么 t6 抓不到：`scripts/mock-llm-confirm.mjs:150-187` 每条 assistant 只发**一个** tool_call；
  其序列校验（`:38-56`）只查「tool 紧跟含 tool_calls 的 assistant」与「同一 id 不重复」，
  **不查「每个 tool_call_id 都有回复」**。
- requiredFix：命中 `needsConfirm` 时不要 `return`，先把该轮**剩余** tool_calls 全部写入占位 tool 回复
  （或在 park 前执行完非破坏性调用），保证「每个 id 恰一条 tool」后再 park。

## 3. HIGH（安全）

### F3 — media:// 变成「无校验任意文件读取 + 跨源可读」的组合

- `src/main/protocol.ts:41-46`：`pathname` 直接 base64url 解码成**绝对路径**，无根目录白名单；
  `:74-84` 只做 `fs.stat`；`:116-127` 200 分支无扩展名限制。
- `src/main/protocol.ts:34-39`：`Access-Control-Allow-Origin: *`，且 204/400/404/405/416/206/200 **每个分支**都带全量 CORS 头。
- `src/main/index.ts:28-37`：scheme 注册 `corsEnabled + supportFetchAPI + stream`。
- 基线对照：1.0.3 已安装主进程 `out/main/index.js` 中**没有** `Access-Control-Allow-Origin`、**没有** `registerSchemesAsPrivileged`
  → 该暴露面是 t10 本轮新增的（路径解码本身是既有代码）。
- 现实可达性：今天没有远程内容入口（renderer 无 `window.open`/`<a href>`），应用页 CSP `connect-src 'self'`；
  但 `img-src/media-src` 显式允许 `media:`，且全仓**没有 will-navigate/will-redirect 守卫**。目标是真实存在的：
  `<userData>/settings.json` 内含 API Key（`src/main/settings.ts:87-93`，`keyMode:'plain'` 回退为 base64 明文）。
- requiredFix：`path.resolve` + 相对路径包含性校验（限定到曲库根/封面/波形/解码缓存目录），
  非白名单扩展直接 404，`ACAO` 收敛到应用自身来源；`corsEnabled` 若可通过更窄的方案替代则替代。

> **captain 处置（已裁定，r2 按此判）**：F3 **本轮修**，验收项 = ①`protocol.ts` 加 `path.resolve`+`relative` 包含性校验、②扩展名白名单、③越权请求 403/404 **且不返回字节**、④`index.ts` 加 will-navigate / setWindowOpenHandler 守卫。
> **明确不改 `CORS_HEADERS` 的 ACAO 取值**（理由：`crossOrigin='anonymous'` 的媒体元素需要 CORS 干净响应；打包态 renderer 为 `file://`（Origin `null`），收紧来源有再次打哑频谱的风险；本机 renderer 无远程内容入口），并要求把该理由写进 `protocol.ts` 注释。
> → 本报告 F3 中「`ACAO` 收敛到应用自身来源」一条**予以撤回**；**r2 不得就 ACAO 取值开 finding**，只核上述四项验收。

## 4. MEDIUM

### F4 — 确认后「模型本轮没吐文本」会把确认前的叙述丢掉
`chatStore.ts:419-420` park 时清空 `streamRaw`；`openStream`（`:320-326`）只把 seed 放进**闭包局部变量**，
不写回 store；`runFrom:453` 又用 `useChatStore.getState().streamRaw` 覆盖 `resume.accumulated`。
若恢复轮没有 `delta.content`（纯 tool_calls 轮很常见），`accumulated` 被覆盖成 `''`，
最终气泡退化为「（无回复）」（`:276`）。t6 的 mock 在 tool_call 同一响应里同步吐文本，所以覆盖不到。
requiredFix：`openStream` seed 时 `setState({ streamRaw: seed })`，或让 run 用自己的累加器而不是全局 streamRaw。

### F5 — 歌词偏移的 UI 文案与实现符号约定相反（用户按文案调会越调越偏）
实现约定（`src/renderer/src/lib/lyricsOffset.ts:8-13`）：正偏移 = 行**提前**生效
（判定式 `t <= currentTime + 0.12 + offset`，即激活时刻 `t - 0.12 - offset`）。
但 `src/renderer/src/components/LyricsPanel.tsx`：
- `:158` tooltip「正数=歌词延后生效，负数=歌词提前生效」——反了
- `:162` 按钮 `−0.5s` 标「歌词提前 0.5s」——实际让它**延后**
- `:177` 按钮 `+0.5s` 标「歌词延后 0.5s」——实际让它**提前**
本轮自己的 E2E 表格即为反证：同一 `currentTime=10.9` 下 offset `−0.5s` 把高亮行从 index 2 变成 index 1
（歌词变得更晚），而用户按的按钮写着「提前」。
requiredFix：交换两个按钮 title 与容器 tooltip（或把符号约定整体翻转并在 module 注释/两处组件保持一致）。

### F6 — `confirm()` 里 executeTool 在 try 之外，抛错即死锁
`chatStore.ts:216-221` 的 `await executeTool(...)` 位于 `try {`（:229）之前；抛错 → 未捕获 rejection，
且 `busy:true` + `pendingConfirm:null` 无法恢复（`abort()` :113-132 只在 parked 分支复位）→ 聊天面板锁死到刷新。

### F7 — 睡眠定时器与播放模式的交互缺口
- `sleepTimer.ts:112-123` + `playerStore.ts:401-402`：**单曲循环（'one'）下 'queue' 定时器永远不会触发**
  （同曲无限重复，`endedIndex` 永远到不了末位）——恰是「放着睡觉」最需要的场景。
- `playerStore.ts:246`：手动 `next()` 会**静默丢弃** 'queue' 定时器（实现自述只说了 'track'）。
- `playerStore.ts:248-253`：shuffle 分支里的 `sleepStop && s.index >= len-1` 是**不可达死代码**；
  shuffle 下定时器只由 `decideEnded` 的 `endedIndex >= len-1` 决定，于是「当前曲恰好落在队列末位」时，
  随机播放第 2 首就停（用户要的是整队播完）。

### F8 — 新用例对 F1 完全不可见（测试有效性）
`src/renderer/src/lib/__tests__/playerStoreSleep.test.ts:143/159/171` 的 `index` 断言是**空转**：
`loadCurrentInternal` 在 `queue[index]` 不在 `useLibraryStore.map` 时于 `playerStore.ts:418-422` 提前 return，
`set({ index, … })`（:423）根本不会执行，而测试只设了 `queue:['a','b','c']`、从未 seed 库 map
→ 三条断言在**改造前的回绕实现下同样通过**，所以 F1 一路绿灯。
requiredFix：seed `useLibraryStore.setState({ map: {a,b,c} })`（`set` 在首个 await 之前，断言即生效），
并补一条「未武装任何定时器时末曲结束应回绕到 index 0」的用例。

## 5. LOW / 证据与流程

- **F9（证据与报告不符）**：`T6-REPORT.md:43` 写「6 首队列在第 1 首结束 → index 0→1」，
  但原始 `probe-sleep-timer.json:84-93` 记录的是 `afterIndex: 5`（探针实际跑到末位并停住）。
  原始记录反而更接近 F1 的现象；报告文字与自家原始证据不一致。
- **F10（证据标签错）**：`T6-REPORT.md:55` 的「mediaPeak=197」实为 `engine.diagnose().signalPeak`，
  且取样时 `audioPaused:true`（`cors-final2.log:36`）；探针自身 mediaPeak 为 0（unset）/245-249（anonymous）。
  真正的支撑证据是 `cors-final3.log:59-70` 的 12 次持续采样表。
- **F11（指纹脚本假阴性）**：`.devdata/zz-fingerprint.mjs:30` 的正则窗口 `{0,400}` 小于实际间隔 499 字符，
  `fingerprint-pre-fix.log:19` 的 `FAIL engine: createElement sets it` 是**误报**——同一次运行第 18 行已 `OK`，
  且 `src/renderer/src/lib/audioEngine.ts:113` 确实设置了 `crossOrigin='anonymous'`。
  （审查已确认：t2/t10 的修复是「CORS 模式请求 + CORS 干净响应」两者共同作用，仅加响应头并不生效。）
- **F12（越界但无害）**：`src/main/protocol.ts:90` 的 `let start → const start` 是 `eslint . --fix` 机械改的，
  落在 t5 声明的 inScope 之外（作者已在报告披露，未计入 changedPaths）。已核实**行为等价**：
  `start` 全程未再赋值，若被赋值则 `const` 无法通过 `typecheck:node`（退出码 0）。
  另 `eslint.config.mjs:15` 新增忽略 `**/scripts`，其中 `scripts/gen-icons.mjs` 被 package.json 的 `icons` 脚本引用，
  即该脚本今后不再纳入 lint（可接受，但属口径变化）。
- **F13（死代码/细节）**：`sleepTimer.ts:134-142` 的 `sleepFiresOnEnded` 有单测但生产代码从未调用
  （注释声称被 handleEnded 使用，实际 store 自行判标签）；`PlayerBar.tsx` 菜单剩余时间可能显示上一轮的 ≤1s 陈旧值；
  `sleepTicker` 无 HMR dispose（仅 dev）；迷你窗状态里没有 sleep 字段，定时器在迷你窗不可见。
- **F14（可追溯性）**：`src/renderer/src/lib/__tests__/lyricsOffset.test.ts`（14 例）时间戳 15:31:38，
  晚于 t4 的三个源文件，且未出现在 t4 的 changedPaths/自述中（我收到的 t4 依赖结果为截断文本，无法据此断定为越界）。
  建议 captain 在任务记录中补一句归属，避免后续审计断链。

## 6. 覆盖确认（未发现问题的部分）

- **t2**：`setSinkId('default')` 可用（electron 39 / Chromium 142）、`prepareContext` try/catch 完整、
  成功与失败路径都只记录不抛；`switchToDirect()` 复位 `ctxPrep` 与 sink 字段并 bump generation；
  `unlock()` 先 await `ctxPrep` 再 `resume()` 的顺序修复成立。遗留：`unlock()` 对永不 settle 的 `setSinkId` 无超时保护
  （`audioEngine.ts:205,243-251`）；`ensureGraph` 在 `createMediaElementSource` 之后抛错时元素已被 source 占用，
  却切到 direct（`:161-179`）——均为既有/边缘场景，不构成本轮退回理由。
- **t5**：`src/main/lrc.ts` 与 `src/main/mediaFormats.ts` 均为**逐字抽取**（正则、排序、DIRECT_EXTS/CONVERT 与 1.0.3 主进程包一致），
  importers 全部解析正常（`lyricsService.ts:4,8,42`、`decodeService.ts:8,12,57,59`）；`scanner.ts`/`queue.ts` 未见语义改动；
  `--no-cache` 全仓 0 error。
- **t4 功能面**：`useSyncExternalStore(subscribeOffsets, getOffsetSnapshot(trackId))` 快照为原始 number，
  不会死循环；MiniPlayer 与 LyricsPanel 用的是同一 key、同一公式（`:61-63` vs `:78`），跨窗 `storage` 事件已接；
  `LyricsPanel` 的派生式改写（不再在 effect 体内 setState）与 flex 包裹修复合理。
- **t1 功能面**：菜单五项齐备、到点暂停不清队列、'track' 模式抑制单曲循环重播、不持久化（reload 后为 null）、
  重复武装安全（`startSleepTicker` 先 stop）、ticker 只驱动徽标而停靠由 wall-clock deadline 判定 —— 均与证据一致。
- **范围核对**：本轮所有 `src/**` 改动都能对应到某任务（t1/t2/t3/t4/t5/t8/t10）；无 git 仓库，
  故以「安装版 1.0.3 执行体」为基线逐文件比对，未发现除 F12 之外的未披露越界改动。

## 7.5 附：t4/t5 深挖补遗（提交后追加，**不改变 verdict=needs_revision**）

以下条目来自一次只读辅助深挖（用 `dist/win-unpacked/resources/app.asar`(15:13:27，t5 抽取前) 与最终 `out/main/index.js`(15:49:51) 做 token 级差分），
**每条都已由 reviewer 本人复核**后才记录；未复核的说法不写入本节。

| id | 级别 | 位置 | 结论（已复核） |
|---|---|---|---|
| A1 | medium（证据强度） | `scripts/verify-lyrics-offset.mjs` 迷你窗同步步 / `probe-lyrics-offset.json` | t6 的「迷你窗与详情页同一高亮行」断言**不可判别**：`song-long.lrc` 行时间为 2.00/6.50/**11.00**/**15.50**，探针把 `currentTime` 钉在 10.9，则 offset 0/+1.0/+2.0 对应阈值 11.02/12.02/13.02 全部落在 [11.00,15.50) 内 → **无论迷你窗是否读偏移，命中行都一样**，`miniBefore === miniAfterPlus` 无法区分「同步」与「迷你窗忽略偏移」。代码路径本身是健全的（同模块、同 key、同公式、storage 事件），但该 acceptance 缺一条能判别的 E2E。建议改在 `seek(13.5)` 下用 ±0.5（跨越 15.50），或直接从迷你窗目标读取 localStorage。 |
| A2 | medium | `src/renderer/src/components/MiniPlayer.tsx:36` | `if (p.track.id === trackId) return` 用的是**闭包渲染值**，而改造前基线用的是 updater 的新值（安装版 bundle:17823）。在 `setTrack`(:29) 与 `[trackId]` effect 生效(:44) 之间若再来一条 `mini:state`，会看到旧 trackId → **重复 lyricsGet**（每次多一次 IPC；主进程有 path|mtime|size 缓存，代价很小）。修：用 ref 记录「最后请求过的 id」。 |
| A3 | low | `src/main/mediaFormats.ts:23` | `needsConvert` 目前**没有任何生产调用方**（grep：仅 `mediaFormats.ts:23` 定义、`decodeService.ts:8/12` import+再导出、`mediaFormats.test.ts:2`）。它在 t5 前/后的主进程 bundle 里都是 0 次出现——但 tree-shaking 既能解释「新增未使用」也能解释「旧有未使用」，**故「是移动还是新增」无法用 bundle 判定**；可确定的是该导出今天是死代码，t5 报告「保持公共 API」的措辞无法证实。修：接进 `ensurePlayable` 或删掉导出。另 `mediaFormats.ts:24-25` 与 `decodeService.ts:56-60` 的扩展名取法不同，`mediaFormats.test.ts:19`（无点路径）断言的是生产路径不会走到的行为。 |
| A4 | low（**已更正**） | `src/main/llmClient.ts:4` | **【captain 裁定更正】归属 t12，不是未披露的越界改动** —— t12 就是「修复 llmClient.ts 的 prefer-const」这一独立任务（有报告、零行为变化），故该行原措辞「第二条未披露的 `eslint --fix` 越界改动」**予以撤回**。仍成立的事实（已实测）：15:12:57 基线 lint JSON 中 `protocol.ts:90` 与 `llmClient.ts:4:7` **两处** `prefer-const` 都存在；两者现均为 `const` 且语义等价。**但无版本控制，无法确证该批 `--fix` 的归属**（见 §7.10 的 provenance 中性表述），故只记「已披露/已归属」，不再就数量或来源作任何推断。 |
| A5 | low（**已更正，无需追溯**） | `src/renderer/src/components/Cover.tsx:17-18`、`NowPlaying.tsx` | **【captain 裁定】** ①`Cover.tsx` 归 **t8**（其 inScope 含该文件，t8 报告已声明清零该文件 `set-state-in-effect`）→ 属已归属改动，**原「无人认领」措辞撤回**；②`NowPlaying.tsx` 的 `waveState` 改写在本轮 **15:13:27 bundle 中已存在** → 属**本轮之前**的工作，不在 t7 范围。二者均无需追溯。 |
| A6 | low（口径） | `eslint.config.mjs:15` | 对 F12 的补充确认：新增 ignores **没有掩盖任何 `src/**` error**——81 条非 prettier error 全部落在 `scripts/**` + `.devdata/**`（均在打包排除之列）。唯一代价是 `scripts/gen-icons.mjs`（`npm run icons` → `build/icon.ico`）今后不再被 lint，而 `.prettierignore` 仍会格式化 `scripts/**`，两者口径不一致。 |
| A7 | low（表述精度） | t5 报告措辞 | 「`scanner.ts` 未改一行」字面不成立（基线有 1 条 prettier warning，格式化器重写过），但与 t5 前 bundle 对比 token 完全一致，**实质成立**；「247 条 prettier」也不精确（实测 276 @15:12:57 / 245 @15:19:40）。 |
| A8 | low | `src/renderer/src/components/LyricsPanel.tsx:66` | 依赖由 `[current?.id]` 改为 `[current]`：同 id/新对象的 `current` 会重新发起一次 `lyricsGet`（`load.trackId` 守住 :70，不会闪旧歌词）。 |
| A9 | —（无回归，正面确认） | `LyricsPanel.tsx` / `MiniPlayer.tsx` | 对**真实 pre-t4 基线**（安装版 bundle 16140/16186/17843）逐点比对：offset=0 时高亮与 seek 与改造前**逐字等价**；派生式改写反而消除了「换曲后一帧旧歌词」，并修正了基线里 reset effect 声明晚于滚动 effect 导致的重滚失效。→ t4 在 offset=0 无行为回归。 |

## 7.6 应用 captain 审查口径后的修订（提交后追加；**F1/F2 仍在最新工作区成立**）

captain 于 t7 提交后补充了审查口径（审查对象=最新实现；t8/t11/t12 纳入范围；t10 不要求现场复现回退；
8 个测试文件与探针脚本为受制裁产物；唯一 TrackList warning 已接受；格式 churn 以幂等性判定）。逐条应用如下。

### (a) 重新核对最新工作区（16:11）

| 项 | 结果 |
|---|---|
| 实现文件是否在我审查后被改动 | `playerStore.ts` 15:25:52、`chatStore.ts` 14:59:58、`LyricsPanel.tsx` 15:09:27、`protocol.ts` 15:25:52 —— **均早于我的快照**，15:31 之后只有 `scripts/*` 探针新增 |
| F1 现状 | `playerStore.ts:266-267` 与审查时**逐字相同** → 仍然成立 |
| F2 现状 | `chatStore.ts:404-422` 与审查时**逐字相同** → 仍然成立 |
| 质量门（`node scripts/verify-lint-tests.mjs --label t7`，16:11） | lint exit=0（0 error / 1 warning）、typecheck node/web=0、**Test Files 11 / Tests 106 passed** → 与我此前的独立复跑一致 |

### (b) 撤回 / 重新定级（captain 口径直接覆盖的条目）

- **F14 撤回**：`src/**/__tests__/**` 的 8 个测试文件（lrc/mediaFormats/scanner/queue/chatConfirm/sleepTimer/playerStoreSleep/lyricsOffset）为 captain 批准的合法产物，
  无法进入 changedPaths 只是契约 glob 未展开的已知限制 → 不再作为「未声明改动/归属缺失」记入。
- **F12 部分撤回并重新定级为信息项**：`src/main/llmClient.ts:4` 的 `let base → const base` 已由正式任务 **t12** 承接（1 行、零行为变化）→ 关闭；
  `src/main/protocol.ts:90` 的 `let start → const start` 保持「已披露的等价钱行为改动」定性，不再计为越界风险；
  `eslint.config.mjs` 忽略 `scripts/**`、`.devdata/**` 亦为受制裁口径（且已证实**没有掩盖任何 `src/**` error**）。
- **F9/F10/F11 维持为「勘误」**：三者已被 captain 归入 t15 的勘误范围；它们不影响 t10 的功能结论（见 (c)）。
- **未提出的项**：6 个 `verify-*.mjs`/`diag-*.mjs` 探针与其中的文件级 `explicit-function-return-type` directive、`TrackList.tsx:42` 的 1 条 warning —— 我从未将其列为 finding，与 captain 口径一致。
- **格式 churn（以幂等性判定）**：`npx prettier --check "src/**/*.{ts,tsx,css}"` → **全部 TS/TSX 已零 diff**，仅 `app.css`/`global.css`/`theme.css` 三个 CSS 文件不符合 prettier 默认格式；
  这三者不在 `npm run lint`（eslint 不处理 CSS）的门禁内，且 global/theme 本轮未改 → 记为信息项，不作为 finding。

### (c) t10 判定对齐（功能面）

我**未**要求现场复现 graph→direct 回退，也未把 t2 的旧措辞判为「未达成」；本报告中 t2 的结论是**通过**。
t10 的验收证据（修复前后 media 链探针对比 0 → 有值、日志不再出现 `MediaElementAudioSource outputs zeroes due to CORS access restrictions`、
`switchToDirect()` 仍在且逻辑未改、日志无 `Web Audio graph silent → direct playback fallback engaged`；`unset` 变体恒为 0 为刻意对照组）**成立**。
F3 与之不冲突：F3 是**加固项**（任意路径读取 + `ACAO *` + corsEnabled 的组合面），已被 captain 纳入 t13 修复集。

### (d) t11 打包卫生 —— 独立复核后予以认可（不属越界）

reviewer 用 `@electron/asar` 直接扫描两份产物（`.devdata/t7-review/t11-asar-before-after.json`）：

| 产物 | 条目数 | `.devdata` 条目 | `scripts/` 条目 | 体积 |
|---|---|---|---|---|
| 已安装 1.0.3（12:27，改前 yml） | **4921** | **620** | **35** | **178.1 MiB**（186.7 MB 十进制） |
| `dist/win-unpacked`（15:14，改后 yml） | **4264** | **0** | **0** | **25.1 MiB** |

即 t11 的「620 个 dev 文件混入 asar」与「186.7MB/4921 → 25.1MB/4264」**逐项吻合**；`'!{.devdata/**}'` 确实没有起到排除作用。
结论：`electron-builder.yml` 的 3 处改动（新增 `'!scripts/**'`、把单元素花括号改成 `'!.devdata/**'`、加解释注释）
是在**同一排除语义下修复了一个真实缺陷**（旧包把 dev 截图/测试音乐/开发脚本一起发给了用户），**不是越界**。

### (e) 对 t13 修复集的建议（不改变 t7 结论）

t13 的既定目标是 F1/F2/F3/F5。补充建议：
1. **把 F8 一并纳入 F1 的修复**——否则列表循环回绕的修复没有任何回归守卫，同一回归可再次静默上线（现有 3 条 index 断言是空转的）。
2. **F6（confirm() 的 executeTool 在 try 之外 → 面板锁死）与 F7（单曲循环下 'queue' 定时器永不触发）未在 t13 范围内**，二者都是用户可见的（前者需一次异常、后者是稳定复现的模式组合），建议 captain 明确「本轮修」还是「记为新任务」。
3. F4（确认前叙述丢失）属观感问题，可与 F2 的多调用修复同批处理（同一段代码）。

## 7.7 追加判据：audioEngine 六态状态机（已接受并逐条核对，**不产生新 finding**）

captain 转达 audio-engine 的判据后，我逐条对代码核对（只读）：

| 判据 | 代码核对结果 |
|---|---|
| `SinkPhase` 六态语义（idle/skipped/pending/applied/failed/released） | 与 `audioEngine.ts:28-41` 的注释与类型定义完全一致；`SinkSetup.error` 注释明确「non-null exactly when phase is 'failed' or 'released'」(`:49-50`) |
| `released & error≠null` 包含「绑定已成功但随后被释放」，文本带 `reported 'applied'` | 成立：`releaseSinkSetup():423-427` 的 else 分支写 `context released after setSinkId reported '${prev.phase}'`；`:417-419` 处理 pending→released（合成原因 `SINK_RELEASED_REASON`）；`:420-422` 保留既有 failed/released；`:414-416` 不支持 → `skipped`（**非失败**） |
| `ctxGeneration` 与 `lastSinkEvent`（`#N applied`）需配对判读 | 成立：`markSinkEvent():399-401` 写入 `#${ctxGeneration} ${event}`；真正防伪造的守卫是 `prepareContext` 内 `this.ctxGeneration !== generation`（`:206`、`:225`）——pending 期间 ctx 被关时只记历史、不伪造 applied/failed |
| `fallbackTried` 一次性门控；`getAnalyser()` 在 direct/无 ctx 时返回 null，`NowPlaying` 转向 `drawWaveform` | 成立：`switchToDirect():446-447` 一次性门控；`getAnalyser():344-347` `if (this.mode !== 'graph' \|\| !this.ctx) return null`；`NowPlaying.tsx:166` 的 `drawWaveform` 分支与 `:170-171` 的 `if (!analyser) return` 与之一致 |
| 该两项是「回退路径未被破坏」的**代码级**证据，但**不能替代**第 3 条要求的证据组合 | 接受。我在报告 §3（t10）用的正是证据组合（前后探针对比 + 日志无 CORS zeroes + 无 silent-graph fallback 日志 + `switchToDirect()` 未改），未以代码存在性代替证据 |

**审查方明确声明（避免误判）**：我**没有**把 `released` 相位判为缺陷，也没有据此开 finding；报告 §6 对 t2 的结论是**通过**。
我在 t2 记录的两条遗留均与六态状态机无关（`unlock()` 对永不 settle 的 setSinkId 无超时保护 `:205/:243-251`；`ensureGraph` 在 `createMediaElementSource` 之后抛错时元素已被 source 占用 `:161-179`），且当时即标注为**既有/边缘、不构成本轮退回理由**。

**一条信息项（非缺陷，仅诊断字段）**：`releaseSinkSetup():410` 先 `ctxGeneration++` 再 `markSinkEvent(phase)`(`:429`)，因此 `released` 事件标签带的是**自增后**的值，而 `applied` 事件带的是该 ctx 自己的代际；
即 `#N released` 中的 N 与「被释放的那个 ctx」的代际相差 1。该字段仅供 diagnose 诊断，**不影响** `prepareContext` 的陈旧性判定（用 live 计数器 vs 捕获值比较），故记为信息项、不作 finding。

## 7.8 并入 t10 追加验证（`.devdata/t6-evidence/T10-ADDENDUM.md`）后的 t7 判定

### (1) t10 功能面：判定维持「通过」，证据强度上调

已读附录原文与结论表。新证据把 t10 从「靠 `diagnose()` 推断」升级为**直接观测**：
`canvas.spectrum` 490×192、**litPixels = 7523**、标签 `LIVE SPECTRUM 0:02…0:10`（`document.hidden=false`）；
连续 6 次采样（约 9s）`mode` 恒 `graph`、`fallbackTried=false`、`audioDirect=false`、峰值 237/243/246/245/240/232、媒体时间 2.8→10.4s；
5 格式播放矩阵 + seek/切歌/自动续播/音量回读全通过、元素错误与 console 错误 0 条；封面在列表/详情/迷你窗 `complete=true / naturalWidth=512`、`MediaImage` 警告 0 条；终版质量门 0/0/0（11 files / 106 tests）。
→ 这些都不改变我的结论：t10 **通过**（我此前也未要求现场复现回退，与本轮第 3 条裁定一致）。

### (2) 我的 F10 关闭

F10 原为「报告把 `signalPeak` 写成 mediaPeak」的**表述精度**问题。附录补上了直接像素证据与 6 次持续采样，F10 所指的证据缺口已被填上
→ **F10 关闭**，仅在 t15 的勘误清单里保留一句措辞修正（不再作为遗留问题）。

### (3) (B) 时序闭合：接受

附录声明 t10 的 main 进程文件（15:25:52）落地后，verifier 在 **fresh 实例**上重跑全部证据。这与我的独立观察一致
（`src/main/index.ts`、`src/main/protocol.ts` 的 mtime 均为 15:25:52，`audioEngine.ts` 为 15:22:39），且与本报告 §7.5 F11 的结论自洽（指纹脚本那条 FAIL 是正则窗口假阴性，`crossOrigin='anonymous'` 确实在 `audioEngine.ts:113`）。

### (4) (D) 探针归类：接受，且我从未计为越界

6 个新探针位于 `scripts/**`，属验证工装；我在整个 t7 中从未把 `scripts/**` 的任何文件计为越界（只在 F12 里提过 `eslint.config.mjs` 忽略 `scripts/**` 后 `gen-icons.mjs` 不再被 lint 这一信息项，已被你的口径覆盖）。
另：`src/main/index.ts` / `src/main/protocol.ts` / `src/renderer/src/lib/audioEngine.ts` 三个产品的 mtime 均停留在 15:22–15:25，**15:25 之后没有任何写入**，故「verifier 未触碰产品文件」在文件系统层面也无反例。

### (5) (E) 兜底项：接受「保留证据」定性

我没有也不会要求现场人为触发一次静默回退。第 3 条裁定的证据组合（前后探针对比 + 日志无 CORS zeroes + 无 silent-graph fallback 日志 + `switchToDirect()` 保持）
已足够支撑 t10 的功能判定；`fallbackTried`/`getAnalyser` 仅作代码级佐证（见 §7.7）。

### (6) (F)① 需要一处机制更正（结论不变，但影响 F3 的加固位置）

附录把渲染进程 `fetch(coverUrl)` 被拒解释为「`media://` 以 `Cross-Origin-Resource-Policy: same-origin` 提供资源」。**代码里没有这个头**：

- `src/main/protocol.ts`（mtime 15:25:52，未变）的响应头只有 `Access-Control-Allow-Origin: *`、`Access-Control-Allow-Methods`、`Access-Control-Allow-Headers`、`Access-Control-Expose-Headers`（L35-38），**无 CORP**。
- 真正拦住 `fetch()` 的是**应用页面自身的 CSP**：`src/renderer/index.html:8` 的 `connect-src 'self'`（而 `img-src 'self' data: media:`、`media-src 'self' media: data: blob:` **显式允许 `media:`**）。

「应用并不 fetch 封面、只渲染」这一结论我接受（`<img>`/`<audio>` 子资源加载不受 `connect-src` 限制）；但机制归属要改。这对 F3 有实质影响：
今天阻断 renderer 侧 `fetch(media://…)` 的是一道**页面级、偶然的防线**（只有本应用页面继承该 CSP；全仓无 `will-navigate/will-redirect` 守卫，被加载的其它来源不继承它），而**资源级的 CORP 并不存在**。
→ F3 的加固必须落在**协议层路径控制**（resolve+relative 包含性校验＋扩展名白名单＋越权不返字节）与**导航守卫**；**不要依赖页面 CSP**。
> **【已由 §7.12 取代】** 我在此处原建议的「新增 `Cross-Origin-Resource-Policy: same-origin`」与「`ACAO` 收敛」两项**均已撤回** —— captain 复核代码后给出反证：CORP 只对 **no-cors** 请求强制校验，而封面 `<img src="media://…">` 一律未设 `crossOrigin`（no-cors、且页面 origin 为 `file://`/`http://localhost:5173` → 与 `media://` 跨源），加 CORP 会**直接拦掉封面显示**；`<audio>` 是 CORS 模式请求且打包态 Origin 为 `null`，`ACAO` 必须是 `*`（或 `null`）才能保持 CORS 干净。详见 §7.12。

### (7) (F)② 接受；但 A1 仍未关闭

- 迷你窗「标题滞后」= 测试音频仅 2–6s + 自动续播造成的采样假象，改高频采样后 12/12 一致 → 接受，**非缺陷**。
- 但 **A1（歌词偏移的迷你窗同步缺判别性证据）仍未关闭**：新探针 `scripts/verify-mini-sync.mjs` 验证的是**标题/封面**同步
  （全文没有 offset / lyric / 时间断言，只有 title/cover 轮询），并未覆盖 t4 的「偏移在迷你窗同样生效」这一 acceptance。
  原判别缺口依旧：在 `currentTime=10.9` 下 offset 0/+1.0/+2.0 全部命中同一行（`song-long.lrc` 行时间 2.00/6.50/11.00/15.50）。
  建议补一次 `seek(13.5)` + ±0.5（跨越 15.50），或从迷你窗 target 直接读 `localStorage['nebula.lyricsoffset']` 与高亮行文本。级别仍是 **medium（证据强度）**，不影响 F1/F2 的 blocker 定性。

## 7.9 eslint 配置口径的正确表述与量化（含 reviewer 自身的一处措辞更正）

### (1) 配置改动的事实核对（接受 captain 更正）

- `eslint.config.mjs` mtime = **2026-09-12T07:24:02.525Z = 本地 15:24:02**（我用 `statSync` 独立核对，与 captain 所述一致），属 quality 的 lint 工作。
- 第 15 行现为 `ignores: ['**/node_modules','**/dist','**/out','**/scripts','**/.devdata']`，第 10–14 行写明理由。
- **裁定接受**：`scripts/**` 与 `.devdata/**` 均非产品源码且经 t11 排除出安装包，以目录级 ignore 处理一次性探针优于给上百个一次性文件加 directive → **不作为 finding、不阻塞**。

### (2) reviewer 自身措辞更正（重要）

我此前把 `npx eslint --no-cache --format json .` 的结果表述为「全仓 0 error / 1 warning」。**精确说法应为：eslint 在改后配置范围内（`src/**` + 根配置，共 70 个文件）= 0 error / 1 warning**，`scripts/**`、`.devdata/**` 不在该范围内。逐项复算（`.devdata/t7-review/recount-eslint-scope.mjs`，直接解析阶段 JSON）：

| 阶段 | 文件 | error | warning | 构成 |
|---|---|---|---|---|
| t6 基线 15:12:44 | **109** | **106** | **277** | src 60(2err/169warn) + scripts 45(103err/106warn) + `.devdata` 1(1/2) + 根配置 3(0/0) |
| t6 终版 15:42 | **70** | **0** | **1** | src 67 + 根配置 3（scripts/.devdata 已不在范围） |
| reviewer 无缓存复跑 16:11 | **70** | **0** | **1** | 同上；唯一 warning = `TrackList.tsx:42` |

→ 与 captain 的核算**逐项吻合**（109/106/277 与 70/0/1），也证实「t6 终版质量门本就跑在改后配置上」，不存在「旧配置报 0」的问题。

**附（供引用）**：`protocol.ts:90` 的 `prefer-const` error 在 t5 基线（15:23）**与 15:25:0x 的 `npm run lint` 输出中**都实际出现过 —— 因此「quality 报过一条不存在的 error」这一反驳不成立（见 §7.10 的 F12 provenance 中性表述）。

### (3) `--no-ignore` 下 `scripts/**` 的实测量化（我独立复测）

命令：`npx.cmd eslint "scripts/**/*.mjs" --no-ignore --no-cache --format json`（原始 JSON：`.devdata/t7-review/eslint-scripts-noignore.json`）

- **57 文件 / 46 个有告警 / 78 error / 97 warning**；33 个文件带 error，最多者 `scripts/diag-cors.mjs`(11)。
- 错误构成：`@typescript-eslint/explicit-function-return-type` **76** + `@typescript-eslint/no-unused-vars` **2** —— 后者恰为
  `scripts/diag-cors.mjs:255:7`（`MAIN_WIRE_EXPRESSION` 未使用）与 `scripts/e2e.mjs:5:10`（`readFile` 未使用）。
- 与 captain 的 **78 error 完全一致**；文件数/警告数（你 54/43/87 → 我 57/46/97）差异来自运行时刻与 glob 范围不同（15:50–16:02 又新增了 6 个 `verify-*.mjs`），**非缺陷**，供合并口径时参考。
- 结论：被排除的是**工装噪音**（76/78 为 return-type），**不是产品缺陷**；已按「已披露的范围限定」记录。

### (4) 非阻塞后续项（记录，不要求 1.0.4 之前做）

把 `'**/scripts'` 目录级 ignore 换成 `scripts/**` 的 **scoped 规则覆盖**：仅关 `explicit-function-return-type` 与 prettier，**保留** `no-unused-vars` 等真错检测。
若采用，(3) 中的两条 unused-vars 会重新暴露（这正是保留该类规则的价值）。另 `scripts/gen-icons.mjs`（`npm run icons` → `build/icon.ico`）仍不再被 lint，属信息项。

### (5) t5 changedPaths 未列该配置文件 = 上报口径瑕疵

接受 captain 定性：这**不构成** needs_revision 依据。我的 F12 实质从来不是该配置，而是两点：`src/main/protocol.ts:90` 的越界但**行为等价**改动（作者已披露），以及 `src/main/llmClient.ts:4` 的同类改动（现由正式任务 **t12** 承接）。故 F12 维持 **low / 信息项**，并已按 §7.6 部分撤回。

### (6) 结论

本节不影响任何 blocker 判定：**t7 唯一的两条 blocker 仍是 F1（`playerStore.ts:266-267` 删除列表循环回绕）与 F2（`chatStore.ts:404-422` 多 tool_calls 时后续 id 无 tool 回复 → 400）**，二者在最新工作区逐字仍在，待 t13 修复后在 t14 复核。

## 7.10 captain 处置表（r2 判定口径基线）与执行纪律

### (1) 执行纪律（reviewer 已确认遵守）

- **t14 尚未 claim**（截至本轮核对，团队面板显示 `t14 [pending] attempt 0`，我名下只有终态的 t7）。
- 依赖顺序为 **t13（repair，涵盖全部 finding）→ t15（verifier r2 独立验证）→ t14（reviewer r2 审查）**，但框架把 t14 的依赖固定在 t13，t13 一完成 t14 即变为可 claim。
- → **我等 captain 的 GO（t15 完成后）再 claim t14**，以免在 verifier 的独立证据出来前开始审议；若届时误 claim 会先停手回报、不提交 verdict。

### (2) 逐条处置（r2 必须按此判）

| 条目 | captain 处置 | r2 判定要点 |
|---|---|---|
| **F1 / F2（BLOCKER）** | 已亲自复核代码事实**确认成立**，写入 t13 契约并给出精确修法 | r2 需**可判别证据**：F1 用「无定时器时末曲自然结束/手动 next 回到 index 0」；F2 用「一轮多 tool_calls（破坏性不在末位）后每个 tool_call_id 恰一条 tool 回复、网关 0×400」 |
| **F3（HIGH 安全）** | **本轮修**：包含性校验 + 扩展名白名单 + 越权 403/404 不返回字节 + `index.ts` 导航/开窗守卫；**ACAO 取值不改**（已裁定接受，理由要求写进 `protocol.ts` 注释） | **不得据 ACAO 开 finding**；只核四项验收 |
| **F4 / F5 / F6 / F7 / F8 / F13** | **全部「本轮修」**（非新任务），写入 t13 修复清单：F5 按「**改文案不改实现符号**」；F6 把 `confirm()` 的 `executeTool` 包 try/catch 并在失败时复位 `busy`；F7 按 captain 语义裁定 —— ①手动 next **只清 'track' 不清 'queue'**、②`mode==='one'` 末曲自然结束**触发 queue 停止**、③shuffle+queue 死分支移除并在注释写明「shuffle 无确定队列终点」；**F8 并入 F1**（`playerStoreSleep.test.ts:143/159/171` 三条 index 断言必须真实生效：seed 库使 `loadCurrentInternal` 不再提前 return，并新增「无定时器时末曲回绕到 0」用例），另加固 verifier 发现的 `:186` 键集合锁死（`toEqual(['mode','volume'])` 改为只断言不出现 sleep/deadline 键，或 `beforeEach` 补 `current: null`）；F4 与 F2 同段代码**同批处理** | 逐条核闭合；F8 的**「空转断言」性质在新用例中不得再现**；r2 报告须**逐条列出「已闭合 / 仍开放（含原因）」** |
| **inScope 保留（captain 声明）** | t13 的 inScope 由框架生成；若 ai-tools 报告某路径不在其契约内（如 `sleepTimer.test.ts`、`PlayerBar.tsx`、`tools.ts`、`mock-llm-confirm.mjs`、`MiniPlayer.tsx`、`mediaFormats.ts`），captain 会在 t13 完成后**立即补派**小任务闭合，**不以「越界」为由搁置** | r2 一律按**最新工作区**判定；对尚未闭合项写明「开放 + 原因（待补派/未在 inScope）」，不因流程未完而误判为缺陷或误判为已修 |
| **A1（迷你窗同步证据不可判别）** | 转为 **t15 的取证要求**（`seek(13.5)` + ±0.5 跨过 15.50） | r2 **以 t15 的判别性证据为准**，不沿用 t6 那条不可判别断言 |
| **A2（MiniPlayer 闭包 dedupe）** | t13 **条件项**（仅当契约 inScope 覆盖 `MiniPlayer.tsx`） | 若未改 → 判**已接受的低风险遗留**（代价一次 IPC，主进程有缓存），**不得据此 needs_revision** |
| **A3（`needsConvert` 死导出）** | t13 **条件项** | 同上，未改则记低风险遗留 |
| **A4（`llmClient.ts:4`）** | 归属 **t12**（独立任务本身，有报告），**不是**未披露的越界 | 已在 §7.5 更正措辞；r2 不计越界 |
| **A5（`Cover.tsx` / `NowPlaying.tsx`）** | `Cover.tsx` 归 **t8**；`NowPlaying.tsx` 的改写属**本轮之前**工作 | 已在 §7.5 更正；r2 按此标注，无需追溯 |
| **A8（`LyricsPanel.tsx:66` 依赖 `[current]`）** | 可接受、**不修**（无用户可见问题） | 记已接受，不提 finding |
| **F9 / F10 / F11** | 转 verifier 的 t15 勘误项（`T6-ERRATA.md`） | r2 只核勘误是否落地，不影响功能判定 |
| **F12（`protocol.ts:90`）** | **保留、不返工、非 finding**。provenance 采用 captain 裁定的**中性表述**（见下方引文），我此前转述的「记 t10」与「记 t5 全仓 `--fix`」**两版均已撤回** | r2 记「已披露、语义等价」，不计越界 |

> **provenance 中性表述（captain 裁定，报告与 r2 一律照此写）**：
> `protocol.ts:90` 在 t5 基线（15:23）为 `let start` 且被报 `prefer-const` error，现为 `const start`，**语义等价**（该变量从未重新赋值）。
> 因仓库无版本控制，**无法确证**系 ai-tools 的 t10 编辑还是 quality 获批的全仓 `eslint --fix`（`prefer-const` 属可自动修复规则）所致 —— 两者产生同一结果，
> 且该改动**超出 t5 的 inScope 归属**（故 quality 在 t5 中报备）。**该行保留、不返工、非 finding。**
>
> 附（供引用，用于反驳「quality 报过一条不存在的 error」）：该 `prefer-const` error 在 t5 基线（15:23）**与 15:25:0x 的 `npm run lint` 输出中**都实际出现过，故该反驳不成立。

### (3) r2 审查范围（captain 指定）

1. 全部 finding 的**闭合情况**，尤其 F1/F2/F3 的**可判别证据**；
2. 本轮修复是否**引入新回归**（播放队列/歌词/迷你窗/AI 消息序列/打包面）；
3. 是否存在**新的空转断言**（F8 的性质不得再现）；
4. 质量门由 reviewer **独立复跑**：`node scripts/verify-lint-tests.mjs --label t14` + `eslint --no-cache`（并按 §7.9 口径写明「范围 = src/** + 根配置」）。
5. 只有 `verdict=pass` 才能 complete；否则给结构化 findings（id/severity/problem/requiredFix，可带 file/line）并使任务 failed。

## 7.11 非阻塞 backlog（captain 裁定：**三项都不动**、不开 finding、不派任务、不影响 verdict）

> 依据 captain 裁定记入本节；**r2 报告须原样转入「非阻塞 backlog」小节，且不得写入 findings 数组、不得据此判 verdict。**

| id | 位置 | 影响面 | 为何不阻塞 |
|---|---|---|---|
| **B1** | `src/renderer/src/lib/audioEngine.ts:410` + `:429`（`releaseSinkSetup()` 先 `ctxGeneration++` 再 `markSinkEvent()`） | 仅诊断字段：`lastSinkEvent` 形如 `#N released` 时 N 比「被释放的那个 ctx」的代际大 1；`diagnose()` 输出随之有一个标签性的偏差 | 陈旧性判定用的是 **live 计数器 vs 捕获的 generation**（`prepareContext():206/:225`），与该标签无关，**行为无影响**；更关键的是 `diagnose()` 这些字段正是 t2/t10/t15 取证所依赖的口径，**打包前改动会让既有证据与新代码不匹配**，得不偿失 |
| **B2** | `src/renderer/src/lib/audioEngine.ts:205`、`:243-251`（`unlock()` 无超时地 `await ctxPrep`） | 若 `setSinkId` 永不 settle，`element.play()` 永不被调用 → **静默停摆且无错误**（图创建本身是 fire-and-forget，不受影响） | 既有/边缘场景，**非本轮六项改动引入**；1.0.4 之后再评估 |
| **B3** | `src/renderer/src/lib/audioEngine.ts:161-179`（`createMediaElementSource` 之后抛错时，catch 切到 direct 但元素已被一个未接入 destination 的 source 占用；`ctxPrep` 未置空、generation 未 bump） | 该抛错路径下「direct」播放可能无声且无自愈 | 同上：既有/边缘、非本轮引入；1.0.4 之后再评估 |

**与 backlog 相关的、仍需保留在报告里的正面结论**（captain 全部采纳）：`released` 相位**未被误判为缺陷**（t2 = 通过）；状态机语义与 `audioEngine.ts:28-41 / 49-50 / 399-427` 逐条吻合；`fallbackTried` 一次性门控 `:446-447`；`getAnalyser()` 在 `mode!=='graph' || !ctx` 时返回 `null`（`:344-347`）与 `NowPlaying.tsx:166/170-171` 吻合；且上述代码级事实**只作佐证，不替代** t10 的证据组合。

## 7.12 F3 加固范围裁定（reviewer 机制更正被接受；CORP/ACAO 两项撤回）

### (1) 机制更正已被 captain 采纳

captain 用代码复核了完整机制，与我的更正一致，并补全了另一半事实：
- `src/renderer/index.html:8` 的 CSP：`connect-src 'self'` 是 renderer `fetch(media://)` 被拒的**唯一原因**；`img-src`/`media-src` 显式允许 `media:`。
- 全 renderer **只有 `audioEngine.ts:113`** 设了 `crossOrigin='anonymous'`（`<audio>`）；**封面 `<img src="media://…">` 一律未设** → 封面是 **no-cors 请求**。

### (2) 裁定：F3 只做「路径包含性校验 + 扩展名白名单 + 越权不返字节 + 导航守卫」

**明确不做**我原建议的另外两项。经我复核，captain 的技术依据成立（我逐条确认后不坚持）：
1. **不加 `CORP: same-origin`** —— CORP 只对 **no-cors** 请求强制校验；封面 `<img>` 不带 `crossOrigin`（no-cors），页面 origin 为 `file://`（打包态）/`http://localhost:5173`（dev），资源 origin 为 `media://` → **跨源 → 会被 CORP 拦掉封面显示**。要让 CORP 生效必须同时给**每个 `media://` 子资源**（含封面组件）加 `crossOrigin='anonymous'`，会把「封面显示」这一已验证功能重新推回风险面。
2. **不收敛 `ACAO`** —— `<audio>` 是 CORS 模式请求，打包态页面 Origin 为 `null`，`ACAO` 必须是 `*`（或 `null`）才能保持 CORS 干净；收敛到「应用来源」有再次把频谱打哑的风险。
3. **CORP 的收益确实很小** —— `media://` 只在本应用进程内注册，不存在「别的源嵌入它」的场景；能发起该请求的攻击者已在同源 renderer 内，CORP 拦不住。真正的控制点是**不让它读到契约外的路径**（包含性 + 白名单）。

→ 结论：我把「挡 fetch 的是一道页面级、偶然的防线」这点指出是对的，但**我们并不依赖它做安全控制**（CSP 只是附加层）；安全控制点是路径包含性与白名单。

### (3) 后续候选（**非本轮 finding**，1.0.4 之后）

若将来要上 CORP，须按「**全 `media://` 子资源加 `crossOrigin`（含封面）+ 5 格式与封面全量回归**」单独立项，captain 已记为 1.0.4 之后的 backlog。**r2 不得据此开 finding、不得据此判 verdict。**

### (4) A1 状态

captain 确认 **A1 仍未关闭**，已明确归入 **t15**（verifier）：用 `seek(13.5)` + ±0.5 跨过 `song-long.lrc` 的 15.50 行做**判别性**取证，或直接从迷你窗 target 读 `localStorage['nebula.lyricsoffset']`；级别维持 **medium（证据强度）**，不影响 F1/F2 的 blocker 定性。已交付的 `scripts/verify-mini-sync.mjs` 只覆盖标题/封面同步、全文无 offset/lyric/时间断言 —— 该点亦已写入 t15 契约。

## 7.13 r2 的 GO 条件与新增审议项（captain 裁定，reviewer 保持停手）

### (1) 执行状态与 GO 条件（更新）

- **t14 被调度器自动占用 attempt 1（attempt_id `e56a7a62-53c1-4842-8462-fda0e4618822`）；reviewer 未产生任何产出、未置 in_progress、未提交 verdict。**
  captain 裁定：**不释放、不改派**，让它以 claimed 状态挂着；GO 到达后我在**最新树**上一次执行并提交（若届时工具要求重新 claim，按报错提示处理）。
- 调度器若再次自动派发 t14：**照旧停手回报、不审议**，直到 captain 明确发 GO。
- **GO 条件（比先前多一条）= `t15`（verifier 的 r2 独立验证）completed + `t21` completed + `t22` completed。**
  当前 t21、t22 在跑；t15 依赖链就绪但按 captain 指令在等。

### (2) r2 **必审**新增项：升级路径隐患的根治（不能只被兜底掩盖）

**定位口径（captain 再次确认，r2 采用）**：**t22（根治）+ t23（防御）=「修掉真实隐患」**（升级用户 100% 命中、更新检查失效、日志污染），
**不是**「根治进程级死亡」—— BEFORE 那次抛错后**进程仍存活 25s** 已坐实。
**进程级死亡是仍未闭合的开项**，去向 = **t15 的 `window-all-closed` 判定性实验**（主窗开着时关掉迷你窗，应用必须存活），最终以 **t9 打包态长跑**为准。r2 **不得**把「进程级死亡」记为已闭合。

- 缺陷事实：**旧配置缺少 `updateURL` → 启动后约 8.1s 触发 `undefined … reading 'trim'` 异常 → 更新检查失效 + 日志污染**；**100% 命中从旧版本升级的用户**，而 **1.0.4 覆盖安装 1.0.3 正是该场景**。
- **t22 = 根治**（`store.ts` 新增 `isPlainObject()` + 通用递归 `mergeWithDefaults()`，消除 `undefined.trim()` 触发条件）；
  **t21 / t23 = 兜底 / 防御**（未处理拒绝容错等；单独存在会**掩盖**问题，**不能作为根治证据**）。

**④「读取期补键」的判定性实验（quality 提供，18:5x 实测；captain 转达）**：
将 `%APPDATA%\nebula-player\settings.json` 设为**只读**后启动修复版打包体 —— `init()` 的 `flush()` 写入被**物理阻断**（实测文件 mtime 仍为 9/6 旧值、`updateURL` 仍未出现在磁盘），
而应用在 **t=10s/20s/30s 均 5 进程存活、`reading 'trim'` 异常增量 0**。
→ 证明缺键是在 `init()` **读取期**由 `mergeWithDefaults()` 补齐（`store.ts:103-104` `this.data = merged`），写入期 `flush()`（`store.ts:108`）仅做持久化、**不承担补键职责**。
**该实验把「写入期补键」这一解释物理排除**，强于行号时序推断 → **作为 t22 闭合的判据**；证据来源记为 quality 的只读夹具实验（实验后已恢复可写）。

**t22 其余验收（均已实测，供 r2 复核）**：
BEFORE = 未修复打包体 + 天然缺 `updateURL` 的真实升级配置 → `uncaughtException … reading 'trim'` @ `Timeout._onTimeout`，**+8.1s**；
AFTER = 修复后重构建 → **存活 30s、异常增量 0**、磁盘配置被补齐 `"updateURL": ""`，且 `api` 块（含 `keyEnc` 密文）与全部用户值**逐一保持原值**；
`init()` 仅在**真补过键时**才 `flush()`（正常启动不写盘），`get/set/replace/persist/flush` 一字未改。
门禁：`typecheck:node`=0、`lint`=0（0 error / 1 warning）、`test`=0（11 files / **118 tests**）。

### (2b) r2 执行协议（captain 指定）

在**冻结树**上**一次**执行；**第 0 步先取实时退出码并附时间戳**（`node scripts/verify-lint-tests.mjs --label t14` + `eslint --no-cache`），
随后才做代码/证据复核，避免混用不同时刻的产物。

### (3) 受制裁实现方产物（captain 正式登记，一律不算越界）

以下路径因**契约 glob 未展开**而「inScope 拒绝但内容合法」，r2 按**最新工作区判定**、不作为越界或未声明改动：
`src/renderer/src/lib/__tests__/chatConfirm.test.ts`（F2/F4 用例唯一落点）、`scripts/probe-media-roots.mjs`、`scripts/probe-media-accept.mjs`、
`.devdata/t6-evidence/{T13-ERRATA,T13-EVIDENCE}.md` 与 `t13-*.{log,json,txt}`、以及**已不存在**的 `.devdata/zz-fingerprint.mjs`（合同列 inScope 但已被清理，全仓仅存其输出 `fingerprint-pre-fix.log`）。

### (4) CORP 口径事实补充（r2 无需开 finding）

captain 更正自身此前的误读：`protocol.ts` 的 **CORP 头已删除**（t13 attempt 2），现仅保留**说明注释**「Why there is deliberately NO Cross-Origin-Resource-Policy」（原先提到的含该头行已无该头）。
→ 与 §7.12 裁定一致；r2 只需**核实该头确实不存在**、且注释已写明「`ACAO` 必须为 `*`、不得加 CORP」的理由，**不就 CORP 开 finding**。

## 7. 复核方式

```powershell
node .devdata/t7-review/run-gates.mjs t7                 # lint/typecheck/test 真实退出码
npx.cmd eslint --no-cache --format json .               # 绕缓存复核
npx.cmd vitest run --config .devdata/t7-review/vitest.review.config.ts --reporter=verbose
node .devdata/t7-review/extract-installed.mjs           # 提取 1.0.3 基线（renderer）
node .devdata/t7-review/extract-installed-main.mjs      # 提取 1.0.3 基线（main）
```

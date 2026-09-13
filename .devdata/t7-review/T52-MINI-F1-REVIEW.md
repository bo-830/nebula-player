# t52 — 迷你窗 H：T47-F1 修复的独立审查（reviewer · 只读）

- 任务：**t52**（review · attempt 1 · `attempt_id = 5d39ac5a-951c-4825-ac6d-784dc9147f59`）；审查对象 = **t50 的修复**（T47-F1）+ **t51 的复验**，以**最新实现**为准。
- **verdict = `pass`（0 blocker）**；开项见 §10（其中 **H1 必须在 1.0.5 发布前用一条运行期探针裁决**，但**不**构成本波 blocker，理由见 §10.1）。
- **纪律**：未改 `src/**`、未改 `scripts/**`、**未起实例**、**未重跑探针/门禁**。唯一写入 = **本报告**（t52 契约本身要求落到该路径；captain 的事故后只管写入令与「写入须先批准」以本契约为准，其余照旧只读）。除本报告外，我本轮只做读取与原地哈希复算。

---

## 0. 第 0 步：锚点、同树核对、门禁逐项值（我实测）

| 项 | 我实测 | t51 声明 | 一致 |
|---|---|---|---|
| t51 取证树 `src/**` 聚合 sha1 | —（见下「现树」） | `ee2adc707e2c27e863d761979195e25a3f0149ba`（83 文件，newest `2026-09-13T12:26:04.674Z`，`t51-pre-snapshot.json`，`capturedAt 12:27:46.907Z`） | — |
| **现树** `src/**` 聚合 sha1（我用 `snapshot-fingerprint.mjs` 的同一算法原地重算：`src/**` `ts/tsx/css/html` 排序后 `file:sha1(12)` 串接再 sha1） | **`10c5284193a216748d30a709cb39d1a8b33f58ed`**，83 文件，newest **`2026-09-13T12:43:49.805Z`** | — | ❌ **与 t51 树不同** |
| **F1 修复所在文件** `src/renderer/src/stores/chatStore.ts` | `920fcb05ac5d873f609ac84bb36ca806ffea61b7`（20600 B，mtime `12:26:04.674Z`） | 同值（`920FCB05AC5D`） | ✅ **逐字节相同** |
| 门禁（`summary-t51.json`，stamp `12:28:00.463Z`，**逐项值**） | `lint.exitCode=0`、`totalErrors=0`、`totalWarnings=1`、**`filesWithErrors=[]`**、`typecheck.node=0`、`typecheck.web=0`、`tests.exitCode=0`、**167 passed / 16 files / 0 failed** | 同左 | ✅ |
| t50 自跑门禁（`T50-REPORT.md` §4） | typecheck 0（node+web）、lint exit 0（0 error / 1 warning，唯一 `TrackList.tsx:42`）、`npm test` → **16 files / 167 passed** | 同左 | ✅ |

### 0.1 同树核对：现树 ≠ t51 取证树 —— 差的是**并行任务 t54**，不是 F1 修复

我逐文件比对 `t51-pre-snapshot.json` 与现树，**恰好 4 个文件**不同（83 → 83，无新增/删除）：

| 文件 | t51 取证时 | 现树 | 归属（我判断） |
|---|---|---|---|
| `src/renderer/src/lib/tools.ts` | `a3f6d1d648c7` | `ee665436ef84` | 并行任务 **t54「薇拉 Vela J：AI 助手定名与人格落地」**（`ai-tools`，`in_progress`）：新增 `ASSISTANT_NAME = '薇拉 Vela'`（`tools.ts:19`）、`summarizeDestructiveTool` 直白化（`:194`） |
| `src/renderer/src/components/ChatPanel.tsx` | `1565969be8fb` | `21329500f4c8` | 同上：面板标题字面量 `ASSISTANT_TITLE`（`:20`）、4 条带人格的建议（`:27-32`） |
| `src/renderer/src/components/MiniChat.tsx` | `5c47602df3ce` | `1e2d62e5b60d` | 同上（迷你窗文案/建议） |
| `src/renderer/src/lib/__tests__/chatConfirm.test.ts` | `a2f23b5c80a3` | `eb7662d3aae8`（30327 B） | 同上：新增 `describe('薇拉 Vela persona (J)')`（`:594` 起） |

**关键核对（我逐点验过，不看结论只看代码）**：
1. `chatStore.ts` 与 t51 取证时**逐字节相同** ⇒ **被审的 F1 修复本体没有被动过**；
2. `emitAfterResolve` 夹具与 t50 的两条用例在现树仍在（`chatConfirm.test.ts:107-139`、`:544-590`）；
3. 流式渲染机制未被 t54 改动：`MiniChat.tsx:83` `snap.streamRaw.slice(0, snap.streamShown)`、`:154` caret；`ChatPanel.tsx:78-79` 同形；
4. 因此：**t51 的「机制/静态」结论对现树仍然成立**，但 **t51 的运行期证据是在 t54 之前取的** —— 见 §7.4 的降级说明。

> **纪律提示（给 captain/t53）**：本 verdict 只认证 **F1 修复（`chatStore.ts = 920fcb05ac5d…`）** 及其在 `ee2adc70…` 树上的运行期证据；**t54 的 4 文件改动不在本 verdict 覆盖范围内**，须由 `t55/t56` 独立验收 —— 不得从本报告继承。

---

## 1. 审查材料（我实际读过的，非转述）

| 材料 | 用途 |
|---|---|
| `.devdata/t47-evidence/T47-VERIFICATION.md` + `t47-runtime.json` / `t47-diag.json` / **`t47-diag2.mjs` + `t47-diag2.json`** | 原始缺陷矩阵与两条对照（我读了 diag2 的**工装源码**以确认对照的驱动方式） |
| `.devdata/t50-evidence/T50-REPORT.md` + `t50-mutation.log` / `t50-mutation2.log`（两份**内容逐字节相同**）+ `t50-repro.log` | 修复报告、变异证据、**修复前**判别复现 |
| `.devdata/t51-evidence/T51-VERIFICATION.md` + `T51-ADDENDUM.md` + `mini-g-hidden4.json` / `mini-g-visible-proxy.json` / `mini-g-hidden-direct.json` / `mini-g-tools.json` / `mini-g-spotcheck.json` / `mini-g-spotcheck2.json` / `mini-g-boundary-hidden.json` / `mini-g-boundary-mixed.json` / `mini-g-boundary-lag.json` / `mini-g-preflight.json` + `t51-boundary-hidden.mjs`（读源码以判定 47.5 s 离群的含义） | 复验与附录的**原始产物**（不采信摘要） |
| `src/renderer/src/stores/chatStore.ts`（全文 629 行）、`src/renderer/src/lib/mainWindowBridge.ts`、`src/renderer/src/lib/chatProxy.ts`、`src/renderer/src/components/MiniChat.tsx`、`src/renderer/src/components/ChatPanel.tsx`、`src/renderer/src/lib/tools.ts`（grep） | 机制核对 |
| `src/renderer/src/lib/__tests__/chatConfirm.test.ts:40-140` / `:483-532` | 夹具与时序用例 |
| `src/main/llmClient.ts`（grep `emitChunk`）、`src/main/ipc.ts:182-198`、`src/preload/index.ts:111-139` | 「chunk 何时被发出」 |
| **`out/renderer/assets/index-Cdfx1hqQ.js`**（= 已发布 1.0.4 的渲染 bundle，mtime `2026-09-12T12:39:22.316Z`，`@764586-770774` 区间原文） | **判定 H1 是否为本波引入**（我从中抽出了与现源码逐字相同的 `closeStream`/`openStream`/打字机/守卫代码） |
| `.devdata/t13-r2-evidence/t47-a2-snapshot.json`、`t51-pre-snapshot.json` | 独立树差（越界核对） |
| `%APPDATA%\nebula-player\chat.json`（安装态 userData）、`.devdata/user/chat.json` | H1 可达性的**现场数据点**（见 §5.3） |

---

## 2. 逐条验收裁定

| # | 验收项 | 裁定 | 依据（要点） |
|---|---|---|---|
| 1 | T47-F1 是否**真正闭合**（根因成立、非症状修补、无新时序脆弱点） | **通过（附限定）** | §3；两条 half 均被变异钉住；哨兵仍在且被反向用例覆盖 |
| 2 | 修复是否保持「单一聊天管线」 | **通过** | §4 |
| 3 | `streamRaw` 写入/清空/回读时序是否不再依赖隐藏窗口计时器 | **部分通过**：读路径已解耦 ✅ / **写路径仍与打字机耦合 ❌（H1）** | §5.1、§5.2 |
| 4 | 同族风险（打字机、chips 等）应列 blocker 还是 backlog | **全部 backlog**（含 H1）；H1 须在 1.0.5 前用探针裁决 | §6、§10 |
| 5 | t51 证据等级（核心场景与两条对照是否运行期、门禁是否逐项值） | **核心场景 + 对照 2 = 运行期 ✅；对照 1 降级 ⚠️；门禁逐项值 ✅** | §7 |
| 6 | 回归面复核 | **通过（附 3 处未覆盖说明）** | §8 |
| 7 | 越界核对（只改声明范围 / 无新增 `eslint-disable` / 证据目录规范） | **通过** | §9 |

---

## 3. 根因闭合性（裁定 1 的展开）

### 3.1 机制重建（我按代码复算，不是复述）

修复前：`runFrom` 在 `await chatComplete` 之后**读共享镜像**
`resume.accumulated = useChatStore.getState().streamRaw`（旧 `:586`），而本轮文本的归属地是 `openStream` 的**闭包缓冲**（`streamRaw` 只是它的镜像，见 `chatStore.ts:365-377`）。修复后：`RunResume.openStream` 返回 `StreamHandle`（`:77-96` 定义，`:395-407` 实现），`next()` = **先让出一个 macrotask**（`:404`）**再返回本流缓冲**（`:405`），`runFrom` 消费于 `:591`。

这条机制**能解释 t47 的全部观测**：
- 文本确实到达（网关每次 1 请求、`errors400=[]`）却被落成 `'（无回复）'` ⇒ 只能是「读取时缓冲还是空」；
- 同一路径在**可见**时正常、**隐藏**时连续失败 ⇒ 差异是「投递/调度次序」，不是路由；
- 工具回合正常（工具回合的文本与工具调用同批，且 settle 前的读不决定工具结果）⇒ 与「投递次序」不矛盾。

### 3.2 三条独立证据（我的裁定依据）

1. **修复前判别性复现（单测层）**：`t50-repro.log`（本地 `12:18:46`，**早于修复**）显示新用例在旧代码上 **failed**：`AssertionError: expected '（无回复）' not to be '（无回复）'`（`chatConfirm.test.ts:515`），另一条（真空回复仍写哨兵）**passed** ⇒ 夹具真的钉住了症状，且不是"顺带变绿"。
2. **干预性运行期证据（跨两套工装）**：修复前 hidden+代理+纯文本 ❌（t47：4 次 + diag 3 次）；修复后 **t50 4/4**、**t51 4/4**（不同工装、不同会话、独立重取），每次两端文本逐字一致、网关 1 请求、无哨兵。**插入一个让出就恢复文本**，这本身就是"deliver 晚于 resolve"的干预式证明。
3. **时序余量实测（t51 附录）**：末个 chunk 的镜像 → settle 仅 **2 ms（可见）/ 5.8 ms（隐藏）**；让出本身实测 **0 ms（两态中位数）** ⇒ 修复前的读**只早了那几毫秒**，正好落在让出所覆盖的区间里。这一条把"机制"从故事变成了**可量化**的解释。

**变异验证（我读了原始日志，两份逐字节相同）**：`t50-mutation.log` = `mutation A（去掉 settle 让出）→ exit=1 CAUGHT | failed=1`、`mutation B（读回 store 快照）→ exit=1 CAUGHT | failed=1`、`restored identical: true`、`residue MUTATION: false`、`BOTH HALVES LOAD-BEARING: true` ⇒ **两半各自承载**，不是装饰。

### 3.3 **不是**「改到现象消失」

- 哨兵 `content || '（无回复）'`（`:321`）**原样保留**，且 t50 第二条用例专门守住"真的空回复仍写哨兵" ⇒ 修复方向不是"让哨兵别出现"；
- 改动落在**取值来源**（镜像 → 拥有该文本的流）与**读取时机**（让出），而不是改结果渲染；
- `runFrom` 之外的所有编排（工具链、确认/取消、`finalize`/`persistHistory`）未被绕过（§4）。

### 3.4 如实限定（我给结论设的边界）

1. **修复前「投递晚于 resolve」的次序本身，两轮都没被直接观测到**：t50 对 `window.api`（冻结的 contextBridge 对象）打时间戳失败；t51 同样无法复现，只能在修复后的树上测到"余量很小"（2–5.8 ms vs 让出 0 ms）。**我的裁定建立于"干预 + 余量 + 变异"，而不是一份事件时序 trace** —— 这是证据链上唯一没有闭到"直接观测"的环节，我明确不背书那一步的**原始时序**，只背书"读取早了几毫秒、让出即恢复"。
2. **"hidden + 主窗直发 = 免疫"仍无解释**（t47-diag2，n=1，工装源码我读过：主窗内 `setDraft + await 300ms + send()`）。在 t50 的机制下，这只能是**竞态那次赢了**（间歇性），与"代理路径多一跳改变投递次序"并不冲突，但**我没有证据证实或否证** ⇒ 记为 **L4（低严重度解释缺口）**，供 owner 决定是否补一条更精确的说明。
3. **打包态（1.0.5）行为未取证**（本波全部 dev 运行期），由 t53 承担。

---

## 4. 架构约束（裁定 2）

| 约束 | 我核对的证据 | 结论 |
|---|---|---|
| 迷你窗**不得**有自己的 AI 循环 | `MiniChat.tsx:36` 只订阅 `onChatProxyState`；`:49` 只发 `chatProxyCmd`；`:51-56` `send()` **仅** `cmd({kind:'send',text})` 并注释写明"主窗拥有该回合"；迷你窗内 `typeof window.__nebula === 'undefined'`（t51 运行期 + preflight `hasNebula: "undefined"`）⇒ **结构上不可能**跑循环 | ✅ |
| 不得绕过 `chatStore` 另建管线 | 修复只改 `chatStore.ts` 内部（`:365-407`、`:591`）；`mainWindowBridge.ts` 全波未改（`1f5ddc067082…`，与 t47 时同值），且把 `send/confirm/cancel/abort/clear` **原样转发**到同一 store（`:41-62`） | ✅ |
| 历史单一写入者 | `window.api.chatSave` 全仓仅 `chatStore.ts:16` 调用（`preload:111` → `ipc.ts:174`）；迷你窗只读快照 | ✅ |
| 破坏性确认仍在唯一进程 | 确认条在迷你窗渲染，但 `confirm/cancel` 经 `chat:proxy:cmd` 回到主窗 store（t51 `mini-g-tools.json`：取消保数据 / 确认真移除，6/6 子断言） | ✅ |

---

## 5. 时序依赖分析（裁定 3：读已解耦，写仍耦合）

### 5.1 读路径：**已解耦** ✅

`:591 resume.accumulated = await stream.next()` 不再触碰 store 镜像；`next()`（`:401-406`）返回**闭包 `accumulated`**。因此「读」不再依赖窗口可见性、打字机、镜像清空时刻。t51 §4 用自己的观察器**否证**了"清空"假设（可见路径同样出现 `31 → 0`，而可见从不失败），我认同该更正。

### 5.2 写路径：**仍与打字机耦合** ❌ —— 记为 **H1**（本报告最重要的一条）

代码事实（现树，行号即 `chatStore.ts`）：
- 守卫：`:375` `if (closed || p.id !== rid || streamConvId !== rid) return` ⇒ **`streamConvId` 一变，后续 chunk 全部被丢弃**；
- `closeStream()`：`:352-358` 除清 interval 外还执行 **`streamConvId = ''`**；
- 打字机 interval：`:379-393`，其中 **`:386-390`** 分支在"揭示游标追上当前文本"时调用 **`closeStream()`**。

⇒ **只要在一次流的中间出现一次「≥ 1 个 tick（22 ms）的间隔且游标已到尾部」，该回合之后到达的所有 delta 会同时从【镜像】和【修复后的闭包缓冲】里被丢掉**（不只是预览冻结：`finalize` 落的就是 `accumulated`）。`:92` 的注释"so the buffered deltas are never dropped"因此**过强**。

**归属判定（我做了独立核实，不靠推测）**：我从**已发布 1.0.4 的渲染 bundle**（`out/renderer/assets/index-Cdfx1hqQ.js`，构建于 `2026-09-12T12:39Z`，**早于 t50 一整天**）抽出了与现源码**逐字相同**的 `closeStream()`／`openStream()`／打字机／守卫代码 ⇒ **H1 是既有缺陷，本波既未引入也未减轻**（修复前读的是镜像，同样受此守卫影响，故也未加重）。

**可达性（我不主张已确认）**：这是**静态判定**，本轮无法运行期证实（冻结令）：
- 该缺陷需要"游标追上尾部 + 相邻 delta 间隔 ≥ 22 ms"；本波自己的运行期数据恰好都**擦肩而过**：`mini-g-boundary-lag.json` 两次镜像事件相隔 **4.9 ms**、`mini-g-boundary-mixed.json` **11.2 ms**、t51 §4 记录的可见态混轮 **18.4 ms**（全都 < 22 ms）；
- **反向数据点**：安装态 `%APPDATA%\nebula-player\chat.json` 里有一条真实 DeepSeek（`baseURL=https://api.deepseek.com`）的**完整**长回答（~1500 字爵士乐史，`ts` 对应 **2026-09-06**）—— 但那是 **1.0.0 之前的老构建**，不能反推当前代码 ⇒ **既不能证实也不能证伪**；
- 因此 H1 的处置 = **backlog-H + 必须在 1.0.5 发布前用一条探针裁决**（配方与修法见 §10.1），**不作为本波 blocker**。

### 5.3 让出（drain）本身的性质

- t51 附录实测让出 = **0 ms（可见/隐藏两态中位数均 0）** ⇒ **不得**再用"后台节流给了更大缓冲"来论证安全性（我采纳该更正；它同时说明：让出保证的是"让已排队任务先跑"，不是等 N 毫秒）；
- 同一次测量里有一个 **47496 ms 的离群样本**（`mini-g-boundary-hidden.json.macrotaskHidden.max`；样本已排序，离群落在尾部）。我读了 `t51-boundary-hidden.mjs:40-50` 确认它是页面内真实计时：**隐藏态下一次 `setTimeout(0)` 可能被延迟数十秒**。方向上是"更安全"（读得更晚 ⇒ 缓冲更全），但代价是**该回合的落袋与气泡显示被推迟**（`next()` 未 resolve 前不 `finalize`）。
- 结论：**M2（backlog）** —— 建议采纳 t51 附录自己的加固方向：`chat:complete` 的返回**本来就带主进程侧的完整文本**，settle 优先采用它（或改用确定性的排空手段：IPC 往返 / `MessageChannel`），即可把"渲染侧事件投递次序"这一依赖**整体**移除，并把让出降级为双保险。
- **M4（backlog，低）**：让出期间用户点"停止"（`MiniChat` 的 abort）时，`catch` 用 `resume.accumulated`（`:224-227` / `:606-628`）落库，而该值此刻可能仍是**上一轮/空** ⇒ 有把"已生成的部分文本"落成旧值/哨兵的窗口。修复前同样如此（读在 catch 之前完成），但让出把这个窗口**变宽**了；需探针确认，未观测到。

---

## 6. 同族风险：blocker / backlog 裁定（裁定 4）

| 编号 | 项 | 现象面 | 我的裁定 | 理由 |
|---|---|---|---|---|
| **H1** | 打字机追上 ⇒ `closeStream()` ⇒ `streamConvId=''` ⇒ 后续 delta 连闭包缓冲一起丢（`chatStore.ts:375` / `:352-358` / `:386-390`） | **可丢用户文本**（截断落库） | **backlog-H，1.0.5 前必须探针裁决** | 既有（1.0.4 bundle 逐字同码）、本波未引入未加重；静态判定、无运行期复现；F1 场景不触发它（见 §10.1 注） |
| **M2** | drain 用 `setTimeout(0)`，时长不可界定（离群 47.5 s） | 气泡延迟（不丢文本） | backlog | 方向安全、仅延迟；采纳 t51 附录的"用回复携带的文本"作为下一波加固 |
| **M3** | `mainWindowBridge.ts:89-96` 120 ms 前导+尾随节流推快照 | 迷你窗 chips/预览滞后（不丢数据；尾随读的是当时状态） | backlog | 只在隐藏态被放大；无丢失路径 |
| **M4** | 让出期间 abort ⇒ 用陈旧 `resume.accumulated` 落库 | 边界落库内容 | backlog（低） | 需探针；未观测 |
| **M5** | `persistHistory` 300 ms 防抖（`:12-18`） | 从托盘立刻退出会漏掉最后一轮持久化 | backlog | 与本波无关的既有行为；本波运行期未见 |
| — | `sleepTicker`（playerStore）/ `detectTimer`（audioEngine）/ toast 3600 ms | 隐藏态节流影响**时基** | 不列为风险 | 不在聊天文本路径上；t47/t51 未观测到功能失败 |
| **L4** | "hidden + 主窗直发免疫"无解释 | 解释缺口 | backlog（低） | §3.4-2；不影响修复成立 |

**一句话**：本波**没有**必须阻塞发布的同族项；唯一能丢文本的 H1 是**既有缺陷**，其裁决需要一条我无权发起的运行期探针。

---

## 7. 证据等级抽验（裁定 5）

### 7.1 核心场景 = **运行期**（接受）
`mini-g-hidden4.json`：主窗 `visibilityState='hidden'`、**在迷你窗自己的 textarea 输入并回车**（`sent.typed/sent.sent = ok`）、4 轮全部 `mainAssistant === miniLastAi`、`hasSentinel=false`、每轮 `gateway.requests=1`、`errors400=[]`、观察器 `afterSettleEvents=0`。**不是静态推断冒充**。

### 7.2 对照 2（hidden + 主窗直发）= **运行期 ✅**
`mini-g-hidden-direct.json`：`main.visibility='hidden'`、真实文本、网关 1 请求、`pass=true`（t47 的 `t47-diag2.mjs` 工装源码我读过，确实是"主窗内直发"）。

### 7.3 对照 1（**主窗可见** + 代理）= **降级 ⚠️**
`mini-g-visible-proxy.json` 的 `group` 写着「main window VISIBLE」，但同一文件里记录的 **`main.visibility = "hidden"`**；而 `mini-g-preflight.json` 记录的是 `"visible"`（且 `t51-runtime.mjs:187-202` 的取序确实是"先可见对照、后 `windowClose()`"）。⇒ **该产物本身不能证明"主窗可见"这个条件成立**。
- 影响：**不致命**（被修的是隐藏态缺陷；"可见态正常"这一面在修复前后都成立，且修复只是把读源换成更可靠的那个），但 t51 报告里「两条对照在修复后的新树上重取均成立」这句应改为「**对照 2 已完整重取；对照 1 重跑但其记录的可见性与其标签矛盾**」。
- 我没有进一步取证（冻结令、且需要实例），故只做**降级 + 措辞更正**，不升级为 finding。

### 7.4 **同树**这一关：通过（对修复本体）/ 提示（对 UI 产物）
- 对**修复本体**：`chatStore.ts` 与 t51 取证时逐字节相同（§0.1）⇒ t51 的静态与机制结论直接适用；
- 对**运行期 UI 证据**：t51 取证发生在 t54 之前，现树的 `MiniChat.tsx` / `ChatPanel.tsx` 已被 t54 改过 ⇒ **严格说运行期证据不覆盖现树**。我核过 t54 的改动**不触及流式机制**（`MiniChat.tsx:83/:154`、`ChatPanel.tsx:78-79` 原样），故机制结论不受影响；但**UI 层面的断言应按"t51 取证树"标注**。

### 7.5 门禁
**逐项值齐全且为真实退出码**（§0 表）。**如实声明**：本轮我**没有**独立重跑门禁（captain 的写冻结/禁跑令优先于我的惯例做法；t42 那种"我自己再跑一遍"本轮不存在），因此我引用的 167 passed / 0 error 是 **t51 runner 的产物**（含 `filesWithErrors: []`），加上 t50 自跑的同值；**若需第三方复跑，请在解冻后另派**。

### 7.6 t51 自曝的 2 处探针缺陷 —— 处置正确
① `clickExpand()` 在已展开时不点击 ⇒ 首轮"收起"读数是展开态副本（`mini-g-spotcheck.json` 的 `passAll=false` / `collapsed360x128NoResidue=false` 正是该缺陷的痕迹），由 `mini-g-spotcheck2.mjs` 无条件 toggle 重测 **6/6**；② `JSON.stringify(...)()` 语法错误已修。**两者都是工装问题，产品证据已用更正后的工装重取** ⇒ 接受。

---

## 8. 回归面复核（裁定 6）

| 面 | 证据 | 结论 |
|---|---|---|
| 迷你窗尺寸/展开收起 | `mini-g-spotcheck2.json`：360×128 ⇄ 360×540 ⇄ 360×128，`collapsedNoResidue/expandedRendersSearchAndChat/collapseAgainRestores` 全 true | ✅ 运行期 |
| 收起态残留 | 同上 `searchZones/chatPanes/searchInputs = 0`；`lyricLines=1` 与折叠态"显示一行歌词"一致（t47 同口径） | ✅ |
| 搜索 → **主窗**播放 | `mini-g-spotcheck.json`：点第 1 行 → 主窗 `currentTitle=song-c`、`queueLen=4`、`index=0` | ✅ 运行期 |
| 隐藏再打开复位 | `beforeHide` 展开 → `afterReopen` 360×128 / `data-expanded=false` / 残留 0 | ✅ 运行期 |
| 迷你窗内破坏性确认 | `mini-g-tools.json`：`parkedNotExecuted/cancelKeptData/confirmMutatedData/barInsideMini` 全 true | ✅ 运行期 |
| 工具链路（控制指令） | 同文件：主窗 `isPlaying=false`、迷你窗 chip 含「暂停」、`errors400=[]` | ✅ 运行期 |
| 主窗**聊天面板 DOM** | 未直接取证（只取到 store 侧文本）；组件在现树被 t54 改过但流式行未变 | ⚠️ 未覆盖（**不构成风险**：本波 diff 不含 `ChatPanel` 的渲染逻辑；t54 的 UI 由 t55/t56 负责） |
| 歌词相关行为 | 本波 `src/**` 变更集**不含任何歌词文件**（§9 的树差可证） | ✅ 无从回归；t42 的 F5 见证层 backlog 原样保留 |

---

## 9. 越界核对（裁定 7）

我用**两份快照逐文件比对**（不采信 changedPaths 自述）：

| 检查 | 结果 |
|---|---|
| t47 树（`t47-a2-snapshot.json`，`459c1da2fd…`，83 文件）→ t50 树（`t51-pre-snapshot.json`，`ee2adc70…`，83 文件） | **恰好 2 个文件**：`src/renderer/src/stores/chatStore.ts`（`962c68d7b436 → 920fcb05ac5d`）、`src/renderer/src/lib/__tests__/chatConfirm.test.ts`（`470b7712daec → a2f23b5c80a3`）；83 → 83 **无新增/删除** ✅ |
| `mainWindowBridge.ts` | 全波未改（`1f5ddc067082…`，t47 时即此值）✅ 与 t50 自述"无需改动"一致 |
| `scripts/**` | 最新 mtime = **`2026-09-12T12:14:07Z`**（上一波）⇒ 本波未触碰 ✅ |
| 新增 `eslint-disable` | 全 `src/**` grep **0 命中**（含两个被改文件）✅ |
| 证据目录 | `.devdata/t50-evidence/**`（报告 + 原始 JSON + 变异日志 + 可复跑 `t50-runtime.mjs`）、`.devdata/t51-evidence/**`（分组独立 JSON + 工装）—— 规范 ✅ |
| 一处**如实记录** | t51 §1 说"t50 实际只改了 chatStore.ts"——严格说还改了 `chatConfirm.test.ts`（它此处想表达的是"派单预期会改 `mainWindowBridge.ts`，实际未改"），措辞易被误读；t50 自己的报告写的是两个文件 ✅ |

---

## 10. 开项与 backlog

### 10.1 **H1（最高优先，1.0.5 发布前必须裁决）**
- **位置**：`src/renderer/src/stores/chatStore.ts:375`（守卫）、`:352-358`（`closeStream()` 清 `streamConvId`）、`:386-390`（打字机追上即 `closeStream()`）。
- **问题**：一次流的中间只要出现"游标追尾 + 间隔 ≥ 1 tick（22 ms）"，之后的 delta 会被守卫丢掉 —— **镜像与闭包缓冲同时丢** ⇒ 回答被截断落库。`:92` 的"never dropped"注释与代码不符。
- **requiredFix（两步，代价很小）**：
 1. **解耦**：打字机追上时**只停自己**（`clearInterval` + `streamTimer=null`），**不要**清 `streamConvId`；把 chunk 守卫改为按"当前会话"判定（复用模块级 `convId` 或引入 `streamRid` 且在 `openStream`/`unsubscribe` 处显式管理），使"揭示进度"与"流是否存活"不再共享同一个变量；
 2. **补判别性用例**：新增"慢滴注"回归 —— mock/夹具按 ≥100 ms 间隔分 3 段投递（现有 `emitAfterResolve` 夹具只需多一个 `delays` 参数），断言最终气泡 = 三段拼接；把该用例加到变异清单（还原旧守卫 ⇒ 必须红）。
 3. 顺带修正 `:92` 的过强措辞（"are not out-run by the sampling read"）。
- **运行期裁决配方（一条任务即可，需实例授权）**：`mock-llm-t47.mjs` 加一个路由（3 段文本、每段 `await sleep(300)` 后再 `res.write`），主窗**可见**、迷你窗代理发一句纯文本，8 s 后读主窗 `messages` 末条；期望完整三段。若截断 ⇒ **升为发布 blocker**（属用户可见文本丢失）。
- **为何不阻塞本波**：既有（1.0.4 已发布包内逐字同码）、本波未引入未加重、F1 场景不创建该条件（hidden/可见两态下均未在本波运行期被触发）、且我的判定是**静态**的 —— 用一条未证实的静态风险去阻塞一个已被运行期验证的修复，会颠倒证据等级。

### 10.2 其余 backlog（M2/M3/M4/M5/L4，见 §5.3 / §6）
- **M2**：采纳 t51 附录的加固方向（`chat:complete` 回复已带完整文本 ⇒ settle 优先采用；或改用确定性排空），让出降级为保险。
- **M3**：隐藏态下 `mainWindowBridge` 120 ms 尾随节的滞后 —— 若要彻底平滑，可在 `finalize` 后做一次**立即**推送（当前依赖尾随定时器）。
- **M4**：让出期间的 abort 落库口径（需探针）。
- **M5**：`persistHistory` 防抖 + 托盘退出 ⇒ 最后一轮可能不落盘（既有；与本波无关）。
- **L4**：补一句更精确的机制说明（"hidden+直发免疫 = 竞态那次赢"，或给出投递路径差异）。

### 10.3 本轮**未做**的事（如实）
- 未起实例、未重跑探针/门禁、未做变异（冻结令）；H1 与 M4 因此只有静态判定；
- 未把 t54 的 4 文件改动纳入本 verdict（§0.1）；
- 未对"打包态 1.0.5"作任何断言（属 t53）。

---

## 11. verdict

> **`pass`（0 blocker）。**
> 1. **T47-F1 的根因判定成立到"可用于工程决策"的程度**：机制与代码逐行对应；三条独立证据（修复前单测判别复现、跨两套工装的干预式运行期 4/4 + 4/4、实测 2–5.8 ms 余量 vs 0 ms 让出）互相印证；两半修复各自被变异钉住；哨兵未被"修掉"而是被反向用例守住。
> 2. **架构约束未被破坏**：迷你窗零 AI 循环、零 store；历史单一写入者；确认/取消仍回到唯一进程的同一条管线。
> 3. **读路径已与窗口可见性/计时器解耦**；**写路径仍与打字机耦合（H1）** —— 但 H1 是**既有缺陷**（1.0.4 已发布 bundle 内逐字同码）、本波未引入未加重、F1 场景不触发，故按 backlog 处理并要求在 1.0.5 前用一条运行期探针裁决（配方见 §10.1）。
> 4. **证据等级**：核心场景与对照 2 为**运行期**证据；对照 1 因其记录中的可见性与标签矛盾而降级（措辞更正即可）；门禁为逐项真实值。
> 5. **两处限定必须随结论一起引用**：① 修复前"投递晚于 resolve"的次序本身未被直接观测（无 trace，只有干预 + 余量）；② "hidden + 主窗直发免疫"仍无解释（L4）。二者都不改变"修复有效"这一结论，但都写在报告里，不得在后续引用中省略。

**本报告只认证**：修复本体 `chatStore.ts = 920fcb05ac5d873f609ac84bb36ca806ffea61b7`（20600 B）及其在 `ee2adc707e2c27e863d761979195e25a3f0149ba` 树上的运行期证据；现树（`10c5284193a216748d30a709cb39d1a8b33f58ed`）新增的 t54 改动不在覆盖范围内。

---

### 附：我本轮的复算命令（只读，未改动任何被审产物）

| 目的 | 手段 |
|---|---|
| 树指纹 | `node -e`（复刻 `scripts/snapshot-fingerprint.mjs` 的聚合算法：`src/**` `ts/tsx/html/css` 排序 → `file:sha1(12)` 串接 → sha1）⇒ 现树 `10c5284193a216748d30a709cb39d1a8b33f58ed` |
| 逐文件同树判定 | `t51-pre-snapshot.json` 的 `srcFiles` × 现树逐条 `sha1(12)` 比对 ⇒ 4 处差异（§0.1） |
| 越界树差 | `t47-a2-snapshot.json` × `t51-pre-snapshot.json` 的 `srcFiles` 集合差 ⇒ 2 文件 |
| H1 归属 | 从 `out/renderer/assets/index-Cdfx1hqQ.js`（1.0.4 已发布 bundle）按字符窗口抽出 `closeStream`/`openStream`/打字机/守卫原文，与现源码逐字比对 |
| 关键文件哈希 | `Get-Item` + `Get-FileHash -Algorithm SHA1`（`chatStore.ts`、`chatConfirm.test.ts`、`mainWindowBridge.ts`、`MiniChat.tsx`、`ChatPanel.tsx`、`tools.ts`、`scripts/**` 最新 mtime） |
| 单写入者/边界 | `grep`：`chatSave`、`eslint-disable`（0 命中）、`streamRaw|streamShown`、`onChatProxyState|chatProxyCmd` |

---

## 12. addendum 7（captain 指定三项追加复核）—— **verdict 不变 = `pass`**

> **落盘说明**：`t52` 已以 `completed` 收口（终态不可改；我尝试 `claim` 被正确拒绝："task status cannot move from completed to claimed"）⇒ 本节按 t51 附录的同一处理方式，以**独立章节 + 消息**呈报。
> **纪律**：本轮写入**仅在** `.devdata/t7-review/**`（`t52-discrim/**` 工装 + 本节）；`src/**`、`scripts/**` **逐字节未动**（§12.6 实测）。

### 12.1 副本级反证：怎么造「修复前语义」（captain 项 1）

- 三份**完整 `src/**` 副本**（83 文件/份）落 `.devdata/t7-review/t52-discrim/{pre,cur,half}/src/`；**原树不参与运行**（配置只 include 副本目录）。
- `patch-variants.mjs`（每条替换**断言恰好命中 1 次**，任一不满足则**整体不写盘**）：

| 变体 | 语义 | 来源 | chatStore 指纹 |
|---|---|---|---|
| **pre** | `RunResume.openStream: (seed) => () => void`；`openStream` 返回裸 unsubscriber；`runFrom` 读 `useChatStore.getState().streamRaw`；`finally { unsub() }`（共 5 处替换） | **已发布 1.0.4 bundle 原文**（`out/renderer/assets/index-Cdfx1hqQ.js`，构建 `2026-09-12T12:39:22Z`，早于 t50） | `920fcb05ac5d → 6edbfc2487a7`（20252 B） |
| **half** | 保留让出、仍读镜像（1 处替换） | 本轮构造（隔离"两半谁承重"） | `→ c13ef3bb451e`（20414 B） |
| **cur** | 现树原样 | — | `920fcb05ac5d`（= `src/renderer/src/stores/chatStore.ts`） |

- 夹具：与仓内 `chatConfirm.test.ts` 同形的 fake window，**加两个时间戳**（round promise resolve 时刻 / delta 投递时刻）；`emitAfterResolve: true` = delta 在 resolve **之后**的 macrotask 投递。
- 命令：`npx vitest run --config .devdata/t7-review/t52-discrim/vitest.config.ts --reporter=verbose`（全量输出 `t52-discrim/matrix-run.log`）。

### 12.2 结果

**A. 用仓内那条用例的原文、只把它跑在 pre 副本上 ⇒ 复现成功**
唯一失败项 = `pre/.../chatConfirm.test.ts > text-only round with late chunks (t50 / T47-F1) > keeps the answer when the chunk event lands after the invoke reply`（`AssertionError: expected '（无回复）' not to be '（无回复）'`）；**同一份用例在 cur / half 副本上通过**。
⇒ 「**若 delta 晚于 resolve 投递，修复前落哨兵、修复后不落**」这一步**不再是推断**。

**B. 矩阵（最近一次运行；pre 的 LATE 格已连续 3 次运行复现）**

| arm | 投递 | 末条 assistant | 结算时 delta 是否已到 | `lag = deliver − resolve` (ms) | 60 ms 后镜像 |
|---|---|---|---|---|---|
| **pre** | **late** | **`（无回复）`** | **否** | **+0.95**（3 次：+0.95 / +11.88 / 结算后才到） | `''`（被守卫丢弃） |
| pre | sync | `ANSWER[pre/SYNC]` | 是 | −0.08 | `''` |
| **cur** | **late** | `ANSWER[cur/LATE]` | 是 | **+16.62** | `''` |
| cur | sync | `ANSWER[cur/SYNC]` | 是 | −0.02 | `''` |
| half | late | `ANSWER[half/LATE]` | 是 | +5.82 | `''` |

读法（四条）：
1. **前置条件已被直接测量**：三个 LATE 格的 `lag` 全部为正（+0.95 / +5.82 / +16.62 ms）⇒ 夹具确实造出了"delta 晚于 resolve"的次序（正是 t50/t51 声明无法观测的那一步）；量级与 t51 附录在真实隐藏态实测的 2–5.8 ms **同阶**。
2. **判别性**：**同一份 pre 代码**，SYNC 投递保住文本、LATE 投递落哨兵 ⇒ 判别因子是**投递次序**，不是夹具副作用。
3. **修复有效**：cur 在同一 LATE 次序下保住文本。
4. **两半的分工**：`half`（只留让出、仍读镜像）在 LATE 格也保住文本 ⇒ **这一格竞态的承重半是"让出"**；"读流自己的缓冲"那一半的价值是**结构性**的（把归属从全局镜像挪走，见 §12.4）。这与 t50 变异日志"B（读回快照）也被 CAUGHT"不矛盾：那次变异把**让出与读源一起**退回（等价于我的 `pre`），我这里**只退回读源**。
5. 旁证：所有 arm 在 60 ms 后 `streamRaw` 都为 `''` ⇒ 再次印证 t51 的更正 ——「settle 即清零」使该指标对成败**毫无判别力**。

**C. 边界（不得省略）**：本反证是**夹具级**的 —— 它钉住的是「晚投递 ⇒ 修复前落哨兵 / 修复后不落」这条**条件-后果**；它**不**证明真实 Chromium 在托盘态必然晚投递。真实侧证据仍是：t47 的前置矩阵（hidden+代理 ❌4+3 次 / 可见+代理 ✅ / hidden+直发 ✅）+ t50/t51 修复后 4/4 + t51 附录"末 chunk→settle 2–5.8 ms vs 让出 0 ms"。⇒ §3.4-1 的限定保持有效，但**强度提高**（前置条件现在有了可复现的判别器）。

### 12.3 captain 项 2：`hidden + 主窗直发 = 免疫` 的候选解释（CDP 唤醒）

**评估：方向成立但未证；我给出可判别的差分设计。**
- 我读了对照工装 `t47-diag2.mjs`：直发确由**外部探针经 CDP `Runtime.evaluate` 在主窗内**执行 `setDraft → await 300 ms → send()`。
- **但"CDP 附加"对两条路径都成立**（失败那条也是探针经 CDP 驱动迷你窗 → IPC → 主窗）⇒ 差异只可能落在**"由 CDP 任务发起 `send()`" vs "由 IPC 任务发起 `send()`"**（渲染进程被唤醒/预热状态不同）。你的表述已经落在这个**更窄**的差异上，我认同方向；不过 **t47 的直发是 n=1**，在 t50 的机制下"免疫"也可能是**那一次竞态赢了**（自洽）⇒ 我不背书。
- **可验证（且不需要修复前构建）**：`lag`（delta 到达时刻 − 回合 resolve 时刻）是**投递管线的属性**，与本修复（只改"读什么"）无关 ⇒ 可在**现树**上直接测。设计：外部观察者（额外 `onChatChunk` 监听 + store 订阅）三臂各 n≥10：
 (a) 迷你窗代理（IPC 发起）；(b) 主窗内 CDP `evaluate` 直发；(c) 主窗内 `setTimeout` 自触发（既非 CDP 也非代理）；另置 **(d) = (a) 的重复、但等待期间探针不做任何 `evaluate`**（排除"探针轮询唤醒渲染进程"这一混淆项）。
 **预测**：若你的解释成立 ⇒ (a) 的"晚投递"比例显著高于 (b)，且 (c) 接近 (a)。（需你授权的受控实例窗口。）
- **对结论的影响：无。** ① 用户实际踩到的是代理路径（托盘态）；② 修复把**读取**与"投递次序"整体解耦（§12.4）；③ §12.2 已把"晚投递 ⇒ 后果"钉住。⇒ 记 **L4（未证解释缺口）**，不阻塞。

### 12.4 captain 项 3：`next()` 读闭包缓冲是否**结构性**消除该类风险

**结论：读/落盘一侧是结构性的；写/投递一侧不是（H1 仍在，且现在它是唯一剩下的"文本丢失"通道）。**
- **结构性**：`StreamHandle`（`:77-96`、`:365-407`）把"本回合文本"变成**流对象的私有状态**，`runFrom` 只在 `:591` 消费它，`finalize` 落盘的 `accumulated` 不再经过全局镜像 ⇒ 修的是**归属**这一整类，而不是本次时序；§12.2-B4 的"只留让出也能过"说明承重的是**让出 + 读私有量**这一对（让出的对象就是流自己的 `next()`）。
- **传递路径逐条核对**（代码 + 既有用例，三副本上均通过）：
 - **seed 恢复**：`runFrom` 每轮开头 `openStream(resume.accumulated)`（`:570`）⇒ 新流以累积文本为 seed；`confirm`/`cancel` 续跑复用同一 `resume`，其 `resume.accumulated` 来自上一次 `next()` 的返回值（`:276`/`:302`）⇒ 续跑不丢前段叙述（仓内 `keeps the narration produced before the pause…` 用例三副本全绿）。
 - **多轮 tool 循环**：`roundStart = resume.accumulated.length`（`:573`）取自流缓冲 ⇒ 拼接以流为准；若上一轮迟到 delta 落在下一轮之前，`roundText` 的**切分**可能偏（叙述层，低危），**总文本不丢**。
 - **confirm/cancel 快照同步**：`:491-503` 未受影响。
- **未结构性消除**：chunk 的**接收**仍由模块级 `streamConvId` 守卫（`:375`），而该变量被**打字机**（`:386-390`）经 `closeStream()`（`:352-358`）清除 ⇒ 流中间一旦出现"游标追尾 + ≥1 tick 间隔"，闭包缓冲与镜像**同时丢 delta**。⇒ **H1 = 修复后唯一的文本丢弃通道**，优先级上调；`StreamHandle` 文档 `:92` "the buffered deltas are never dropped" 应按此修正。

### 12.5 对本报告前文结论的影响

- **裁定 1（根因闭合）不变（加强）**：§12.2 把"晚投递 ⇒ 落哨兵（pre）/ 不落（cur）"从推断变为**可复核复现**（仓内用例原文 + 副本）。
- **裁定 3（读已解耦 / 写仍耦合）不变**；`half` 格使分工更清楚（**让出**承重本次竞态、**私有缓冲**承重归属）。
- **H1 优先级上调为"1.0.5 发布前必须裁决"**；§10.1 的配方补一条：**新用例不能只造"晚投递"，还要造"多段慢滴注"（≥100 ms 间隔）** 以触发游标追尾（`chatStore.ts:386-390`）。
- **verdict 仍为 `pass`（0 blocker）**：本轮没有任何新证据指向**修复本身失效**或引入**新的用户可见缺陷**；H1 是**既有**缺陷（1.0.4 bundle 逐字同码），需要的是**裁决任务**而非本波返工。

### 12.6 纪律实测（本轮）

- `src/**` 聚合（我复算）`83d13b16706a441c5d4f331d00ad86d12568b343`（83 文件）；其中 **`chatStore.ts = 920fcb05ac5d` 未变**（= 被审的修复本体）。
- `12:40Z` 之后被改动过的 src 文件 = `MiniChat.tsx`(12:43:17) / `chatConfirm.test.ts`(12:47:33) / `tools.ts`(12:48:30) / `ChatPanel.tsx`(12:48:33)，指纹为 `1e2d62e5b60d` / `e33545d5777d` / `ee665436ef84` / `fa0f16ec596b` ⇒ **全部是并行任务 t54（薇拉 Vela）的产物，与我的动作无关**（我在 `src/**` 上只有读操作）。
- **副本一致性（实测，非假设）**：三份镜像在 `tools.ts` / `ChatPanel.tsx` / `MiniChat.tsx` / `chatConfirm.test.ts` 上**逐字节相同**（分别为 `ee665436ef84` / `fa0f16ec596b` / `1e2d62e5b60d` / `e33545d5777d`，即拷贝时的现树状态），**只有 `chatStore.ts` 按变体不同**（`6edbfc2487a7` / `920fcb05ac5d` / `c13ef3bb451e`）⇒ 三个 arm 的差异被**限定在被考察的那一个文件**上。

### 12.7 复跑方式与产物

| 产物 | 内容 |
|---|---|
| `t52-discrim/{pre,cur,half}/src/**` | 三份完整 `src` 副本（83 文件/份） |
| `t52-discrim/patch-variants.mjs` | 变体构造（逐条断言"命中 1 次"，输出三份 sha1） |
| `t52-discrim/matrix.test.ts` | 5 格矩阵（带时间戳夹具） |
| `t52-discrim/vitest.config.ts` | 只 include 副本目录（`src/**` 不参与） |
| `t52-discrim/matrix-run.log` | 本次运行完整输出（含 `T52-ROW` 行） |
| 命令 | `npx vitest run --config .devdata/t7-review/t52-discrim/vitest.config.ts --reporter=verbose` ⇒ **exit 1**，唯一失败项 = `pre` 副本上那条**官方用例原文**（= 目标复现）；`Test Files 1 failed \| 3 passed (4)`、`Tests 1 failed \| 76 passed (77)`；pre 的 LATE 格在**连续 3 次运行**中均落哨兵 |

### 12.8 锁版复核（captain 环境更新后，`2026-09-13T12:53:07.537Z`）

| 项 | 我实测 | 判定 |
|---|---|---|
| **被审修复本体** `src/renderer/src/stores/chatStore.ts` | `920fcb05ac5d873f609ac84bb36ca806ffea61b7`（20600 B，mtime `12:26:04.674Z`） | **未漂移**（与 t51 取证时、与本人审阅开始时同值）⇒ **§0–§12 全部裁定继续有效，无需暂缓 verdict** |
| 读取时 `src/**` 聚合 | `83d13b16706a441c5d4f331d00ad86d12568b343`，83 文件，newest `2026-09-13T12:48:33.832Z` | 记录在案 |
| `12:40Z` 之后变动的 src 文件 | 恰好 4 个：`tools.ts ee665436ef84`(12:48:30) / `ChatPanel.tsx fa0f16ec596b`(12:48:33) / `MiniChat.tsx 1e2d62e5b60d`(12:43:17) / `chatConfirm.test.ts e33545d5777d`(12:47:33) | **与 captain 所述 t54 契约面逐字一致，且不含 `chatStore.ts`** ⇒ 钉版稳定 |

**三个读取时聚合值（可追溯漂移）**：§0 读取时刻 = `10c5284193a216748d30a709cb39d1a8b33f58ed`（12:45Z 前）→ §12.6 = `83d13b16706a441c5d4f331d00ad86d12568b343`（12:50Z）→ 本节 = 同值（12:53:07Z）；两次差异**全部**归因 t54，被审文件恒为 `920fcb05ac5d`。

**与 t56 的边界（captain 明确要求）**：本报告只认证「T47-F1 修复 + 其在 `ee2adc70…` 树上的运行期证据」；**人格落地（`t54`/`t55`/`t56`）是另一件事**，本报告的任何结论（含 §12 的矩阵与 H1）**不得**被当作 t56 的既定事实引用。

**两条结论不冲突（避免误读）**：t51 附录判「**超过一个 macrotask** 的晚投递 = 不可达/仅理论」（无"返回后再发 chunk"的代码路径）＋ 我是用**恰好一个 macrotask 级**的晚投递做副本反证（`lag` = +0.95 / +5.82 / +16.62 ms）—— 两者是同一机制的两个刻度：**一个 macrotask 的晚投递足以让修复前落哨兵、也让修复后不进哨兵**；而"比一个 macrotask 更晚"的投递在本树中无路径可产生。⇒ 合并读法：修复覆盖了**可达的那一档**，不可达的那一档仍按 backlog 记录（并在 H1 裁决时一并说明）。

---

## 13. addendum 8：**H1 已在夹具层定死（追尾 ⇒ 丢 delta）—— 两档均截断，两条对照钉住机制**

> captain GO 后的**零实例**实验。**不改 verdict**（t52 = `pass`）；本节把 H1 从"静态判定"升级为**可复现的机制确认**，供 t57 的运行期 trace 作为**独立佐证**交叉验证。

### 13.1 方法：把「节流」这一混淆变量整个消除

- 新增 `t52-discrim/h1-drip.test.ts`：**一个回合两段 delta、真实间隔**，且回合**在第二段之后才 resolve**（与 §12 的"晚投递"矩阵是两件事：那次考投递次序，这次考**追尾**）；
- **vitest/node 里没有后台节流**：22 ms 打字机定时器按真节奏走（这正是 verifier 运行期 300 ms 档拿不到的前提）；
- 4 个 arm（各为完整 `src` 副本）：`pre`（= 1.0.4 bundle 原文语义）、`cur`（= t50 修复）、**`noclose`（对照 1：追尾分支只停揭示、不再 `closeStream()` ⇒ `streamConvId` 存活）**、**`noguard`（对照 2：守卫不再以 `streamConvId` 为键）**；后两者由 `patch-h1-variants.mjs` 从 `cur` 生成（各 1 处替换、断言命中 1 次；`faea382d825b` / `dd254767f5ef`）；
- 命令：`npx vitest run --config .devdata/t7-review/t52-discrim/vitest.h1.config.ts --reporter=verbose`（日志 `h1-drip-run.log`）。

### 13.2 结果（**8/8 通过 = 全部符合 H1 预测**）

| arm | gap | 末条 assistant | 截断 | `maxRawLenSeen` | 观察器 trace（`t: rawLen/shown`，摘要） |
|---|---|---|---|---|---|
| **pre** | **100 ms** | **`AAAA`** | **是** | **4** | `0.9:r4/s0 → 27.4:r4/s4 → 168.3:r0/s4`（**从无 r8**） |
| **cur** | **100 ms** | **`AAAA`** | **是** | **4** | `1.3:r4/s0 → 38.9:r4/s4 → 179:r0/s4`（**从无 r8**） |
| noclose | 100 ms | `AAAABBBB` | 否 | 8 | `0.7:r4/s0 → 35.5:r4/s4 → **113.1:r8/s4** → 145.3:r8/s8` |
| noguard | 100 ms | `AAAABBBB` | 否 | 8 | `0.7:r4/s0 → 38:r4/s4 → **114.2:r8/s4** → 145.6:r8/s8` |
| **pre** | **2000 ms** | **`AAAA`** | **是** | **4** | `0.2:r4/s0 → 29.6:r4/s4 → 2070:r0/s4`（**从无 r8**） |
| **cur** | **2000 ms** | **`AAAA`** | **是** | **4** | `0.2:r4/s0 → 29.9:r4/s4 → 2080:r0/s4`（**从无 r8**） |
| noclose | 2000 ms | `AAAABBBB` | 否 | 8 | `0.3:r4/s0 → 30.6:r4/s4 → **2007.2:r8/s4** → 2038.9:r8/s8` |
| noguard | 2000 ms | `AAAABBBB` | 否 | 8 | `0.1:r4/s0 → 30.2:r4/s4 → **2012.6:r8/s4** → 2044:r8/s8` |

### 13.3 四条读法（每条都能被 t57 的运行期 trace 复核）

1. **H1 成立，且在修复后的树上同样成立**：`pre` 与 `cur` **两档都截断**（末条只剩第一段）—— 与 captain 预期一致（t50 从未碰 `:375` 守卫与 `:379-393` 打字机）。
2. **丢的是 delta 本身，不只是"没显示"**：截断 arm 的 `maxRawLenSeen = 4` = 第一段长度 ⇒ 第二段**从未进入镜像**，即被 `:375` 守卫拒绝（与 t47 当年"`streamRaw` 在 +2s/+8s 均为 0"同源）。
3. **机制定位（追尾）**：trace 显示第一 tick 就把 4 字符揭示完（`r4/s4`，t≈27–39 ms），**此后 `shown` 再无推进**（`noclose`/`noguard` 则继续推进到 `s8`）⇒ `:386-390` 的追尾分支确实触发并执行了 `closeStream()`（清 interval 与 `streamConvId`）。
4. **两条对照证明"用例咬住的正是 H1 机制"**：追尾分支（对照 1）**或**守卫键（对照 2）任去掉一半 ⇒ 第二段被正常接收（`r8` 出现在第二段到达时刻、末条 = 两段拼接）⇒ **两半对这条路径各自承重**，不存在"换个别的机制也能过"。

### 13.4 对判定与修法的影响

- **修法已被"构造性验证"**：captain 计划的第一步（"打字机只停自己、不清 `streamConvId`"）**正是我的 `noclose` 对照**，而该对照在这两档里都把文本救回来了 ⇒ 方案有效，不是猜测；第二步（修正 `StreamHandle :92` 的 "never dropped" 注释）维持。
- **t52 verdict 不变（`pass`）**：被审的 F1 修复本体无问题；H1 是**既有**缺陷（`pre`/`cur` 同表现 + §5.2 的 1.0.4 bundle 逐字同码），本次实验只把它**从静态判定升为确认**。
- **对 1.0.5 的建议（维持 §10.1 的升级条件）**：H1 现为**已确认的用户可见文本截断通道**（真实 token 节奏 10–100 ms 落在触发区间；前台/非节流窗口是其发生条件）⇒ 应在 1.0.5 前修复；其"是否即发布 blocker"由 captain 按既定裁定（"若复现即升为 blocker"）认定 —— 我不改 t52 的 verdict。
- **与 t57 的分工**：本节为**夹具级**机制确认（消除节流混淆变量，但仍是模拟投递）；t57 提供**真实环境**侧的成立条件（前台/遮挡/节流）。互证点：若 t57 在前台档看到 `rawLen` **冻结于第一段长度** + `shown` **不再推进** ⇒ 与本节的 `r4/s4` 冻结签名完全一致。

### 13.5 复跑与产物

| 产物 | 内容 |
|---|---|
| `t52-discrim/h1-drip.test.ts` | 8 格（2 档 × 4 arm），含 `(t, rawLen, shown)` 观察器 |
| `t52-discrim/vitest.h1.config.ts` | 只 include 上面这一份（便于逐步复现，不重跑 §12 矩阵） |
| `t52-discrim/patch-h1-variants.mjs` | 生成 `noclose` / `noguard` 两个对照（各 1 处替换、断言命中 1 次） |
| `t52-discrim/h1-drip-run.log` | 本次运行完整输出（含 `T52-H1-ROW`） |
| 命令 | `npx vitest run --config .devdata/t7-review/t52-discrim/vitest.h1.config.ts --reporter=verbose` ⇒ **exit 0 / 8 passed**（8 格全部符合 H1 预测） |

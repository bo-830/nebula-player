# t56 — 薇拉 Vela L：人格落地的独立审查（reviewer · 只读）

- 任务：**t56**（review · attempt 1 · `attempt_id = a93b5112-49e7-4a5a-8844-7593ddc13942`）；**审查对象 = t54**（人格落地）+ **t55**（独立验证），以**最新实现**为准。
- **verdict = `pass`（0 blocker）**。开项/backlog 见 §9（无一条构成发布阻塞）。
- **纪律**：未改 `src/**`、未改 `scripts/**`、**未起实例**、未重跑门禁；唯一写入 = 本报告。与 **t52（T47-F1 修复的审查）分属不同对象**，两份 verdict 不互引、不合并。

---

## 0. 第 0 步：锁版、漂移归因（我实测）

| 项 | 我实测（`2026-09-13T13:57:51.305Z`） | 判定 |
|---|---|---|
| `src/**` 聚合（复刻 `snapshot-fingerprint.mjs` 算法） | **`e5653c9e4c9bc969995f6615a40ce9e1ca9dbb99`**，83 文件，newest src mtime **`13:43:18.746Z`** | 记录在案 |
| **t54 的 3 个实现文件** | `tools.ts` `ee665436ef84`(24884 B, 12:48:30) / `ChatPanel.tsx` `fa0f16ec596b`(8310 B, 12:48:33) / `MiniChat.tsx` `1e2d62e5b60d`(7498 B, 12:43:17) | **与 t54 声明逐字节一致** ⇒ 被审实现未被后续任务改动 ✅ |
| t54 的测试文件 | 现为 `e82e5d2ef624`(40954 B, **13:37:56**)，t54 声明 `e33545d5777d`(31884 B) | **被 t58 改写**（非 t54 缺陷）；我另行核对 persona 断言仍在（§7.3） |
| 其余 src 变动 | 仅 `chatStore.ts` `3c4edd11171b`(22970 B, **13:43:18**) | 归属 **t58**（= H1 修复；其内容含我 t52 §13 的机制说明），**不在 t54 范围、也不属本审查对象** |
| `package.json` 版本 | **1.0.5**（t55 的 typecheck 日志亦为 `nebula-player@1.0.5`） | 发布波次在准备中，记录在案 |
| 同树核对 | newest src mtime `13:43:18` **早于** t55 的门禁窗口（`13:46:44→13:47:12`） | ⇒ **t55 的门禁逐项值覆盖的正是我审的这棵树** ✅ |

---

## 1. 审查材料（我实际读过/复算过的，非转述）

| 材料 | 用途 |
|---|---|
| `.devdata/t54-evidence/T54-REPORT.md`、`t54-mutation.log`、`mutation-check.mjs`（读源码以核对基线口径）、`t54-scope.log` | 实现报告与判别性证据 |
| `.devdata/t55-evidence/T55-REPORT.md` + **原始产物**：`t55-runtime.json` / `t55-runtime4.json` / `t55-runtime5.json` / `t55-lint.json` / `t55-test.log` / `t55-typecheck.log` / `t55-wire-system-prompt.txt` | 证据等级抽验（我用脚本直接从产物里取值，不采信摘要） |
| `src/renderer/src/lib/tools.ts`（全文关键段：token 逻辑 `:127-164`、`summarizeDestructiveTool` `:194-204`、`destructiveGuard` `:214-232`、`executeTool` `:254-…`、`buildSystemPrompt` `:567-600`） | 硬边界与提示词 |
| `src/renderer/src/lib/__tests__/chatConfirm.test.ts`（persona `:602-768`、guard `:192-296`、H1 块 `:794+`） | 判别性与测试现状 |
| `src/renderer/src/components/MiniChat.tsx`（`:44-73` 等） | 组件侧仅改文案的核对 |
| **`.devdata/release-evidence/asar-out_renderer_assets_index-Cdfx1hqQ.js`**（= 已发布 1.0.4 的渲染 bundle 原文，`2026-09-12T12:41:07Z`） | **人格落地之前的官方基线**：逐区域比对工具/令牌逻辑（§3） |

---

## 2. 逐条验收裁定

| # | 验收项 | 裁定 | 依据 |
|---|---|---|---|
| 1 | 是否**只改了措辞与提示词**、未悄悄改工具行为逻辑（硬边界） | **通过** | §3：文件集 + 功能区域双证据 |
| 2 | 确认条是否**直白化且未被软化**、与 t3/t34 规则一致 | **通过** | §4 |
| 3 | 口吻分档的实现方式是否可靠（提示词 vs 代码兜底） | **通过（评估结论：可接受，兜底记 backlog）** | §5 |
| 4 | 失败话术的诚实性（不诱导承诺做不到的事） | **通过** | §6 |
| 5 | t55 证据等级（三类口吻/确认条是否**运行期实际文案**、门禁是否逐项值） | **通过（附证据边界）** | §7 |
| 6 | 回归面（工具链路、多轮循环、双窗文案一致、无新增 `eslint-disable`） | **通过** | §8 |

---

## 3. 硬边界（验收 1）：两条独立证据

### 3.1 文件集（我自己的树差，不看 t54 自述）

以 t51 取证树 `t51-pre-snapshot.json`（83 文件）为基线逐文件比对：

| 面 | 结论 |
|---|---|
| 变化的文件 | **恰好 4 个**：`tools.ts`(`a3f6d1d648c7`→`ee665436ef84`)、`ChatPanel.tsx`(`1565969be8fb`→`fa0f16ec596b`)、`MiniChat.tsx`(`5c47602df3ce`→`1e2d62e5b60d`)、`chatConfirm.test.ts`（t54 后又被 t58 改写） |
| **禁改面**（`src/main/**`、`src/preload/**`、`src/shared/**`、`MiniPlayer.tsx`、`MiniSearch.tsx`、`mainWindowBridge.ts`） | 全部**与 t51 基线逐字节相同**（例：`mini.ts 7963cb9da9be`、`index.ts 18ef7c49c2eb`、`preload/index.ts fc37d10aab99`、`MiniPlayer.tsx f14e26699111`、`mainWindowBridge.ts 1f5ddc067082`）⇒ **0 越界** |
| `src/**` 内 `eslint-disable` | **0 命中**（无新增抑制） |

### 3.2 功能区域（与**已发布 1.0.4 bundle** 逐区域比对 —— 本审查的关键一步）

从 1.0.4 bundle（人格落地**之前**）抽出原文，与现源码对照：

| 函数/常量 | 1.0.4 已发布 bundle | 现源码 | 判定 |
|---|---|---|---|
| `DESTRUCTIVE_TOOLS` | `new Set(["remove_from_playlist"])` | `new Set(['remove_from_playlist'])` | **相同** ✅ |
| `DESTRUCTIVE_LABELS` | `{ remove_from_playlist: "移出歌单" }` | 同 | **相同** ✅ |
| `isDestructiveTool` | `return DESTRUCTIVE_TOOLS.has(name)` | 同 | **相同** ✅ |
| 令牌常量/工具 | `CONFIRM_TOKEN_PREFIX="dconf"`、`CONFIRM_TOKEN_SEP="\0"`、`tokenPart`（清 `\0` 与 `\|`）、`mintConfirmToken=[prefix,runId,name,toolCallId,nonce]`、`confirmTokenMatches`（5 段 + 逐段精确匹配） | `:127-153` **逻辑逐句相同** | **相同** ✅ |
| `destructiveGuard` | `if (!isDestructiveTool) return null; if (deps && confirmTokenMatches(deps.confirmToken, deps, name)) return null;` + `{ok:false,needsConfirm:true,content:等待用户确认：…, chip:待确认：…, confirmSummary, confirmToken}` | `:214-232` **条件与字段逐句相同** | **相同** ✅ |
| `executeTool` | 解析 args → **先** `destructiveGuard` → `fail()` → 取 4 个 store → `switch` | `:254-…` 结构相同 | **相同** ✅ |
| `summarizeDestructiveTool` | `歌单「X」` / `移除 N 首歌曲：` / `（未指定歌曲）` | `歌单《X》` / `移除 N 首：` / `未指定歌曲（数量 0），需要你确认` | **仅返回字符串变化**（t54 声明）✅ |
| `buildSystemPrompt` | 无 `ASSISTANT_NAME`、无人格段、规则 1–6（旧编号） | 新增 `ASSISTANT_NAME` + 人格段 + 规则 1–7 | 提示词改动（本任务对象）✅ |

⇒ **人格落地没有触碰工具执行、确认令牌、防重复调用的任何逻辑**；`chatStore.ts` 侧亦无 t54 改动（该文件 mtime `12:26:04`，晚于它的两次改动属 t58）。t54 自述「一行未动」在**第三方基线**上成立。

---

## 4. 确认条（验收 2）：直白化 + 语义未削弱

| 检查 | 证据 | 结论 |
|---|---|---|
| 含**操作对象**与**数量** | 运行期 DOM：`从歌单《夜跑》移除 1 首：《SongB》`（`t55-runtime.json` `summaryChecks.containsCount=true`、`t55-runtime4.json` `hasCount=true`）；单测 4 形态（`:661-702`）：`从歌单《夜跑》移除 2 首：t1、t2` / 曲名已知逐字 `…《雨夜行》、《夜跑》` / 4 首时 `等 4 首` / 未指定 `未指定歌曲（数量 0）` | ✅ |
| 无 emoji / 无卖萌 | 运行期 `summaryChecks.emojiCount=0`；卖萌词扫描 `[]`；单测每形态 `emojiIn(summary) === []` | ✅ |
| **确认语义未被软化** | `needsConfirm:true` + `chip: 待确认：…` + `content: …该操作尚未执行…请不要重复调用同一个工具。`（与 1.0.4 逐句相同）；**令牌只在 (runId,name,toolCallId,nonce) 全等时放行**；按钮仍是 `确认执行/取消`（运行期 DOM）；取消后 `trackIds` 前后一致（运行期） | ✅ |
| 与 t3/t34 规则一致 | 上述逻辑与 1.0.4 已发布实现**逐句相同**（§3.2）⇒ 人格未削弱既有确认规则 | ✅ |
| 提示词未反向削弱 | 规则 5（`tools.ts:596`）要求「用一句不加修饰的话说明将要删除的对象和数量…请用户在聊天框确认或取消，禁止软化、禁止卖萌、禁止 emoji，**不要重复调用同一个工具**；用户取消时不要重试」⇒ **加强**叙述纪律，且与 t34 的取消语义一致 | ✅ |

> 判定：**确认条比人格本身更重要，此处最关键的「必须确认」由代码（guard+token+按钮）承担，提示词只约束叙述** —— 这是本波设计上最值得肯定的一点。

---

## 5. 口吻分档的可靠性（验收 3）：评估与建议

**现状（我独立核实）**：
1. 机制 = **纯提示词委托**：人格段（`tools.ts:584-589`）与规则 1/4/5/6 用文字授权与分档；
2. **应用侧零强制**：全 `src/**` 中 `emoji` 只出现在**提示词字符串与注释**里（grep 命中 `:190-191`、`:587-588`、`:595-596`），无任何过滤/裁剪代码；
3. 运行期反证：网关故意回 **5 个 emoji** ⇒ 应用**原样渲染**（`t55-runtime.json` `overCapProbe.emojiCount=5`）⇒ 「单条 ≤2」**只存在于提示词**。

**裁定：可接受，不需要阻塞发布（记 backlog）**。理由（按重要性排序）：
1. **安全相关文案是代码资产，不经模型**：确认条 summary、chip「该操作尚未执行」、按钮「确认执行/取消」、失败指路句全部由 `src/**` 生成（§4），模型即使过度卖萌也**无法削弱确认语义** —— 用户必须看到代码生成的对象+数量并亲手点确认；
2. 提示词分档的失效后果是**风格瑕疵**（执行类多一句寒暄或一个 emoji），不是正确性/安全性缺陷；
3. 代码侧「按语气分类后裁 emoji」在本仓难以可靠实现（需先判定回复类别），属**侵入且模糊**的方案。

**建议的加固（backlog，低成本且不侵入）**：**只在"上下文已知"的位置做确定性后处理** —— 破坏性回合在代码里是**可判定的**（`result.needsConfirm` / `PendingConfirm`）；可在该回合把模型的叙述（`roundText` → `PendingConfirm.finalText`）做一次 emoji/卖萌词剥离，使"确认现场"永远无装饰。至于一般执行类回复，保持提示词约束即可。

---

## 6. 失败话术的诚实性（验收 4）

| 检查 | 结果 |
|---|---|
| 代码自产的失败文案 | `⚠️ 无法获取 AI 回复：<原因>\n\n请检查「设置 → AI 配置」中的接口地址、API Key 与网络连接。`（运行期 store 与 DOM 逐字一致，`t55-runtime.json` `failureTier`） |
| 是否存在**做不到的承诺** | 否：文案只做**诊断指路**（检查接口地址/Key/网络），未暗示可联网下载、可获取曲库外的歌；`tools.ts` 全文对 `联网/下载/外网/在线/全网/听歌识曲` **0 命中** |
| 提示词是否诱导承诺 | 规则 6 反向要求：「曲库里没有的歌就直说没有，并给出最接近的 3 首替代…**不要承诺做不到的事**」，且人格段单列「不承诺做不到的事」 |
| 卖惨/道歉墙 | 单测钉住非空行 ≤2、不含 `对不起对不起`/`马上就好`（`:754-756`）；运行期同为 2 行 |
| 行首 `⚠️` | **captain 已裁决维持**（功能性警示图标）⇒ 不作为 finding；t54/t55 均如实记录并在测试里标注 KNOWN GAP（`:759-766`） |

---

## 7. t55 的证据等级（验收 5）

### 7.1 运行期（我直接从原始产物取值，不采信摘要）

| 面 | 我从产物读到的值 | 来源 |
|---|---|---|
| 执行类 | 气泡 `已暂停。`、chip `已暂停播放`、`lastMessage` 同 | `t55-runtime.json.execTier` |
| 闲聊类 | `emojiCount=2`（网关文案） | `…chatTier` |
| **上限探针** | `emojiCount=5` 原样渲染 ⇒ 无应用侧上限 | `…overCapProbe` |
| **确认条** | DOM `需要你确认的破坏性操作 \| 从歌单《夜跑》移除 1 首：《SongB》 \| 确认执行 \| 取消`；`containsCount=true`、`emojiCount=0`；取消后 `已取消，歌单没有改动。` | `…destructiveTier` / `t55-runtime4.destructiveBarDom` |
| 双窗标题/空态/示例 | 主窗 `chatTitle=薇拉 Vela`、hint 含名字、空态含人格 + 4 条示例；迷你窗 `title=薇拉 Vela` + 同一组 4 条；两者 `hidden=false`（有效性门） | `t55-runtime4.mainEmptyStateDom/miniWindowDom` |
| 迷你窗真实路径 | 经**它自己的展开按钮**：`{hidden:false, attr:"true", hasChat:true, title:"薇拉 Vela"}` | `t55-runtime5.miniAfterOwnButton` |
| 提示词**线路抓包** | 9 条请求全部带 system、`distinctSystemPrompts=1`，`t55-wire-system-prompt.txt` = **2644 B / sha1 `77cf6444e8a99c16f1fba20ecc33cf33000078bc`**（我复算一致） | 该文件 |

⇒ 三类口吻与确认条**都是运行期实际渲染文案**（不是"提示词里写了"）；提示词侧还有**线上抓包**，强于源码阅读。

### 7.2 门禁（逐项值，我自行解析 `t55-lint.json`）

`typecheck` exit 0（日志无 `error TS`，版本 1.0.5）｜`lint` exit 0 → **files=82、errorFiles=0、totalErrors=0、totalWarnings=1**（唯一 `TrackList.tsx:42 react-hooks/incompatible-library`）｜`tests` exit 0 → **16 files / 179 passed**（chatConfirm 单文件 27 例，含 persona 与 t58 的 H1 用例）⇒ **逐项值齐全、且覆盖当前树**（§0 同树核对）。

### 7.3 t54 判别性证据的两点核对（我做了，结论：成立）

1. **变异基线不是"旧版本"**：`t54-mutation.log` 打印 `tools.ts sha256=140fe8b43336193e (21577 B)`，而交付的 `tools.ts` 我实测 sha256 前缀 **同为 `140fe8b43336193e`**（24884 **字节** = 21577 **字符**，差额是 CJK 多字节）⇒ **7/7 CAUGHT 是针对交付版本跑的**（对照 `mutation-check.mjs` 用的是 `length` 字符数，故日志里的 B 实为字符数 —— 供后续引用时不要误读为旧版本）；
2. **t58 改写测试文件后，判别锚点仍在**：现 `chatConfirm.test.ts` 的 persona 断言逐条包含 M1–M7 的锚点（名字 `:607-608`、执行类 `:612-613`、闲聊/emoji `:617`、破坏性 `:620-621`、失败 `:624-629`、summary 形态 `:666`、双窗标题字面量 `:710`）⇒ 判别力**跨 t58 的改写得以保留**（严格说：M 系列本身跑在 t54 时代的测试文件上，但锚点未漂移）。

### 7.4 证据边界（我接受 t55 的如实标注，并补一条）

- **模型侧遵从不可证**（本机无真实后端，运行期文案由自建网关产生）—— 这是本次**唯一无法在本机闭合**的环节；
- 打包态（1.0.5）未取证；迷你窗确认条 **DOM 未取证**（我与 t55 一致：`MiniChat.tsx:183` 渲染同一个 `pending.summary` 单一来源，且 t54 只改了该文件文案，静态路径成立）；
- t54 时代测试文件哈希不可复核（t58 改写）—— 我以 §7.3-2 的锚点核对部分补偿；
- `MiniChat` "改前无标题" 无法复核（无 git 历史）。

---

## 8. 回归面（验收 6）

| 面 | 证据 | 结论 |
|---|---|---|
| 工具链路（控制播放器） | 运行期：`暂停` → 气泡 `已暂停。` + chip `已暂停播放`，网关 `emitted=[control_player]`、工具结果 `执行了 pause` | ✅ |
| 破坏性确认（取消/确认） | 运行期：确认条在迷你/主窗同一来源；取消后歌单不变、`pending` 清空、网关收到「用户已取消该操作…」；单测 `pauses the turn…` / `tells the model the user cancelled…` / `cannot be self-approved…`（`:299/:353/:235`）保持通过 | ✅ |
| 多轮 tool 循环 | 线路抓包 **9 条请求**（含工具结果后的续轮）全部带同一份 system 提示词 ⇒ 循环未被人格改动破坏 | ✅ |
| 双窗文案一致 | 运行期 DOM 两窗 4 条示例逐字相同 + 单测 `panelSuggestions === suggestionsOf(mini)`（`:718-724`） | ✅ |
| 无新增 `eslint-disable` | 全 `src/**` **0 命中** | ✅ |
| 代码面回归风险 | §3.2：工具/令牌逻辑与已发布 1.0.4 逐句相同 ⇒ t54 的回归面被**限制在字符串**上 | ✅ |
| 越界 | t54 只动 4 个声明文件；禁改面与 t51 基线逐字节相同（§3.1） | ✅ |

---

## 9. 开项与 backlog（**均不阻塞发布**）

| id | 项 | 级别 | 建议 |
|---|---|---|---|
| **B1** | 口吻分档**纯提示词**、应用零强制（上限探针证明 5 个 emoji 原样渲染） | backlog（中） | 只做**上下文已知处**的确定性后处理：破坏性回合的叙述（`PendingConfirm.finalText`）剥离 emoji/卖萌词；其余档位维持提示词约束（§5） |
| **B2** | `src/main/mini.ts:65 setMiniExpanded()` 不向渲染进程转发 `mini:expanded` ⇒ 经 preload API 展开时迷你窗几何变大但 `data-expanded=false`（不挂载聊天/搜索） | backlog（低-中，**既有**） | t55 已活体判别；`mini.ts` 与 t51 基线**逐字节相同** ⇒ 与本波无关；建议在 `setMiniExpanded()` 内补一次转发（或渲染侧订阅主进程真值）。当前 `src/**` 内无调用者（仅迷你窗自身按钮），属"潜在陷阱" |
| **B3** | 名字存在 **3 份字面量**：`tools.ts:ASSISTANT_NAME` + 两个组件的 `ASSISTANT_TITLE`，靠测试钉一致性 | backlog（低） | t54 给出的理由是 `react-refresh/only-export-components`；该约束**只限制"导出组件的文件"**，并不禁止新增一个纯 `.ts` 模块（如 `lib/assistantName.ts`）供三处 import ⇒ 可真正单一来源（非必须，测试已能漂移必红） |
| **B4** | 应用自有字形与"失败档无装饰"的边界：确认条/chip 无 emoji ✅，但 chip 存在 `▶ 播放推荐 N 首`（`tools.ts:558`）等**功能性图形** | 观察（信息） | 与 captain 对 `⚠️` 的裁定口径一致：**应用自有图标不属人格的 emoji 约束**；若后续想统一，应一次性裁决口径 |
| **B5** | 模型侧遵从、打包态、迷你窗确认条 DOM | 未取证（如实） | 由发布波次的打包态冒烟覆盖；若日后接入真实后端，可补一条真实模型口吻抽验 |

---

## 10. verdict

> **`pass`（0 blocker）。**
> 1. **硬边界成立**：t54 只动 4 个声明文件，禁改面与 t51 基线逐字节相同；且与**已发布 1.0.4 bundle** 逐区域比对后，`DESTRUCTIVE_TOOLS/DESTRUCTIVE_LABELS/isDestructiveTool/令牌铸造与校验/destructiveGuard/executeTool` **逻辑逐句相同**，唯一变化是 `summarizeDestructiveTool` 的返回字符串与 `buildSystemPrompt()` 的提示词内容 ⇒ 「只改措辞与提示词」在第三方基线上得到证实。
> 2. **确认条直白、语义未削弱**：含对象+数量、无 emoji/卖萌（运行期 `emojiCount=0` + 单测 4 形态）、按钮与令牌语义与 1.0.4 相同、取消不动数据；提示词规则 5 反而**加强**了叙述纪律。
> 3. **口吻分档取法可接受**：现有实现是提示词委托 + 应用零强制，但**安全相关文案由代码承担**（模型无法软化确认语义），最坏后果是风格瑕疵 ⇒ **不阻塞发布**，加固方向见 B1（上下文已知处的确定性后处理）。
> 4. **失败话术诚实**：一句原因 + 一句指路、无做不到的承诺、无卖惨；`⚠️` 按 captain 裁定保留。
> 5. **t55 证据等级合格**：三类口吻/确认条/双窗文案均取自**运行期 DOM 与 store 实际值**（我逐项从原始产物复算），提示词另有**线路抓包**（2644 B / `77cf6444e8a9…`）；门禁为**逐项真实退出码**（82 文件 / 0 error / 1 既有 warning / 16 files / 179 passed），且该门禁窗口正好覆盖我审的这棵树。
> 6. **回归面通过**：工具链路、破坏性确认、多轮循环、双窗一致、无新增 `eslint-disable`；回归风险被限制在字符串层。
>
> **本报告只认证**：`tools.ts ee665436ef84` / `ChatPanel.tsx fa0f16ec596b` / `MiniChat.tsx 1e2d62e5b60d`（t54 交付版本）及其在树 `e5653c9e4c9bc969995f6615a40ce9e1ca9dbb99`（83 文件，newest `13:43:18.746Z`）上的证据；`chatConfirm.test.ts`（`e82e5d2ef624`，t58 改写）与 `chatStore.ts`（`3c4edd11171b`，t58 = H1 修复）**不属本 verdict 的审查对象**（它们的先行版分别由 t54 声明、由 t52 审查）。
# T51 迷你窗 G —— 复验 T47-F1 修复（verifier 独立复算）

> **结论：9/9 验收全部通过。** 核心场景 **hidden + 迷你窗代理 + 纯文本 = 4/4 两端拿到真实回复**；两条对照仍成立；工具链路无回归；t47 通过项抽验 6/6；架构约束静态 + 运行期均成立；门禁 167 passed（不降）。
> **一条如实限定**：t50 的「hidden 下 delta 投递晚于 invoke resolve」这一步我**无法独立复现**（需要修复前代码；且 `window.api` 是冻结的 contextBridge 对象，我的时间戳包装未生效）——我能独立证明的是它依赖的**形状**（store 镜像瞬时且 settle 即清零），并已据此**推翻我自己在 t47 的假设**。详见 §4。
> 产物目录 `.devdata/t51-evidence/`。

## 1. 锚点、纪律与门禁

| 项 | 值 |
|---|---|
| 新树指纹 | `srcAggregateSha1 = ee2adc707e2c27e863d761979195e25a3f0149ba`，**83 文件**，newest src mtime `2026-09-13T12:26:04.674Z`（t47 那一套 `459c1da2fd…` 已不适用，故全部重取） |
| t50 实际改动面 | **仅 `src/renderer/src/stores/chatStore.ts`**：`962c68d7b436` → **`920fcb05ac5d`**，18605 → 20600 B，mtime `12:26:04Z`。**`mainWindowBridge.ts` 未改动**（`1f5ddc067082` 不变，与派单预期"两个文件都会改"不同，记一笔）；`MiniChat.tsx`/`MiniPlayer.tsx` 未改动 |
| 取样完整性 | 4 个关键文件 run 前后 sha1 全同（`filesUnchanged=true`） |
| 门禁（`node scripts/verify-lint-tests.mjs --label t51`，stamp `12:28:00.463Z`，读逐项值） | `lint.exitCode=0`、`totalErrors=0`、`totalWarnings=1`、`filesWithErrors=[]`、`typecheck.node=0`、`typecheck.web=0`、`tests.exitCode=0`、**167 passed / 16 files / 0 failed**（t46 基线 165 + t50 新增 2 例，**不降**） |
| 实例纪律 | 单实例 **npm PID 11672**（detached + PID 落盘），用完 `taskkill /T`；末态 **electron=0 / nebula-player=0**，5173/5174/9222/9223 全 FREE；未改 `src/**` |
| 夹具还原 | `.devdata/user/settings.json` 被 `settingsSetApi` 改写后**按字节还原**至取样前状态 `7FCA6DCD1A78060BB467A3ABF8F180C9CE42B99D`（394 B）。（注：该基线已非 t47 时的 `C92586A0…` —— 在我本轮之前就已被改写，我还原的是自己看到的那一份） |
| 我起的进程 | mock 网关（9997，node PID 23924）取证后已终止。**另有一个非我的 `node install.js`（PID 30056）未被我触碰** |

## 2. 逐条验收

| # | 验收项 | 结果 | 证据 |
|---|---|---|---|
| 1 | 门禁逐项值 + 用例数不降 | ✅ | 见 §1：`167 passed / 16 files`，`lintErrorFiles=[]`、tc 0/0 |
| 2 | **核心场景**：hidden + 代理 + 纯文本，连续 4 次，两端真实回复 | ✅ **4/4** | `mini-g-hidden4.json`：4 次全部 `main.lastAssistant = mini.lastAi = 「我是 NEBULA 测试网关的第 1 轮回复。已收到你的问题。」`；每次 `gateway.requests=1`、`errors400=[]`；`hasSentinel=false`；`bothAgree=true` |
| 3 | 两条对照仍成立 | ✅ | `mini-g-visible-proxy.json`（主窗**可见**时代理：两端一致、`pass=true`）；`mini-g-hidden-direct.json`（hidden 下**主窗直发**：真实文本、`pass=true`）⇒ 修复未把问题转移 |
| 4 | 工具链路不回归 | ✅ | `mini-g-tools.json`：`controlPausedMain=true`（主窗 `isPlaying=false`）、`controlChipShown=true`（迷你窗 chip 含「暂停」）、`parkedNotExecuted=true`（确认前歌单仍 2 首）、`barInsideMini=true`（迷你窗内「确认执行/取消」）、`cancelKeptData=true`、`confirmMutatedData=true`；`errors400=[]` |
| 5 | 架构约束（静态 + 运行期） | ✅ | 静态：`MiniChat.tsx` 只使用 `onChatProxyState`(:36) 与 `chatProxyCmd`(:49)，其 `send()`(:51-56) 仅 `cmd({kind:'send'})` 并在注释写明「the main window owns the run」；`MiniSearch.tsx`/`MiniPlayer.tsx` 对 store/工具/AI **零引用**；`window.api.chatSave` 全仓仅 `chatStore.ts:16` 调用（`chat:save` 处理器在 `ipc.ts:174`）⇒ 历史**单一写入者**；镜像快照仅 `mainWindowBridge.ts:75` 推送。运行期：迷你窗内 `typeof window.__nebula === 'undefined'`（无 store ⇒ 结构上不可能跑 AI 循环），且磁盘 `chat.json` 内容 = 主窗最后一次回合（user+assistant 逐字） |
| 6 | t47 通过项抽验回归 | ✅ **6/6** | `mini-g-spotcheck2.json`：360×128 ⇄ 360×540（`collapsedIs360x128`、`expandedIs360x540`、`collapseAgainRestores`）、收起态残留 0（`collapsedNoResidue`）、展开态渲染搜索+聊天（`expandedRendersSearchAndChat`）、迷你窗无 `__nebula`；`mini-g-spotcheck.json`：搜索→**主窗**播放（点第 1 行 song-c ⇒ 主窗 `currentTitle=song-c`、`queueLen=4`、`index=0`）、隐藏再打开必为收起态（`afterReopen` = 360×128 / `data-expanded=false` / 残留 0，且 hide 前为 `data-expanded=true`）。**未复验项及理由**：夹取的小屏运行期（应用内无法改 OS workArea，t47 已用副本复算替代，本轮 MiniBounds 未改动故不重复）；判别性实验（t50 未触碰 `miniBounds.ts`/`chatProxy.ts`，其哈希与 t47 取证时相同，且门禁已含这两套用例） |
| 7 | 根因证据复核 | ✅（含明确限定） | 我**自己复跑了差分实验**（不采信转录）：修复后 hidden 代理 ✅4/4、可见代理 ✅、hidden 主窗直发 ✅ ⇒ 定义该缺陷的差分已消失。并用**自己的观察器**独立测到 t50 依赖的形状：`streamRaw` 镜像 `0 → 23 → 31 → **0（settle 时清零）**`，**hidden 与可见两条路径完全同形**（`mini-g-hidden4.json` 4 轮 + `mini-g-mechanism.json` 2 轮）。**无法独立复现的部分**：修复前的「delta 投递晚于 invoke resolve」次序 —— 需要修复前代码；且 `window.api` 为冻结的 contextBridge 对象，我对其 `chatComplete` 的时间戳包装**未生效**（`patched` 未置位、`resolve=null`），故不作主张。详见 §4 |
| 8 | 未取证项如实标注 | ✅ | 见 §5 |
| 9 | 实例自起自关 / 末态 / 未改 `src/**` | ✅ | 见 §1 |

## 3. 核心场景 4 次逐条读数（hidden，主窗 `visibilityState='hidden'`）

| # | 主窗 store 末条 assistant | 迷你窗 `.chat-msg.ai` 末条 | 一致 | 网关请求 | 400 | 读取时 `streamRawLen` |
|---|---|---|---|---|---|---|
| 1 | 我是 NEBULA 测试网关的第 1 轮回复。已收到你的问题。 | 同左 | ✅ | 1 | 0 | 0 |
| 2 | 同左 | 同左 | ✅ | 1 | 0 | 0 |
| 3 | 同左 | 同左 | ✅ | 1 | 0 | 0 |
| 4 | 同左 | 同左 | ✅ | 1 | 0 | 0 |

> 判据刻意用「两端文本逐字一致」而**不是** `streamRawLen`：t47 已证该指标在**成功**回合后同样为 0，不可作判据（本轮 4 次读数再次确认）。

## 4. 根因复算、我自己的勘误、以及一处仍未闭合的解释

**t50 的机制（复述）**：`runFrom` 原先在 `await chatComplete` 之后读**共享 store 快照**（旧 `:586`），而本轮文本真正归属地是 `openStream` 的**闭包缓冲**；hidden 时 Chromium 把已排队的 `chat:chunk` 排在 invoke 回复之后投递 ⇒ resolve 时 `streamRaw=''` ⇒ 落 `（无回复）`。修复 = ①`StreamHandle.next()` 先让出一个 macrotask；② 读数取自**闭包缓冲**（`:591 resume.accumulated = await stream.next()`）。

**我独立核实了的结构部分**（静态，可复核）：`chatStore.ts:77-92` 定义 `StreamHandle` 与 `next()` 语义；`:365-377` `openStream` 维护闭包 `accumulated` 并镜像到 store；`:404-405` `next()` 先 `setTimeout 0` 再 `return accumulated`；`:591` 消费。⇒ 「读数不再取 store 快照」在代码上成立。

**我自己的勘误（重要）**：t47 我把「`streamRaw` 被清空 vs settle 读取」列为最可疑假设。本轮我用自己的观察器**否证了它作为充分原因**：`rawLen` 轨迹在**可见**路径上同样出现 `31 → 0`（settle 清零），而可见路径从不失败 ⇒ 单靠「清零」无法解释 hidden 专属失败。t47 报告里该假设已标注"未定"是正确的处理，此处正式更正为**不成立**。

**仍未闭合的解释缺口（如实记）**：t50 的机制需要解释为什么 t47 的「hidden + **主窗直发** = 正常」免疫。他们的公开表述是「差异只在后台事件投递时机」，这要求代理路径多出的那一跳（迷你窗 → 主进程 → 主窗渲染）改变投递次序；我**没有**独立证据能证实或否证这一点（见 §2 #7 的限定）。我不据此判 failed（它不影响修复成立与验收通过），但标注为**低严重度解释缺口**，供 owner 决定是否补一条更精确的说明。

## 5. 未取证项（不冒充）与我的探针缺陷自查

**未取证**：① **打包态**（1.0.4 安装包）下的行为未取证，本轮全部为 dev 运行期；② 修复前「投递晚于 resolve」的次序本身未复现（理由见 §4）；③ 小屏夹取的运行期（理由见 §2 #6）。

**我的探针缺陷（2 处，均已更正，不影响结论）**：
1. `t51-runtime.mjs` 的 `clickExpand()` 在已展开时返回 `already-expanded` 而**不点击**，导致第 4 组「收起」读数其实是展开态的副本（`spotcheck.collapsed360x128NoResidue=false`）。**这是探针缺陷、非产品缺陷**：由 `t51-spotcheck2.mjs` 用无条件 toggle 重测 ⇒ 6/6 通过。
2. `t51-mechanism.mjs` 首次运行时报 `JSON.stringify(...) is not a function`（模板里多写了一个 `()`），已修正后重跑。

## 6. 产物清单

| 文件 | 内容 |
|---|---|
| `.devdata/t51-evidence/mini-g-preflight.json` | 主窗 boot 确认、迷你窗打开+展开、API 指向 mock、指纹 |
| `mini-g-visible-proxy.json` | 对照 1/2：主窗可见时代理 |
| **`mini-g-hidden4.json`** | **核心：hidden 代理纯文本 ×4（含每次观察器轨迹）** |
| `mini-g-hidden-direct.json` | 对照 2/2：hidden 下主窗直发 |
| `mini-g-tools.json` | 工具链路（控制 + 破坏性确认条取消/确认） |
| `mini-g-spotcheck.json` / `mini-g-spotcheck2.json` | t47 抽验（含探针缺陷的更正版） |
| `mini-g-mechanism.json` | 机制观察器（`streamRaw` 轨迹；时间戳包装未生效的记录） |
| `t51-runtime-summary.json` | 全量汇总 + `filesUnchanged` |
| `t51-runtime.mjs` / `t51-spotcheck2.mjs` / `t51-mechanism.mjs` | 工装（可复跑，复用 `.devdata/t47-evidence/mock-llm-t47.mjs`） |
| `settings-before.json`、`dev-instance*.log`、`dev-pid.txt` | 夹具快照与实例日志 |
| `.devdata/t13-r2-evidence/t51-pre-snapshot.json` | 新树聚合指纹 |

# T51 附录（Addendum）—— `StreamHandle.next()` 的边界考

> ⚠️ **落盘说明**：`t51` 已于本轮之前以 **`completed`（9/9）** 收口，终态不可再改 ⇒ 本附录**不能**并入 t51 的 `output`，以**独立文件 + 消息**呈报。若 captain 要它进台账，请另开任务号（例如 t52）；本文档与 `T51-VERIFICATION.md` 同目录、内容自洽。
> 树：`chatStore.ts = 920FCB05AC5D`（`ee2adc707e2c…` 树的后半），全程未变。

## 1. 边界实验（captain 四项要求逐条）

| # | 要求 | 结果 | 证据 |
|---|---|---|---|
| 1 | 制造「delta 晚于 `chat:complete` resolve **超过一个 macrotask**」并看最终气泡 | **无法从外部制造**（见 §2）；改测**可达的那一面**并给数据 | `mini-g-boundary-*.json` |
| 2 | 若会丢 ⇒ 可达性判断（真实网关 + 真实 IPC 路径下是否可能出现） | **仅理论**：无任何代码路径会在 handler 返回**之后**再发 `chat:chunk`；网关也不可能在 `[DONE]` 之后再写 | §2 三条依据 + 实测时序 |
| 3 | 三档结论 | **第二档：不可达 / 仅理论 ⇒ 记为 backlog**，并附**加固建议** | §3 |
| 4 | 反向边界：提前/并发投递时 `next()` 返回**完整**文本（含 seed 恢复段） | ✅ **通过**（可见 + 隐藏两种状态各一次） | `mini-g-boundary-mixed.json` / `mini-g-boundary-hidden.json` |

## 2. 「严格晚于一个 macrotask」为什么造不出来（依据，非推断）

1. **应用自己的客户端在 SSE 流结束后才 resolve**：`/v1/chat/completions` 的响应里 `[DONE]` 是最后一个写出的东西，网关不可能在其后再写 delta（HTTP 响应已结束）；因此**所有** chunk 都在主进程 handler 返回之前写出。
2. **主进程不存在「返回后再发」的路径**：`chat:chunk` 由流式回调在流存活期间发送；`chat:complete` 的 invoke 回复在流结束后返回。树内没有任何 `.finally()` / 尾随 flush 会在返回后再发一帧（本轮 t50 只改 `chatStore.ts`，主进程侧代码未动，其哈希我在本轮前后各算一次，一致）。
3. **实测时序余量**（隐藏态）：最后一个 chunk 的 store 镜像 → settle 之间 **5.8 ms**（`mini-g-boundary-hidden.json.timing.lastMirrorToSettleMs`）；而修复用的 `setTimeout(0)` 让出实测延迟 **0 ms**（可见 0 / 隐藏 0，各 7 次取中位数）⇒ 该让出的语义是「**让已排队的任务先跑**」，不是「等 N 毫秒」。已排队的 delta 会被它覆盖；要漏掉必须出现「读取之后才投递」的 delta，而这需要第 2 条那种不存在的路径。

**必须同时记下的两点（避免过度背书）**：
- 实测显示**隐藏窗口并没有把 0ms 定时器节流**（0 ms）⇒ 修复的让出**不**依赖"后台节流给了更大缓冲"这一说法；它只保证一个完整事件循环轮次。
- 我在 `T51-VERIFICATION.md` §2 #7 已限定：**我无法独立复现修复前"投递晚于 resolve"的次序本身**。本附录的测时余量（5.8 ms vs 0 ms 让出）说明：修复后的运行期里，delta **实际到达得足够早**；至于修复前为何会反序，仍以 t50 的机制说明为准（我没有独立证据，未背书）。

## 3. 结论（三档）与加固建议

**结论：第二档 —— 不可达 / 仅理论，记为 backlog，不判 finding、不需要为它改代码。**
理由：① 无「返回后再发 chunk」的代码路径；② 网关侧不可能；③ 实测余量正向。**但不宣称"零窗口"**：若将来有人让主进程在 handler 返回后再补发一帧（例如加 tail flush），该帧就会落在读取之后而丢失 —— 这是**新增代码才会打开**的窗口。

**加固建议 —— ⚠️ 已按 captain 更正为「跨层契约变更、非零成本」，列为 post-1.0.5 backlog，本次不动**：
原建议「settle 优先采用 `chat:complete` 的 invoke 返回值」其**事实前提不成立** —— `ChatDonePayload` 只有 `{ id, finishReason, toolCalls }`（`src/shared/types.ts`），`llmClient` 也不回传正文，正文只走 `chat:chunk` 事件。因此该项**需要新增字段并跨层改动 `src/main/llmClient.ts` + `src/main/ipc.ts` + `src/shared/types.ts`（主进程 / 预加载契约变更）⇒ 属跨层契约变更、非零成本**，**不是"低成本可选项"**。按 captain 约束（不得把渲染侧耦合到主进程时序）本次不动；且 §8 的亚毫秒实测说明**当前无需**该项加固。自我勘误见 §8。

## 4. 反向边界（要求 #4）实测

| 场景 | 轮次结构 | 最终气泡（主窗 = 迷你窗，逐字一致） | 结果 |
|---|---|---|---|
| 可见态 | 第 1 轮：文本 `第一段：` + 工具调用 `get_player_state`；工具结果回来后第 2 轮：文本 `第二段：结束。` | **`第一段：第二段：结束。`** | ✅ seed 未丢 |
| 隐藏态（含上表 5.8ms 时序测量） | 同上 | **`第一段：第二段：结束。`** | ✅ seed 未丢 |
| 可见态纯文本对照 | 单轮 | `我是 NEBULA 测试网关的第 1 轮回复。已收到你的问题。` | ✅ |

⇒ 「提前/并发投递」时 `next()` 返回的是**含 seed 的完整累计文本**，修复没有把这一面弄丢。

## 5. 实例审计（captain 明确版规则）

| 项 | 值 |
|---|---|
| 实例 | **npm PID 14908**（`Start-Process` detached，PID 落盘 `.devdata/t51-evidence/dev-pid-boundary.txt`），**同一时刻唯一 owner**，用毕 `taskkill /T` |
| 收尾三查 | **electron=0 / nebula-player=0**；5173 / 5174 / 9222 / 9223 全 **FREE** |
| 我起的 mock | `mock-llm-t51.mjs`（9998，node 进程）已终止 |
| 他人进程 | **未触碰**（含非我的 `node install.js` PID 30056） |
| 夹具 | `.devdata/user/settings.json` 按字节还原至 `7FCA6DCD1A78060BB467A3ABF8F180C9CE42B99D` |
| `src/**` | **未改**；`chatStore.ts` 本轮前后 sha1 均为 `920FCB05AC5D` |

## 6. 环境澄清的执行确认

- **`t48` / `t49`：未认领、未引用**（仅在本文档出现该两枚编号作为"已作废"的说明）。
- 实例规则按"同一时刻唯一 owner、自起自关、串行、末态清零"执行，记录见 §5。

## 7. 产物

`mini-g-boundary-mixed.json`（可见态混合轮）、`mini-g-boundary-hidden.json`（隐藏态混合轮 + macrotask 时序 + 可达性判定）、`mini-g-boundary-lag.json`（对照 + 镜像/结算时序）、`t51-boundary-summary.json`、`mock-llm-t51.mjs`、`t51-boundary.mjs`、`t51-boundary-hidden.mjs`（均可复跑）。

## 8. ⭐ 修订口径：**有界性实测**（captain 新口径，取代"人为延迟 30/200ms"）

**结论：第三档 —— 修复已覆盖，附数据。** 不需要加固、不判 finding。

**为什么用"代理量"而不是直接给 resolve 打时间戳**（实测证据，非推测）：`window.api` 是**冻结的 contextBridge 对象** —— `frozen=true / extensible=false / writable=false / configurable=false / setter 无`（`mini-g-boundedness.json.apiFrozen`）⇒ 从渲染侧**无法**包裹 `chatComplete` 来戳 resolve 时刻。改测两个可观测事件：
- **每个 delta 的 listener 触发** = store 订阅里的 `streamRaw` 镜像写入；
- **`busy: true → false` 转变** = `settleRun`，它紧跟在 `await stream.next()`（即**读取之后**）执行 ⇒ 它是"读取点"的**保守下界**（略晚于读取）。

**6 次 hidden + 代理 实测**（`mini-g-boundedness.json`）：

| 指标 | 值 |
|---|---|
| 文本完整性（含**尾巴 delta** 的第二段） | **6/6**，两端逐字一致 = `我是 NEBULA 测试网关的第 1 轮回复。已收到你的问题。` |
| 「最后 delta listener → settle 转变」余量 | min **0.1 ms** / median **0.3 ms** / max **0.4 ms** |
| 落在 settle **之后**的 delta 数 | **0**（6 次合计） |

⇒ 实测偏移是**亚毫秒～零点几毫秒**量级，**远小于**一次 macrotask 轮次（更远小于数十/数百 ms）；且**尾巴 delta 从未丢失**。结合 §2 的 source 侧顺序（delta 的 `send` 一律早于 reply），**一次 settle yield 已足以闭合该竞态**。

**⚠️ 我此前的加固建议作废（自我勘误）**：§3 我写过「`chat:complete` 的 invoke 回复本来就带完整文本，settle 优先取它即可」——**这是错的**。我自己复核 `src/main/ipc.ts:202-206`：回复体是 `{ id, finishReason, toolCalls }`，**不含文本**（文本只在 `chat:chunk` 事件里）。所以那条建议在不动 `src/main/**` 的前提下**不可实现**；按 captain 的约束（不得把渲染侧耦合到主进程时序），**不建议**为此改动主进程。既然实测显示偏移在亚毫秒级，本轮也**无需**任何加固。

**关于"人为延迟 30/200ms"**：按 captain 新口径不再作为缺陷证据；我在 §2/§3 已把它归入**可达性论证**（该状态不可达：无「handler 返回后再发」的路径）。若日后有人真的让主进程在返回后补发一帧，才会打开这个窗口 —— 记为 backlog 条件，而非当前缺陷。

**本组实例审计**：npm PID **10544**（detached + PID 落盘 `dev-pid-bound.txt`，唯一 owner），用毕 `taskkill /T`；**收尾三查：electron=0 / nebula-player=0；5173/5174/9222/9223 全 FREE**；mock（`mock-llm-t51.mjs` 9998）已终止；`settings.json` 还原至 `7FCA6DCD1A78060BB467A3ABF8F180C9CE42B99D`；`src/**` 未改（`chatStore.ts=920FCB05AC5D`、`ipc.ts=8C67F9DEC91A`，前后一致）。产物：`mini-g-boundedness.json`、`t51-boundedness.mjs`。

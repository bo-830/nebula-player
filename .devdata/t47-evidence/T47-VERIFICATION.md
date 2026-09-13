# T47 迷你窗 C —— 独立运行期验证（verifier）

> 结论（先说）：**11 项验收 = 10 通过 / 1 未通过**。未通过项是「主窗口收进托盘时，迷你窗 AI 文本回合」。
> 按 t47 契约「若发现缺陷：如实判 failed 并给 findings」⇒ 本任务以 **failed** 上报，缺陷定位与复现矩阵见 §3。
> 产物目录 `.devdata/t47-evidence/`；快照 `.devdata/t13-r2-evidence/t47-snapshot.json`。

## 1. 纪律、锚点与方法

| 项 | 值 |
|---|---|
| 门禁（`node scripts/verify-lint-tests.mjs --label t47`，**读逐项值**） | `lint.exitCode=0`、`lintJson.totalErrors=0`、`filesWithErrors=[]`、`typecheck.node=0`、`typecheck.web=0`、`tests.exitCode=0`、**165 passed / 16 files / 0 failed**（基线 141 + t45 新增 8 + t46 新增 16 = 165，**不降**） |
| 冻结指纹（取样时刻） | `srcAggregateSha1 = 459c1da2fd33727c8f64b5ce3c7bdccbf197fb4b`，**83 文件**，newest src mtime `2026-09-13T11:49:24.039Z`；`filesUnchanged=true` |
| 关键文件 sha1（run 前 = run 后） | MiniPlayer `f14e26699111…`、MiniSearch `9c06cc3128…`、MiniChat `5c47602df3…`、miniBounds `eb84fa4a0b…`、mini.ts `7963cb9da9…`、ipc.ts `8c67f9dec9…`、mainWindowBridge `1f5ddc0670…`、chatProxy `42a82c4722…` |
| 实例纪律 | **两次自建自关、串行不并发**：#1 `npm PID 15308`（首轮，暴露探针时序缺陷后 `taskkill /T`）、#2 `npm PID 30844`（正式取证，结束后 `taskkill /T`）。末态 **electron=0 / node=0**，**5173/5174/9222/9223/9997 全 FREE** |
| 未改 `src/**` | 只新增 `.devdata/t47-evidence/**` 与 `.devdata/t13-r2-evidence/t47-snapshot.json` |
| 夹具还原 | `.devdata/user/settings.json` 被 `settingsSetApi` 改写（`CBA56122…`）⇒ **按字节还原**至 `C92586A029B6C85356B9840D3B284A9544626CD2`（394 B） |
| 自建工装 | `mock-llm-t47.mjs`（9997）：既有 `mock-llm-confirm.mjs` **无** `control_player` / `set_volume` 路由，无法驱动播放控制验收 |

## 2. 逐条验收（命令 + 判据 + 产物）

| # | 验收项 | 结果 | 证据（命令 → 数值） |
|---|---|---|---|
| 1 | 门禁逐项值 + 用例数不降 | ✅ | 见上表；`summary-t47.json` |
| 2 | 收起 360×128 / 展开 360×540 / 四边在工作区内 / 无残留 | ✅ | `node .devdata/t47-evidence/t47-runtime.mjs` → 开=**360×128**（`data-expanded=false`，searchZones=0、chatPanes=0）、展开=**360×540**（searchZones=1、searchInputs=1、chatPanes=1、chatTextareas=1）、`insideWorkArea=true`、收起回到 **360×128** 且 `data-expanded=false`、两处残留均为 0 |
| 3 | 夹取有效性（小屏/缩放） | ✅（替代口径） | 运行期：真实显示器四边包含 = true；小屏裁剪无法从应用内改 OS workArea ⇒ 按契约用**副本 + 独立 vitest 配置**复算：`npx.cmd vitest run --config .devdata/t47-evidence/discrim/minibounds/vitest.config.ts` → **8 passed**，含 `clips the height when the work area is shorter than the expanded window`、`clips the width too…`、`respects a work area that does not start at the origin (secondary display)` |
| 4 | 搜索 → **主窗口**播放 | ✅ | 迷你窗输入 `so` → 4 行结果（song-c / SongB / SongD / SongE）；**点第 2 行**（SongB）→ 主窗 `current.id=f6d99f294b9932accaa9`（= SongB）、`index=1`、`queueLen=4`（= 结果行数） |
| 5 | 播放控制（暂停 / 下一曲 / 音量 50%） | ✅ | 迷你窗聊天发「暂停」→ 主窗 `isPlaying=false`；「下一曲」→ `index 1→2`、current 改变；「音量调到 50%」→ 主窗 `volume=0.5`；网关工具序列 `["control_player","control_player","set_volume"]`，`errors400=[]`；迷你窗 chips 出现 `已暂停播放` |
| 6 | AI 同会话（迷你窗 ↔ 主窗口） | ✅ | 迷你窗发「你好，请介绍一下你自己」→ 迷你窗 DOM：`chat-msg user::你好，请介绍一下你自己` + `chat-msg ai::我是 NEBULA 测试网关的第 1 轮回复。`；**主窗 store `messages` 与 DOM 出现同一轮**；网关 1 请求 0 个 400 |
| 7 | 破坏性确认条在**迷你窗**可用 | ✅ | 迷你窗发「把夜跑歌单里的 `48340575992a4a0b1a06` 这首歌删掉」→ `pendingConfirm` 非空且歌单仍 2 首（未执行）；**迷你窗内**按钮 `["确认执行","取消"]`；点「取消」→ 歌单仍 2 首；重发后点「确认执行」→ 该 id 被移除；`errors400=[]` |
| 8 | 主窗口收进托盘时三条链路仍可用 | ❌ | 搜索→播放 ✅（hidden 下仍能播放）、控制命令 ✅（hidden 下「暂停」生效）、**AI 纯文本回合 ❌**：见 §3 |
| 9 | 隐藏再打开必为收起态 | ✅ | 展开（按钮路径，`data-expanded=true`）→ `miniClose()` → `miniToggle()` → 回到 **360×128**、`data-expanded=false` |
| 10 | 两项判别性倒退实验 | ✅ | 见 §4（miniBounds 5 failed/3 passed；chatProxy 3 failed/13 passed；还原哈希逐字一致） |
| 11 | 实例自起自关 / 未改 `src/**` / 末态端口 | ✅ | 见 §1 |

## 3. ❌ 未通过项：hidden 主窗 + 迷你窗代理 + 纯文本 AI 回合 → `（无回复）`

**观测矩阵（4 次复现 + 2 个对照，均同一 mock、同一 dev 实例族）**

| 发起方 | 主窗状态 | 回合类型 | 结果 | 出处 |
|---|---|---|---|---|
| 迷你窗 | 可见 | 纯文本 | ✅ `我是 NEBULA 测试网关的第 1 轮回复。` | `t47-runtime.json` `aiRoundTrip` |
| 迷你窗 | **hidden** | 纯文本 | ❌ `（无回复）` ×4 | `trayScenario`（"笑话"）+ `t47-diag.json`（3 次） |
| 迷你窗 | **hidden** | 工具回合 | ✅ `好的，已完成。` | `trayScenario`（"暂停"） |
| **主窗口** | **hidden** | 纯文本 | ✅ `我是 NEBULA 测试网关的第 1 轮回复。` | `t47-diag2.json` |

**判据**：每次失败回合网关**都收到 1 个请求**（`errors400=[]`、`tools=[]`，`lastUser` 逐字为所发问题）⇒ **模型确实回了文本**；而主窗 store 的 `streamRaw` 在 +2s 与 +8s 均为**长度 0**、`streamShown=0`，最终落库 `content='（无回复）'`。

**代码定位（供 owner 判断，我未改任何实现）**
- `src/renderer/src/stores/chatStore.ts:295` —— `content: content || '（无回复）'`（本次落点）
- `src/renderer/src/stores/chatStore.ts:353-376` —— `setInterval` 打字机；`:376 set({ busy:false, streamShown: get().streamRaw.length, streamRaw: '' })`
- `src/renderer/src/stores/chatStore.ts:550` —— `resume.accumulated = useChatStore.getState().streamRaw`（**若在 :376 清空之后读取即得空串**）
- `src/renderer/src/lib/mainWindowBridge.ts` —— 迷你窗 `chat:proxy:cmd` → `setDraft` + `send`（120ms 前导+尾随节流）

**机制：未定（我不下结论）**。数据只支持「迷你窗代理 + hidden + 纯文本」这一**组合**；可见时同路径正常、主窗 hidden 直发正常，故**不是**单纯的 hidden 状态，也**不是** mock 形状问题（同一 route 在可见时成功）。最可疑的是 `streamRaw` 的「清空 ↔ settle 读取」时序与隐藏窗口下计时器节流叠加（`:550` 读到被 `:376` 清空后的空串），但这只是**假设**，需要 owner 在 dev 里加仪表验证。

**影响**：`（无回复）` 会**写入 `messages` 并持久化**，用户在主窗/迷你窗都看到空回复 ⇒ 用户可见缺陷。

**最小复现（供修复方）**
1. `node .devdata/t47-evidence/mock-llm-t47.mjs 9997`；`npm run dev`（CDP 9222）；把 LLM 指向 mock（`window.api.settingsSetApi({baseURL:'http://127.0.0.1:9997/v1',model:'deepseek-v4-flash',apiKey:'k'})`）。
2. 主窗执行 `window.api.windowClose()`（`closeToTray` 默认 true ⇒ 收进托盘、renderer 仍存活）；展开迷你窗（点 `button[aria-expanded]`）。
3. 迷你窗输入框发送**纯文本**问题（不带工具意图）；8s 后读 `window.__nebula.chat.getState().messages` 末条 ⇒ `（无回复）`。
4. 对照：同一问题改由主窗 `setDraft+send` 发送，或让主窗可见再经迷你窗发送 ⇒ 正常文本。

**建议最小修法（不在我职责内，仅建议）**：让 settle 取「不可能被打字机清空的来源」（例如把本次累计文本随 promise 结果传递，或延后清空 `streamRaw`），并补一条「`document.hidden === true` 或抑制打字机计时器」下驱动纯文本回合的回归用例。

## 4. 判别性实验（副本 + 独立 vitest 配置；`src/**` 未动）

| 模块 | 对照 | 倒退实现 | 还原 |
|---|---|---|---|
| `miniBounds.ts`（`computeMiniBounds` 去掉夹取/裁剪） | exit 0，**8 passed** | exit 1，**5 failed / 3 passed**（`expected 952 to be 540` / `1820→1560` / `540→400` / `360→200` / 越界） | 哈希 `EB84FA4A0B04F31FE21B467E38285C30C3C5488F` **逐字一致**，exit 0，8 passed |
| `chatProxy.ts`（`clampText` 不再截断 + 去掉气泡上限） | exit 0，**16 passed** | exit 1，**3 failed / 13 passed** | 哈希 `CC1DAA4CF01AAFDCC4C6D1EAE1D88E92C937F70A` **逐字一致**，exit 0，16 passed |

配置：`discrim/minibounds/vitest.config.ts`、`discrim/chatproxy/vitest.config.ts`（`environment: node`，include 指向各自副本）。反证结论：`src/main/miniBounds.ts = eb84fa4a0b04…`、`src/renderer/src/lib/chatProxy.ts = 42a82c4722…`（副本与源仅差 import 路径改写：chatProxy 副本指向 `../../../../src/shared/types`）。
**取舍说明**：契约优先「副本 + 独立配置」而非真实 `src/**` 变异，故本轮**未**申请 `src` 变异窗口。

## 5. 观察（**不判缺陷**）

1. `miniSetExpanded()` 是**裸 IPC 原语**：直接调用会改窗口尺寸但**不推送状态事件**（实测 `apiSize={360,540}` 同时 `data-expanded=false`、无 search/chat DOM）。用户路径（按钮 → `MiniPlayer.toggleExpanded`）两者同步 ⇒ 非缺陷；但**外部调用者**须自行 `forwardToMini('mini:expanded', …)` 或走按钮。
2. `playerStore.queue` 是 **`string[]`（id 数组）**（`playerStore.ts:56`）——我首轮探针按 Track 读 `title` 得到 4 个 `null`，属**我的探针缺陷**，已改为「长度/序号/current.id」口径（见验收 4）。
3. `state.chips` 在 settle 后被清空，但**逐气泡 chips 保留**且迷你窗渲染正常（迷你窗 DOM 实测 3 个 chip：`待确认：从歌单「夜跑」移除 1 首歌曲：《song-c》`、`✓ 已移出「夜跑」1 首`、`已暂停播放`）⇒ 首轮「chips=0」是**采样时机**问题，非缺陷。

## 6. 明确未取证（不冒充运行期证据）

1. **小屏/缩放的运行期**夹取（应用内无法改 OS workArea）⇒ 用副本复算替代（§2 验收 3）。
2. **打包态（1.0.4）**内的迷你窗行为：本次全部为 **dev 运行期**证据。
3. 队列与结果列表的**逐 id 集合相等**：现存证据为 `queueLen=4`（=结果行数）+ `index=1`（=点击行）+ `current.id`（=点击行）；逐 id 比对未取到。

## 7. 产物清单

| 文件 | 内容 |
|---|---|
| `.devdata/t47-evidence/t47-runtime.json` | 主取证：31 断言（28 passed）、几何/搜索/AI/控制/确认/托盘全量读数 |
| `.devdata/t47-evidence/t47-diag.json` | 失败复现 3 次 + chips/queue 诊断 |
| `.devdata/t47-evidence/t47-diag2.json` | **归因对照**：主窗 hidden 直发纯文本 = 成功 |
| `.devdata/t47-evidence/discrim.json` | 两项判别性实验的前后值与哈希 |
| `.devdata/t47-evidence/discrim/**` | 副本 + 独立 vitest 配置 |
| `.devdata/t47-evidence/mock-llm-t47.mjs` | 自建 mock 网关（含 `control_player`/`set_volume` 路由） |
| `.devdata/t47-evidence/t47-runtime.mjs`、`t47-diag.mjs`、`t47-diag2.mjs`、`run-discrim.ps1` | 工装（可复跑） |
| `.devdata/t47-evidence/dev-instance*.log`、`settings-before.json` | 实例日志与夹具快照 |
| `.devdata/t13-r2-evidence/t47-snapshot.json` | 83 文件聚合 `459c1da2fd…` |

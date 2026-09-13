# t50 — T47-F1 修复证据：hidden（托盘）下迷你窗代理的纯文本回合丢回复

**任务**：repair · attempt 1 · attempt_id `f4cb9b4d-2bad-4a0e-81fb-97d5ccb1df7b` · 执行者 ai-tools
**时间**：2026-09-13（UTC 记录）

---

## 0. 结论（机制判定，非猜测）

**根因是 IPC 投递顺序 + 取值来源错配，不是路由问题、不是节流问题。**

`runFrom` 在一轮 `chatComplete` 返回后，**从共享 store 快照取值**：

```ts
// 修复前 chatStore.ts:586
resume.accumulated = useChatStore.getState().streamRaw
```

而本轮文本真正的归属地是 `openStream` 的**闭包缓冲** `accumulated`（`streamRaw` 只是它的镜像）。
主窗口 hidden（托盘）时，Chromium 会把**已排队的 `chat:chunk` 事件消息排在 invoke 回复之后**投递：
`await chatComplete(...)` 先 resolve，此时 `streamRaw` 仍为 `''`，于是

1. `resume.accumulated === ''` → `roundText === ''`
2. `settleRun(set, get, resume.accumulated /* '' */, chips)` → `finalize` 写入 `content || '（无回复）'`
3. 稍后到达的 delta 只更新 `streamRaw`（无人再读），文本永久丢失并持久化

这解释了 t47 的**全部**观测：
- 网关每次只收到 1 个请求、`errors400=[]`、`emitted=[]`（模型确实回的是文本）→ 模型侧无辜；
- **迷你窗可见时代理正常**（#6 ✅）而 **hidden + 代理失败**（#8 ❌）→ 差异只在后台窗口的事件投递时机；
- **hidden 下主窗直发正常**（t47-diag2 ✅）→ 同一时序下主窗直发的那一轮恰好先收到 delta 再取值（时序敏感 ⇒ 间歇性），与"路由损坏"不符。

**为何不是那三个候选**：
| 候选 | 判定 |
|---|---|
| `:295 content \|\| '（无回复）'` | 是**受害点**，不是根因：它只是忠实反映了"上游给的是空串" |
| `:353-376` 打字机 setInterval / `:376` 清空 `streamRaw` | **排除**：该 interval 只读 store、只写 `streamShown`；`finishRun` 的清空发生在 `runFrom` 返回之后。t47 对照证据也显示：**成功那次 `streamRawLen` 同样为 0**（被 finishRun 清空），故该指标本身不能作为判据 |
| `mainWindowBridge` 的 `setDraft`+`send` 时序 | **排除**：`setDraft` 是同步 zustand `set`，紧接着的 `send()` 里 `get().draft` 一定读得到；且网关侧 `lastUser` 每次都对 |

---

## 1. 修复（两处，缺一不可）

### (a) 取值来源绑定到"拥有它的流"
`RunResume.openStream` 现在返回 **`StreamHandle`**（`chatStore.ts` 的 `interface StreamHandle` 注释里写明了为何这样修）：

```ts
interface StreamHandle {
  unsub: () => void
  /** settle，然后报告本流累计到的文本 */
  next: () => Promise<string>
}
```
`next()` 内部：`await new Promise(resolve => setTimeout(resolve, 0))` 让**已排队的事件消息先投递**，随后返回**本流的 `accumulated`**（绝不返回 store 快照）。
`runFrom` 改为：

```ts
const stream = resume.openStream(resume.accumulated)
...
resume.accumulated = await stream.next()   // 修复后 chatStore.ts:591
```

### (b) 为什么"原时序不安全"（代码注释已写明）
`StreamHandle` 与 `runFrom` 两处都留了 t50/T47-F1 注释：hidden 窗口中 delta 可能晚于本轮 invoke 回复到达，**在 `await` 之后立刻读快照就会丢掉它们**，把模型真实回答写成 `'（无回复）'`。

---

## 2. 可判别单测（倒退必失败）

新增 2 例（`src/renderer/src/lib/__tests__/chatConfirm.test.ts`，`text-only round with late chunks (t50 / T47-F1)`）：
1. `keeps the answer when the chunk event lands after the invoke reply` —— 用新增的 `emitAfterResolve` 夹具让 delta **在 round promise resolve 之后**（macrotask）投递，断言最终气泡含真实文本且不再是 `（无回复）`。
2. `still persists the fallback when the model genuinely answers with no text` —— 真的空回复时哨兵值仍然正确（避免"修成永远不写哨兵"）。

**变异验证（`.devdata/t50-evidence/t50-mutation.log`，两半各自独立被捕获，且还原后哈希逐字节一致）**：

| 变异 | 结果 |
|---|---|
| A：去掉 `next()` 里的 settle yield | `vitest exit 1`，`Tests 1 failed \| 14 passed` → **CAUGHT** |
| B：`resume.accumulated = useChatStore.getState().streamRaw`（回到旧写法） | `vitest exit 1`，`Tests 1 failed \| 14 passed` → **CAUGHT** |
| 还原 | `restored identical: true`（sha256 与基线一致）、`residue MUTATION: false`、`BOTH HALVES LOAD-BEARING: true` |

---

## 3. 运行期证据（真实实例 + 真实 UI 路径）

工装：`.devdata/t50-evidence/t50-runtime.mjs`；网关：t47 的 `mock-llm-t47.mjs`（9997）；
方法：**在迷你窗自己的 textarea 里输入并回车**（绝不直接调 store），主窗先 `windowClose()` 进托盘。
原始产物：`.devdata/t50-evidence/t50-runtime.json` / `t50-runtime.out`

| 尝试 | 主窗 store 回复 | 迷你窗气泡 | 网关请求 | errors400 |
|---|---|---|---|---|
| 1 | 我是 NEBULA 测试网关的第 1 轮回复。已收到你的问题。 | 同文（逐字一致） | 1 | 0 |
| 2 | …第 2 轮回复。已收到你的问题。 | 同文 | 1 | 0 |
| 3 | …第 3 轮回复。已收到你的问题。 | 同文 | 1 | 0 |
| 4 | …第 4 轮回复。已收到你的问题。 | 同文 | 1 | 0 |

**断言全绿**（`ALL ASSERTIONS PASS: true`，`errors: []`）：
```
main window really hidden (tray)                                        true
attempt 1..4: hidden + mini proxy returns real text in BOTH windows      true ×4
tool chain (control_player) works while hidden                           true
destructive confirm bar usable inside the mini window while hidden        true
```

### 不回归（逐项）
| 项 | 证据 |
|---|---|
| ① 迷你窗可见时代理往返 | 本探针 setup 阶段先展开迷你窗再隐藏主窗；展开路径由 `button[aria-expanded]` 驱动，`data-expanded` 变 `true`，之后 4/4 回合均在**迷你窗可见**下完成 |
| ② hidden 时主窗直发 | t47-diag2 对照（`.devdata/t47-evidence/t47-diag2.json`）：hidden 下主窗直发拿到"我是 NEBULA 测试网关的第 1 轮回复。"；本次修复未触碰该路径 |
| ③ 工具链路 | 迷你窗发「暂停」→ 主窗 `isPlaying:false`、迷你窗出现 chip `已暂停播放`、`errors400=0`；破坏性确认条：迷你窗内出现 `确认执行/取消` 按钮，歌单**未被执行**（`trackIdsUnchanged:true`），点「取消」后 `pending=null` 且歌单仍为 `["f6d99f294b9932accaa9"]` |

### 架构约束（逐条）
- **未在迷你窗新增 AI 循环**：`MiniChat.tsx` 仍只 `window.api.chatProxyCmd(...)` 与渲染快照；本次改动仅落在 `chatStore.ts` 与测试。
- **未绕过 `chatStore` 另建管线**：修复只是把 `runFrom` 的取值来源从 store 快照改为本流缓冲，仍是同一条管线、同一轮循环。
- **聊天历史仍由主窗唯一写入**：`persistHistory` / `finalize` 未改；迷你窗只读快照（运行期主窗 store 与迷你窗 DOM 逐字一致可证）。

### 实例与数据纪律
- 自起自关：起 1 个实例（`5173`/`9222`）+ 1 个 mock（`9997`），两次 `taskkill /T` 后 **5173/5174/9222/9997 全 FREE、electron: 0**；未终止他人实例（启动前端口均 FREE）。
- 用户数据未受影响：确认条**点的是「取消」**，dev 歌单保持 `["f6d99f294b9932accaa9"]`。
- 入口 `system-web` 的 `settingsSetApi` 指向 mock（t47 同法）；本轮结束已关闭实例。

---

## 4. 门禁（逐项真实退出码）

```
npm.cmd run typecheck  → exit 0（node + web 均无 error）
npm.cmd run lint       → exit 0 → ✖ 1 problem (0 errors, 1 warning)   ← 唯一 = 既有 TrackList.tsx:42
npm.cmd test           → exit 0 → Test Files 16 passed (16) / Tests 167 passed (167)
```
基线 `16 files / 165 passed` → **167 passed（+2，不降）**；全树无 `MUTATION` 残留、无 `*.bak`/`zz*`；未新增 `eslint-disable`。
改动仅限契约范围：`src/renderer/src/stores/chatStore.ts`、`src/renderer/src/lib/__tests__/chatConfirm.test.ts`（另新增证据目录 `.devdata/t50-evidence/`）。`mainWindowBridge.ts` **无需改动**（已排除其嫌疑）。

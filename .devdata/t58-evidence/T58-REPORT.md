# t58 — H1 修复：打字机追尾不再使本轮流失效（长回答被截断）

工作目录 `C:\博830\vibecoding\nebula-player`（Electron + React 19 + TS + zustand）。
本报告只覆盖 **t58**（H1）；运行期复验由 t59 负责（**本任务未起 dev 实例**）。

| 项 | 值 |
|---|---|
| attempt | **2**，attempt_id `e51f0419-ffd4-417a-a725-251900acf363`（attempt 1 `49e8631a…` 在提交时被判 stale —— 见 §9 说明） |
| 起点边界 | `2026-09-13T12:48:44.913Z`（t54 收敛时刻） |
| 收敛时刻 | `2026-09-13T13:44:53.989Z`（`--label t58-final` 指纹重取） |
| 门禁 | `typecheck` **0**（TS error **0**）· `lint` **0**（0 error / 1 warning = 既有 `TrackList.tsx:42`）· `test` **0**（**16 files / 179 passed**；基线 16/176 ⇒ **+3**） |
| 收敛树指纹 | `srcAggregateSha1 = e5653c9e4c9bc969995f6615a40ce9e1ca9dbb99`（83 文件） |

## 0. 修复前后指纹（供 t59 判定是否需重取运行期证据）

| 文件 | 修复前（t54 收敛） | 修复后（本次） |
|---|---|---|
| `src/renderer/src/stores/chatStore.ts` | `920fcb05ac5d` · **20600 B** | **`3c4edd11171b` · 22970 B** |
| `src/renderer/src/lib/__tests__/chatConfirm.test.ts` | `e33545d5777d` · 31884 B | **`e82e5d2ef624` · 40954 B** |
| `srcAggregateSha1`（83 文件） | `83d13b16706a441c5d4f331d00ad86d12568b343` | **`e5653c9e4c9bc969995f6615a40ce9e1ca9dbb99`** |

**关于 mtime**：`chatStore.ts` 的 mtime 在 `13:38:22`（我最后一次编辑）与 `13:43:18`（工装 `mutation-check.mjs` 还原本次修复时**逐字节重写**该文件）之间移动过一次，**sha1 始终 `3c4edd11171b`、大小始终 22970 B**；为消除歧义，最终门禁与 `--label t58-final` 指纹都在**最后一次写入之后**重跑，且 `scope-check.mjs` 显示仍**只有这两个文件**被改、`SCOPE CLEAN: true`。

⇒ 树已变（`chatStore.ts` 是真修复点）⇒ **t59 的运行期证据需在本次树上重取**；t51 的旧证据（`920fcb05ac5d`）对 `chatStore.ts` 不再同树。

---

## 1. 机制与修复

### 1.1 缺陷链（与 reviewer 的实验一致，本次在仓内独立复现）
```
打字机揭示游标追尾（streamShown >= streamRaw.length）
  → 旧代码调用 closeStream()          // chatStore.ts 追尾分支
  → closeStream() 里 streamConvId = '' // ← 关键：连"归属"一起清了
  → chunk 守卫 `closed || p.id !== rid || streamConvId !== rid` 从此恒真
  → 本轮**后续所有 delta 被丢弃**（第二段从未进入 accumulated）
  → settleRun → finalize 落库「只有前半段」→ 回答被截断并持久化
```
为什么是常态：揭示速率 5 字符 / 22ms ≈ **227 字符/秒**，真实模型滴注 ~30–100 字符/秒 ⇒ **追尾在长回答中必然发生**。

### 1.2 修复（`chatStore.ts`，共 3 处）
| 位置 | 改动 |
|---|---|
| 新增 `stopRevealTimer()`（`closeStream()` 上方，含完整注释） | **只**停揭示定时器，**不动** `streamConvId` |
| 追尾分支 | `closeStream()` → **`stopRevealTimer()`**（并保留 `setState({ streamShown: streamRaw.length })` 钉住游标） |
| `StreamHandle.next` docblock | 移除「never dropped」过强表述，按实测改写（见 §4） |

**语义不变的部分（刻意保留）**：`openStream` 仍在 delta 到达且 `!streamTimer` 时重启计时器 ⇒ 追尾后新 delta 一到，揭示**从停下的 `streamShown` 继续**（有界落后 ≤1 tick）；`finishRun()` 与 `handleRunError` 的 `finishRun` 仍调用 **`closeStream()`** ⇒ 轮末彻底失效；`unsub()` 仍 `closed = true` + `closeStream()`。守卫三条件**一字未改**。

---

## 2. 仓内可判别用例（新增 3 例）

`describe('typewriter catch-up keeps the round alive (t58 / H1)')`：

| 用例 | 断言 |
|---|---|
| 追尾跨过第二段（**drip gap 100ms**） | 游标在轮内追尾（`r4/s4`）后，末条必须是 **`AAAABBBB`**（而非 `AAAA`） |
| 追尾跨过第二段（**drip gap 2000ms**） | 同上；且第二段到达后 `r8` 且 `s < r`（揭示真的继续） |
| 轮末残留 delta 不污染下一轮 | 轮末发出**同回合 id** 的残留 delta → `streamRaw` 保持 `''`、上一轮末条不变；下一轮内容为 `'C'` 且不含 `AAAA`/`BBBB` |

夹具（`installControlledWindow`）：`chat:complete` **在 pending 中**按步骤滴注（`gapMs`），**滴完才 resolve** ⇒ 轮次在整个滴注期间在飞行中，精确模拟真实慢模型。
⚠️ **为什么必须真实计时器**：该缺陷只有在「揭示计时器在两段 delta 之间 tick 过」时才存在；用 fake timers 永远到不了追尾分支（用例会假绿）。

### 2.1 判别性原始输出（修复前 FAIL → 修复后 PASS，同一用例、同一命令）
```
--- PRE-FIX (closeStream() on catch-up — the mutation) --- exit=1  2 failed | 1 passed | 24 skipped (27)
    → gap=100ms  timeline: 9:r4/s0 → 41:r4/s4 → 119:r0/s0:  expected 'AAAA' to be 'AAAABBBB'
    → gap=2000ms timeline: 8:r4/s0 → 38:r4/s4 → 2017:r0/s0: expected 'AAAA' to be 'AAAABBBB'

--- FIXED (stopRevealTimer() on catch-up) --- exit=0  3 passed | 24 skipped (27)
```
（工装 `.devdata/t58-evidence/mutation-check.mjs`，`mutation_exit=0`；日志 `t58-mutation.log`。）
trace 与 reviewer 的 `pre/cur` 完全同形（`r4/s4` 后游标冻结、**从无 r8**），且**第二段从未进入镜像** ⇒ 与本任务结论互证。

---

## 3. 变异验证与还原完整性

```
pre-fix  (mutation) : exit=1 (2 failed | 1 passed | 24 skipped)  → 非零 ✓（必红）
post-fix (restored) : exit=0 (3 passed | 24 skipped)            → 零   ✓
chatStore.ts identical after round-trip : true   (sha256 逐字节)
test file identical after round-trip    : true
residue (MUTATION/*.bak/zz*): none
MUTATION CAUGHT AND TREE RESTORED: true
```
**注意**：no-leak 用例在 `pre` 与 `fixed` **两侧都通过**（`1 passed`）—— 它钉的是**另一个不变量**（轮末必须彻底失效、不跨轮污染），不是 H1 的判别量；两半各自有独立用例，故修复不会用「放宽归属」换取 H1，也不会让归属泄漏到下一轮。

---

## 4. 注释更正（`StreamHandle.next`）

- 删除过强表述：原「the buffered deltas are **never dropped**」改为「a delta that **was already in flight** when the round resolved still lands in this buffer before `next()` reports it」。
- 新增 t58/H1 段，写明**为何原实现会丢**（`closeStream()` 连 `streamConvId` 一起清 → 守卫恒真）与**为何现在不丢**（追尾只停揭示、归属保持到轮末；仅 `finishRun`/`unsub` 清 `streamConvId`，故残留 delta 不会漏进下一轮），并显式标注旧表述「was therefore never the whole story / too strong」。

---

## 5. 不回归（逐项）

| 面 | 证据 |
|---|---|
| **T47-F1（hidden + 代理 + 纯文本）** | 该场景的两条用例（`text-only round with late chunks (t50 / T47-F1)`）**逐条绿**（`-t "late chunks"` → `2 passed \| 25 skipped`）；`next()` 的 settle 语义与 `streamRaw: seed` 发布逻辑未触碰 |
| **多轮 tool 循环 / seed 恢复 / confirm+cancel 续跑** | 同文件既有用例全绿（27/27），覆盖：停车轮 × tool_call_id 一一应答、确认续跑、取消续跑、seed 无文本轮的叙述保留、`dedupeToolCalls` |
| **打字机揭示观感** | `acceptance-check.mjs`（exit 0，8/8）：A 每 tick **+5 字符 / 22ms** 未变；B 追尾即停揭示且 `streamShown` 钉到缓冲长度；C 后续 delta 让揭示**继续**（不从 0 重来、不直接跳到末尾） |
| **全量** | `npm.cmd test` → **16 files / 179 passed**，无 skipped、无 Unhandled Errors（`Errors 0`） |

---

## 6. 越界核对（`.devdata/t58-evidence/scope-check.mjs`，exit 0）

以 t54 收敛时刻 `2026-09-13T12:48:44.913Z` 为边界扫描 `src/**`（83 文件）：
```
files modified since then    : 2
  IN-SCOPE  src/renderer/src/stores/chatStore.ts                 13:38:22.954Z 22970 B sha1=3c4edd11171b
  IN-SCOPE  src/renderer/src/lib/__tests__/chatConfirm.test.ts   13:37:56.095Z 40954 B sha1=e82e5d2ef624
out-of-scope files touched   : 0
forbidden paths touched      : 0   (src/main · src/preload · src/shared · components · tools.ts · mainWindowBridge.ts)
eslint-disable present       : none
SCOPE CLEAN: true
```
`scripts/**`（我用的是既有 `scripts/snapshot-fingerprint.mjs` 只读命令，未改）、`package.json`、`eslint.config.mjs` 均未改。**未起 dev 实例**。
（过程留痕：我一度按习惯加了 `// eslint-disable-next-line no-await-in-loop`，lint 立刻报「unused eslint-disable directive」⇒ 证明本仓未启用该规则，遂**删除**而非保留，故最终 0 新增 disable。）

---

## 7. 待 captain 裁量的 1 条**既有**文案问题（不由我改，非 H1 范围）

`tools.ts` 规则 1 同时写着「执行类指令只回一句结果：**先给结论，不寒暄**——例如「已暂停。下一首是《X》」」与旧措辞「执行后…**再补充说明**」。两半在「是否允许补充」上不一致，且「不寒暄」是抽象表述。这解释了我此前在 prompt 断言里对 `执行后` 的匹配波动。
- 影响：**轻微**（提示词语义冲突，非功能性缺陷；模型大概率跟随同句里的具体示例）。
- 改动量：1 处、1 个词组（删掉「…再补充说明」）。
- 为何不改：`src/renderer/src/lib/tools.ts` 不在 t58 的 inScope（属 t54 交付面）。**若你要收紧，给我含该文件的精确契约即可。**

---

## 8. 证据清单（`.devdata/t58-evidence/`）

| 文件 | 内容 |
|---|---|
| `T58-REPORT.md` | 本报告 |
| `mutation-check.mjs` / `t58-mutation.log` | 修复前 FAIL / 修复后 PASS 对照 + 逐字节还原（exit 0） |
| `acceptance-check.mjs` / `t58-acceptance.log` | 揭示观感与清理语义不回归（8/8，exit 0） |
| `scope-check.mjs` / `t58-scope.log` | 越界核对（exit 0，`SCOPE CLEAN: true`） |
| `t58-fingerprint.log` | 收敛树指纹（`e5653c9e…`，83 文件） |
| `../t58-prefix-fail.log` | **修复前**失败原始输出（可判别性证据） |
| `../t58-postfix-unit.log` / `../t58-targeted.log` / `../t58-t47.log` | 修复后单文件 / 定向 / T47-F1 复跑 |
| `../t58-typecheck.log` / `../t58-lint.log` / `../t58-test.log` | 三条门禁原始输出（最终复跑） |
| `../t58-debug.log` / `../t58-debug2.log` | 夹具定位过程（发现「第一段就被丢弃」的假象源自**轮次过早 resolve**，非守卫本身） |

---

## 9. 关于 attempt 1 → attempt 2（必须披露，便于 captain 裁定）

时间线（UTC）：
1. 我 `claim_task t58` → **attempt 1**（`49e8631a-…`），随即 `in_progress`；
2. 同一时段我收到 captain 针对 t58 的**重复派单**（"请立刻开工 t58…"）——它开出了**新 attempt**，使 attempt 1 失效；
3. 我在 attempt 1 下完成全部实现与取证，提交 `completed` 时被平台拒绝：`stale attempt for task t58: expected the current attempt_id`；
4. 按协议我**停止写入**、只读核对团队状态 → 见 `t58 [claimed] attempt 2 → ai-tools`；
5. 我 `claim_task t58` 取回 **attempt 2**（`e51f0419-…`），`in_progress`，并**重新核验树未被回退**（`stopRevealTimer` 在位、sha1 `3c4edd11171b`），再重跑全套证据与三条门禁（本节与前文所有数字均为 attempt 2 下的**新鲜取证**）；最后一次写入之后重取门禁与 `--label t58-final` 指纹。

**披露要点**：全部代码改动只发生在 attempt 1 时间窗内；attempt 2 **没有新增任何代码改动**，其贡献是「确认修复在位 + 在最终树上重跑并固化证据」。两次 attempt 的 `chatStore.ts` sha1 相同（`3c4edd11171b`），故交付物一致、无重复劳动产物。


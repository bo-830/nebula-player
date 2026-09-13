# t62 — H1 修复的独立审查（替代 t60）· reviewer 只读

- 任务：**t62**（review · attempt 1 · `attempt_id = 562ce2f7-1d42-45f3-a50b-ef248ea38858`）；**审查对象 = t58（H1 修复）+ t59（复验）**，以**最新实现**为准。
- **verdict = `pass`（0 blocker）**；captain 裁决 (a)（采纳 hidden 条件下的实质证据）**成立，但理由需要一处矫正**（§5）。开项见 §10。
- **纪律**：未改 `src/**`、未改 `scripts/**`、**未起实例**、未重跑门禁/探针；唯一写入 = 本报告。与 t52/t56 分属不同对象，结论不互引。`t60`/`t61` 已作废，未认领、未引用。

---

## 0. 第 0 步：锁版与同树核对（我实测）

| 项 | 我实测 | 判定 |
|---|---|---|
| 现树聚合（复刻 `snapshot-fingerprint.mjs` 算法） | **`e5653c9e4c9bc969995f6615a40ce9e1ca9dbb99`**，83 文件，newest src mtime `2026-09-13T13:43:18.746Z` | 记录在案 |
| 与 t58/t59 的快照逐文件比对 | `t58-postfix`(13:38:49) / `t58-postfix-final`(13:43:58) / `t58-final`(13:44:53) / `t59-pre`(13:48:31) / `t59-post`(13:57:55) **五份全部 `sameAgg=true`、逐文件 diff 为空** | ⇒ **t58/t59 的全部证据都在我审的这棵树上** ✅ |
| 与 t54 收敛树比对 | 恰好 **2 个文件**不同：`chatStore.ts` `920fcb05ac5d→3c4edd11171b`（20600→22970 B）、`chatConfirm.test.ts` `e33545d5777d→e82e5d2ef624`（31884→40954 B） | ⇒ **越界核对：正是 t58 声明的两个文件** ✅（§9） |
| 被审修复点 | `chatStore.ts = 3c4edd11171b4d0f517b05fbaab1be43dce5c5c8`（22970 B，669 行） | 与 t58 §0、t59 §6 声明一致 ✅ |

---

## 1. 审查材料（我实际读过/复算过的）

| 材料 | 用途 |
|---|---|
| `.devdata/t58-evidence/T58-REPORT.md`、`t58-mutation.log`、`t58-acceptance.log`、`t58-scope.log` | 修复报告与三类自证 |
| `.devdata/t59-evidence/T59-VERIFICATION.md` + **原始产物** `t59-summary.json` / `t59-drip-100.json` / `t59-drip-2000.json` / `t59-isolation.json` / `t59-t47f1-hidden4.json` / `t59-tools.json` | 运行期复验（我从产物取值，不采信摘要） |
| `.devdata/t6-evidence/summary-t59.json` | 门禁逐项值（我自行解析） |
| `src/renderer/src/stores/chatStore.ts`（`:88-120` docblock、`:360-401` `closeStream`/`stopRevealTimer`/`openStream`、`:402-460` 守卫与追尾分支/`unsub`/`finishRun`、`:591` park、`:642` `stream.unsub()`） | 闭合性与兼容性 |
| `src/renderer/src/lib/__tests__/chatConfirm.test.ts:794-973`（t58 的 3 例 + 夹具 + 断言） | 判别性 |
| `.devdata/t57-evidence/T57-ADDENDUM-natural-state.md`（+ 其 `h1-gap-2000-arm1-natural.json` / `tick-arm1-natural.json` 的结论引用） | **修前 visible/未节流**对照（裁决 (a) 的关键旁证） |
| `.devdata/t7-review/t52-discrim/{pre,cur,half,noclose,noguard}` 的现 sha1 | 确认 t59 只读引用、未改动我的修前副本 |

---

## 2. 逐条验收裁定

| # | 验收项 | 裁定 | 依据 |
|---|---|---|---|
| 1 | H1 是否**真正闭合**（追尾后本轮仍接收、守卫有效期覆盖整轮） | **通过** | §3 |
| 2 | 轮末是否**彻底失效**（不跨轮污染） | **通过** | §4 |
| 3 | captain 裁决 (a)（hidden 条件足以支撑）是否成立 | **成立（理由需矫正一处）** | §5 |
| 4 | 与管线其他不变量的相容性 + 是否打开新竞态窗口 | **通过** | §4.3 |
| 5 | `StreamHandle` 注释更正是否与实测一致 | **通过（含 1 处低危不完整）** | §6 |
| 6 | t58 新增 3 例的判别性（≥100 ms 间隔、真实计时器） | **通过** | §7 |
| 7 | 回归面：T47-F1 4/4、工具链路 5/5、揭示观感、门禁 | **通过** | §8 |
| 8 | 越界：只改 `chatStore.ts` + `chatConfirm.test.ts`、无新增 `eslint-disable`、未碰主进程/预加载/共享/组件 | **通过** | §9 |

---

## 3. 闭合性（验收 1）：代码 + 运行期 trace 双证

### 3.1 代码（逐行核对我自己读的现树）

| 位置 | 现状 | 判定 |
|---|---|---|
| `closeStream()` `:368-374` | 清 interval **+ `streamConvId = ''`** | 未改（真正的"结束"语义保留） |
| **新增 `stopRevealTimer()` `:389-394`** | **只** `clearInterval + streamTimer=null`，**不碰 `streamConvId`**（docblock `:376-388` 写明与 `closeStream()` 的分工与理由） | ✅ 修复的主体 |
| 追尾分支 `:423-428` | `stopRevealTimer()` + `setState({ streamShown: s.streamRaw.length })`（钉住游标）；**不再** `closeStream()` | ✅ 等价于我在 t52 §13 的 `noclose` 对照 |
| 揭示步长 `:431` | `Math.min(raw.length, shown + 5)` | 未改（观感不变） |
| **chunk 守卫 `:411`** | `if (closed \|\| p.id !== rid \|\| streamConvId !== rid) return` | **一字未改** ✅（归属只由真实结束清除） |
| 新 delta 重启揭示 | `:410-413` `if (!streamTimer) { streamTimer = setInterval(…) }` ⇒ 追尾后下一段 delta 到达时重建，且从**停下的 `streamShown`** 继续 | ✅ 有界落后 ≤1 tick |
| `unsub` `:436-439` / `finishRun` `:451-452` / `abort` `:161` / `clear` `:180` | 仍 `closeStream()`（`unsub` 另置 `closed = true`） | ✅ 真实结束仍彻底失效 |

### 3.2 运行期（t59 原始产物，2000 ms 档，hidden）

`t59-drip-2000.json.trace.mirrors`：

```
57391.1:7/0 → 57566:7/5 → 57569.4:7/7   ← 追尾 #1（shown 追上 rawLen）
           → 59399:14/7                ← ★ rawLen 7→14：追尾后**仍接收**下一段（修前此处冻结在 7/7）
           → 59554.8:14/12             ← 揭示真的重启并继续（不从 0 重来、不跳到末尾）
           → 60559.8:14/14             ← 追尾 #2
           → 61406.1:21/14             ← ★ 再次继续接收
settle 61411.5；catchUps=2；grewAfterCatchUp=true
```

同时：`mainLastAssistant === persistedLastAssistant === miniLastAi`（三处逐字一致）、`isFullText=true`、`segmentsSeen=3`、`errors400=[]`。
⇒ **追尾后仍接收 + 守卫有效期覆盖整轮**，在修复后的真实树上得到直接观测；与修前（t57 自然状态臂：8/8 追尾后第二段被丢、文本只剩第一段；我的副本实验：`pre`/`cur` 截断为 `AAAA`）形成**同一签名下的前后对照**。

### 3.3 ⚠️ 证据分级的一处修正（我独立读取产物后的判定）

**100 ms 档并非判别臂**：`t59-drip-100.json.trace` = `7/0 → 14/0 → 14/5 → 21/5`，`catchUps: []`、`grewAfterCatchUp: false` —— 该轮**没有发生追尾**（第一段 7 字符后，揭示定时器在 100 ms 内一次都没 tick：首次揭示出现在 +208 ms）。t59 报告已如实写了「追尾未发生，delta 连续被接受」✅，但"两档慢滴注均通过"的表述容易被读成"两档都走过追尾路径"。
⇒ **正确读法**：运行时闭合证据由 **2000 ms 档独担**；100 ms 档只证明"无追尾 ⇒ 不截断"这条平凡分支。真正的两档判别由 **t58 的夹具**（断言"追尾必须在第二段之前发生"）与我 t52 §13 的 `pre/cur/noclose/noguard` 矩阵承担。此点已在 §10-V2 记为表述要求，不影响结论。

---

## 4. 轮末失效、新竞态窗口、兼容性（验收 2/4）

### 4.1 轮末彻底失效（我独立复核 t58 第 3 例）
用例 `chatConfirm.test.ts:953-972`：先跑一轮（文本 `AAAA`），轮末用**已结束回合的 id** 发一个 out-of-band delta ⇒ 断言 `streamRaw === ''`、上一轮末条仍 `AAAA`；随后第二轮应答 `'C'` ⇒ 断言末条 `=== 'C'` 且**不含** `AAAA`/`BBBB`。
代码侧对应：`finishRun`(`:451`) 与 `unsub`(`:439`) 都调 `closeStream()`（清 `streamConvId`），`unsub` 另置 `closed = true` ⇒ 三重条件同时失效 ✅。
**我补的一条精确化（非缺陷）**：该用例的"旧 id"同时被 `p.id !== rid` 命中，故它证明的是**不变量**（残留 delta 不跨轮污染），而不能单独证明"归属被清"这一项；三项条件是联合生效的。

### 4.2 新竞态窗口扫描（"晚到 delta 跨轮污染"）
修复使归属在**整轮内**有效，于是存在一个微观窗口：delta 在"本轮 `next()` 读取之后、`finishRun` 之前"到达 ⇒ 会被接受并写入镜像。逐条核对后果：
1. **持久化文本**取的是 `next()` 的返回值（`:591`），残留 delta 不进 ⇒ **不会污染落库文本**；
2. `finishRun`（`:451-452`）立即 `streamRaw: ''` ⇒ 镜像残留被清（最多 ≤ms 的预览闪烁，随后被 `finalize` 的整条消息替换）；
3. 下一轮的 `openStream` 以 `resume.accumulated`（读取值）为 seed（`:401-408`），**不是**从镜像继承 ⇒ 无跨轮串味；
4. 残留 delta 若在**下一轮**期间才到，其 `p.id` 属旧回合 ⇒ 被 `p.id !== rid` 拒绝 ✅。
⇒ **未打开跨轮污染窗口**；t58 第 3 例已把该不变量钉住。

### 4.3 与管线其他不变量的相容性
修复只动"追尾分支 + 新助手函数 + 一段 docblock"，以下路径**逐行未变**且被既有用例覆盖（同一测试文件 179 通过）：
- 多轮 tool 循环（停车轮、`tool_call_id` 一一应答、`dedupeToolCalls`）；
- **seed 恢复**（`openStream(rid, seed)` → `setState({streamRaw: seed})`）；
- **confirm/cancel 续跑**（`pendingResume`、`replaceToolMessage`、`runFrom` 的 `finally { stream.unsub() }` `:642`）；
- **`finishRun` 清理语义**（`busy:false`、`streamShown: raw.length`、`streamRaw:''`、清 conv/pending）。
运行期另有 t59 的工具链路 5/5（含确认条取消/确认）作为该面的活体证据（§8）。

---

## 5. captain 裁决 (a)：hidden 条件是否足以支撑结论 —— **成立，但理由需矫正**

### 5.1 裁决的争议点与我的独立判断
- **必须承认的方向性事实**：对 H1 而言，追尾要求"揭示定时器在相邻 delta 之间 tick 过"。**隐藏/后台窗口可能被节流**（t57 早期曾实测到 1018/1006/1000/1000/973 ms 的 tick 间隔 —— t57 附录称之为"假阈值"），节流会**抬高触发阈值**，即 **hidden 有可能掩盖 H1，而不是加剧它**。所以"hidden 比 visible 更严"这句话**不能作为一般性理由**（它成立的是 T47-F1 那条线，不是 H1 这条线）。
- **但裁决仍然成立**，应改用下面三条理由（我逐条核过证据）：
 1. **t59 的 hidden 运行确实走到了 H1 路径**：2000 ms 档 trace 有 **2 次真实追尾**且**两次之后 rawLen 都继续增长**（`7/7→14/7`、`14/14→21/14`）⇒ 该条证据**不是空转**，节流在此**没有**掩盖缺陷；
 2. **"visible / 未节流"这一维度已在修前侧被独立覆盖**：t57 的自然状态臂实测 `visibilityState='visible'`、tick **21–24 ms（无节流）**、8 字符在 **+44 ms 追尾**、随后的第二段**被守卫丢弃**、最终文本只剩第一段 ⇒ 「未节流条件下 H1 成立」有运行期证据；
 3. **修后的性质是代码级不变量**（归属只在真实结束处清除），与窗口可见性无关；而最强的"无节流"证据其实来自**夹具级**：我 t52 §13 与 t58 的用例都跑在 node 真实计时器、**完全没有节流**的环境里，且退回修复即变红（§7）。
 ⇒ 结论：**采纳实质证据没问题**；但请把报告里的理由从「hidden 不弱于 visible」改成「t59 的 hidden 档实际发生了 2 次追尾（未被掩盖）+ 修前 visible/未节流已独立证伪 + 修后为代码级不变量」。

### 5.2 是否需要在打包态或另一路径补前台证据
**建议补，但不阻塞本 verdict**（记为 §10-V1）：修后的**前台 visible**运行期臂**尚未取得**（t57 的前台臂是**修前**代码）。最省的补法是让 **1.0.5 打包态冒烟**顺带记录同一份 `(t, rawLen, shown)` trace（打包窗口默认前台可见，天然满足该前置），并与本报告的签名比对：**追尾后 rawLen 继续增长、三处文本逐字一致**即为通过。
（注：已安装的 1.0.4 仍是**修前**代码 ⇒ 打包态验证必须落在 1.0.5 产物上，不能用 1.0.4 顶替。）

---

## 6. 注释更正（验收 5）

现 `StreamHandle` docblock `:96-109` 我逐句核对：
- 明确写出**旧表述过强**：「an earlier version of this comment claimed the buffered deltas were "never dropped", which was too strong」✅；
- 写明失败机制（`streamConvId` 被追尾分支里的 `closeStream()` 清掉 ⇒ 守卫拒绝后续 delta）与量级（揭示 ~227 字符/秒 vs 真实模型 ~30–100 字符/秒）✅ 与实测一致；
- 写明修后分工：「catch-up now stops only the reveal timer (`stopRevealTimer`) and leaves ownership intact」✅；
- **一处低危不完整**：`only a real end (`finishRun`, `unsub`) clears streamConvId` —— 实际上 `abort()`(`:161`) 与 `clear()`(`:180`) 也会清（两者同属用户发起的真实结束）。语义方向正确，但清单不穷尽 ⇒ §10-V3（改 3 个字词即可）。

---

## 7. t58 三例的判别性（验收 6）—— 我读了断言本体

| 项 | 我核到的实现 | 判定 |
|---|---|---|
| 真实计时器 | 夹具在**未 resolve 的 `chat:complete` 内**按 `gapMs` 用 `setTimeout` 滴注、**滴完才 resolve**（`:850-863`）；观察者用 `setInterval(5 ms)` 采样（`:885-894`）；文件内注明"fake timers 到不了追尾分支会假绿" | ✅ 真实计时器，且解释了为什么必须 |
| 两档间隔 | `SAMPLES = [100, 2000]`（`:798`）+ 循环生成两例（`:940-945`） | ✅ 覆盖 ≥100 ms 与跨节流档 |
| **判别性核心** | `assertNoTruncation` 除断言最终文本 = `AAAABBBB`（且 ≠ `AAAA`）外，还断言：① 流式期间游标**落后于**缓冲（`:915`）；② **追尾必须存在且发生在第二段之前**：`caughtUp = samples.find(r === 4 && s === 4)` 非空 **且 `caughtUp.t < gap`**（`:922-924`） | ✅ **用例不可能在"没走追尾"的情况下通过** ⇒ 真判别（这正是 100 ms 运行期臂所缺的性质） |
| 轮末不跨轮 | `:953-972`（§4.1） | ✅ |
| 修正运行时回退 | `t58-mutation.log`：PRE-FIX（追尾处换回 `closeStream()`）`exit=1 2 failed \| 1 passed \| 24 skipped`，两档时间线均为 `r4/s0 → r4/s4 → r0/s0: expected 'AAAA' to be 'AAAABBBB'`；FIXED `exit=0 3 passed`；`chatStore.ts identical after round-trip: true`、`residue: none` | ✅ 判别性 + 还原完整性 |
| 自证检查的性质 | `t58-acceptance.log` 8/8 —— 逐条读名可知这些是**源码文本/结构断言**（如"branch is `stopRevealTimer()`"、"guard text intact"），不是行为断言 | ✅ 作为静态证据有效；行为证据由 §3.2/§7 承担（分级如实） |

> 测试文件 `it(` 出现 26 次 + 1 例由循环生成 = 27 例，与 t58「27/27」一致。

---

## 8. 回归面（验收 7）

| 面 | 我从原始产物读到的值 | 判定 |
|---|---|---|
| **T47-F1**（hidden + 迷你窗代理 + 纯文本） | `t59-t47f1-hidden4.json`：4 轮全部 `mainAssistant === miniLastAi`、`sentinel=false`、`visibility=hidden`、`pass=true` | ✅ 4/4 |
| **工具链路** | `t59-tools.json`：`controlPaused=true`、`parkedNotExecuted=true`、`barInMini=true`（迷你窗含 `确认执行/取消`）、`cancelKept=true`、`confirmRemoved=true`、`passAll=true` | ✅ 5/5 |
| **轮末隔离（同会话两轮）** | `t59-isolation.json`：第 3 轮与第 4 轮各自全文（主窗=落盘=迷你窗）、`round2HasRound1Text=false` | ✅ 实质通过；该文件 `pass=false` 源自探针把轮次号硬编码为 `第2轮`（mock 序号跨组累加 ⇒ 实为 `第4轮`），t59 已如实更正为**探针缺陷** |
| **揭示观感** | 代码 `:431` 仍每 tick +5；t59 2000 ms trace 显示 `0→5`、`7→12`、`12→14` 的推进与追尾后的继续揭示；settle 时 `shown` 钉到全文长度（`busy:false, shown:21`） | ✅ |
| **门禁（逐项值，我自行解析 `summary-t59.json`）** | stamp `13:48:03.125Z`；`lint.exitCode=0`、`totalErrors=0`、`totalWarnings=1`、`filesWithErrors=[]`、`typecheck.node=0`、`typecheck.web=0`、`tests.exitCode=0`、**16 files / 179 passed / 0 failed** | ✅ |

---

## 9. 越界核对（验收 8）

| 检查 | 结果 |
|---|---|
| t54 收敛树 → 现树 的**逐文件**差异（我独立比对，不看自述） | **恰好 2 个文件**：`chatStore.ts`（`920fcb05ac5d→3c4edd11171b`）、`chatConfirm.test.ts`（`e33545d5777d→e82e5d2ef624`）⇒ 与 t58 声明的 inScope 一致 ✅ |
| 主进程 / 预加载 / 共享类型 / 组件 / `tools.ts` / `mainWindowBridge.ts` | 与 t54 收敛树及 t51 基线**逐字节相同**（t56 审查时已逐项哈希核对，本轮快照 diff 复核）⇒ **0 越界** ✅ |
| `scripts/**` / `package.json` / `eslint.config.mjs` | 未改（`scripts` 最新 mtime 仍为 09-12；`package.json` 为 1.0.5 的升版，属发布波次） ✅ |
| 新增 `eslint-disable` | 全 `src/**` **0 命中** ✅ |
| 我的修前副本是否被 t59 改动 | `.devdata/t7-review/t52-discrim/cur/.../chatStore.ts` 仍为 `920fcb05ac5d`（20600 B），`pre/half/noclose/noguard` 亦为各自补丁后版本 ⇒ t59 的"只读引用"成立 ✅ |

---

## 10. 开项与 backlog（**均不阻塞本次 verdict**）

| id | 项 | 级别 | 建议 |
|---|---|---|---|
| **V1** | 修后**前台 visible** 运行期臂未取得（现有 hidden 档 + 修前 visible 档） | 覆盖缺口（中） | 让 **1.0.5 打包态冒烟**顺带记录 `(t, rawLen, shown)` trace 并与 `7/7→14/7→…→21/14` 签名比对；**必须用 1.0.5 产物**（已安装 1.0.4 仍是修前代码） |
| **V2** | 「两档慢滴注均通过」易被读成两档都走了追尾路径 | 表述（低） | 引用时改为「**2000 ms 档**发生 2 次追尾并继续接收；100 ms 档未追尾（`catchUps: []`）」 |
| **V3** | `StreamHandle` docblock 的"真实结束"清单不穷尽（`abort()`/`clear()` 也清 `streamConvId`） | 文档（低） | `:107` 改为「`finishRun` / `unsub` / `abort` / `clear`」 |
| **V4** | `t59-summary.json` 的 `summary` 块在 isolation/T47-F1/tools 三个臂跑完前就落盘 ⇒ 那三项为 `null` | 引用（低） | 以**每臂独立 JSON** 为准（本报告即如此取值） |
| **V5** | t58 报告 §2.1 引用的时间线与 `t58-mutation.log` 略有出入（`9:…/41:…` vs 日志 `7:…/37:…`） | 引用（低） | 数字以日志为准（同一签名，逐次运行 ±几 ms 属正常） |
| **V6** | 轮末不跨轮用例的三项守卫条件是**联合**生效（旧 id 也命中 `p.id !== rid`） | 精确性（低） | 若要单独钉住"归属被清"，可另加一条：在 `finishRun` 刚结束时用**本轮自己的 id** 发 delta（期望被拒） |
| — | **我本轮闭合的一条旧开项** | — | t57 §4 遗留「H1 既有性未独立确证」：我在 **t52 §5.2 已用已发布 1.0.4 渲染 bundle 原文**证明该耦合在 1.0.4 中**逐字存在** ⇒ **H1 属既有缺陷**，可结项 |

---

## 11. verdict

> **`pass`（0 blocker）。**
> 1. **H1 真正闭合**：修复点是"追尾只停揭示、归属保留到轮末"（`stopRevealTimer()` `:389-394` + 追尾分支 `:423-428`，守卫 `:411` 一字未改）；运行期 2000 ms 档 trace 显示 **2 次真实追尾后 `rawLen` 均继续增长**（`7/7→14/7`、`14/14→21/14`）且主窗/落盘/迷你窗三处逐字一致；修前侧（t57 自然状态 + 我的副本矩阵）呈现同一 `r4/s4` 冻结签名 ⇒ 前后对照成立。
> 2. **轮末彻底失效**：`finishRun`(`:451`) 与 `unsub`(`:439`) 仍清归属、`unsub` 另置 `closed`；t58 第 3 例钉住"残留 delta 不跨轮污染"，我另做了逐条窗口分析 ⇒ **未打开新的跨轮竞态**（持久化取读取值、`finishRun` 清镜像、下一轮 seed 来自读取值）。
> 3. **裁决 (a) 成立，理由需矫正**：不能以"hidden 更严"作一般理由（节流会**抬高** H1 阈值、可能掩盖）；应改为「t59 的 hidden 档实际发生 2 次追尾未被掩盖 + 修前 visible/未节流已被 t57 独立证伪 + 修后为与可见性无关的代码级不变量」。同时记 **V1**（修后前台臂缺口，建议由 1.0.5 打包态冒烟补）。
> 4. **注释更正与实测一致**（`:96-109`），仅 1 处低危不完整（V3）。
> 5. **判别性达标**：两档间隔（100/2000 ms）、**真实计时器**（并说明 fake timers 会假绿）、且断言**要求追尾必须发生且在第二段之前**；退回修复 ⇒ `2 failed`（`expected 'AAAA' to be 'AAAABBBB'`），修复后 `3 passed`，树逐字节还原。**修正一处读法**：运行时 100 ms 档 `catchUps: []`（未追尾）⇒ 闭合证据由 2000 ms 档 + 夹具承担（V2）。
> 6. **回归面通过**：T47-F1 4/4、工具链路 5/5、轮末同会话两轮无串味、揭示每 tick +5 与追尾后继续、门禁逐项真实值（`0 / 0 / 1 / [] / 0 / 0 / 0`、16 files / 179 passed）。
> 7. **越界与同树**：只改 2 个声明文件、其余与 t54/t51 基线逐字节相同、无新增 `eslint-disable`；现树与 t58/t59 的五份快照**完全一致** ⇒ 全部证据落在同一棵树上（聚合 `e5653c9e4c9bc969995f6615a40ce9e1ca9dbb99`，83 文件）。
>
> **本报告只认证**：`chatStore.ts = 3c4edd11171b4d0f517b05fbaab1be43dce5c5c8`（22970 B）与 `chatConfirm.test.ts = e82e5d2ef624`（40954 B）在树 `e5653c9e…` 上的修复与证据；未对 1.0.5 打包态作任何断言（属发布波次）。

---

## 12. addendum（captain 派单上下文并入 + 一处版本号更正）

> 本节为**尾部追加**，§0–§11 未改。t62 已于前一轮以 `completed`（verdict=`pass`）收口，`claim` 被平台正确拒绝（"task status cannot move from completed to claimed"）⇒ 本节与消息为唯一呈报通道。

1. **派单上下文（captain 提供，记录在案）**：`t59` 判 `failed` ⇒ 依赖它的 `t60` 永久不可解锁、`t61` 随之作废；改由 **`t62`（本审查）+ `t63`（发布）** 承接。本报告**未认领、未引用 `t60`/`t61`** ✅。
2. **版本号更正（影响 §10-V1 与 §11 末句的表述）**：本报告撰写时仓内 `package.json` = **1.0.5**，故 V1 写的是"1.0.5 打包态冒烟"；captain 现称承接的发布为 **1.0.6** ⇒ **V1 的正确读法**是「**下一次发布产物**（当时记作 1.0.5，现为 1.0.6）的打包态冒烟应顺带记录同一份 `(t, rawLen, shown)` trace」。**结论不变**：已安装的 1.0.4 仍是**修前**代码，不能顶替该验证。
3. **文件命名（已按 captain 后续更正登记）**：t62 契约文本写的是 `T63-H1-REVIEW.md`；captain 随后更正 **正确/首选文件名为 `T62-H1-REVIEW.md`**（与任务号一致），并明确「两条我都接受，只要在 output 里注明实际路径」。**实际路径 = `.devdata/t7-review/T63-H1-REVIEW.md`（即本文件）**，已在 t62 的 `output`（终态，不可再改）中注明；为避免同一份审查出现两个副本，**不再新建 `T62-H1-REVIEW.md`**，本条即两份命名之间的唯一对照登记。
4. **captain 列出的 t59 实质读数与未取证项，我均已独立复核并按其要求处置**（逐条对应）：

| captain 列出项 | 我的处置 |
|---|---|
| 两档 100/2000 ms「主窗末条 = 迷你窗 = 落盘 = 期望全文」 | ✅ 我从原始 JSON 复核；**但** 100 ms 档 `catchUps: []`（未追尾）⇒ 已在 §3.3/V2 记为**非判别臂** |
| 副本级判别（我的 `t52-discrim/vitest.h1.config.ts` 8 passed） | ✅ 与我自己 t52 §13 的运行结果一致，并另核 t59 只读引用未改动我的副本（`cur` 仍 `920fcb05ac5d`） |
| T47-F1 4/4、工具链路 5/5、门禁 16 files / 179 passed | ✅ 逐项从 `t59-t47f1-hidden4.json` / `t59-tools.json` / `summary-t59.json` 取值（§8） |
| 树 `chatStore.ts 3c4edd11171b` / 聚合 `e5653c9e…` 前后同值 | ✅ 我另与 t58/t59 的**五份快照**逐文件比对 ⇒ 完全一致（§0） |
| 未取证项：`visible` 前置、轮末边界严格形态、打包态 | ✅ 已按此表述（§5.2、§10-V1、verdict 末句） |
| **t59 自报探针缺陷一处**（isolation 断言硬编码轮次号） | ✅ **如实引用为探针缺陷、不作产品信号**（§8 表格该行）；其底层数据 `round2HasRound1Text=false`、第 3/4 轮各自全文满足判据 |
5. **对我 §5 结论的再次确认（captain 明确"允许不同意"）**：**同意采纳 hidden 下的实质证据（裁决 (a) 成立）**，但**不同意**其理由中的「hidden 不弱于 visible」这一**一般性**表述 —— hidden 可能通过节流**抬高**追尾阈值从而**掩盖**该缺陷（t57 早期实测 tick ≈1 s）；t59 之所以仍成立，是因为其 hidden 档**实际发生了 2 次追尾**（未被掩盖），且修前 visible/未节流已由 t57 自然状态臂独立证伪、修后为与可见性无关的代码级不变量。**是否需补前台证据：建议补（并入下一次发布的打包态冒烟），但不阻塞本 verdict。**
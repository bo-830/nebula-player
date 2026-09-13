# T59 —— H1 修复复验（verifier 独立运行期）

> **判定：H1 已修复（可判别、无回归）**。⚠️ **一处必须随结论阅读的偏差**：两档慢滴注跑在 `visibilityState='hidden'` 下（**未能取得 acceptance 要求的「前台 visible」前置**，原因见 §4），但该条件比要求**更严**（正是 T47-F1 的暴露条件），且两档都真实发生了追尾后仍收全 —— 故结论不被削弱，偏差如实记录。

## 1. 门禁（逐项值，stamp `2026-09-13T13:48:03.125Z`）
`lint.exitCode=0`、`totalErrors=0`、`totalWarnings=1`、`filesWithErrors=[]`、`typecheck.node=0`、`typecheck.web=0`、`tests.exitCode=0`、**179 passed / 16 files**（基线 176 + t58 新增 3 例，**不降**）。

## 2. 运行期核心场景（两档慢滴注）—— 实质通过
| 档 | 主窗末条 assistant | 落盘 `chat.json` | 迷你窗气泡 | 三者逐字一致 | 全文 |
|---|---|---|---|---|---|
| **100 ms** | `第1轮-甲段。第1轮-乙段。第1轮-丙段。` | 同左 | 同左 | ✅ | ✅ |
| **2000 ms** | `第2轮-甲段。第2轮-乙段。第2轮-丙段。` | 同左 | 同左 | ✅ | ✅ |

网关实际写出：100 ms 档 `1/104/214 ms`；2000 ms 档 `0/2007/4015 ms`；`errors400=[]`。

> **⚠️ 证据分级更正（采纳 t62 审查意见）**：**100 ms 档并未发生追尾**（`catchUps: []`、`grewAfterCatchUp: false`）⇒ 它是**非判别臂**，只证明"短间隔不截断"。**H1 的闭合证据由 2000 ms 档（`catchUps=2`、`7/7` 后 `rawLen` 继续增长 7→14→21）+ t58 夹具承担**。请勿引用为"两档均判别"。

**trace（`t: rawLen/shown`）—— 修复签名清晰可见**：
- 100 ms：`47355.5:7/0 → 47456:14/0 → 47564.4:14/5 → 47567.7:21/5`（追尾未发生，delta 连续被接受）
- **2000 ms：`57391.1:7/0 → 57566:7/5 → 57569.4:7/7`（追尾 #1，shown 追上 rawLen）→ `59399:14/7`（追尾后 rawLen **继续增长** ⇒ 未再被守卫丢弃）→ `59554.8:14/12`（揭示重启并继续）→ `60559.8:14/14`（追尾 #2）→ `61406.1:21/14`（**再次继续增长**）**
⇒ 正是 t58 修法（追尾只停揭示、不使流失效）的预期轨迹；修前此处会冻结在 `7/7`（对照见 §3）。

## 3. 判别性（副本级，`src/**` 未触碰）
**修前侧（我亲自执行 reviewer 的夹具，非采信转录）**：
`npx.cmd vitest run --config .devdata/t7-review/t52-discrim/vitest.h1.config.ts` → **8 passed**，逐行：
`pre/100ms → AAAA 截断`、`cur/100ms → AAAA 截断`、`noclose → AAAABBBB`、`noguard → AAAABBBB`；`pre/2000ms → AAAA 截断`、`cur/2000ms → AAAA 截断`、`noclose/noguard → AAAABBBB`。
其中 `pre`/`cur` 均为 `920fcb05ac5d`，行内证据 `maxRawLenSeen=4`（追踪 `0.2:4/0 → 30.9:4/4 → 2075.3:0/4` 后 settle）⇒ **修前必截断**。
**修后侧**：§2 运行期两档全文 + 门禁 179 passed（含 t58 的 3 例判别用例）。
**副本来源（按要求注明）**：修前版本取自 **reviewer 证据目录** `.devdata\t7-review\t52-discrim\cur`（`920fcb05ac5d`，20600 B），**只读引用、非我重建**；取证前后 sha1 **同为** `920fcb05ac5d873f609ac84bb36ca806ffea61b7`（未被改动）。

## 4. ⚠️ 偏差与未取证（如实，不冒充）
1. **`visible` 前置未取得**（acceptance #2 明示要求）：发送前读到 `visibilityState='hidden'`（`screenX/screenY=-16000`，Chromium 的隐藏窗口哨兵；应用用 `hide()` 隐藏到托盘，无持久化 bounds 文件）。三种手段均无法恢复：Win32 `SetWindowPos(SWP_SHOWWINDOW)`+`SetForegroundWindow`（位置未变）、应用自身 `windowMaximizeToggle()`（位置回到 `0,0`、`hasFocus=true`，但 `visibilityState` 仍为 `hidden`）。**故两档均在 hidden 下取得**；该条件更严（T47-F1 的暴露条件），且追尾真实发生（2 次）后仍收全。
   *补充参照*：t57 的**自然状态**臂（`visible`、tick 21–24 ms、+44 ms 追尾）已证明节流不是触发必要条件；本轮 hidden 臂补齐「追尾后仍能接收」。
2. **轮末边界**：运行期我构造的是**同会话连续两轮**（`第3轮` 后接 `第4轮`）⇒ 第 4 轮气泡只含自身全文、**不含第 3 轮任何文本**、落盘一致（`t59-isolation.json`）。acceptance 原文的严格形态（「第 N 轮的 delta 在 N 轮结束**之后**才到达」）由 **t58 的夹具用例**覆盖（其自报第 3 例），**我未独立重跑该严格形态** —— 记为未独立取证。
   *探针缺陷自查*：我的断言把轮次号硬编码为 `第2轮`，而 mock 的序号跨组累加（实际为 `第4轮`），故断言显示 `ownText=false`；**底层数据满足判据**（无残留 + 落盘一致），已在报告更正，非产品问题。
3. **打包态未取证**（本轮全为 dev 运行期）。
4. 打字机观感：由 §2 trace 佐证（每 tick 5 字符：`0→5`、`7→12`、`12→14`；追尾后停止继续揭示但**仍能接收**后续文本）。

## 5. 不回归
| 项 | 结果 |
|---|---|
| **T47-F1**（hidden + 迷你窗代理 + 纯文本） | **4/4** 通过，主窗与迷你窗逐字一致、无「（无回复）」 |
| **工具链路** | **5/5**：`controlPaused=true`（主窗 `isPlaying=false`）、`parkedNotExecuted=true`、`barInMini=true`（迷你窗含确认执行/取消）、`cancelKept=true`、`confirmRemoved=true` |

## 6. 树钉版
- 取样时 `chatStore.ts = 3c4edd11171b4d0f517b05fbaab1be43dce5c5c8`，22970 B ⇒ **与 t58 声明的修复后值一致**（无需回报）。
- 聚合 `e5653c9e4c9bc969995f6615a40ce9e1ca9dbb99`（83 文件，newest `2026-09-13T13:43:18.746Z`），**取证前后同值**。
- reviewer 修前副本前后同 sha1（§3）。未改 `src/**`（只新增 `.devdata\t59-evidence\**` 与快照 `t59-pre/post-snapshot.json`）。

## 7. 实例纪律
唯一 owner：**npm PID 27140**（detached + PID 落盘 `dev-pid.txt`），用毕 `taskkill /T`；**收尾三查：electron=0 / nebula-player=0，5173/5174/9222/9223 全 FREE**；`settings.json` 按字节还原至 `7FCA6DCD1A78060BB467A3ABF8F180C9CE42B99D`；他人进程未触碰（起实例前已确认无占用）。

## 8. 产物
`t59-drip-100.json`、`t59-drip-2000.json`、`t59-isolation.json`、`t59-t47f1-hidden4.json`、`t59-tools.json`、`t59-summary.json`、`mock-llm-t59.mjs`、`t59-verify.mjs`、`dev-t59.log`、`settings-before.json`、`prefix-copy-sha1-before.txt`、`prefix-h1-run-log-copy.txt`（reviewer 夹具运行日志的只读副本）。

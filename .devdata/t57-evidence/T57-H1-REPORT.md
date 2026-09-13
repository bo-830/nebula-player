# T57 —— H1 慢滴注探针（结论：**可达且影响用户 ⇒ 应为发布 blocker**）

> **一行结论**：把同一回答分 3 段、段间 **2 s** 滴注时，回答**被截断为第 1 段**，主窗 / 迷你窗 / 落盘 `chat.json` **三处同样截断**；1 s 及更短间隔不触发。触发条件是「揭示游标追尾 ⇒ `closeStream()` 清空 `streamConvId` ⇒ 其后 delta 被 `:375` 守卫丢弃」，与 reviewer 的静态 H1 判定**一致**。
> **⚠️ 同时发现一件必须立刻上报的排期事实**：**1.0.5 已被构建并安装**（见 §6），而 t53 按 captain 令处于暂缓 —— 且该已安装的 1.0.5 渲染 bundle **内含 H1 代码**（§6 抽取证据）。

## 1. 判据与工装
- 判据（按 captain 口径）：**主窗 `chat.messages` 末条 assistant / 迷你窗 `.chat-msg.ai` / 落盘 `chat.json` 三者正文**，与预期全文逐字比对；**不用** `streamRaw` 长度。
- mock：`.devdata/t57-evidence/mock-llm-t57.mjs`（9999）——同一回答拆 3 段（`第一段滴注内容。`/`第二段滴注内容。`/`第三段滴注内容。`），段间 `POST /__gap?ms=`；`/__log` 记录**每段实际写出时刻**。
- 探针：`t57-h1-drip.mjs` —— 主窗**可见**、回合由**迷你窗代理**发起；记录**每一次游标追尾时刻**（`streamShown === streamRaw.length`）与**被接受的 delta 序列**。

## 2. 速率扫描（逐档逐字比对）

| gap | 落盘/主窗/迷你窗文本 | 段数 | 截断 | 接受的 delta 镜像 | 游标追尾 |
|---|---|---|---|---|---|
| **10 ms** | 全文 | 3/3 | 否 | 3 | 无 |
| **50 ms** | 全文 | 3/3 | 否 | 3 | 无 |
| **300 ms** | 全文 | 3/3 | 否 | 4 | 无 |
| **1000 ms** | 全文 | 3/3 | 否 | 5 | 无 |
| **2000 ms** | **仅 `第一段滴注内容。`** | **1/3** | **是** | 3（仅第 1 段） | **有：t=+1296 ms** |

（网关实际写出时刻：300 ms 档 = 1/306/616 ms；2000 ms 档 = 0/2015/4024 ms。）

## 3. 截断时刻线（2000 ms 档，直接取证）
```
+0.0 ms   delta#1 到达 → 守卫放行 → rawLen=8，打字机启动
+300 ms   shown 0→5（打字机一走）
+1296 ms  shown 5→8 ⇒ shown === rawLen ⇒ **追尾 → closeStream() → streamConvId=''**
+2015 ms  delta#2 到达 → 守卫 `streamConvId !== rid` ⇒ **丢弃**（镜像无记录）
+4024 ms  delta#3 到达 → **丢弃**
+4027 ms  busy→false，落 `content='第一段滴注内容。'`（被 `.trim()` 后落库）
```
证据：`h1-gap-2000.json`（`mirrorEvents` / `cursorCatchUps=[144801.1]` / `gateway.writtenAtMs`）、`h1-gap-1000.json`（无追尾，5 个镜像全接受）。

## 4. 阈值为何在本机是 ~1–2 s（**这决定真实可达性，必读**）
本机实测：**名义 22 ms 的 interval 实际以 ~1000 ms 触发** —— `t57-existing-and-tick.json` 记录的 tick 间隔为 `1018, 1006, 1000, 1000, 15, 973` ms（渲染进程被重度节流，主窗被置顶迷你窗遮挡/后台）。
⇒ 追尾耗时被拉长到 **~1.3 s**，故 1 s 档擦肩而过、2 s 档触发。
⇒ **真实用户环境下打字机按 22 ms 正常走时**，8 字段的追尾只需 **≈3 tick ≈66 ms** ⇒ **阈值降到 ~70 ms 量级**，而真实网关在回答中途停顿数百 ms～数秒**很常见** ⇒ **H1 在实际使用中可达，且后果是回答被永久截断并落库**。本机 1–2 s 的阈值**只是被节流抬高了**，不是安全边界。

## 5. 既有性复核（**本轮未能独立完成，如实标注**）
- 我抽取的是**已安装**的 bundle ⇒ 但安装位现在已是 **1.0.5**（§6），**不是 1.0.4** ⇒ 因此这次抽取**不能**证明"t47 之前就有"。抽取结果显示该 bundle 含**完整 H1 代码**（`streamConvId`×5、`closeStream`×6、22 ms 打字机、追尾 `closeStream()` 调用、`+5` 步进），并**同时含 t50 的 `next()` 修复**（`await new Promise(r=>setTimeout(r,0)); return accumulated`）—— 说明 1.0.5 里 **F1 已修、H1 未修**。
- **未取证**：从 `dist/nebula-player-1.0.4-setup.exe`（118,119,624 B，仍在盘上）解出 1.0.4 的 bundle 做逐字比对 —— 需 NSIS + 7z 两段解包，本轮未做。**因此"既有缺陷"这一点我维持 reviewer 的静态结论、但不为其背书**（无独立证据）。
- 可确证的一点（属后果而非归属）：**该 H1 代码确实存在于已安装的 1.0.5 产物中**。

## 6. ⚠️ 排期事实（超出 t57 范围，但必须上报）
| 事实 | 值 |
|---|---|
| `package.json` version | **1.0.5**（`chatStore.ts` 仍 `920fcb05ac5d`，未变） |
| 已构建产物 | `dist/nebula-player-1.0.5-setup.exe` = **118,123,909 B**，mtime `12:55:05Z`；`latest.yml` 同步刷新（version 1.0.5，sha512 `XmxSntaq…`，size 一致） |
| 已安装 | `%LOCALAPPDATA%\Programs\nebula-player` **ProductVersion = 1.0.5.0**；`resources/app.asar` = 26,331,161 B，sha1 `6E16506719591DB3B71B2CA01F2E71A9C86A4123`，mtime `12:54:58Z`（1.0.4 时为 26,305,579 B / `D45D823F…`） |
| 运行中 | **`nebula-player` 进程 6 个、9223 在监听** —— **不是我的**（我的 dev 实例 PID 17884 在我收尾前已被他人终止），我未触碰 |
| 我的动作 | **不是我做的**：我全程按 captain 令未 claim/未开工 t53（此前只发生过一次误 claim，已由 captain 收回） |

**⇒ 结论性提示**：H1 已在**已安装的 1.0.5** 中；若 1.0.5 已对外发布/交付，H1 即为**已发布缺陷**；修复方案（打字机只停自己、不清 `streamConvId`；补 ≥100 ms 间隔的判别性用例）与验证口径由 captain 排期。

## 7. 纪律与产物
- 未改 `src/**`（只新增 `.devdata/t57-evidence/**` 与快照 `.devdata/t13-r2-evidence/t57-pre-snapshot.json` / `t57-post-snapshot.json`）；`settings.json` 按字节还原至 `7FCA6DCD1A78060BB467A3ABF8F180C9CE42B99D`。
- 实例：npm PID **17884**（detached + PID 落盘，唯一 owner）；收尾三查 **electron=0**、5173/5174/9222 FREE（9223 为他人占用）。
- 探针缺陷自查：`t57-tick-and-existing.mjs` 首跑因渲染进程**重度节流**（interval 实际 1 s/次）而挂起 120 s 被超时终止 —— 已改为**页内硬上限 8 s** 的版本，重跑成功（`t57-existing-and-tick.json`）。
- 产物：`h1-gap-{10,50,300,1000,2000}.json`、`h1-summary.json`、`t57-existing-and-tick.json`、`t57-installed-bundle.json`、`t57-bundle-region.json`、`mock-llm-t57.mjs`、`t57-h1-drip.mjs`、`t57-existing-and-tick.mjs`、`t57-installed-bundle.mjs`、`t57-bundle-region.mjs`。

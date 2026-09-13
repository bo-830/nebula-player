# 日志判据更正与两份日志的完整分析（dev vs 打包态）

- 采集：**verifier**，本地 19:44–19:46（UTC 11:44–11:46）
- 触发：captain 指出「dev 日志在 `.devdata/user/logs/`，`%APPDATA%` 是打包态」，要求查 19:00–19:07 的尾部原文
- 结论：**captain 的目录更正正确；但"有没有写日志"这条判据本身不可用** —— 见 §2

## 1. 两份日志的现状

| 日志 | 路径 | 大小 | 最新写入 | 内容 |
|---|---|---|---|---|
| **dev 态** | `.devdata/user/logs/nebula-20260912.log` | 15534 B | `11:42:42.986Z`（= 当前实例） | 149 行 |
| **打包态** | `%APPDATA%\nebula-player\logs\nebula-20260912.log` | 4686 B | `11:42:17.356Z` | 57 行 |

`src/main/index.ts:20` 的 `app.setPath('userData', join(process.cwd(),'.devdata','user'))` 确认 dev/打包态写不同目录。

## 2. **判据更正（重要）**：应用日志无法判定"启动早期即退"

dev 日志全天只有三种行：
- `--- NEBULA Player boot v1.0.3 win32 x64 ---`（61 次）
- `services initialized; update feed=…`（58 次）
- `[error] [renderer] [vite] …`（30 次，全部是渲染进程 HMR 热更失败）

而真正表示"走到窗口加载"的那一行是 **`console.log('[main] window loaded')`（`src/main/index.ts:256`）—— 它是 `console.log`，只进 stdout，不落这个文件**（同类还有 `:227` argv、`:250` `[renderer:N]`、`:253` renderer gone、`:267` probe）。
⇒ **在 `.devdata/user/logs` 里，"健康跑 61 秒"与"services init 后 10 毫秒被杀"留下的是完全相同的一行。**
⇒ 正确的判据必须来自 **launcher 捕获的 stdout**（我写的 `verify-crash-capture.mjs` 落 `.devdata/t6-evidence/dev-capture.log`）。只看应用日志会同时产生假阳性与假阴性。

## 3. 对 captain 具体问题的回答（19:00–19:07 本地 = 11:00–11:07Z）

**该时间段有记录，且每一次都写了两行**（原文逐字）：

```
[2026-09-12T11:01:52.982Z] [info] --- NEBULA Player boot v1.0.3 win32 x64 ---
[2026-09-12T11:01:52.997Z] [info] services initialized; update feed=http://127.0.0.1:8888/
[2026-09-12T11:03:03.261Z] [info] --- NEBULA Player boot v1.0.3 win32 x64 ---
[2026-09-12T11:03:03.271Z] [info] services initialized; update feed=http://127.0.0.1:8888/
[2026-09-12T11:04:49.838Z] [info] --- NEBULA Player boot v1.0.3 win32 x64 ---
[2026-09-12T11:04:49.850Z] [info] services initialized; update feed=http://127.0.0.1:8888/
[2026-09-12T11:05:08.105Z] [info] --- NEBULA Player boot v1.0.3 win32 x64 ---
[2026-09-12T11:05:08.116Z] [info] services initialized; update feed=http://127.0.0.1:8888/
[2026-09-12T11:05:24.492Z] [info] --- NEBULA Player boot v1.0.3 win32 x64 ---
[2026-09-12T11:05:24.506Z] [info] services initialized; update feed=http://127.0.0.1:8888/
[2026-09-12T11:06:22.237Z] [info] --- NEBULA Player boot v1.0.3 win32 x64 ---
[2026-09-12T11:06:22.245Z] [info] services initialized; update feed=http://127.0.0.1:8888/
[2026-09-12T11:09:46.017Z] [info] --- NEBULA Player boot v1.0.3 win32 x64 ---
[2026-09-12T11:09:46.030Z] [info] services initialized; update feed=http://127.0.0.1:8888/
```

⇒ 「本轮 19:0x 的启动根本没写日志」**不成立**；这 7 次都**越过了 `initLogging()` 与服务初始化**。
⇒ 「死于 logging 初始化之前」这一支假设**被否证**（但如 §2，也不能反推"活到了 window loaded"）。

## 4. 全天真正的"启动早期即退"签名（唯一一处）

全部 149 行里，**只有 3 次 boot 没有后续 `services initialized`**：

| 行 | 时间戳 | 本地 |
|---|---|---|
| L23 | `2026-09-12T07:11:56.144Z` | 15:11:56 |
| L28 | `2026-09-12T07:20:39.666Z` | 15:20:39 |
| L29 | `2026-09-12T07:23:15.023Z` | 15:23:15 |

3 次集中在 11 分钟内，且**均无任何异常行**。这是今天唯一一处"进程在 `services initialized` 之前消失"的痕迹（banner 与 services 行相隔通常仅 10–14 ms，故等价于"启动后 ~10 ms 内被终止"）。

## 5. 异常统计（dev 日志全天）

| 项 | 计数 |
|---|---|
| `uncaughtException` / `unhandledRejection` | **0** |
| `[warn]` | **0** |
| `[error]` | 30（全部 `[renderer] [vite]` HMR 热更失败：11:47:47 前后 `sleepFiresOnEnded` 瞬态 ×28、09:04:04 MiniPlayer ×2） |

⇒ dev 态全天**没有任何主进程异常**，与「启动期崩溃已消除」一致；也说明"启动早期即退"**在应用侧没有留下可归因的抛错**。

## 6. 意外收获：打包态日志本身就是 **t22+t23 的打包态前后对照**（对 t9 直接可用）

`%APPDATA%\nebula-player\logs\nebula-20260912.log`（57 行）：

**修复前（抛错）—— 全部带完整的 `trim` 堆栈**
| 时间戳 | 二进制路径 | boot→抛错间隔 |
|---|---|---|
| `02:38:33.995Z` | `AppData\Local\Programs\nebula-player\...\app.asar\out\main\index.js:1430:47`（**已安装 1.0.2**） | 8.1 s |
| `03:15:12.346Z` | 同上（1.0.2） | 8.1 s |
| `03:17:23.182Z` | 同上（1.0.2） | 8.1 s |
| `03:51:01.312Z` | 同上（1.0.2） | 8.1 s |
| `04:36:35.417Z` | 同上（1.0.3） | 8.1 s |
| `07:15:10.291Z` | `dist\win-unpacked\...\app.asar\out\main\index.js:**1453:47**` | 8.2 s |
| `10:43:37.041Z` | 同上（1453:47） | 8.1 s |
抛错原文：`uncaughtException: TypeError: Cannot read properties of undefined (reading 'trim')` @ `Timeout._onTimeout`。

**修复后（零异常）—— 配置形状完全相同（`feed=(none)`，即**真实的旧配置缺 `updateURL`**）**
`10:46:12.147Z`、`10:48:39.363Z`、`10:52:32.312Z`、`10:55:02.057Z`、`11:41:08.973Z`、`11:41:38.767Z`、`11:42:17.356Z` —— **7 次 boot，全部 `services initialized; update feed=(none)`，其后零异常**（每次 boot 后至少观察 8 s 以上：11:41:08 与 11:41:38 相隔 30 s 无抛错）。

⇒ **t22+t23 在打包态的前后对照成立**：同一旧配置形状下，修复前 7 s 必抛 `trim`，修复后 7/7 干净。
⇒ **对 t9 的直接结论**：打包态 `%APPDATA%\nebula-player\settings.json` **本来就没有 `updateURL`（全程 `(none)`）** ⇒ t9 的升级路径验证**不需要造夹具**，直接跑真实用户配置即可（但仍需按你的要求存活 ≥20 s 并确认补齐键落盘）。

## 7. 顺带确证：被误停的那个实例是 **t31（ai-tools）的**，不是我的

dev 日志里全天才 3 次 `update feed=(none)`：

| 时间戳 | 含义 |
|---|---|
| `11:23:54.328Z` | 用 1.0.2 旧形状夹具（缺 `updateURL`）启动 |
| `11:24:54.165Z` | 同上 |
| **`11:37:26.618Z`** | **同上** —— 正是被 audio-engine 误停的那个实例的启动时刻 |

`(none)` 要求 `settings.json` 里 `updateURL` 缺失/为空 —— 这是 **t22 / t27 / t31 的"旧配置升级路径"夹具实验**（t31 的契约明确授权其 `Start-Process` 起唯一实例、并前后各取一次指纹）。**我的任何探针都没有修改过 `settings.json`**，也没有起过实例（`scripts/**` 中唯一能起实例的是 `verify-crash-capture.mjs:31`，其输出文件 `dev-capture.log` 的 mtime 为 18:57:25，早于该实例 40 分钟）。
⇒ 归属结论有据可查；此处仅作留档，不要求追责。

## 8. 归档口径（采纳 captain 裁定，并附本报告的支撑）

「启动早期即退」记为 **dev 环境工件（未定性）**、**不判产品缺陷**：
- 支撑：dev 日志全天 **0** 主进程异常 ⇒ 该现象**没有应用侧抛错可归因**；
- 与"频繁 start/stop + `out/` 重建 churn"强相关；
- 「重负载音频探针期间死亡」独立存在、与多实例无关，记为「环境/健壮性观察（未定性）」，**最终以 t9 打包态长跑为准**（打包态无 vite、无重建 churn、不嵌套探针作业）。

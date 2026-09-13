# RELEASE 1.0.5 — 迷你窗新形态（展开态搜索 + AI 聊天）与 hidden 代理链路修复

- 任务：**t53**（迷你窗 I：1.0.5 集成发布），`attempt_id = 6ed868f3-742e-494e-8e23-ded291bcf505`
- 执行者：ui-features
- 报告时间：2026-09-13T13:35Z 左右（本地 21:35）
- **重要**：本轮之后 captain 确认 user-visible 缺陷 **H1**（打字机揭示游标追尾后清 `streamConvId` ⇒ 后续 delta 被守卫丢弃 ⇒ AI 长回答截断并落库）**存在于 1.0.5 中**，**1.0.5 已被 1.0.6 取代**（t58 修复 → t59 复验 → t60 审查 → t61 发布）。本报告只记录「已完成的发布步骤与实测事实」，不主张 1.0.5 可发布。

---

## 0. 构建修订（可追溯性）

| 项 | 值 |
|---|---|
| 指纹命令 | `node scripts/snapshot-fingerprint.mjs` |
| **src 聚合 sha1（构建时）** | **`83d13b16706a441c5d4f331d00ad86d12568b343`**（83 文件） |
| 该修订的 newest src mtime | `2026-09-13T12:48:33.832Z`（= 本地 20:48:33） |
| 稳定性采样 | 连续 6 次采样（15s 间隔）完全一致 ⇒ 构建目标为稳定修订 |
| `package.json` 版本 | 1.0.4 → **1.0.5**；sha1 `C2FDC56B4A30F652D43A862A0123F951ACCAD893` → **`BB38C9D7CC50E5556F222C2BC2CAE0095B9993A1`** |
| 当前树（报告时） | `7229181ae0f3911e61a6b396a8ecb9946b2b6de8` —— **已偏离**（t58 的 H1 施工：`chatStore.ts` 21:00:55、`chatConfirm.test.ts` 21:34:00） |

> 说明：t54（薇拉 Vela 人格）在我开工前 2–8 分钟改过 `tools.ts`/`ChatPanel.tsx`/`chatConfirm.test.ts`/`MiniChat.tsx`；我等的 90s 稳定窗口通过后才 bump 版本并构建，故 **1.0.5 的内容 = 上述 `83d13b16…` 修订**（含 t54 的改动，未含 t58 的 H1 修复）。

## 1. 构建（自建，不复用验证期 dist）

镜像变量：`ELECTRON_MIRROR=https://cdn.npmmirror.com/binaries/electron/`、`ELECTRON_BUILDER_BINARIES_MIRROR=https://registry.npmmirror.com/-/binary/electron-builder-binaries/`

`npm.cmd run build:win` → **exit 0**（后台作业 `pwsh-11`，日志已采集）。自建链路：`npm run build`（typecheck + electron-vite）→ `electron-builder --win`。

构建产物（自建，全部为本轮 20:54–20:55）：

| 文件 | 大小 | 时间 | sha1 前 12 |
|---|---|---|---|
| `dist/nebula-player-1.0.5-setup.exe` | 118,123,909 B（112.7 MB） | 20:55:05 | `A529B33F08AD` |
| `dist/nebula-player-1.0.5-setup.exe.blockmap` | 123,421 B | 20:55:11 | `AD65E87AF0A3` |
| `dist/latest.yml` | 355 B | 20:55:11 | `15F0046E24BB` |
| `dist/win-unpacked/resources/app.asar` | 26,331,161 B | 20:54:29 | `6E1650671959` |
| `dist/win-unpacked/nebula-player.exe` | 211,232,768 B | 20:54:30 | `CA58355110FB` |

`latest.yml`：`version: 1.0.5` / `path: nebula-player-1.0.5-setup.exe` / `releaseDate: 2026-09-13T12:55:11.479Z`，sha512 与产物同步刷新。
渲染层 bundle 名与构建日志一致：`index-scMuNDEJ.js`（839,015 B）/ `index-aOh5m7Hj.css`。

与 1.0.4 对比：setup.exe **+4,285 B**；安装态 app.asar（26,305,579 → 26,331,161）**+25,582 B**。

## 2. asar 复核

`node scripts/verify-asar.mjs dist/win-unpacked/resources/app.asar` → **exit 0**

```
totalEntries: 4096
topLevel: node_modules 4089 / out 5 / package.json 1 / resources 1
scriptsEntries: 0   devdataEntries: 0   srcEntries: 0   testFiles: 0
```
四项归零 ✅。asar 内 `package.json` 版本 = **1.0.5**、`main = ./out/main/index.js`；仓库 `package.json` 未被污染（sha1 仍 `BB38C9D7…`，提取时用临时 CWD 规避了 t43 踩过的 `extract-file` CWD 覆盖陷阱）。

**新功能字面量（解包正式 asar 后 grep）**

| 字面量 | main `out/main/index.js` | renderer `out/renderer/assets/index-scMuNDEJ.js` |
|---|---|---|
| `computeMiniBounds` | 2 | —（仅主进程用） |
| `setMiniExpanded` | 3 | — |
| `chat:proxy` | **4** | — |
| `mini:expand` | 2 | — |
| `mini:expanded` | 1 | — |
| `MINI_EXPANDED`/`MINI_COLLAPSED` | 8 | — |
| `mini-search-zone` / `mini-chat-input` / `data-expanded` | — | 各 1 |
| `曲库为空，先在主窗口添加音乐` | — | 2 |

**旧闩锁痕迹**：`latch` / `latchRoots` / `allowedRootsLatch` 全为 **0**；`will-redirect` 1 处，上下文为 `contents.on("will-redirect", guard);`（就是 t33 的守卫，非残留）。

渲染层未见 `chat:proxy:*` **字符串**，仅 `proxy` 6 次 —— 通道名在 preload 里是字符串、在渲染层是 `window.api.chatProxyCmd/chatProxyState/...` 的**标识符**，压缩后仍保留，属预期。

## 3. 覆盖安装

| 项 | 值 |
|---|---|
| 命令 | `Start-Process dist\nebula-player-1.0.5-setup.exe -ArgumentList '/S' -Wait` |
| 安装器 PID | **33664**（已退出） |
| **exit code** | **0** |
| 耗时 | **19.5 s** |
| 安装位 | `%LOCALAPPDATA%\Programs\nebula-player` |
| `ProductVersion` | **1.0.5.0**（`FileVersion 1.0.5`，`ProductName NEBULA Player`） |
| 安装副本 app.asar sha1 | `6E16506719591DB3B71B2CA01F2E71A9C86A4123` |
| dist 产物 asar sha1 | `6E16506719591DB3B71B2CA01F2E71A9C86A4123` ⇒ **SAME** |
| 已装 exe vs dist exe sha1 | 均 `CA58355110FB…` ⇒ **SAME** |

体积对比：1.0.4 安装态 26,305,579 B → 1.0.5 安装态 26,331,161 B（+25,582 B）。

## 4. 打包态迷你窗冒烟

以 `--remote-debugging-port=9223` 启动**已安装的 1.0.5**（PID **4752**，已终止）。主窗口 URL = `file:///…/Programs/nebula-player/resources/app.asar/out/renderer/index.html` ⇒ **确实从 asar 加载**。

### 4a. 按钮路径（真实用户路径）—— **11/11 全绿**
驱动 `packaged-mini-button2.mjs`（每次点击前先读 `data-expanded`，消除相位歧义），exit **0**：

| 断言 | 结果 |
|---|---|
| 打包态主窗从 asar 加载 | ✅ |
| 起始收起 360×128 + `data-expanded=false` | ✅ `w=360 h=128` |
| 点展开 → 窗口 360×**540** | ✅ `w=360 h=540` |
| 点展开 → 搜索框真的渲染 | ✅ `searchZone=true searchInput=true` |
| 点展开 → 聊天区真的渲染 | ✅ `chatPane=true chatInput=true` |
| 点展开 → `data-expanded=true`，head/lyric/controls 保留 | ✅ |
| 点收起 → 回到 360×**128** | ✅ |
| 点收起 → 搜索/聊天区消失 | ✅ `searchZone=false chatPane=false` |
| 隐藏再打开 → 必为收起态 | ✅ `360×128 + flag=false` |

### 4b. API 路径（`window.api.miniSetExpanded`）—— 20/21（**1 项失败，已定位为 t45 信息缺口**）
驱动 `packaged-mini-probe.mjs`，exit 1。窗口几何全部符合（`miniSetExpanded(true)` 返回 `height:540`、实测 540×360；收起 128×360）；**失败项**：`expanded renders search input / chat pane / flag` = false。

**机制**：`src/main/mini.ts:65-76 setMiniExpanded()` 只 `setBounds`，**不发** `mini:expanded`；只有 `collapseMini()`（`mini.ts:79-82`）发 `mini:expanded(false)`。渲染层只从两处获知展开态：按钮自身的乐观更新、以及 `onMiniExpanded`。因此**任何外部调用** `miniSetExpanded(true)`（非按钮路径）⇒ 窗口变成 540 高但 UI 仍按收起态渲染（搜索/聊天区不出现）。

**可达性**：当前代码里 `miniSetExpanded` 的生产调用者**只有**渲染层按钮自身的 `toggleExpanded`（按钮同时本地置位），故对真实用户**不可达**；但对接方（t47 验收脚本、t45 契约的“返回实际生效尺寸供调用方校正”）一旦从主进程侧调用即复现。属**潜在缺陷 / 接口语义缺口**，建议由 mini 侧后续波次补 `setMiniExpanded` 内的 `forwardToMini('mini:expanded', expanded)`。
（另注：我的第一版按钮探针曾因相位错位误报 8/9，已用 `packaged-mini-button2.mjs` 纠正；`packaged-mini-button.json` 保留为过程证据。）

### 4c. 日志与未处理拒绝
打包态应用日志 `%APPDATA%\nebula-player\logs\nebula-20260913.log`：
```
[2026-09-13T12:57:36.035Z] [info] --- NEBULA Player boot v1.0.5 win32 x64 ---
[2026-09-13T12:57:36.052Z] [info] services initialized; update feed=(none)
```
`[error]` 计数 **0**、`unhandledrejection|uncaughtException` 计数 **0**；迷你窗渲染进程 `Runtime.exceptionThrown` 收集为空。

## 5. 进程级死亡观察（≥60s）

每 10s 采样一次，共 6 次（本地 20:58→21:00）：

| t+ | alive(nebula-player) | 主 PID | 日志 `[error]` |
|---|---|---|---|
| 10s | 6（主+renderer/utility） | 4752 | 0 |
| 20s | 6 | 4752 | 0 |
| 30s | 6 | 4752 | 0 |
| 40s | 6 | 4752 | 0 |
| 50s | 6 | 4752 | 0 |
| 60s | 6 | 4752 | 0 |

观察结束时实例已存活 **3.2 分钟**，CDP 仍有 2 个 target（主窗 + 迷你窗）。**结论：60s 窗口内无进程死亡、无异常日志。**

## 6. 已知限制（如实标注，未在打包态伪造）

1. **打包态曲库为空 ⇒ 搜索无结果、无曲可播**。实测 `%APPDATA%\nebula-player\library.json` 存在但 `tracks = 0`（是“根已配置但无曲”，不是文件缺失）。故本节**未**断言搜索→播放链路；该链路以 dev 运行期证据为准（t47 搜索→主窗播放 song-c、queueLen=4/index=0）。
2. **AI 往返需真实网关**，打包态未配置 ⇒ 未断言聊天往返；以 dev 运行期证据为准（t50/t51 hidden 代理 4/4 两端逐字一致）。
3. **未扫描用户真实曲库、未改写 settings.json**：实测 `%APPDATA%\nebula-player\settings.json` sha1 `49D39C5EBFD4243B1AF9E812E16DE69347678DE6`，与 t43 基线 `settings-post-upgrade.json` **逐字节相同** ⇒ 未被我触碰。
4. **H1 缺陷存在于 1.0.5**：captain 已确认（夹具 + 运行期双复现），故 1.0.5 由 1.0.6 取代。本报告的 4a/4b 迷你窗形态结论**不受 H1 影响**（H1 在 chatStore 的流式读取路径，不在窗口几何/面板渲染）。

## 7. 门禁

| 项 | 构建前（修订 83d13b16，权威，`summary-t53-pre.json`） | 报告时重跑 |
|---|---|---|
| `lint.exitCode` | 0（`errors=0`, `warnings=1`, `filesWithErrors=[]`） | 0（`1 problem / 0 errors / 1 warning`） |
| `typecheck:node` | 0 | **0** |
| `typecheck:web` | 0 | **2 —— 3 条 TS 错误，全在 `chatConfirm.test.ts`（t58 当前施工中）** |
| `tests` | 0：`16 files / 176 passed / 0 failed`（t51 基线 167，**不降**） | 未复跑（树已被 t58 改动，无发布意义） |

**说明**：报告时 `typecheck:web` 的红是 t58 的 H1 施工中间态（`chatConfirm.test.ts` 21:34:00 被写入，`DripStep[]` 类型未同步），**不在 1.0.5 产物内**（1.0.5 构建于 20:55，其自身 typecheck 为 0，见左侧列）。

## 8. 收尾（实例自起自关）

| 项 | 值 |
|---|---|
| 我启动的进程 | 安装器 PID **33664**（已退出）；打包态实例 PID **4752**（已 `win32_process.Terminate` 终止） |
| 我的实例末态 | `nebula-player` 进程 = **0**；端口 **9223 FREE** |
| 队友实例 | 21:00:44 由 `node_modules/electron` + `.devdata` user-data-dir 启动的 dev 实例（占 5173/9222）**非我所有，未触碰**；报告时该实例已自行退出（`electron` = 0） |
| **未终止他人进程** | ✅（仅终止自己启动的 PID 4752） |

## 9. 未取证项（不冒充）

1. **真机工作区夹取**未在打包态取（应用内无法改 OS workArea；t47 以副本复算替代）——本报告只证明「`miniSetExpanded(true)` 返回 540 且实际渲染视口为 360×540」，**未**证明小屏下被裁剪的路径。
2. **1.0.4 → 1.0.5 升级路径长跑**（t43 做过 settings 迁移取证）本轮未做，只做了 `/S` 覆盖安装 + 版本/哈希断言。
3. **搜索→播放、AI 往返**在打包态未断言（见 §6）。
4. `dist/` 内 1.0.0–1.0.4 历史安装包未清理（t53 未要求）。

## 10. 过程性记录（自查）

- 一次瞬时故障：`verify-lint-tests.mjs --label t53` 首跑被强制终止（exit `1073807364` = 0x40010004，日志 0 B），发生在 21:01:30（与队友 dev 实例重启同刻）。随后 `node -e` 健康检查正常，lint/typecheck 单独重跑成功 ⇒ 判定为环境瞬态，非仓库问题。已改为分项重跑并各自落盘。
- `@electron/asar extract-file` 的历史 CWD 覆盖陷阱：本轮全程在 `%TEMP%` 子目录内执行再复制，仓库 `package.json` sha1 未变（`BB38C9D7…`）。
- 探针脚本：`.devdata/release-evidence/packaged-mini-probe.mjs`（API 路径）、`packaged-mini-button2.mjs`（按钮路径，最终判据）、`packaged-mini-button.mjs`（首版，保留为过程证据）。

## 11. 产物清单（证据文件）

```
.devdata/release-evidence/
  RELEASE-1.0.5.md                  ← 本报告
  packaged-mini-probe.mjs / .json   ← API 路径（20/21）
  packaged-mini-button2.mjs / .json ← 按钮路径（11/11）★ 判据
  packaged-mini-button.mjs / .json  ← 首版按钮探针（相位错位，过程证据）
  asar-package.json                 ← asar 内 package.json（1.0.5）
  asar-1.0.5-main-index.js          ← 解包主进程 bundle
  asar-1.0.5-renderer-index.js      ← 解包渲染层 bundle
  asar-list-1.0.5.txt               ← asar 条目清单（4264 行）
  t53-smoke-pid.txt                 ← 打包态实例 PID（4752）
.devdata/t53-*.log                  ← 门禁与探针日志
```

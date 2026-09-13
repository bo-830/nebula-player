# RELEASE 1.0.6 —— 集成发布报告（verifier）

> **结论：1.0.6 已自建、校验、静默覆盖安装到本机（ProductVersion 1.0.6.0），asar 层已证明含 H1 修复且不含旧模式，1.0.5 内部版已归档。**
> **⚠️ 两项打包态 UI 冒烟未取证**（§5）：打包态慢滴注、打包态迷你窗形态与「薇拉 Vela」标题 —— 卡点为打包渲染进程的 DOM/可见性获取（详见 §5），**未用 dev 证据冒充**。故本任务以 **failed** 上报（8/11 通过、2 项未取证、1 项随之失败），交 captain 裁决是否重取。

## 1. 前置与锚点
- `t62`（H1 修复审查）= **pass / 0 blocker**；captain **GO** 已到（一并确认构建前置满足）。
- 构建锚点：`srcAggregateSha1 = e5653c9e4c9bc969995f6615a40ce9e1ca9dbb99`（83 文件，newest `2026-09-13T13:43:18.746Z`）—— 与 t58/t59/t62 同树。
- 起跑前占用检查：`electron=0 / nebula-player=0`，5173/5174/9222/9223/9999 全 FREE。

## 2. 版本（唯一源码侧改动）
| | sha1 | size | version |
|---|---|---|---|
| 改前 | `BB38C9D7CC50E5556F222C2BC2CAE0095B9993A1` | 2123 B | 1.0.5 |
| 改后 | `FB06321AFAEAC5155E18AEDEA30BF6BB5E2350FD` | 2123 B | **1.0.6** |

`Compare-Object` 逐行核对：**唯一差异即 version 行**（`<= 1.0.5` / `=> 1.0.6`）。改前备份 `.devdata/release-evidence/package-1.0.5.json`。

## 3. 构建（自建，不复用验证期 dist）
`ELECTRON_MIRROR` + `ELECTRON_BUILDER_BINARIES_MIRROR` 已设；`npm.cmd run build:win` **exit 0**，日志 `.devdata/release-evidence/build-win-1.0.6.log`。
| 产物 | 值 |
|---|---|
| `dist/nebula-player-1.0.6-setup.exe` | **118,124,012 B** @ `14:18:37Z` |
| `dist/nebula-player-1.0.6-setup.exe.blockmap` | 123,518 B @ `14:18:47Z` |
| `dist/win-unpacked/resources/app.asar` | **26,331,277 B** @ `14:17:50Z`，sha1 `0ACFB6CDCFB06CA685648F05936548E6872F43A9` |
| 构建前同文件（1.0.5 期） | 26,331,161 B @ `12:54:29Z` ⇒ **确系本次重建** |
| `dist/latest.yml` | **version 1.0.6**；声明 sha512 `y1co0ugC…SIg==` 与**独立复算逐字符相同**；size 118124012 一致 |

## 4. asar 断言（H1 修复证据）
解包正式 asar 的 `out/renderer/assets/index-DHrHGVU_.js`（831,337 B，header 解析法），命中计数：`streamConvId`×5、`closeStream`×5、**`stopRevealTimer`×2**。
`.devdata/release-evidence/t63-asar-assert2.json`（**6/6 pass，exit 0**）：
| 断言 | 结果 |
|---|---|
| `stopRevealTimer` 已定义且只 `clearInterval` | ✅ |
| **`stopRevealTimer` 函数体不含 `streamConvId`**（函数体域内断言） | ✅ |
| 打字机 interval 回调已定位 | ✅ |
| **追尾分支调用 `stopRevealTimer()`** | ✅ |
| **追尾分支不再调用 `closeStream()`**（旧 H1 模式缺失） | ✅ |
| 轮末 `unsub` 仍 `closed = true` + `closeStream` | ✅ |

`node scripts/verify-asar.mjs` → `totalEntries 4096`、**`scriptsEntries 0 / devdataEntries 0 / srcEntries 0 / testFiles 0`** ✅
*（自查披露：v1 断言脚本用 `streamShown>=` 无空格匹配编译产物而窗口为空，2 条断言误报 false；已改为按 interval 回调 + 函数体域断言，v2 全绿。属我的工具缺陷，非产品问题。）*

## 5. ⚠️ 打包态 UI 冒烟：**未取证**（卡点如实说明）
产物：`.devdata/release-evidence/t63-packaged-smoke.json`；探针 `t63-packaged-smoke.mjs`（DOM-only，因打包渲染进程**没有** `window.__nebula`）。
- 环境：`%APPDATA%\nebula-player\settings.json` **按字节备份**（`49D39C5EBFD4243B1AF9E812E16DE69347678DE6`，407 B）→ 临时指向本地 mock（`0573C101…`，700 B）→ **用后按字节还原**（sha1 复原为 `49D39C5E…`，size 407 B）。
- 打包应用以 `--remote-debugging-port=9222` 启动（PID 26968），CDP 可用（2 s 内）。
- **实际观察**：① 我的读取显示 `visibilityState='hidden'`（与本项目 dev 侧同一现象）；② mock **确实收到 1 次请求并已作答**（`expectedText='第1轮-甲段。第1轮-乙段。第1轮-丙段。'`）⇒ 输入与发送链路是通的；③ 但主窗 DOM 扫描**取不到 `.chat-msg.ai` 气泡**，且扫描全 body 文本**未发现「薇拉 Vela」**；④ **无 `#mini` 目标**（打包态迷你窗未打开，而我无法用 `window.api.miniToggle()` 打开它）。
- **卡点结论**：打包态缺少 dev 的 `__nebula`/`window.api` 调试面，我的 DOM 选择器未能命中所用版本的真实结构（聊天面板可能处于收起态或结构不同），且无法程序化开窗。**未取证，不用 dev 证据顶替。**

## 6. 覆盖安装与体积
- `/S` 静默覆盖安装：**exit 0**，耗时 **19.3 s**（在位的 1.0.5 为真实基线）。
- 安装位 `ProductVersion = **1.0.6.0**`。
- 安装副本 asar `26,331,277 B / sha1 0ACFB6CD…` **与 dist 产物 asar 逐字符相同**。
- 体积对比：`app.asar` 1.0.4 `26,305,579` → 1.0.5 `26,331,161` → **1.0.6 `26,331,277` B**。

## 7. 进程级死亡观察（打包态）
PID 26968 在 **76 s** 与 **121 s** 两次读数均存活（uptime 递增），期间无崩溃 ⇒ **未复现进程级死亡**（观察窗口 ≥60 s）。仅记录存活与进程数（5），未捕获异常计数（打包态无 dev 日志面）——**此项为部分取证**。

## 8. 收尾归档（用户已批准）
`dist/nebula-player-1.0.5-setup.exe`（118,123,909 B）与 `.blockmap`（123,421 B）→ **`dist/internal/`**（移动，非复制）；1.0.6 的 `latest.yml` 仍为 `version: 1.0.6`，`dist/nebula-player-1.0.6-setup.exe` 不受影响；**未触碰其他版本产物**。

## 9. 门禁（逐项值，stamp `2026-09-13T14:26:46.035Z`）
`lint.exitCode=0`、`totalErrors=0`、`totalWarnings=1`、`filesWithErrors=[]`、`typecheck.node=0`、`typecheck.web=0`、`tests.exitCode=0`、**179 passed / 16 files**（= t62 基线，不降）。

## 10. 实例与纪律
- 打包应用唯一 owner **PID 26968**（PID 落盘 `packaged-pid.txt`），用毕 `Stop-Process`（**只停自己的 PID**）。
- 末态三查：**electron=0 / nebula-player=0 / node=1**（harness），5173/5174/9222/9223 **全 FREE**（9999 为我的 mock，取证后已终止）。
- 未改 `src/**`（除 `package.json` 版本号）；打包态 `settings.json` 按字节备份 + **按字节还原**（前后 sha1 同为 `49D39C5E…`）；未扫描用户真实曲库。

## 11. 产物清单
`build-win-1.0.6.log`、`package-1.0.5.json`、`t63-asar-assert.json`、`t63-asar-assert2.json`、`t63-packaged-smoke.json`、`t63-packaged-smoke.mjs`、`t63-asar-assert.mjs`/`assert2.mjs`、`packaged-settings-BEFORE.json`、`packaged-pid.txt`。

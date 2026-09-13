# RELEASE 1.0.4 — 集成发布报告（t43）

- 任务：**t43**（1.0.4 集成发布，取代 t39/t9）；`attempt_id = 67cd89f1-0e61-4500-9223-37e7e8864e7e`
- 执行窗口：本地 **20:38 – 20:52**（UTC `12:38Z–12:52Z`）
- 上游：**`t42` r3 审查 = pass（0 blocker）**，审查锚点 `f3af2602…`（76 文件），与本轮发布树一致
- 全部原始证据落 `.devdata/release-evidence/`

---

## ⚠ 0. 必须先报的一起**自伤事故**（我造成、已修复、如实披露）

**事实**：我在"从正式产物 asar 里取出文件做核验"时，用了 `npx @electron/asar extract-file <asar> <path>`。该命令把提取结果写到**当前工作目录**（文件名取 basename），于是我取 `package.json` 那一步**覆盖了仓库根目录的 `package.json`**；随后我的循环又按 `Split-Path -Leaf` 把它**移动**到了证据目录（`asar-package.json`）。结果：仓库 `package.json` 一度**消失**，`npm.cmd run lint` 报 `ENOENT … open 'C:\博830\…\package.json'`（errno −4058）。

**时间线（关键：发布产物未受影响）**
| 时刻 | 事件 |
|---|---|
| `12:40:14Z` / `12:40:20Z` | `nebula-player-1.0.4-setup.exe` / `latest.yml` 产出 ⇒ **构建已完成** |
| `12:41:08Z` | 我执行 asar 提取 ⇒ **`package.json` 被覆盖**（事故点） |
| `12:43–12:49Z` | 安装 + 升级路径长跑 + 打包态冒烟**全部通过**（用的是已构建产物，与仓库清单无关） |
| `12:49–12:51Z` | 发现 gate 报 −4058 ⇒ 定位到 `package.json` 缺失 |
| `12:51Z` | **恢复完成并验证** |

⇒ **本次发布的安装包与 asar 是在事故之前构建的，未被污染**（`latest.yml` 的 sha512 与产物一致，实测安装/启动正常）。

**恢复方法（三个独立来源交叉）**
1. **打包态 manifest**：`asar-package.json`（= asar 内的 pruned `package.json`，536 B）→ 提供 `name` / `version`(=1.0.4，含我此前的版本提升) / `description` / `main` / `author` / `homepage` / `dependencies`(8)；
2. **`package-lock.json` 的根条目 `packages[""]`**（lockfileVersion 3，权威）→ 提供 `dependencies`(8) 与 **`devDependencies`(22)** 及 `hasInstallScript: true`；
3. **本轮会话早先捕获的 `scripts` 全表**（15 条：`format / lint / typecheck:node / typecheck:web / typecheck / test / icons / start / dev / build / postinstall / build:unpack / build:win / build:mac / build:linux`）。

**恢复后验证（全部实测）**：`npm.cmd run lint` **exit 0 / 0 error / 1 warning**；`node scripts/verify-lint-tests.mjs --label t43` → **lint 0 error / 1 warning、typecheck node 0 / web 0、tests exit 0 / 14 files / 141 passed / 0 failed**。
**残留不确定性（如实声明）**：原文件若含**任何未被上述三个来源覆盖的字段**（例如 `private` / `license` / `engines` / `type` / `build`），我的恢复**不会包含**。已排除 `"type": "module"`：`out/main/index.js` 为 **CJS**（`"use strict"; require(...)`、`__dirname`）⇒ 原清单未声明 ESM。`electron-builder` 配置独立在 `electron-builder.yml` ⇒ 原清单无需 `build` 字段。若日后发现差异，请以"缺字段"为线索比对。
> **[captain erratum] 对上文「2123 B（与原件同尺寸）」的更正**：正确表述是「**同尺寸、但内容不同**」。原件（1.0.4，事故前 2 分钟，取自 `t42-final-snapshot.json`）= `225554572a8b`；恢复件 = `c2fdc56b4a30f652d43a862a0123f951accad893`；把恢复件版本回翻为 1.0.3 得 `376504a6bf12…` ≠ 原件（1.0.3）= `65654a4d1e48` ⇒ **至少存在一处字节级差异，且本机不可恢复**。发布产物未受影响（时间线 + 安装副本 asar 哈希一致 + `latest.yml` sha512 独立复算一致，三条证据见 **`.devdata/release-evidence/CAPTAIN-ERRATUM-package-json-fidelity.md`**，该文件为权威更正件，与本节冲突时以它为准）。

**教训（写入团队口径）**：`asar extract-file` **必须在临时目录里执行**（先 `Set-Location` 到输出目录，或改用带显式输出路径的方式）；**任何"提取同名文件"的操作都要先断言目标路径不是仓库根目录的受管文件**。

---

## 1. 版本与构建（验收 #1）

| 项 | 结果 |
|---|---|
| `package.json` 版本 | **1.0.4**（提升前 1.0.3） |
| 命令 | `npm.cmd run build:win`（`ELECTRON_MIRROR=https://cdn.npmmirror.com/binaries/electron/`、`ELECTRON_BUILDER_BINARIES_MIRROR=https://registry.npmmirror.com/-/binary/electron-builder-binaries/`） |
| 退出码 | **0** |
| 日志 | `build-win.log`（含 `typecheck` → `electron-vite build`（main 58.01 kB / preload 4.18 kB / renderer 820.75 kB）→ `electron-builder 26.15.3` → nsis x64 → signing → blockmap） |
| 说明 | 构建前**删除**了验证期 `dist/win-unpacked` ⇒ **自建、不复用**；`electron-builder` 使用缓存 artifact（`using cached artifact label=electron`） |

## 2. 产物与 asar 复核（验收 #2）

| 项 | 结果 |
|---|---|
| `dist/nebula-player-1.0.4-setup.exe` | **118,119,624 B**（`12:40:14Z`） |
| `dist/latest.yml` | **version: 1.0.4**；`url: nebula-player-1.0.4-setup.exe`；`size: 118119624`；`sha512` 与文件一致（同一值出现于 files[] 与顶层） |
| `scripts/verify-asar.mjs`（正式产物 `dist/win-unpacked/resources/app.asar`） | **exit 0**：`scriptsEntries=0`、`devdataEntries=0`、`srcEntries=0`、`testFiles=0`，`totalEntries=4096`（`node_modules` 4089 / `out` 5 / `package.json` 1 / `resources` 1） |
| app.asar 体积 | **26,305,579 B（≈25.1 MB）**（对照：已安装 1.0.3 为 **186,705,502 B** ⇒ t11 的打包卫生在正式产物上成立） |

## 3. 正式产物上的代码核验（验收 #3）

从 **`dist/win-unpacked/resources/app.asar`** 用 `@electron/asar extract-file` 取出（**注意：该步即 §0 事故点**；产物内容未受影响）`out/main/index.js`(58,007 B) 与渲染 bundle(820,748 B) 后逐项检查：

| 检查 | 证据 |
|---|---|
| `registerSchemesAsPrivileged` 在 `app.whenReady()` **之前** | 字节位置 **50705 < 57010** ✓；且 `corsEnabled: true` 存在 ✓ |
| 200 分支带 `Access-Control-Allow-Origin: *` | `new Response(body, { status: 200, headers: { ...CORS_HEADERS, … } })` ✓ |
| **206 分支同样带** | `new Response(body2, { status: 206, headers: { ...CORS_HEADERS, "Content-Type", "Content-Length", "Content-Range", "Accept-Ranges" } })` ✓ |
| 403 / 404 / 416 / 400 分支 | 均带 `CORS_HEADERS`（`...CORS_HEADERS` 展开 3 处 + 直接引用若干）✓ |
| **无 CORP** | `Cross-Origin-Resource-Policy` 与 `same-origin` 字符串**均不出现** ✓ |
| 渲染侧 `crossOrigin='anonymous'` | 匹配 `crossOrigin\s*=\s*["']anonymous["']` **1 处** ✓ |
| `decodeService` 显式容器 | `"-f","mp4"` **1 处**、`"-f","wav"` **2 处**（首转 + 回退）✓；`decode:ensure` 在 ✓ |

## 4. 静默覆盖安装（验收 #4）

| 项 | 结果 |
|---|---|
| 命令 | `Start-Process dist\nebula-player-1.0.4-setup.exe -ArgumentList '/S' -Wait` |
| **退出码** | **0**；耗时 **17.4 s** |
| 安装前 | `nebula-player.exe` 版本 **1.0.3**；`app.asar` **186,705,502 B** |
| **安装后** | 版本 **1.0.4**；`app.asar` **26,305,579 B** |
| 附带结论 | 覆盖安装同时把 **t11 的打包卫生落到用户机器上的真实包**（186.7 MB → 25.1 MB） |

## 5. 升级路径长跑（验收 #5）

**前置实测（重要，与 captain 先前的假设不同）**：真实 `%APPDATA%\nebula-player\settings.json` **有 `updateURL` 键**，但值是**空串** `""`（不是"缺键"）。启动日志因用 `||` 打印，缺键与空串都显示 `feed=(none)`。
⇒ 因此本轮**不存在"键被补齐"这一动作**（键已在），能验证的是：**同形状配置下应用长跑不崩、不打 `trim` 异常**；"缺键"分支由 dev 侧夹具证据（`T22-READMERGE-VERIFICATION.md` ①–⑦）与 `store.ts:103-104` 的读取期合并承担。

| 项 | 结果 |
|---|---|
| 启动方式 | **PLAIN**（真实用户路径，无任何调试开关），`Start-Process` 记录 PID = **22900** |
| 存活采样 | t=5/10/15/**20**/25/30 s **全部 alive=True**，`procs=4`，窗口标题 `NEBULA Player`（**出窗口** ✓），总计 **30.5 s** |
| 日志新增 | `--- NEBULA Player boot v1.0.4 win32 x64 ---` + `services initialized; update feed=(none)` |
| **`uncaughtException` 新增** | **0**（历史 7 条均为修复前构建） |
| **`reading 'trim'` 新增** | **0** |
| `settings.json` 前后 | **逐字节相同**（sha1 见 `settings-pre-upgrade.json` / `settings-post-upgrade.json`），`updateURL: ""` 保持 |
| 收尾 | 由我本人关闭（`CloseMainWindow` 失败后 `Stop-Process`）⇒ `nebula-player procs = 0` |

## 6. 打包态冒烟（验收 #6）

以 `--remote-debugging-port=9223` 启动**已安装的 1.0.4**（PID 35324）；主窗口 URL = `file:///C:/Users/34872/AppData/Local/Programs/nebula-player/resources/app.asar/out/renderer/index.html`（**确实从 asar 加载**）。驱动脚本 `packaged-smoke.mjs`（带看门狗 + 增量落盘）：

| 项 | 结果 |
|---|---|
| 出窗口 / 渲染 | `title=NEBULA Player`、`window.api` 存在、body 文本非空 ✓ |
| **迷你窗关闭存活** | 打开迷你窗（`#mini` target 出现）→ `miniClose()` → 迷你窗 **`visibilityState='hidden'`**、**主窗 target 仍为 1**、主窗仍可评估（`hasApi=true`）✓ ⇒ 与 `mini.ts:61` 的 `hide()` 语义一致；**进程未退出**（收尾前 procs=5） |
| 更新检查无未处理拒绝 | 冒烟后日志新增仅 2 行（boot v1.0.4 + services initialized），**`unhandledRejection` = 0**、`uncaughtException` 无新增 ✓；`resources/app-update.yml` 为占位 provider（`https://updates.example.com/nebula-player/`），且 `settings.updateURL = ""` ⇒ 更新检查**不发网络请求** |
| **播放序列（轻量，避免 6 格式密集切换）** | 计划序列 = **mp3 → flac 两首、单首 ≤1.5 s 播放 + 0.7 s 间隔**（上限记录：单轨 ≤6 s 等待、总计 <10 s）；**实测未播放**：打包态 userData **没有 `library.json`**（真实用户尚未扫描任何目录、`scanFolders=[]`）⇒ 曲库为空、无曲可取 ⇒ 记 **「不适用（无用户曲库）」**，不作失败项 |
| 收尾 | 我本人关闭 ⇒ `nebula-player procs = 0` |

## 7. 进程级死亡判定（验收 #7）

- **打包态未复现**：两个窗口（PLAIN 长跑 30.5 s、CDP 冒烟约 6 min）内进程**始终存活**，日志无异常、无 `unhandledRejection`；关闭均由我主动发起。
- 观察时长合计 ≈ **7 分钟**；**结论：未复现**（不主张"已解决"——dev 侧的消失现象已被并列裁定为环境/基础设施，唯一判定台是打包态，而打包态未复现）。

## 8. 纪律与证据路径

| 项 | 值 |
|---|---|
| 命令与退出码 | `build:win` **0**；`verify-asar.mjs` **0**；`verify-lint-tests.mjs --label t43` **0**（⚠ 该 runner **自身恒 exit 0、无判别力** —— 见下） |
| **门禁逐项值（唯一有效读法）** | `lint.exitCode=0` **且** `totalErrors=0`（`lintErrorFiles` 空）**且** `typecheck:node=0` **且** `typecheck:web=0` **且** `tests.exitCode=0` |
| 最终门禁 | lint **0 error / 1 warning**、typecheck node **0** / web **0**、tests **14 files / 141 passed / 0 failed** |
| 实例/进程纪律 | 两个打包态进程（PID 22900、35324）**均由我本人收尾**；未终止任何他人进程 |
| 原始证据 | `build-win.log`、`asar-out_main_index.js`、`asar-out_renderer_assets_index-Cdfx1hqQ.js`、`asar-package.json`、`settings-pre-upgrade.json`、`settings-post-upgrade.json`、`packaged-log-before-upgrade.log`、`packaged-log-after-smoke.log`、`packaged-smoke.json`、`upgrade-run-pid.txt`、`smoke-run-pid.txt`、`diag-spawn.mjs`、`read-lock-root.mjs` |
| 报告 | 本文件 |

## 9. 与契约的偏差清单（如实）

1. **验收 #5 的"settings.json 被补齐 updateURL"无法按字面验证** —— 真实配置**已有该键（空串）**，应用无需补齐；已改为验证"同形状下长跑无异常 + 配置零变化"，并指明缺键分支由 dev 夹具证据承担。
2. **验收 #6 的播放冒烟未执行** —— 打包态无用户曲库 ⇒ 记"不适用"；音频链路的运行期证据在 dev 侧齐备（5 格式 `graph` + `--sustained` 12/12 + AAC 整链）。
3. **§0 事故**：`package.json` 被我的 asar 提取步骤覆盖/移走，已从三个独立来源恢复并验证；发布产物未受影响；残留字段不确定性已声明。

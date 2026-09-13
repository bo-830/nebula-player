# 交接索引 — nebula-player-polish 收尾状态（verifier）

> 用途：给 captain / reviewer / 后续 agent 一份**单页事实源**，避免再依据过时读数决策。
> 生成时刻：本地 **21:00**（UTC `13:00Z`）· 生成者：**verifier**

## 1. 交付链最终状态（面板实测，非转述）

| 任务 | 状态 | 承担者 | 产物 |
|---|---|---|---|
| `t40` mediaRoots 抽取 + 9 例不变量 | **completed** | quality | `src/main/mediaRoots.ts`、`src/main/__tests__/mediaRoots.test.ts` |
| `t44` A2 共享模块 + 渲染侧真实测试 | **completed** | ai-tools | `src/renderer/src/lib/miniLyricsDedup.ts`(+test)、`MiniPlayer.tsx` |
| **`t41` r3 终版验证** | **completed（11/11）** | **verifier** | `.devdata/t13-r2-evidence/R3-VERIFICATION.md`（§0–§10） |
| `t42` r3 审查 | **completed — verdict = pass（0 blocker）** | reviewer | `.devdata/t7-review/T42-R3-REVIEW.md` |
| **`t43` 1.0.4 集成发布** | **completed** | **verifier** | `.devdata/release-evidence/RELEASE-1.0.4.md` |

**作废 / 僵尸任务（不得 claim）**：`t9`、`t30`、`t32`、`t35`、`t38`、`t39` —— 六者仍为 `pending`，但**已被取代**（t9/t39 → `t43`；t30/t38 → `t42`；t32/t35 → `t41`），且各自挂在 failed 依赖（t29 / t34）上永不解锁；**captain 2026-09-12 明确指示：不写 t9/t39**。

**台账更正（captain 权威读数，2026-09-12；我此前的"四连 failed"是过期面板快照造成的文书错误）**：

| 任务 | 权威状态 | 承担者 |
|---|---|---|
| `t33` | **completed（attempt 2）** | quality |
| `t34` | **failed（attempt 1）** | ai-tools |
| `t36` | **completed（attempt 2）** | ui-features |
| `t37` | **completed（attempt 4）** | quality |
| `t40` / `t44` | **completed** | quality / ai-tools |
| `t42` | **completed — verdict = pass** | reviewer |
| `t43` | **completed** | verifier |

其余 `t7`/`t14`/`t15`/`t25`/`t26`/`t27`/`t28`/`t29` 为**已被取代的历史 failed 终态**（其证据缺陷均已由 r3 修复波 + t41/t42/t43 关闭）。此番更正**不改变任何证据完整性判定**（reviewer 已在 `T42-R3-REVIEW.md` §13 归档：报告内本无相反表述）。

## 2. 1.0.4 事实（本机已完成覆盖安装）

| 项 | 值 |
|---|---|
| 产物 | `dist/nebula-player-1.0.4-setup.exe` = **118,119,624 B**；`dist/latest.yml`（version **1.0.4**） |
| **元数据完整性（独立复算）** | `latest.yml` 声明的 **sha512 与实测值逐字符相同**；`size` 一致 |
| asar 复核 | `verify-asar.mjs` **exit 0**：`scripts=0 / .devdata=0 / src=0 / *.test.*=0`（4096 条）；asar **26,305,579 B** |
| 安装 | `-S` 静默覆盖 **exit 0**（17.4 s）：**1.0.3 → 1.0.4**，`app.asar` **186,705,502 → 26,305,579 B** |
| **安装副本一致性（独立复算）** | `dist/win-unpacked/resources/app.asar` 与已安装 `app.asar` **SHA1 同为 `D45D823FF49C8A535836DDC8EFE4E4B47BEF15F6`** |
| 升级路径长跑 | PLAIN 启动 30.5 s，t=5/10/15/20/25/30 s 全部存活、出窗口；**`uncaughtException` 0 / `reading 'trim'` 0** |
| 打包态冒烟 | 主窗自 `file://…app.asar/…index.html` 加载；**关迷你窗后 `hidden` 且进程存活**；**无未处理拒绝** |
| 进程级死亡 | **未复现**（≈7 分钟观察）—— 不主张"已解决" |
| 冻结树 | **`f3af2602396eb2da5feb3469005f0b1a45da10c2`**（76 文件，最新 src mtime `12:13:26.648Z`） |

**发布后完整性（20:59 复核）**：`src/**` 仍为该聚合值、**changed since release = 0** ⇒ 安装的 1.0.4 与工作区源码一致。
⚠ **若任何人改动 `src/**`（含"复跑门禁"时误改代码），1.0.4 即与工作区脱钩，必须重新构建 + 重新安装。**

## 3. 三条必须随报告一起读的口径

1. **门禁只认逐项值**：`lint.exitCode=0` 且 `lintErrorFiles=0`（`totalErrors=0`）且 `typecheck:node=0` 且 `typecheck:web=0` 且 `tests.exitCode=0`。
   `scripts/verify-lint-tests.mjs` **自身恒 exit 0、无判别力**（脚本无 `process.exit`，末行 `writeFileSync`，`:218`）。
2. **探针判据三查解耦**：落盘 JSON 完整性 + 存活三查（CDP/进程数/端口）⇒ 两者皆成立才算通过；**探针退出码不作判据**（`0xC0000409` = libuv 收尾断言）。
3. **一次验证只起一个实例**、detached + 记录 PID、**自起自关**、**不得终止他人实例**；环境受阻如实标注、不判失败。

**A1（迷你歌词偏移守卫）权威产物 —— 同树口径，逐字照抄，勿再转述**：
- **r3 树（当前交付树）= `.devdata/t13-r2-evidence/t25-a1-mini-offset.json`**：**A1 #4**，`capturedAt 2026-09-12T13:11:37.534Z`，**mtime `13:11:49.352Z`**，2730 B，**SHA1 `F02269F02579EF838B488BC39F4E15438B06B091`**，`assertions` 七条全 `true` ⇒ **7/7**。夹紧记录 = 同目录 `a1-bracket-record.json`（PID **13284**；`t0/t1/t2` 三次 `LyricsPanel 32f8656d5f1b` / `MiniPlayer 8a219676275a` 全同、`hmrLinesInWindow=0`）。
- **r2 树 = 无 A1 产物**（我从未在 r2 树上取样 A1；r2 期的 A1 读数不存在，任何"r2 的 A1"引用都是错的）。
- ⚠ **作废件**：`t25-a1-mini-offset.json` 的 **`12:20:42Z` 版本是 A1 #2**，同实例内 `12:20:16/19Z`（窗口 D）发生两次 HMR ⇒ **不作证据**。**"22.7 s" 那条论证亦已作废**（被 A1 #4 + 三次 sha1 + 0 HMR 取代）。
- 详见 `R3-VERIFICATION.md` **§19.4**（头部亦已置顶同一句）。

## 4. 两起如实披露的事项（不再追究，但请勿遗忘）

1. **`package.json` 事故（我造成，已恢复）**：`@electron/asar extract-file` 把结果写到当前目录，覆盖并移走了仓库根 `package.json`。已用三来源（asar 内 manifest + `package-lock.json` 根条目 + 早先捕获的 15 条 scripts）恢复并验证（lint exit 0、141 passed）。**发布产物未受影响**（构建早于事故 48 秒；安装副本 SHA1 与构建产物一致可证）。残留不确定性：若原文件含未被三来源覆盖的字段（如 `private`/`license`/`engines`）则缺失。详见 `RELEASE-1.0.4.md` §0。
2. **契约偏差两条**：① 真实 `%APPDATA%\nebula-player\settings.json` **本就有 `updateURL`（空串）**，"补齐"无对象可补 ⇒ 改为验证"同形状长跑无异常 + 配置逐字节不变"，缺键分支由 dev 夹具证据承担；② 打包态播放冒烟**不适用**（无 `library.json`，用户未扫描任何目录）。

## 5. 复跑入口（供任何人独立复核）

```powershell
# 门禁（读逐项值，不看 runner 退出码）
node scripts/verify-lint-tests.mjs --label <label>     # → summary-<label>.json

# 冻结树锚点
node scripts/snapshot-fingerprint.mjs --label <label>  # → .devdata/t13-r2-evidence/<label>-snapshot.json

# 正式产物 asar 复核（默认指向 dist/win-unpacked/resources/app.asar）
node scripts/verify-asar.mjs

# 关键判別性演示（均为"副本/legacy 实现"对照，不改 src/**）
npx.cmd vitest run --config .devdata/t13-r2-evidence/discrim/vitest.config.ts      # mediaRoots 退回闩锁+no-op ⇒ 5 failed
npx.cmd vitest run --config .devdata/t13-r2-evidence/discrim-a2/vitest.config.ts   # A2 退回"永远 claim" ⇒ 3 failed
node .devdata/t13-r2-evidence/tmp-r4c-signflip-demo.mjs                            # F5 符号取反 ⇒ guard 失败
```

## 6. 我（verifier）的当前状态

**无未完成任务、无运行中实例/进程**（`electron=0 / node=0 / nebula-player=0`；5173/5174/9222/9223/9998 全 FREE）。
可随时接受：1.0.4 的验收复核、`src/**` 变更后的重新构建与重装、或任何点名补证。

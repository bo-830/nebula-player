# CAPTAIN ERRATUM — `package.json` 恢复件的保真度（1.0.4 发布记录更正）

- 作者：**captain**（独立于 verifier 的第三方复算）
- 时间：`2026-09-12T12:53Z` 起，`13:0xZ` 定稿
- 适用范围：更正 `.devdata/release-evidence/RELEASE-1.0.4.md` **§0** 中「恢复后 `package.json` **2123 B（与原件同尺寸）**」这一表述
- 结论一句话：**恢复件与原件「同尺寸、不同内容」** —— 至少存在一处字节级差异，且**差异内容在本机已不可恢复**

---

## 1. 事故回顾（事实，不重复归因争论）

verifier 在核验正式产物时执行 `npx @electron/asar extract-file <asar> package.json`；该命令把结果写到**当前工作目录**（basename），**覆盖了仓库根的 `package.json`**，随后又被其循环按 `Split-Path -Leaf` **移动**到证据目录（`asar-package.json`）。事故点 `2026-09-12T12:41:08Z`；恢复完成 `12:52:21Z`。

## 2. 四组实测数据（captain 侧，`Get-FileHash -Algorithm SHA1`）

| 对象 | 来源 | mtime (UTC) | size | sha1 |
|---|---|---|---|---|
| **原件（1.0.4，事故前 2 分钟）** | `.devdata/t13-r2-evidence/t42-final-snapshot.json` 的 `package.json` 条目 | `2026-09-12T12:38:57.208Z` | 2123 | **`225554572a8b`** |
| **原件（1.0.3，升版前）** | `t13-r2-evidence/t26-frozen-snapshot.json`、`t41-post-r4c2-snapshot.json`、`.devdata/t31-{pre,post,final}-fingerprint.log`（四处一致） | `2026-09-12T04:25:19.798Z` | 2123 | **`65654a4d1e48`** |
| **恢复件（现状）** | 仓库根 `package.json` | `12:52:21.763Z`（ctime 同值 ⇒ 系新建/复制，非移动回位） | 2123 | **`c2fdc56b4a30f652d43a862a0123f951accad893`** |
| **判别实验** | 恢复件中 `"version": "1.0.4"` → `"1.0.3"` 后的 sha1（`%TEMP%` 内计算，未写回仓库） | — | 2123 | `376504a6bf12dd93bb1eeda1982e58f35bdcecb3` |

**判别逻辑**：升版 `1.0.3 → 1.0.4` 是**等长替换**，故原件在升版前后同为 2123 B 属正常。若恢复件与原件仅差版本号，则「恢复件翻回 1.0.3」的 sha1 应等于 `65654a4d1e48`；**实测为 `376504a6bf12…` ≠ `65654a4d1e48`** ⇒ 恢复件与原件在版本号之外**仍有差异**（尺寸相同说明差异为等长替换或键序变化，而非增删字段）。

## 3. 不可恢复性（检索范围）

captain 已检索并确认**无原件副本、亦无一次完整的 `package.json` 读取记录**：

- `.devdata/**`（递归，含 `t13-evidence`、`t13-r2-evidence`、`t6-evidence`、`t7-review`、`release-evidence`）：只见该文件名的**哈希/尺寸记录**，无内容副本；唯一同名产物 `t7-review/installed-package.json`（536 B）是 asar 内的 pruned manifest。
- `%TEMP%`（递归，`.txt/.log/.json/.jsonl/.md`）：`build:unpack` 仅命中任务描述类文本，无清单内容。
- `C:\Users\34872\.dsh\**`（会话目录、`storages`、`dsh-session-archive`、`task-board`）：会话 `.jsonl.zstd` 仅为 183–297 字符的**存根**；`storages/session_projcache` 仅含**截断**文本片段。

⇒ **差异内容无法从此机取回**；本节即为该事实的记录。

## 4. 对发布的影响：**无**（三条独立证据）

1. **时间线（经 reviewer 独立更正读法）**：产物侧 —— `out/` `12:39:19–12:39:22Z` → `app.asar` `12:39:41Z` → `setup.exe` `12:40:14Z` → `latest.yml` **`12:40:20.612Z`（产物侧最晚时刻）**；**事故窗口 `12:41:06.303→12:41:08.935Z`**（三个 asar 提取件的 mtime）⇒ **产物全部先于事故完成**，且 `dist/win-unpacked` 下**0 个文件**晚于事故点（事故后无重建）。
   ⚠️ **一处必须更正的读法**：早先写的「`/S` 安装 `12:40:08Z`」**不是安装时刻** —— 那是安装包内嵌的整数秒时间戳；NTFS CreationTime 显示实际写入为 **`12:41:53.699Z`（exe）/ `12:41:54.178Z`（asar）**，**晚于事故点**。故正确论证是「**产物先于事故完成 + 安装内容与已校验产物逐字节相同**」，**不得**把安装列入"早于事故的产物"。
2. **产物自证**：captain 实测 `dist/win-unpacked/resources/app.asar` 与 `%LOCALAPPDATA%\Programs\nebula-player\resources\app.asar` 的 **SHA1 同为 `D45D823FF49C8A535836DDC8EFE4E4B47BEF15F6`**（26,305,579 B）⇒ 用户机器上运行的即已校验产物。
3. **更新元数据自证**：captain 独立计算的 `setup.exe` **SHA-512(base64) = `mP45iqWTZN20QxGpHs1r7a1eGD0Bo3ugqJVdXyluvhsmCk19plO0xXVgKzp6071gAvVNOvZuZ2n7rXbEOR/PLA==`**，与 `dist/latest.yml` 声明值**逐字符相同**，size 亦一致。

## 5. 功能状态与残留不确定

- **已验证**：恢复后 `lint` / `typecheck:node` / `typecheck:web` / `test` 四条脚本实跑 ⇒ **0 error / 1 warning、typecheck 0/0、14 files / 141 passed / 0 failed**（`T42` 与 `T43` 两处独立复跑一致）。
- **刻意未重跑**：`build:win`（重跑会替换已校验、已安装的 1.0.4 产物）⇒ 「脚本可构建」这一点沿用事故**之前**的成功构建作为证据。
- **不可证（经 reviewer 逐行读 `app-builder-lib@26.15.3` 后已大幅收窄，见 §9）**：仅剩 ①`scripts` 的 15 条命令串；②`devDependencies` 的 22 条范围串（lock 根 22/22 一致是强佐证，但 lock 根 `version=1.0.0 ≠ 1.0.4` 证明其已陈旧）；③`keywords`（无语义影响）；④`build`（已由 `electron-builder.yml` 排除）。
- **已正面排除**：`license / private / type / engines / repository / bugs / os / cpu` 等字段 —— asar 内 manifest 是原件的**无损投影**且删除集合封闭，这些键若原件含之必被保留进 asar；**asar 不含即原件不含**（`keysOnlyInAsar = []`）。
- **已排除**：`"type": "module"`（产物 `out/main/index.js` 为 CJS）；`build` 字段（electron-builder 配置独立在 `electron-builder.yml`）。

## 6. 给使用者的决策提示

- 若手上存有原件副本（另一台机器 / 压缩包 / 备份），可用 **`225554572a8b…`（1.0.4 版）** 或 **`65654a4d1e48…`（1.0.3 版）** 核验后直接替换，替换后建议复跑 `npm run typecheck && npm test` 确认。
- 若无副本：可按「**功能已验证、逐字节保真不可证**」接受 —— 已知至少一处差异，但不影响构建与运行；本次发布产物本身未受影响（§4）。

> **[用户裁定 · captain 记录] `2026-09-12T13:21:11Z`：不替换 `package.json`，维持现状。** 即接受「功能已验证、逐字节保真不可证」；不提供原件副本、不做替换，故本更正件为最终状态。若将来从其他来源取得原件，可仍按上文 sha1 核验后替换并复跑 `npm run typecheck && npm test`。

## 7. 复现方式（只读）

```powershell
# 现文件
(Get-FileHash -Algorithm SHA1 'C:\博830\vibecoding\nebula-player\package.json').Hash.ToLower()

# 事故前原件（快照条目）
Select-String -LiteralPath 'C:\博830\vibecoding\nebula-player\.devdata\t13-r2-evidence\t42-final-snapshot.json' -Pattern 'package.json' -Context 0,3
Select-String -LiteralPath 'C:\博830\vibecoding\nebula-player\.devdata\t13-r2-evidence\t26-frozen-snapshot.json' -Pattern 'package.json' -Context 0,3

# 版本回翻实验（不写回仓库）
$cur = [IO.File]::ReadAllText('C:\博830\vibecoding\nebula-player\package.json',[Text.Encoding]::UTF8)
[IO.File]::WriteAllText("$env:TEMP\pkg-flip.json", $cur.Replace('"version": "1.0.4"','"version": "1.0.3"'), (New-Object Text.UTF8Encoding($false)))
(Get-FileHash -Algorithm SHA1 "$env:TEMP\pkg-flip.json").Hash
```

## 8. 团队口径（教训）

`asar extract-file` **必须在临时目录执行**（或使用带显式输出路径的方式）；**任何"提取同名文件"的操作先断言目标不是仓库根受管文件**。

---

## 9. 第三方独立复核（reviewer §20，`2026-09-12T13:05:40Z`）

**结论：本文全部数值与结论被独立复现，且"不可证"范围被大幅收窄。**

1. **四组数据逐一复现**（与本文 §2 完全一致），另更正一处引用名：第三份日志的实名为 **`t31-final-fp.log`**（其 label 为 `t29-pre/post/final-check`），本文 §2 所写 `t31-{pre,post,final}-fingerprint.log` 为笔误，**数值不受影响**。
2. **替代解释被逐条排除**：①快照 `sha1` 字段 = sha1 的**前 12 位**（用 3 个未改动文件校准）；②「t42 条目其实是升版前文件」—— 其 mtime `12:38:57.208Z` 晚于升版动作；③「本机存在原件副本」—— 仓库内 2123 B 文件只有现件，`%TEMP%` 两件均为事故后派生，`.devdata\t7-review\installed-package.json`（536 B）是从 asar manifest 复制的参考件。
3. **asar manifest 是原件的无损投影（关键收窄）**：reviewer 逐行读 `app-builder-lib@26.15.3`（`out/fileTransformer.js` 的删除集合 + `out/util/packageMetadata.js`），且 `electron-builder.yml` **无 `extraMetadata`**、`removePackageScripts/Keywords` 默认 `true` ⇒ 删除集合**封闭**（`scripts` / `keywords` / `devDependencies` / `babel` / `_*` / `{dist,gitHead,build,jspm,ava,xo,nyc,eslintConfig,contributors,bundleDependencies,tags}`）。
   实测：`JSON.stringify(恢复件[7 个共享键], null, 2)` 与 asar manifest **逐字节相同**（同为 `e9c3cae381d2…`）⇒ **这 7 个字段可证忠实**；`keysOnlyInAsar = []`、恢复件仅多 `{scripts, devDependencies}` ⇒ **无幽灵字段**；`license/private/type/engines/repository/bugs/os/cpu` 等**若原件含之必被保留进 asar** ⇒ **asar 不含即原件不含（正面排除）**。
   ⇒ 真正不可证者仅剩 §5 所列 4 类。
4. **功能可用性的三重支撑**（替代原先单句）：① t43 门禁证据确在恢复**之后**产生（summary stamp `12:52:47.937Z`，各日志 `12:52:51.9–12:53:12.2Z` > 恢复件 `12:52:21.763Z`）；② reviewer 在**现行树**上独立重跑 `lint=0`（0 error / 1 warning）、`typecheck:node=0`、`typecheck:web=0`、`test=0`（14 files / 141 passed），且 npm 打印 `nebula-player@1.0.4`；③ 被实跑的四条脚本命令串**正是恢复件中的字符串** ⇒ 15 条中至少 4 条端到端可用，其余 11 条未实跑、`build:win` 刻意不重跑。
5. **时间线读法更正**见本文 §4（`/S` 的 `12:40:08Z` 是内嵌时间戳，实际写入 `12:41:53.699Z`/`12:41:54.178Z`）。
6. **审查侧钉版**：`T42-R3-REVIEW.md` = **94,383 B / `0d1df1d77293bea67abf73b657e86f4c2021d12c` / mtime `2026-09-12T13:05:40.2531563Z`**（§0–§19 前缀 sha1 经其自证为 `bc9709c25af41c4b12708a690a0f0b5599a9cf85` ⇒ 纯尾部追加）；**verdict 维持 `pass`，本事故不作为 R1–R4 的 blocker**。
7. **可复跑探针**：`.devdata/t7-review/pkg103-variant.mjs`、`.devdata/t7-review/asar-header-pkg.mjs`、`.devdata/t7-review/manifest-projection-compare.mjs`。
8. **非阻塞小事实**：现行树无 `.eslintcache`（t43 的 `npm run lint` 用 `eslint --cache .` 本应生成；reviewer 自跑生成 30,883 B @`13:02:48Z` 后已删除复原）⇒ 不影响 lint 结论。

# T24 — AAC/APE 转码修复：独立验证（实例无关层）

- 验证人：**verifier**
- 采集时间：`2026-09-12T11:38:16Z` – `2026-09-12T11:39:07Z`（本地 19:38–19:39）
- 任务归属：captain 在 t15 加派的「新增必验项（AAC）」；**该结果的正式任务记录待挂**（t15 为 failed 终态、t32 依赖 t29 未完成，见 §5）
- 冻结锚点：`src/**` 聚合 sha1 = **`b7ea6c857054a8890952608fa9d50ed9e94ff759`**，71 文件，最新 src mtime `2026-09-12T10:58:00.199Z`
  - 落盘：`.devdata/t13-r2-evidence/t24-post-snapshot.json`
  - 关键文件：`decodeService.ts` `df1c81800a0d` @ `10:54:32.494Z`（t24 的写入）
  - **与 t26/t28 的锚点逐字节相同** ⇒ t24 的修复在我此前 t26/t28 取证时**已经在树里**，两轮结论处于同一棵树，不存在"锚点漂移"。

## 0. 结论（一句话）

t24 的修复**已在 ffmpeg 行为层被独立复现并证成因果**：同一输入、同一输出路径（`.tmp` 结尾），**去掉 `-f` 必然失败且失败码恰为应用内上报的 `4294967274`；加上 `-f` 必然成功且产物是真正的 MP4/WAV 容器**。m4a 分支与 wav 分支（APE 路径与 remux 回退共用）**两条**均如此。

**但这不是端到端验证**：`decode:ensure` IPC → 产物落盘 `<userData>/decode-cache/*.m4a` → 渲染进程 Web Audio 图真出声这一段**尚未取证**（需要独占一个 dev 实例，见 §4）。因此本报告**不主张**「用户导入 AAC 后一定有声音」的运行期结论，只主张到「转码命令必然产出合法容器」为止。

## 1. 命令与真实退出码

| # | 命令（workdir = `C:\博830\vibecoding\nebula-player`） | 退出码 | 说明 |
|---|---|---|---|
| 1 | `node scripts/snapshot-fingerprint.mjs --label t24-post` | **0** | §0 锚点 |
| 2 | `node scripts/verify-decode-cache-root.mjs` | **0** | 10/10 检查全 true（见 §3） |
| 3 | `node scripts/probe-transcode-repro.mjs` | **0** | 作者侧探针，我独立复跑（见 §2.B） |
| 4 | `node scripts/verify-transcode-branches.mjs` | **0** | **我新建的独立探针**，12/12 PASS（见 §2.A/C） |
| 5 | `<ffmpeg-static> -hide_banner -i .devdata/transcode-fixtures/tone.aac` | 1 | ffmpeg 无输出参数的正常用法，用于确认夹具真实容器 |

原始产物：`t24-transcode-branches.json`、`t24-post-snapshot.json`（本目录）。

## 2. 三层证据

### A. 静态：源码里每个 `.tmp` 输出都带显式 `-f`（新探针 `scripts/verify-transcode-branches.mjs`）

| 行号 | 实参向量 |
|---|---|
| `decodeService.ts:94` | `['-y','-i',mediaPath,'-c','copy','-movflags','+faststart','-f','mp4', tmp]` |
| `decodeService.ts:95` | `['-y','-i',mediaPath,'-vn','-c:a','pcm_s16le','-f','wav', tmp]` |
| `decodeService.ts:105` | `['-y','-i',mediaPath,'-vn','-c:a','pcm_s16le','-f','wav', wavTmp]`（remux 失败回退） |

`-f` 计数 = **3**；`tmp = out + '.tmp'` 的原子 rename 契约**保留**（`:85`、`:86`、`:98`）。
⇒ 该探针同时是一条**回归护栏**：t29/t30/t9 任何一次把 `-f` 去掉而 tmp 仍以 `.tmp` 结尾的编辑，都会让它立刻 FAIL。

### B. 行为：修前 / 修后对照（同一输入、同一输出路径）

输入夹具 `.devdata/transcode-fixtures/tone.aac`，**我先验证夹具本身是货真价实的 ADTS AAC**：
```
Input #0, aac, from '...tone.aac':   Duration: 00:00:05.94, bitrate: 67 kb/s
Stream #0:0: Audio: aac (LC), 44100 Hz, mono, fltp, 67 kb/s
```
（不是被改名的 m4a —— 若夹具本身是 m4a，"修前失败"就可能是伪造的。）

| 分支 | 修前（`.tmp`，无 `-f`） | 修后（加 `-f`） |
|---|---|---|
| aac→m4a remux | **exit 4294967274**，0 字节，末行 `Error opening output files: Invalid argument` | **exit 0**，50382 字节 |
| pcm_s16le（wav 分支） | **exit 4294967274**，0 字节，同上 | **exit 0**，532558 字节 |
| 对照：输出用真实扩展名 `.m4a`、无 `-f` | — | exit 0，50362 字节 |

**这条对照是本报告的关键控**：唯一变量就是"输出名能否被 ffmpeg 推断封装"，因此失败归因于 `.tmp` 后缀而非输入、二进制或 `-c copy`。

### C. 因果：应用内上报的错误码被逐位复现

应用侧 `decodeService.ts:46-51` 用 `解码失败 (${code})` 原样上报 ffmpeg 退出码；t24 现场上报的是 `解码失败 (4294967274): Error opening output files: Invalid argument`。
我独立跑出的修前退出码 = **4294967274**（`0xFFFFFF6A`，即 -22 / EINVAL），末行文本逐字相同。
⇒ **数字与文本双匹配**，应用里那条报错就是本机制产生的，不是同形异因。

产物真伪（用 ffmpeg 自己回读）：
- `-f mp4` 产物：`Input #0, mov,mp4,m4a,3gp,3g2,mj2` / `Audio: aac (LC) (mp4a), 44100 Hz, mono` / `Duration: 00:00:06.04`
- `-f wav` 产物：`Input #0, wav` / `Audio: pcm_s16le, 44100 Hz, 1 channels, s16`

## 3. 产物落点与可服务性（静态 + Vite SSR 实测，实例无关）

`node scripts/verify-decode-cache-root.mjs` **exit 0，`allPass: true`**，10 项全真：
`decodeCacheInRoots`、`coversInRoots`、`cacheFileInsideCache`、`explicitContainerFlags`、`cachePathFromStore`、`aacConvertsToM4a`、`apeConvertsToWav`、`lowercaseTolerant`、`directFormatsUntouched`、`unknownReturnsNull`。
- `decodeCache` = `C:\Users\34872\AppData\Roaming\nebula-player\decode-cache`（`store.ts:23 join(userData,'decode-cache')`）
- `protocol.ts:54` 注册根 = `[covers, decode-cache]` ⇒ 转码产物落在**允许根内**，不会被 F3 越权拦截
- 真实 `needsConvert()`：`aac/AAC → m4a`、`ape/APE → wav`、`mp3/wav/flac/ogg/opus/m4a → null`、`xyz/noext → null`

## 4. 未完成项（如实标注，非失败）

1. **运行期 AAC 整链**：`decode:ensure` → 产物落 `<userData>/decode-cache/*.m4a` → `mode=graph`、`signalPeak>0`、`paused=false`、`elementErrorCode=null`、seek 生效、CORS zeroes 0。
   - 状态：**未取证**。需要独占一个 dev 实例；本回合 9222 上存在**他人正在使用的实例**（见下），按纪律我不发起第二实例、也不使用/终止他人实例。
   - 现场：`netstat` 显示 `[::1]:5173 LISTENING`（PID 25516，node/vite）+ `127.0.0.1:9222 LISTENING`（PID 29288，electron），CDP `/json/version` = `nebula-player/1.0.3`、`Electron/39.8.10`，唯一 page target `http://localhost:5173/`（无 `#mini`），进程启动时刻 `2026-09-12 19:37:26`（本地）。
   - **附带发现（影响他人自查）**：vite 只绑 **IPv6 `[::1]:5173`**，因此 `Test-NetConnection 127.0.0.1 -Port 5173` 会返回 **False**，不能据此判定"dev 未启动"；应以 `netstat` 或 `localhost:5173` 为准。
2. **APE 整链 E2E**：本机 ffmpeg（ffmpeg-static）**无 Monkey's Audio 编码器**，无法合成 `.ape` 素材 ⇒ 按 captain 口径**不做**，记为环境限制。
   - 但 APE 与 remux 回退**共用同一条 wav 实参向量**，该向量已在 §2.B 以分支级证据（AAC 输入）证成；`mediaFormats.test.ts` 的路由判定亦为 `ape → wav`。
   - 措辞纪律：这**不是** APE E2E，只是"该分支的 ffmpeg 实参必然产出合法 WAV"。

## 5. 阻塞与请求（需要 captain 决策）

- `claim_task t15` 于本地 `19:36` **再次被拒**：`task status cannot move from "failed" to "claimed"` —— t15 已是终态，我无法在其下提交本结果。
- `t32`（r3 验证，assignee=verifier）当前 **pending**，`dependencies: [t29]`，而 t29 仍 `in_progress` ⇒ 我此刻**没有任何可 claim 的任务**。
- 请求（二选一）：
  - **(A)** 把「AAC 运行期整链 + APE 分支级说明」并入 **t32 的 acceptance**（我已把实例无关部分做完，claim 后只需补运行期那一段）；或
  - **(B)** 另开一个与 t15 同契约的验证任务承载本报告。
- 另需 captain 明确：**我 claim t32 时能否拥有唯一实例**（当前 9222/5173 被他人实例占用）。

## 6. 给 t29（r3 修复）的前置提醒

t29 的 acceptance 含「tmp 改用 `out + '.' + pid + '.' + counter + '.tmp'`（去掉预清理 rm）」。
该命名**仍以 `.tmp` 结尾** ⇒ `-f mp4` / `-f wav` **依然必需**；若 t29 在清理临时文件命名时顺手删掉 `-f`，本缺陷会原样复发。
⇒ 我将在 t32 上用 `scripts/verify-transcode-branches.mjs`（exit 0 = 12/12）复核 t29 之后的 `decodeService.ts`；只要 `-f` 丢失，它会立即 FAIL 并点名行号。

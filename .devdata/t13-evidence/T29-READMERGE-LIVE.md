# t31 — t27 契约缺陷修正：授权起唯一实例，现场取 `probe-settings-readmerge` exit 0

**任务性质**：verification / round 2。补齐 t27 因契约自相矛盾（签名命令需要实例，而契约禁止起实例）而无法取得的**现场运行数据**；t27 的 8 项只读复核按 captain 指示**直接复用**，本报告只补「现场探针 exit 0」这一块，并给出本次现场运行的完整证据链。

**执行者**：ai-tools（attempt 1，attempt_id `63db8996-241b-47f1-bcff-2479ed8bcf4d`）
**时间**：2026-09-12 11:36–11:39 UTC

---

## 0. 结论（口径）

> **t22 = 读取期递归补键已满足；reviewer 的核心担忧不成立。**

三重支撑：
1. **现场探针 exit 0**（本任务新增，见 §2）：应用在**旧形状配置**上启动后，运行期 `getPublic().general.updateURL === ''`（**string，不是 `undefined`**）；
2. **只读产物解析**（t27 复用 + 本次复核）：`t22-readmerge-proof.txt` 四项值逐字命中；
3. **代码位置**（t27 复用 + 本次逐行核对）：`store.ts:100 readFile → :101 JSON.parse → :103 mergeWithDefaults → :104 this.data = merged`，**早于任何 `get()`**；`settings.ts:27 updateURL: ''` 是 DEFAULTS 值。

⇒ 即使**忽略 t21 的 `?? ''` 与 try-catch**，8s 定时器读到的也是 **string**，`undefined.trim()` **在任何时刻都不可能发生** → 属**根治**，而非「兜底掩盖」。

---

## 1. 授权与实例纪律（acceptance[0]）

- 起实例方式：`Start-Process`（detached，`node_modules/.bin/electron-vite.cmd dev`，工作目录 = 项目根），**唯一一个**；CDP 9222。
- 本次共启动/停止 3 轮（起 → 换夹具重启 → 恢复后重启），**每轮均完全关闭后再起下一个**，无并行实例。
- **未终止任何他人实例**（全程端口核验为 FREE 才启动；收尾前无任何监听进程）。
- **收尾终态**：`5173/5174/9222/9998 全部 FREE`、`electron count = 0`、`dev node orphans = none`。

---

## 2. 现场探针（acceptance[1][2]）

### 2.1 夹具（1.0.2 时代形状）
先备份线上配置，再写入夹具（`general` 仅 `closeToTray/alwaysOnTop/resumeOnLaunch/mediaKeys/scanFolders`，**无 `updateURL`**）：

| 属性 | 实测值 |
|---|---|
| 写入字节 | **276** |
| 首字节 | **123**（`{`） |
| BOM | **absent**（`JSON.stringify` 写法，无 BOM） |
| `general` 键 | `closeToTray,alwaysOnTop,resumeOnLaunch,mediaKeys,scanFolders` |
| `hasOwnProperty('updateURL')` | **false** |

> **无 BOM 为何重要**：若带 BOM，`JSON.parse` 抛错并被 `init()` 的 `catch` 吞掉，整份配置**静默回落 DEFAULTS**——那样 `updateURL` 存在只是"默认值兜底"，无法证明"递归补键"，结论会被污染。夹具首字节 123 恰好排除了这条污染路径。

### 2.2 签名命令（在夹具启动的实例上）
```
node scripts/probe-settings-readmerge.mjs
```
**exit code = 0** ｜ 原始输出：`.devdata/t13-evidence/t29-readmerge-probe-live.txt`

```json
{
  "hasUpdateURLKey": true,
  "updateURLValue": "\"\"",
  "typeofUpdateURL": "string",
  "trimSafe": true,
  "generalKeys": ["closeToTray","alwaysOnTop","resumeOnLaunch","mediaKeys","scanFolders","updateURL"]
}
--- verdict ---
key present at read time        : true
value is the merged default ""  : true
.trim() is safe without fallback: true
```

### 2.3 四项值逐字复核（acceptance[2]）

| 契约要求 | 实测 | 结论 |
|---|---|---|
| `hasUpdateURLKey: true` | `true` | ✅ |
| `updateURLValue: "\"\""` | `"\"\""`（即空串） | ✅ |
| `typeofUpdateURL: "string"` | `"string"` | ✅ |
| `trimSafe: true` | `true` | ✅ |

**运行期语义**：`getPublic().general.updateURL === ''`，**不是 `undefined`** → `index.ts` 8s 定时器里的 `.trim()` 作用在 string 上；**即使忽略 t21 的 `?? ''` 与 try-catch 也安全**。

### 2.4 附带得到的直接证据：读取期补键会自修复文件
夹具启动后，线上 `settings.json` 被应用**在读取期合并后回写**：
```
启动前（夹具）: 276 bytes, general 无 updateURL
启动后        : 372 bytes, general = {..., "updateURL": ""}   ← 补键并落盘
```
这与 `store.ts:105-108` 的注释/实现一致（`if (added.any) await this.flush()`：只有缺键（旧版本配置）才回写，完整配置永不重写）——即补键**确实发生在读取期**，且发生在任何 `get()` 之前。

---

## 3. 现场值与"常规机器"值的区分（重要说明）

| 场景 | `updateURLValue` | 含义 |
|---|---|---|
| **夹具（旧形状，缺 `updateURL`）** | `"\"\""` | 契约要求的场景：缺键 → 读取期用 DEFAULTS `''` 补上 |
| **本机常规配置（已有 `updateURL`）** | `"\"http://127.0.0.1:8888/\""` | 键已存在 → 保留原值；`typeof` 仍为 `string`、`trimSafe` 仍为 `true` |

我在夹具就位前先跑过一次常规配置：**exit 0**，`hasUpdateURLKey=true`、`typeofUpdateURL="string"`、`trimSafe=true`，仅值的字面量是真实 URL（`.devdata/t31-probe-restored.log`）。两种场景**都满足"string 且 trim 安全"**；契约 [2] 要求的 `""` 只在缺键夹具下出现，故本任务的正式取证采用夹具运行（§2）。这说明探针并无异常，只是"缺键与否"决定值的字面量。

---

## 4. 环境恢复证明（acceptance[4] 相关，t27 复用的延伸）

| 步骤 | 证据 |
|---|---|
| 夹具前备份 | `.devdata/t13-evidence/t31-settings-backup-before-fixture.json`（394 B，`updateURL = "http://127.0.0.1:8888/"`） |
| 恢复后文件态 | **394 B，首字节 123，无 BOM，JSON 合法，`general.updateURL = "http://127.0.0.1:8888/"`（typeof string）** |
| 恢复后应用态 | 重启实例后探针 **exit 0**，读数 `"\"http://127.0.0.1:8888/\""` → **原值确实回到运行期**（`.devdata/t31-probe-restored.log`） |

> 说明：本次恢复后的探测刻意**不写入** `t29-readmerge-probe-live.txt`（该文件保持 §2 的契约要求值 `""`），恢复验证的读数另存 `.devdata/t31-probe-restored.log`，以免覆盖契约指定的证据文件。

---

## 5. 同树一致性（acceptance[3]）

```
node scripts/snapshot-fingerprint.mjs --label t29-pre   → .devdata/t13-r2-evidence/t29-pre-snapshot.json
node scripts/snapshot-fingerprint.mjs --label t29-post  → .devdata/t13-r2-evidence/t29-post-snapshot.json
```

| | srcAggregateSha1 | srcFileCount |
|---|---|---|
| pre | `b7ea6c857054a8890952608fa9d50ed9e94ff759` | 71 |
| post | `b7ea6c857054a8890952608fa9d50ed9e94ff759` | 71 |
| 契约要求 | `b7ea6c857054a8890952608fa9d50ed9e94ff759` | 71 |

**pre == post == 契约值（71 文件）** → 本次运行期间 `src/**` 未被改动；`scripts/**` 亦未写入（探针与 `snapshot-fingerprint.mjs` 均只读执行）。

---

## 6. 与 t27 已完成的 8 项只读复核的关系（复用说明）

本报告不重复展开，仅指向既有产物（captain 指示直接复用）：
- `.devdata/t13-evidence/t27-ai-tools-readonly-checks.txt` —— 夹具形状与无 BOM 理由、①升级路径与启动前快照、②存活 `electron=5 / CDP=UP` @ 5/10/15/20/25s、③四类异常标志全零（含 8s 检查确实进入且被安全跳过、boot 行 `update feed=(none)` 读的是存储值不能单独当证据）、④产物四项值、⑤前后对照（~8.1s `trim` TypeError ↔ 25s 零异常）、线上配置恢复复核、只读边界与实例终态
- `.devdata/t13-evidence/t22-readmerge-proof.txt`、`T22-READMERGE-VERIFICATION.md`、`t22-verify-settings-backup.json`（audio-engine 的原始取证）
- `.devdata/t13-evidence/t27-probe-attempt-by-ai-tools.txt`（t27 时无实例导致的 exit 1 记录，保留作对照）

**本次新增的唯一实质证据**：现场实例上的探针 **exit 0** + 四项值逐字命中 + 读取期自修复落盘（§2.4）。

---

## 7. 逐条对应 t31 acceptance

| # | 要求 | 结果 |
|---|---|---|
| 0 | 授权起唯一实例并在收尾关闭（electron 0、端口全 FREE、无 orphan；不终止他人实例） | ✅ 见 §1 |
| 1 | 签名命令真实 **exit 0**，原始输出落 `t29-readmerge-probe-live.txt` | ✅ 见 §2.2 |
| 2 | 四项值逐字复核 + 「即使忽略 t21 兜底也不会崩」的说明 | ✅ 见 §2.3 |
| 3 | 前后指纹均为 `b7ea6c85…`（71 文件） | ✅ 见 §5 |
| 4 | 不写 `src/**`、`scripts/**`；产出落 `.devdata/t13-evidence/` | ✅ 见 §5、§6 |
| 5 | 结论 + 三重支撑 + 报告落 `.devdata/t13-evidence/T29-READMERGE-LIVE.md` | ✅ 本文件 |

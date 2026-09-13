# R2 补充验证（t28）— decode-cache 根 / 迷你窗关闭 / 稳定实例 12s

> 验证人：verifier（**只读**）。证据目录：`.devdata/t13-r2-evidence/`。
> captain 裁定：`0xC0000409` = **环境/基础设施**（`STATUS_FAIL_FAST_EXCEPTION`，探针进程被强杀；`--compare` 后 **electron=0 且 vite=0** 说明整棵作业树被回收）→ **不判产品缺陷**，唯一能定性的是打包态（t9 直接跑 `nebula-player.exe`）。

## §0 冻结锚点（claim t28 起）

| 项 | 值 |
|---|---|
| `src/**` 聚合 sha1 | **`b7ea6c857054a8890952608fa9d50ed9e94ff759`** |
| src 文件数 / 最新 mtime | **71** / `2026-09-12T10:58:00.199Z` |
| 落盘 | `t28-anchor-snapshot.json` |

**本结论基于 `b7ea6c85…` 号快照。**

## §1 质量门（t28，真实退出码 + 时间戳）

| 命令 | 退出码 | 结果 |
|---|---|---|
| `npm.cmd run lint` | **0** | **0 error / 1 warning**（唯一 `TrackList.tsx:42 react-hooks/incompatible-library`） |
| `npm.cmd run typecheck:node` | **0** | 通过 |
| `npm.cmd run typecheck:web` | **0** | 通过 |
| `npm.cmd test` | **0** | **11 files / 118 tests passed** |

日志：`lint-t28.log`、`typecheck-node-t28.log`、`typecheck-web-t28.log`、`tests-t28.log`。

## §2 项目 2 — decode-cache 是否在 `media://` 允许根内 → **通过 ✅**

探针：`node scripts/verify-decode-cache-root.mjs` → **exit 0**（`t28-decode-cache-root.json`）

| 检查 | 实测 |
|---|---|
| `decodeCacheInRoots` | **true** —— `protocol.ts:54` 的注册集合 = `new Set([resolve(p.covers), resolve(p.decodeCache)])` |
| `coversInRoots` | true |
| `cacheFileInsideCache` | true（`<userData>/decode-cache/<hash>.mp4` 在根内） |
| `cachePathFromStore` | true（`store.ts:23` `decodeCache: join(userData, 'decode-cache')`） |
| `explicitContainerFlags` | true（`decodeService.ts` 有 `-f mp4` 与 `-f wav`） |

**用真实模块 `needsConvert()`（经 Vite SSR 加载 `src/main/mediaFormats.ts`）实测判定**：

| 输入 | 返回 | 期望 |
|---|---|---|
| `a.mp3 / a.wav / a.flac / a.ogg / a.opus / a.m4a` | `null` | 直连 ✅ |
| **`a.aac` / `a.AAC`** | **`'m4a'`** | ✅（大小写不敏感） |
| **`a.ape` / `a.APE`** | **`'wav'`** | ✅ |
| `a.xyz` / `noext` | `null` | ✅ |

→ **AAC / APE 的转码产物落在允许根内**，`protocol.ts` 会放行（否则真实用户播不了）；`DIRECT_EXTS` 的 6 个直连格式**不受影响**。
→ **APE 按 captain 口径只做静态/单元级核验**：判定与调用接线、产物目录均正确；**本机无 Monkey's Audio 编码器 = 已知限制，不判失败**。

## §3 项目 1 — 迷你窗关闭后应用是否存活 → **未取到（环境中断）**

- **代码预期（已核实）**：`index.ts:347-355` `window-all-closed` 仅在 `platform!=='darwin' && !isQuitting() && !settings.general.closeToTray` 时 `app.quit()`；**`closeToTray` 默认 `true`**（`settings.ts:22`，dev 与打包态实测均为 `true`）→ **主窗仍在时关闭迷你窗不应触发 `window-all-closed`**，应用应继续存活。
- **运行期实测**：**未完成**。本轮我起实例后执行该实验时实例链消失（与 §5 的环境现象同源）；**按 captain 裁定不判产品缺陷**，但**该实验本身也未取得数据** → 如实标注为"环境中断、未取到"。
- **补充给 t9 的已知非缺陷路径**：若 `closeToTray=false`，**关主窗 → `window-all-closed` → `app.quit()`（干净退出、无日志）**——探针里极易误读为"崩溃"。
- **建议**：该项目在 **t9 打包态**用 `Start-Process` 独立进程组 + 记录 PID 复验（打包态不经 dev 链、不嵌套在探针作业里，是本机唯一能定性的实验台）。

## §4 项目 4 — 稳定实例 12 秒 `--sustained` → **未取到（环境中断）**

- captain 已允许**分段采样**（每段「启动→采 ≤6s→停」拼接，标注每段起始时间戳与实例来源 PID）。
- **本轮未执行**：实例链在实验期间消失（同 §5）。此前**成功捕获过一次完整 12 秒表**（同一棵树，`diag-cors.mjs --sustained` exit 0）：
  `t+1s…t+12s` 全 `mode=graph`、peak **211→244**、maxDev **16**、`playing=true`、`fallbackTried=false`，`VERDICT: all 12 samples peak>0 && maxDev>0 = true; mode stayed graph = true`；日志中 `Web Audio graph silent → direct playback fallback engaged` **0 命中**。
- → 该项目**在本轮未新增证据**；历史那次**仍可引用**（同指纹），但**我未按分段口径重做**，如实标注。
- **适用范围说明（t41 复核，2026-09-12；按 captain 裁定补写，不需重跑）**：该 12 秒表**采集自 pre-t24 树**（`src/**` 聚合 `b7ea6c857054a8890952608fa9d50ed9e94ff759`）。**t22（`store.ts` 深合并）、t23（`index.ts` 定时器容错）、t24（`decodeService.ts` 显式封装）均不触碰频谱链路**。此外我在 **r3 树上逐行复核了该链路的两根承重件仍然在位**：`src/main/index.ts:69` 仍为 `corsEnabled: true`（`:58`/`:77-78` 的注释明示其承重），`src/main/protocol.ts:91-96` 的 `CORS_HEADERS` 仍为 `Access-Control-Allow-Origin: '*'` + `Allow-Methods` + `Allow-Headers` + `Expose-Headers`（**无 CORP**），且 200 响应路径 `:185`/`:199` 仍带该头 ⇒ **t33（闩锁→缓存 Promise）与 t40（mediaRoots 抽取）的改写未触及这两处**。
  ⇒ 该表结论在 `b7ea6c85…` 与当前 r3 树（`e7756117…`）上**同样适用**；**不需要重跑**（captain 裁定）。
- 日志侧两条证据一并保留：`Web Audio graph silent → direct playback fallback engaged` **0 命中**、`outputs zeroes … CORS access restrictions` **0 命中**。

## §5 环境章节（按 captain 裁定记账）

| 现象 | 记账 |
|---|---|
| `0xC0000409`（`STATUS_FAIL_FAST_EXCEPTION`） | **环境/基础设施**：探针进程被强杀；`--compare` 后 **electron=0 且 vite=0** ⇒ 整棵作业树被回收，非应用自杀 |
| 实例链"莫名消失" | 同上；**不写成产品缺陷**、不写成"安装包坏了" |
| 唯一能定性的实验台 | **t9 打包态**：直接 `Start-Process nebula-player.exe`（不经 dev 链、不嵌套探针作业）+ 记录 PID |
| 我的整改 | 长探针改用**独立进程组**启动；报告记录**启动方式 + PID** |

## §6 结论

| 项目 | 结果 |
|---|---|
| 冻结锚点指纹 | ✅ `b7ea6c85…`（71 文件） |
| 质量门（lint/typecheck/test） | ✅ **0 error / 1 warning**、`0/0`、**118 passed / 11 files** |
| **项目 2：decode-cache 允许根 + AAC/APE 判定** | ✅ **通过**（含真实 `needsConvert` 实测） |
| 项目 1：迷你窗关闭存活实验 | ❌ **未取到**（环境中断；代码预期为"应存活"） |
| 项目 4：稳定实例 12s `--sustained` 分段表 | ❌ **本轮未新增**（历史一次完整表可引用，同指纹） |
| F1 / F5 / mock 自检（复跑） | ✅ exit 0 / exit 0 / exit 0（11-11 PASS） |
| 进程级死亡 | ⚠️ **单列未闭合项**；按裁定归环境，**不用 t22/t23 当"已解决"证据** |

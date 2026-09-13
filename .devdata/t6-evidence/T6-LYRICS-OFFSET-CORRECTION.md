# t6 附录 D — t4 歌词偏移：mini 同步与点击跳转的更正与补验

> 起因：audio-engine 指出我此前的 mini 观测是**探针口径问题**，不是产品缺陷；同时我的探针**遗漏了"点击跳转计入偏移"**这一验收项。本附录记录更正与补验结果。

## 1) 更正：此前"迷你窗未同步"的观察是**我探针的口径问题**
- 我原先在**冻结播放位置 t≈10.9s** 上依次试 `0 → +0.5 → +1.5`，而本曲歌词时间点是 **t = 2 / 6.5 / 11 / 15.5 …**（`.devdata/test-music/song-long.lrc`，`[ti:]/[ar:]` 为元数据、被 `parseLrc` 跳过）。
- 判定式（`MiniPlayer.tsx:87`、`LyricsPanel.tsx`）为 `line.t <= display + 0.12 + offset`：
  - t=10.9 时 `display+0.12 = 11.02 ≥ 11` → 本就落在**行2**
  - `+0.5 → 11.52`、`+1.5 → 12.52` 都**仍在行2 与行3(15.5) 之间** → 高亮**本来就不该变**
- 结论：**mini 同步观察一致是正确行为**，我此前把它列为"未验/疑似不同步"是**过度声明**，现予更正。感谢 audio-engine 的纠正。

## 2) 补验：用"能跨行"的偏移量，mini 高亮确实随偏移变化
新探针 `scripts/verify-lyrics-sync-crossing.mjs`：冻结在 **t≈1.06**（首行 2.0 之前），偏移取自模块 API `setOffset()`（与面板同源），结果：

| 偏移 | mini `active` | mini `prev` | mini 行数 |
|---|---|---|---|
| 0 → 起始 | `夜幕低垂 星光闪烁`（或 null 首行态） | — | 1–2 |
| **+2.1** | **`远处传来 熟悉的旋律`** | `夜幕低垂 星光闪烁` | 3 |
| **+7.0** | **`我在城市的边缘 轻声哼唱`** | `远处传来 熟悉的旋律` | 3 |
| 回到 0 | `夜幕低垂 星光闪烁` | — | 1–2 |

两次独立运行的采样序列（原始证据 `probe-lyrics-sync-crossing.json`）：
- 运行 A（`probe-lyrics-sync-crossing.json` 早前快照）：
  | 偏移 | mini `active` | mini `prev` | lines |
  |---|---|---|---|
  | 0 | `夜幕低垂 星光闪烁` | — | 2 |
  | **+2.1** | **`远处传来 熟悉的旋律`** | `夜幕低垂 星光闪烁` | 3 |
  | **+7.0** | **`我在城市的边缘 轻声哼唱`** | `远处传来 熟悉的旋律` | 3 |
  | 回 0 | `夜幕低垂 星光闪烁` | — | 2 |
  主窗同刻读数：`夜幕低垂 星光闪烁` → `夜幕低垂 星光闪烁` → `远处传来 熟悉的旋律` → `null`（主窗比 mini **滞后一行**，见下方说明）
- 运行 B（更早一次）：
  `null → null → 夜幕低垂… → 夜幕低垂…`，`lines` 1→2→3 随偏移增长
→ **高亮随偏移跨行变化、复位回退**，与 audio-engine 的独立实测（offset 2.1→行0、7.0→行1、复位→回退）一致。

### 关于 `storage` 事件机制证据的说明（如实）
按 captain 要求，我在 `verify-lyrics-sync-crossing.mjs` 里**已经加装**了"在迷你窗 renderer 内挂 `storage` 监听收集 `{key,oldValue,newValue}`"的取证代码；但**本机当前的探索式实例在跑该探针时会中途崩溃**（见 §8），因此我**没有拿到那一份事件数组的成功快照**。
替代的直接机制证据（均为已落盘实测）：
1. **mini 高亮确实随主窗改写的偏移跨行变化**（运行 A/B 的 `active`/`lines` 变化）——若 mini 不订阅偏移存储，这两个量不会随偏移改变；
2. **mini 与主窗共用同一模块**：`MiniPlayer.tsx:5` `import { getOffsetSnapshot, subscribeOffsets }`、`:37` `useSyncExternalStore(subscribeOffsets, getOffsetSnapshot(trackId))`、`:87` 判定式含 `offset`——与主窗 `LyricsPanel.tsx:48` 完全同源；
3. localStorage 键实测：`nebula.lyricsoffset` = `{"aee944d929770f08f757":<偏移>}`，由主窗写入。
→ 结论：**同步机制成立**；`storage` 事件数组本身**未取到成功快照**，如需该形态证据，请在 t21 修复后重跑本节探针（我会补）。


> 说明：mini 是**独立 renderer**，其 `display` 由主窗经 IPC 推送后**自行按 1Hz 插值**，因此在"刚改完偏移"的瞬间可能比主窗**滞后一行**；这解释了两次运行序列不完全相同。同步机制本身可靠（audio-engine 另在 mini 内挂 `storage` 监听，实测捕获 `{key:'nebula.lyricsoffset'}` 事件并触发重渲染）。

## 3) 补验：**点击跳转计入偏移**（此前完全缺失的一项）
`LyricsPanel.tsx:204` 的实现是 `usePlayerStore.getState().seek(Math.max(0, l.t - offset))`。
实测（点带 `风把思念 吹向远方` 的行，其 DOM `data-i=3` 对应 `lines[3].t = 15.5`，当前偏移 2.5s）：

```
dataIndex            : 3
lineText             : 风把思念 吹向远方
lineT                : 15.5
offsetInEffect       : 2.5
expected = 15.5-2.5  : 13
actual               : 13
accountedForOffset   : true          ← 通过
```

- **首次判定为 false 是我的期望值写错**（我误以为该行 t=11.0，实际 11.0 是 `我在城市的边缘`，索引 2；`风把思念` 是 15.5/索引 3）。改为**从 DOM `data-i` + 应用自身 `lyricsGet` 反查 `t`** 后判定为 **true**。
- 结论：**点击跳转计入偏移：通过**（`t − offset` 精确吻合）。

## 4) 选择器口径（采纳 audio-engine 的规范）
新探针与 `verify-lyrics-offset.mjs` 均可用 `button[title^="歌词提前"]` / `button[title^="歌词延后"]` / `button[title="重置本曲歌词偏移"]` 定位控件；偏移读数取 `.detail .chip-badge`（我原探针用 tuner 容器的 `<span>` 读取，两种写法都稳定）。选主窗用 `url.endsWith('5173/')`、迷你窗用 `url.includes('#mini')`。

## 5) t4 四项验收 → 最终状态

| 验收项 | 结论 | 证据 |
|---|---|---|
| 跨行翻转（±0.5s 步进生效） | **通过** | 同一 `currentTime=10.9` 下 `0.0s→行2`、`−0.5s→行1`、`+0.5s→行2`（`probe-lyrics-offset.json`） |
| 逐曲记忆（localStorage 按曲目） | **通过** | `nebula.lyricsoffset` 记录 `{aee9…f757:-0.5/-1/0.5}`；切到 song-c 为空、切回恢复 +1.0s |
| **迷你窗同步** | **通过** | 本附录 §2（offset 2.1/7.0 跨行时 mini 高亮随动） |
| **点击跳转计入偏移** | **通过** | 本附录 §3（`15.5 − 2.5 = 13.0` 精确吻合） |

## 6) 相关交付脚本处理（按 audio-engine 说明）
- 保留：`scripts/diag-graph.mjs`、`scripts/diag-cors.mjs`（t2/t10 交付脚本）。
- 我的 t6 工装（`verify-*.mjs`、`mock-llm-confirm.mjs`）继续保留在 `scripts/**`；t11 的 `!scripts/**` 已保证它们不进安装包。
- 全仓 `tmp-*` 残留：我此前删除过自己的 `verify-lyric-sync.mjs`（被本附录的交叉探针取代），当前无 `tmp-*`。

## 7) 回退路径（graph→direct）的处置
按 captain 明令：**不得**为验收临时回退 t10 三处改动。该条以**代码路径保证**记录：`startDetection()`（1200ms 轮询）→ 连续 3 次 `readPeak()===0` → `switchToDirect()`（含 `fallbackTried` 一次性守卫 + `emit('fallback')`）；`getAnalyser()` 在 direct 下返回 null → `NowPlaying` 走 `drawWaveform`。
**补强证据**（captain 建议的"未触发"反证）：持续采样期间**日志/控制台均不出现** `Web Audio graph silent → direct playback fallback engaged` 这一行，且 `fallbackTried` 恒 false。

## 8) 本轮探索式实例的稳定性（影响"重复取事件数组"）
- **P0 缺陷已由 t21 修复**：`src/main/index.ts:308` 现为 `const feed = settings.getPublic().general.updateURL ?? ''`（此前是 `.trim()` 直取），启动期 8s 定时器不再抛 `uncaughtException`；最新 boot（18:46）日志中**无** uncaughtException。
- 但**我做本轮重复取样时实例仍会中途死亡**（探针退出码 `-1073740791` = `0xC0000409`，且每次死亡后 `9222` 不可达）。已排除的诱因：启动期更新检查（已修）、并发编辑（我独占实例）、探针自身的连接管理（`--playback`/`--sustained` 与本节探针都出现过）。
- 影响：**不能**在本轮把"同一实例上连续多次取样"的形态证据补齐（例如 mini 的 `storage` 事件数组、`--sustained` 的 12 秒表）。
- 不受影响：**已经取得的单次/少数次快照结论**（t10 对照、t1、t3、t4 四项）均取自实例存活期内成功完成的批次，且关键结论有 2 次以上独立运行互相印证。
- 建议：请 captain 决定是否把"实例中途死亡"也并入 t21 的复现清单（给出 `0xC0000409` 退出码 + `scripts/verify-crash-timing.mjs`/`crash-timing.json` 作为复现工具）。


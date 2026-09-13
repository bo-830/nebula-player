# t6 附录 B — 测试稳定性取证（针对 playerStoreSleep 偶发失败）

> 起因：captain 报告 ai-tools 复跑时曾**可复现地**失败过 `playerStoreSleep.test.ts` 中 "never persists the timer — a restart starts with sleep off"（栈指向 `playerStore.ts:301`），随后自行消失。t5/t6 都以"全仓测试全绿"为验收证据，故需稳定性取证。

## 1) 结论速览

| 项目 | 结果 |
|---|---|
| 全仓测试连跑 **3 次** | **3/3 通过**，真实退出码全为 **0**，每次 `Tests 106 passed (106)` / `Test Files 11 passed (11)` |
| `playerStoreSleep.test.ts` 单独连跑 **10 次** | **10/10 通过**（每次 `Tests 8 passed (8)`，退出码 0） |
| `chatConfirm.test.ts` 单独跑 | **通过**（`Tests 9 passed (9)`，退出码 0） |
| 复现次数 | **本轮 13 次运行、0 次失败**，无法复现 captain 报告的那次失败 |
| 判定 | **偶发未复现**；但定位到**结构性脆弱点**（见 §3），属"测试自身对跨用例状态残留敏感"，非实现缺陷 |

命令与真实退出码（由 `scripts/verify-test-stability.mjs` 采集：Node 直接 spawn `npx.cmd`，日志由 Node 写盘）：

```
npx.cmd vitest run --reporter=verbose                    → exit 0  ×3   (106 tests each)
npx.cmd vitest run <playerStoreSleep.test.ts> --reporter=verbose → exit 0  ×10 (8 tests each)
npx.cmd vitest run <chatConfirm.test.ts> --reporter=verbose      → exit 0  (9 tests)
```

原始日志：`.devdata/t6-evidence/test-full-run{1,2,3}.log`、`test-stress-playerStoreSleep-{1..10}.log`、`test-chatConfirm.log`、`test-stability.json`。

> 说明：captain 建议的 `cmd.exe /c "npx.cmd vitest run > … 2>&1"` 形式在本机对本项目**不可用**（项目路径含 CJK，cmd.exe 无法解析自身 cwd → "系统找不到指定的路径"；Node 24 另对 `cmd.exe /c`/`node -e` 抛 EINVAL）。改用 Node 直接 spawn（`shell:true`）读取真实 `error.code`，满足"权威退出码 + 可复核日志"的实质要求。

## 2) 用例定位更正（重要）

captain 给的定位是"`playerStoreSleep.test.ts:147` + 用例名 never persists the timer"。实测该文件里：

- `:147` 实际是 **`keeps playing through the queue and only stops once the queue ends`**
- `never persists the timer — a restart starts with sleep off` 在 **`:175`**

即"文件:行号"与"用例名"对不上（可能是报告时按编辑中版本的行号记录的）。**结论不受影响**——两者本轮均 3+10 次通过。

## 3) 结构性脆弱点（本轮未触发，但是真实风险）

失败用例的断言（`:175-188`）：

```ts
st().setSleepMinutes(30)
st().setVolume(0.5)              // 触发 300ms 防抖持久化
vi.advanceTimersByTime(500)
expect(written.length).toBeGreaterThan(0)
for (const raw of written) {
  expect(raw).not.toContain('sleep')
  expect(raw).not.toContain('deadline')
  const parsed = JSON.parse(raw)
  expect(Object.keys(parsed).sort()).toEqual(['mode', 'volume'])   // ← 脆弱断言
}
```

而实现（`playerStore.ts:37-53`）：

```ts
let saveTimer = null                                  // 模块级、跨用例存活
function persistPlayer() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const { current, currentTime, volume, mode } = usePlayerStore.getState()
    const data = { volume, mode }                     // 总会写 volume+mode
    if (current) { data.trackId = current.id; data.position = currentTime }   // ← current 非空就多两个键
    localStorage.setItem(SAVE_KEY, JSON.stringify(data))
  }, 300)
}
```

`beforeEach`（:69-70）只重置 `sleep/sleepRemaining/queue/index/mode`，**不重置 `current`**；`afterEach`（:77）也只重置 `sleep/sleepRemaining`。因此：

- 若**同一文件内更早的用例**把 `current` 置为非空（例如任何调用 `playTracks`/`resumeIfSaved` 的用例、或未来的新增用例），随后 `:186` 的 `toEqual(['mode','volume'])` 会因多出 `position`/`trackId` 而**必然失败**；
- 反之，只要 `current` 恰好为 `null`（当前实际状态），该断言恒过——这正是"能复现又自行消失"的特征：**取决于用例执行顺序与本文件内的状态残留，而非环境本身**。
- 另有次要脆弱点：`written`/`saveTimer` 为模块级；若某用例在 fake timers 下留下未触发的防抖定时器，下一个用例的 `vi.advanceTimersByTime(500)` 会**顺带触发上一个用例的写入**，把旧快照混进 `written`。

**判断（按 captain 要求三选一）**：倾向 **"测试用例间的状态残留/顺序依赖"**，而非实现缺陷；也未观察到"持久化残留污染磁盘"（stub 每次 `beforeEach` 重建，`written` 清空）。

**建议的加固（属 t5/quality 的 inScope，我未改动）**：
1. `beforeEach` 里显式 `usePlayerStore.setState({ current: null, currentTime: 0, duration: 0, isPlaying: false, muted: false })` —— 让该用例不依赖 `current` 是否为空的偶然性；
2. 或把断言改为"**只断言 sleep 相关键不出现**"（测试本意是"定时器不被持久化"），例如 `expect(parsed).not.toHaveProperty('sleep')` + `expect(parsed).not.toHaveProperty('deadline')`，不锁死键集合；
3. 更彻底：在 `afterEach` 清 `saveTimer`（需导出测试钩子）或让每个用例使用全新 `written` 沙箱。

## 4) chatConfirm.test.ts 两条指定断言（captain 第 4 点）

确认**确实在跑且通过**（`test-chatConfirm.log` 中 9 个用例全 `✓`，0 skip/only/todo）：

| 断言 | 位置 | 值 | 状态 |
|---|---|---|---|
| 确认路径末条气泡 | `:234` | `toBe('好的，我来把这两首移出「夜跑」。已移出 2 首歌曲。')` | **通过** |
| 取消路径末条气泡 | `:277` | `toBe('需要把这两首移出「夜跑」吗？好的，已取消，没有改动歌单。')` | **通过** |
| 防重复（确认） | `:235` `:236` | `indexOf(narration) === 0` 且 `split(narration).length - 1 === 1` | **通过** |
| 防重复（取消） | `:278` `:279` | `indexOf(narration) === 0` 且 `split(narration).length - 1 === 1` | **通过** |
| 工具序列 | `:249-253` `:282-286` | 第 2 轮 `tool` 消息恰好 1 条且紧跟 `assistant.tool_calls`；取消回填 `用户已取消该操作` | **通过** |

对应用例（均 ✓）：`chat confirmation flow (chatStore.ts) > pauses the turn on a destructive call and continues as soon as the user confirms`、`… > tells the model the user cancelled and keeps the sequence intact (no duplicate tool message)`。

## 5) 根因确认 + 快照指纹（captain 补充 ui-features 的实证后复跑）

captain 转述的根因：第 8 例 "never persists the timer" 调 `setVolume(0.5)` → 真实 `audioEngine.setVolume()` → `audioEngine.element()` 懒创建 `<audio>` → node 环境 `ReferenceError: Audio is not defined`，栈因此停在 `playerStore.ts:301`；该文件原本只有第 5/6/7 例打了 engine 桩。

**我的独立复核（`scripts/verify-flake-rootcause.mjs`，证据 `flake-rootcause.json`、`flake-single-test.log`）**：

| 检查 | 结果 |
|---|---|
| 该文件是否已对 engine 入口统一打桩 | **是**：`:24 pauseSpy`、`:27 volumeSpy`、`:64 pauseSpy()`、`:65 volumeSpy()`（在 `beforeEach` 内） |
| 第 8 例是否仍直触真实 engine | 否：`setVolume(0.5)` 在 `volumeSpy()` 生效后执行；`vi.mocked(audioEngine.pause)` 断言 |
| 单测单跑（`-t "never persists the timer"`） | **exit 0**，`Tests 1 passed \| 7 skipped (8)`，**无 ReferenceError** |
| 整文件单跑 | **exit 0**，`Tests 8 passed (8)`，无失败行 |
| 根因是否仍可复现 | **不可**——打桩已在最终快照中就位 |

**快照指纹**（仓库无 git，用 mtime+size+sha1 固定版本；采集于 `2026-09-12T08:22:53Z` ≈ 本地 16:22）：

| 文件 | mtime（本地） | size | sha1(12) |
|---|---|---|---|
| `src/renderer/src/lib/__tests__/playerStoreSleep.test.ts` | **2026-09-12 15:14:45** | 7123 | `73ff83f7970f` |
| `src/renderer/src/stores/playerStore.ts` | 2026-09-12 15:25:52 | 14041 | `3efe56326f4d` |
| `src/renderer/src/lib/audioEngine.ts` | 2026-09-12 15:22:39 | 19520 | `e01f4c0d66d5` |
| `src/renderer/src/stores/uiStore.ts` | 2026-09-06 14:12:46 | 2251 | `e3eef3ac940d` |

**关于"t1 completed 之后又修订测试文件"这一时点**：captain 提到的后置修订应为 **15:14:45** 这次（与文件内 `volumeSpy`/`pauseSpy` 打桩一致）；captain 报告的失败是在该修订之前发生的。我本轮**全部 13 次运行都发生在这份最终快照之上**（我首次运行该文件约在 15:30 之后），因此：**§1 的 13/13 全绿正是对该最终快照的验证，可以直接引用**。

**语义确认（与 captain 一致）**：`persistPlayer()` 只写 `{volume, mode}`（有 `current` 时附加 `trackId/position`），`sleep/sleepRemaining` 纯内存 → 重启必为 `null`；该用例已断言写入键恰为 `['mode','volume']` 且不含 `sleep`/`deadline`。

> 注：§3 记录的"锁死键集合 + `beforeEach` 不重置 `current`"仍是**未被触发的**脆弱点（当前该文件全文无任何给 `current` 赋值之处），与本次根因无关，保留为加固建议。


## 6) 与 captain 给出的基线对账

captain 给的基线是 **6 files / 56 tests**（format4/sleepTimer20/search9/recommend6/playerStoreSleep8/chatConfirm9 = 56）。当前实际为 **11 files / 106 tests**——差额来自 t5 新增的主进程与队列/歌词偏移用例：

| 文件 | 用例数 |
|---|---|
| `src/main/__tests__/lrc.test.ts` | t5 新增 |
| `src/main/__tests__/mediaFormats.test.ts` | t5 新增 |
| `src/main/__tests__/scanner.test.ts` | t5 新增 |
| `src/renderer/src/lib/__tests__/queue.test.ts` | t5 新增 |
| `src/renderer/src/lib/__tests__/lyricsOffset.test.ts` | t4/t5 新增 |

即基线数字是 t5 完成**之前**的快照，当前 106 为终版。

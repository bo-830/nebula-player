# t6 附录 C — 格式合规核对（回应 captain「资产备案 + 验证边界」第 2 点）

> 目的：确认 t5 的格式化动作是**纯格式**（不改变行为），并界定 prettier 告警的归属，避免被算成越界或行为改变。

## 1) 结论速览

| 范围 | prettier 状态 | 差异性质 | 是否影响验收 |
|---|---|---|---|
| `src/**/*.ts`、`src/**/*.tsx`（含全部新增测试） | **全部已是 prettier 格式** | **byte-identical**（`byteIdentical=true, lenDelta=0`） | 无 |
| `src/renderer/src/styles/*.css`（3 个文件） | prettier 报告未格式化 | **仅 white-space / 换行**（结构计数完全一致） | 无（**eslint 不检查 CSS**，不进入 lint 门） |
| `scripts/**`（约 30 个 .mjs） | prettier 报告未格式化 | 纯格式（.mjs 不在 lint 范围，且 t11 已排除出打包） | 无 |

**核心结论**：**没有任何 TypeScript/TSX 源文件**被 prettier 判定需要改写——我抽查的 `src/main/protocol.ts`、`src/main/index.ts`、`src/renderer/src/lib/tools.ts`、`src/renderer/src/stores/playerStore.ts`、`src/renderer/src/components/NavBar.tsx` 五份文件，与 `prettier` 输出**逐字节相同**；被 captain 备案为 t5 资产的 `chatConfirm.test.ts` / `sleepTimer.test.ts` / `playerStoreSleep.test.ts` / `lrc.test.ts` 四份测试文件，`prettier --check` 亦为 **"All matched files use Prettier code style!"**。因此"t5 的 prettier --fix 属纯格式"这一判断**成立**，且实际影响面比预期更小。

## 2) 证据与命令

```powershell
node scripts/verify-formatting-only.mjs        # 逐文件：是否 byte-identical / 仅空白
node scripts/verify-format-class.mjs <file>    # 单文件：空白/逗号/结构计数 + 差异片段
```

五份 TS/TSX 抽查结果（`probe-formatting-only.json`）：

```
src/main/protocol.ts                      byteIdentical=true  whitespaceOnly=true  lenDelta=0
src/renderer/src/components/NavBar.tsx    byteIdentical=true  whitespaceOnly=true  lenDelta=0
src/renderer/src/lib/tools.ts             byteIdentical=true  whitespaceOnly=true  lenDelta=0
src/renderer/src/stores/playerStore.ts    byteIdentical=true  whitespaceOnly=true  lenDelta=0
src/main/index.ts                         byteIdentical=true  whitespaceOnly=true  lenDelta=0
```

## 3) CSS 的差异到底是什么（如实说明，并给出"不进入门"的依据）

`app.css` 唯一的差异形态是**多值声明换行**：

```
original : transition: background var(--dur), …
formatted: transition:
            背景 var(--dur),
            …
```

结构计数**完全一致**（braces 484/484、semicolons 1063/1063、parens 772/772、colons 1107/1107），属纯排版。

**一个我核实后修正的判断**：我最初用"`npx eslint src` 报 0 条 `prettier/prettier`"来推断 CSS 没问题——这个推断**不成立**，因为 **eslint 根本不检查 `.css` 文件**（lint 范围是 `**/*.{ts,tsx}` 与 js 配置），所以"eslint 沉默"不能证明 CSS 格式正确。正确依据应为：**prettier 单独对 CSS 报告的差异经核对是纯空白/换行，且 lint 门不覆盖 CSS**。这一点已更正，避免用错误的推理支撑正确结论。

## 4) 与 captain 备案的三类改动对账

| captain 备案项 | 我的核对 |
|---|---|
| ① 新增测试文件（chatConfirm/sleepTimer/playerStoreSleep 等） | 确认存在、被 `npm test` 实际执行（11 files/106 tests），且 prettier 合规；`changedPaths` 里确实没有它们（契约校验器拒收未声明路径）——**不算越界**，与备案一致 |
| ② t5 全仓 `prettier --fix` 属预期 | 确认：**TS/TSX 无一处需要改写**；仅 CSS/scripts 仍被 prettier 标记，且都是纯排版——**不构成行为改变**，与备案一致 |
| ③ t11 改 `electron-builder.yml`（`!scripts/**`） | 属预期配置变更；我未改动该文件，且已用 prettier 核查确认 `scripts/**` 不进 lint、其格式不影响门与产物 |

## 5) 对我方（t6）取证结论的影响

无影响。质量门仍为：`npm run lint` **exit 0 / 0 error / 1 warning**、`typecheck:node|web` **0/0**、`npm test` **exit 0 / 106 passed**；唯一 warning 是 `TrackList.tsx:42 react-hooks/incompatible-library`（TanStack Virtual 已知限制），与格式无关。

# t54 — 薇拉 Vela：AI 助手定名与人格落地

工作目录 `C:\博830\vibecoding\nebula-player`（Electron + React 19 + TS + zustand）。
本报告只覆盖 **t54**（J）；运行期验证不在本任务范围（不起 dev 实例）。

| 项 | 值 |
|---|---|
| attempt | 1，attempt_id `888df71d-c756-42f8-983d-bac5b5c6e17f` |
| 起止（UTC） | 2026-09-13T12:29:35Z（起点=边界）→ 2026-09-13T12:48:44Z（指纹） |
| 门禁 | `typecheck` **0**（TS error 计数 **0**）· `lint` **0**（0 error / 1 warning = 既有 `TrackList.tsx:42`）· `test` **0**（**16 files / 176 passed**；对比本任务基线 16/167（t50 后）⇒ **+9**，对比更早的 16/165 ⇒ +11） |
| 收敛树指纹 | `srcAggregateSha1 = 83d13b16706a441c5d4f331d00ad86d12568b343`（83 文件，newest src mtime `2026-09-13T12:48:33.832Z`，`scripts/snapshot-fingerprint.mjs --label t54-postfix`） |

---

## 1. 交付内容（4 个文件，全部 inScope）

| 文件 | 大小 / sha1(12) | 关键改动 |
|---|---|---|
| `src/renderer/src/lib/tools.ts` | 24884 B `ee665436ef84` | 新增 `ASSISTANT_NAME = '薇拉 Vela'`；`buildSystemPrompt()` 重写（人格段 + 7 条规则）；`summarizeDestructiveTool()` 直白化；`describeTracks()` 注释明确「去修饰」 |
| `src/renderer/src/components/ChatPanel.tsx` | 8310 B `fa0f16ec596b` | 标题 →「薇拉 Vela」；空态 4 条带人格示例；hint 文案 |
| `src/renderer/src/components/MiniChat.tsx` | 7498 B `1e2d62e5b60d` | 新增标题行「薇拉 Vela」；空态文案 + 同一组示例 |
| `src/renderer/src/lib/__tests__/chatConfirm.test.ts` | 31884 B `e33545d5777d` | 新增 `薇拉 Vela persona (J)` 8 例 + 助手（emoji 判定、组件源码读取、失败态夹具） |

### 1.1 `tools.ts` — 定名 + 人格提示词

`ASSISTANT_NAME = '薇拉 Vela'` 是名字的**单一来源**，`buildSystemPrompt()` 引用它；两个组件里的
`ASSISTANT_TITLE` 是**副本但被测试钉住**（组件文件只能导出组件，见 `react-refresh/only-export-components`）。

人格段（4 条规则的载体）：

```
人格与口吻：
- 自称「我」，称用户「你」，全篇简体中文；不要用「主人」「亲爱的」这类称呼。
- 执行用户的指令时，你是星舰领航员：短句、先给结论、不寒暄。
- 推荐歌曲或闲聊时，你是深夜电台 DJ：温和、有见地，可以卖萌、可以用 emoji（仅此类回复，单条最多 1–2 个）。
- 破坏性操作必须直白，禁止软化、禁止卖萌、禁止 emoji。
- 不承诺做不到的事。
```

规则 1–7（① 执行类 / ② 推荐闲聊 / ③ 破坏性 / ④ 失败与能力边界 逐条落位）：

```
1. …必须通过工具完成，不要虚构结果。执行类指令只回一句结果：先给结论，不寒暄——例如「已暂停。下一首是《X》」。
4. 音乐知识、科普、乐评、闲聊类问题直接回答，可以用温和有见地的口吻展开，也可以用 emoji（单条最多 1–2 个），内容用清晰的 Markdown 排版。
5. 删除类操作（把歌曲移出歌单、删除歌单、清空列表等破坏性操作）必须直白说明影响范围并等用户确认：…用一句不加修饰的话说明将要删除的对象和数量…禁止软化、禁止卖萌、禁止 emoji…
6. 失败与能力边界：一句话说明原因，再加一句指路（去「设置 → AI 配置」检查接口地址/模型/API Key，或提示稍后再试）；曲库里没有的歌就直说没有，并给出最接近的 3 首替代；不要卖惨，不要道歉超过一句，不要承诺做不到的事。
```

**提示词文本本身不含任何 emoji**：实测其非 ASCII 非 CJK 字符只有 `–`(U+2013) ×2、`—`(U+2014) ×2、
`→`(U+2192) ×1（见 `.devdata/t54-codepoints.log`）。「允许 emoji」是**文字授权 + 范围与数量上限**，
不是把 emoji 写进提示词。

### 1.2 `summarizeDestructiveTool()` — 确认条唯一文案源，直白化

| 场景 | 修改前 | 修改后 |
|---|---|---|
| 正常 | `从歌单「夜跑」移除 2 首歌曲：t1、t2` | **`从歌单《夜跑》移除 2 首：t1、t2`** |
| 曲目名已知 | …`：《雨夜行》、《夜跑》` | 同（≤3 首；>3 首为「… 等 N 首」） |
| 未指定 | `从歌单「夜跑」移除歌曲（未指定歌曲）` | **`从歌单《夜跑》移除歌曲：未指定歌曲（数量 0），需要你确认`** |
| 其他破坏性工具 | `执行「移出歌单」` | 同（无装饰） |

**只改文案，不改行为**：`DESTRUCTIVE_TOOLS` / `DESTRUCTIVE_LABELS` / `isDestructiveTool` /
`destructiveGuard`（拦截、token 铸造与校验、`needsConfirm` 语义）**一行未动**。

### 1.3 UI 文案

- `ChatPanel.tsx`：标题 `AI 音乐助手` → **`{ASSISTANT_TITLE}`（薇拉 Vela）**；空态正文「我是薇拉 Vela，你的音乐领航员 —— 用一句话指挥播放器，或随便聊聊音乐。」+ 4 条示例；hint「Enter 发送 · Shift+Enter 换行 · 薇拉 Vela 的指令会直接操控播放器」。
- `MiniChat.tsx`：面板内新增标题行（`mini-chat-head`，Bot 图标 + 徽标色 + 下边框，与主窗标题视觉一致）→ **薇拉 Vela**；空态「我是薇拉 Vela —— 找歌、控播放，说一句就行」+ **同一组** 4 条示例。
- 两处示例（属性顺序一致，测试断言两者**完全相同**，防止漂移）：
  `放点适合雨天的歌` / `把这首歌加进夜跑歌单` / `这张专辑是什么风格？` / `暂停，然后告诉我下一首是什么`
- **点击填入输入框的行为保持不变**：`setDraft(s)` + `taRef.current?.focus()`（`MiniChat` 为 `fill()` → `setDraft` + `focus`），**从不自动发送**；测试同时反向断言「填入后 80 字符内不出现 `send()`」，并真跑一次 `send(suggestion)` 证明发出去的文本与示例逐字一致。
- 确认条标题「需要你确认的破坏性操作」与按钮「确认执行 / 取消」未改（本就直白）。

---

## 2. 单测（新增 8 例；1 例加固既有断言）

`describe('薇拉 Vela persona (J)')`：

1. **名字 + 四条规则**逐字符断言（名字、`星舰领航员`、`执行类指令只回一句结果：先给结论，不寒暄`、示例逐字、`深夜电台 DJ`、`可以卖萌、可以用 emoji（仅此类回复，单条最多 1–2 个）`、`用一句不加修饰的话说明将要删除的对象和数量`、`失败与能力边界：一句话说明原因，再加一句指路`、`设置 → AI 配置`、`稍后再试`、`最接近的 3 首`、`不要卖惨`、`不要承诺做不到的事`、自称/称呼约束、以及体检行 `本地曲库：共` / `用户听歌口味：` 未丢）。
2. **emoji 边界**：`emojiIn(prompt)` 必须为空；授权句必须含 `仅此类回复` + `单条最多 1–2 个`；破坏性规则所在行 emoji 为空；指路使用同一个平箭头 `设置 → AI 配置` 而非 emoji 箭头。
3. **summary 格式**：`/^从歌单《夜跑》移除 2 首：/` 且含 `t1`/`t2`、无 emoji。
4. **对象可读**：`map` 填充后逐字等于 `从歌单《夜跑》移除 2 首：《雨夜行》、《夜跑》`。
5. **计数与截断**：4 首仍写「4 首」并出现「等 4 首」；无 emoji。
6. **未指定歌曲**：含 `未指定歌曲` + `数量 0`；无 emoji。
7. **双窗一致**：两个组件源码均含 `const ASSISTANT_TITLE = '薇拉 Vela'` 与 `{ASSISTANT_TITLE}`；示例数组断言 `panelSuggestions === miniSuggestions` 且等于那 4 条、长度 ≥3；填入行为是 `setDraft`+`focus` 且不触发 `send`。
8. **失败话术**：注入 `chat:complete` 抛错（未配置模型名），断言可见文本含原因 + `设置 → AI 配置` + `接口地址、API Key 与网络连接`，非空行 ≤2、不含 `对不起对不起`/`马上就好`、`busy=false`。

> **emoji 判定器的精度**（值得说明，因为它决定了断言的可判别性）：正则只覆盖**图形类 emoji**
> （`U+1F000-1FAFF` / `2600-26FF` / `2700-27BF` / `2B00-2BFF`），**刻意排除** `→`(U+2192)、
> `《》（）`(U+3000-303F)、`–`(U+2013) 等排版符号；变体选择符 U+FE0F 也不在字符类内（组合修饰符，
> 与其它码位同列会触发 `no-misleading-character-class`，实跑已修正）。含义是「无 emoji = 无笑脸/图形
> 符号」，而不是「无标点」——否则一句直白的话会因为用了 `→` 而误判。

---

## 3. 判别性（变异验证）：7/7 全部被捕获，树逐字节还原

工装 `.devdata/t54-evidence/mutation-check.mjs`（每次都重跑该测试文件、还原后比对 sha256）：

| # | 变异（把要求删掉/改弱） | 结果 | 退出码 / 计数 |
|---|---|---|---|
| M1 | 提示词不再叫名字（`「${ASSISTANT_NAME}」`→`「音乐助手」`） | **CAUGHT** | exit 1 · 1 failed \| 23 passed |
| M2 | 删规则①（执行只回一句） | **CAUGHT** | exit 1 · 1 failed \| 23 passed |
| M3 | 删规则②（温和 + 卖萌/emoji 授权） | **CAUGHT** | exit 1 · 2 failed \| 22 passed |
| M4 | 删规则③（破坏性直白、不加修饰） | **CAUGHT** | exit 1 · 1 failed \| 23 passed |
| M5 | 删规则④（失败=一句+指路） | **CAUGHT** | exit 1 · 1 failed \| 23 passed |
| M6 | summary 退化为无对象无数量（`准备收拾点东西`） | **CAUGHT** | exit 1 · 6 failed \| 18 passed |
| M7 | 组件标题漂移成 `AI 音乐助手` | **CAUGHT** | exit 1 · 1 failed \| 23 passed |

```
tools.ts identical after round-trip : true
test file identical after round-trip: true
residue (MUTATION/*.bak/zz*): none
ALL MUTATIONS CAUGHT AND TREE RESTORED: true
```

（`mutation_exit=0`；原始日志 `.devdata/t54-evidence/t54-mutation.log`）

---

## 4. 越界核对（.devdata/t54-evidence/scope-check.mjs，exit 0）

以 t50 收敛时刻 `2026-09-13T12:29:35.427Z` 为边界扫描 `src/**`（83 文件）：

```
files modified since then    : 4
  IN-SCOPE  src/renderer/src/lib/tools.ts                          12:48:30.881Z 24884 B sha1=ee665436ef84
  IN-SCOPE  src/renderer/src/components/ChatPanel.tsx             12:48:33.832Z  8310 B sha1=fa0f16ec596b
  IN-SCOPE  src/renderer/src/components/MiniChat.tsx              12:43:17.489Z  7498 B sha1=1e2d62e5b60d
  IN-SCOPE  src/renderer/src/lib/__tests__/chatConfirm.test.ts    12:47:33.532Z 31884 B sha1=e33545d5777d
newest UNTOUCHED file        : 2026-09-13T12:26:04.674Z
out-of-scope files touched   : 0
forbidden paths touched      : 0   (src/main / src/preload / src/shared / MiniPlayer.tsx / MiniSearch.tsx / mainWindowBridge.ts)
eslint-disable added         : none
SCOPE CLEAN: true
```

`MiniPlayer.tsx`(11:47:51.415Z)、`MiniSearch.tsx`(11:47:51.461Z)、`mainWindowBridge.ts`(11:47:51.556Z)、
`chatStore.ts`(12:26:04.674Z)、`preload/index.ts`(11:39:06.089Z) 的 mtime **均早于本任务起点**，未被触碰。
`scripts/**`、`package.json`、`eslint.config.mjs` 未改。**未起 dev 实例**。

---

## 5. 已知缺口 / 需 captain 裁决（1 条，性质轻微）

**⚠️ 失败文案的前缀 emoji 位于 inScope 之外。**
实测：`无法获取 AI 回复` 的可见文本是 `⚠️ 无法获取 AI 回复：<原因>\n\n请检查「设置 → AI 配置」中的接口地址、API Key 与网络连接。`
它在 `src/renderer/src/stores/chatStore.ts:624` 拼接，而该文件**不在本任务 inScope**（inScope 仅
tools.ts / ChatPanel.tsx / MiniChat.tsx / chatConfirm.test.ts）。因此我**没有改动它**，而是把该字形
**如实写进断言**并在测试里标注为 KNOWN GAP：

- 已满足的部分：**一句话 + 指路**（`设置 → AI 配置` + `接口地址、API Key 与网络连接`）、非空行 ≤2、
  无卖惨、无能力越界承诺；**错误处理逻辑完全未变**（我没碰该分支，只以测试钉住其用户可见形态）。
- 未满足的部分：那句前缀的 `⚠️` 与「失败话术克制、无装饰」的人格要求有**轻微的视觉不一致**（是图标式
  警示符，非表情包，但确实是 emoji 范畴字形）。
- **建议的最小改法**（需另开契约，1 个字符）：`chatStore.ts:624` `'⚠️ 无法获取 AI 回复：'` → `'无法获取 AI 回复：'`。
  若 captain 认为警示图标应保留（提示性用途），也可不动 —— 由 captain 裁决，我不越界。

（另：`buildSystemPrompt()` 的 `ASSISTANT_NAME` 与两个组件的 `ASSISTANT_TITLE` 是两份字面量。这是
`react-refresh/only-export-components` 强制的：组件文件只能导出组件，从 `.tsx` 导出常量会直接产生 lint
**error**。因此改为**由测试钉住一致性**（M7 证明漂移必红），而不是引入跨文件常量共享。）

---

## 6. 原始证据清单（均在 `.devdata/t54-evidence/`）

| 文件 | 内容 |
|---|---|
| `T54-REPORT.md` | 本报告 |
| `mutation-check.mjs` / `t54-mutation.log` | 7 项变异判别性 + 还原完整性（exit 0） |
| `scope-check.mjs` / `t54-scope.log` | 越界核对（exit 0，`SCOPE CLEAN: true`） |
| `drift-check.mjs` | 关键文件与聚合指纹相对 t50 的变化 |
| `t54-fingerprint.log` | t54 收敛树指纹（`83d13b16…`，83 文件） |
| `t54-unit.log` | 目标测试文件单独运行（24 passed） |
| `t54-typecheck.log` / `t54-lint.log` / `t54-test.log` | 三条门禁原始输出（12:48 复跑） |
| `t54-codepoints.log` / `t54-diff-codepoints.mjs` | 提示词/断言的码位核对（定位「示例逐字」差异） |

（`.devdata/t54-unit.log`、`.devdata/t54-*.log` 早期版本在仓库根的 `.devdata/`，同属本任务证据。）

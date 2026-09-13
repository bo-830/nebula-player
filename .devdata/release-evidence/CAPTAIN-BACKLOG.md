# CAPTAIN BACKLOG — NEBULA Player（截至本次会话）

> 由 captain 维护。分三类：**用户可见缺陷（优先）** / **工程与流程** / **功能与体验**。
> 已完成的不再列出（H1 修复见 t58、F1 修复见 t50、迷你窗新形态见 t45/t46、薇拉 Vela 见 t54）。

## A. 用户可见缺陷（下一版优先）

| # | 事项 | 现状 / 证据 | 建议修法 |
|---|---|---|---|
| A-1 | **扫描竞态**：`LibraryService.flush()` 无写队列，400ms 防抖与 handler 的 flush 可能并发写同一 `.tmp` ⇒ `library:scan` 可能被拒、新目录 403 直到重扫 | 1.0.4 发布时裁定"记已知问题"（reviewer §8 A-2） | 给 `flush()` 加写队列（照 `store.ts` 的 `writing` 链）+ `refreshMediaRoots()` 包成 best-effort try/catch |
| A-2 | **跨轮重复 `tool_call_id`**：网关若"按响应重新编号"（`call_0`/`call_1`），第二轮重复 id 会覆盖上一轮的 tool 回复 ⇒ 旧 400 形态复现 | 默认 DeepSeek 唯一 id ⇒ 不触发（t42 §9 B-1） | 唯一性提升到 **run 级**：对已公告 id 铸造新 id，并同时改写 `assistant.tool_calls` 与对应 tool 回复 |
| A-3 | **进程级死亡未定性**（`0xC0000409`）：打包态长跑多次未复现 | 唯一未闭合开项；判定台 = 打包态长跑 | 接 Electron `crashReporter` + 收集 dump；对失败退出码做分类统计 |
| A-4 | **`llmClient.ts:174` `tc.index ?? 0`**：同一 delta 内两个无 `index` 的调用会被合并成一条坏调用 | 消息序列仍合法，只影响该次调用成败（t42 §9 B-2） | 无 `index` 时按到达顺序分配递增索引，不默认 0 |
| A-5 | **F5 见证层静默降级**：两面板若改为委托共享 helper，`witness()` 返回 null 时用例只 `console.warn` 后 return（视为通过） | quality t37；已写入 t41 §14.6 已知限制 | 把"失去守护"变成显式失败（`expect.fail()`），或让 witness 指向共享 helper 的算式 |

## B. 工程与流程

| # | 事项 | 说明 |
|---|---|---|
| B-1 | **`scripts/verify-lint-tests.mjs` 两个缺陷**：`:31` 硬编码 `outDir='.devdata/t6-evidence'`（与 `--label` 无关）；脚本**自身恒 exit 0**（无 `process.exit`） | 修为 `outDir = .devdata/${label}-evidence` + 有失败项时非零退出；在修好前**一律逐项读 `exitCode`** |
| B-2 | **`mini.ts` 的 `setMiniExpanded()` 不发 `mini:expanded`**（只有 `collapseMini()` 发） | 外部调用会让窗口变 540 而渲染层仍按收起态画；**当前仅按钮调用 ⇒ 用户不可达**（ui-features t53 发现）。修法：在 `setMiniExpanded` 内补 `forwardToMini('mini:expanded', expanded)`，注意与 `collapseMini()` 去重 |
| B-3 | **`diag-*.mjs` 一族缺 `#mini` 主目标守卫**（22 个有风险 / 21 个已走共享 `mainTarget()`） | 统一 import 共享 `mainTarget()`（顺带获得 boot 轮询与超时保护） |
| B-4 | **媒体封面不进系统媒体控件**（Windows SMTC 空白）：`MediaImage`/`MediaSession` 不接受 `media://` | 改用 `data:` 或 `blob:` 传封面（应用内封面不受影响） |
| B-5 | **无版本控制**（仓库无 `.git`） | `git init` + 精确 `.gitignore`（排除 `node_modules/`、`dist/`、`out/`、`.devdata/`、`*.exe`）⇒ 首次 push 仅几 MB，同时解决"GitHub 上传中断" |
| B-6 | **`scripts/**` 证据目录与冻结纪律** | 冻结时用 `snapshot-fingerprint --label`；锚点一律用**内容 sha1 + 聚合值**，**不要用 mtime**（本项目多次被 `Copy-Item` 保留旧 mtime 误导） |
| B-7 | **归档缺口（t42 §10）**：AI 确认探针输出、A1/F5 采样时面板哈希、F3 的 `..` 正对照、AAC 产物 size/首字节未落盘 | 下一版补齐或明确降级标注 |
| B-8 | **L4 未证**：`hidden + 主窗直发 = 免疫` 的解释（"CDP 任务发起 send vs IPC 任务发起"） | 四臂差分（代理 / CDP 直发 / 渲染进程内自触发 / 代理但不轮询，各 n≥10），需受控实例窗口 |

## C. 功能与体验

| # | 事项 | 说明 |
|---|---|---|
| C-1 | APE 端到端未取证 | 本机无 Monkey's Audio 编码器；分支级证成已有（`-f mp4`/`-f wav`），缺真实 `.ape` 素材 |
| C-2 | 迷你窗歌词时钟只随引擎事件推进 | 暂停态 seek/拖动进度条后迷你窗歌词可能不刷新（t41 §9.1）；可改为显式 `currentTime` 推送或订阅主窗快照 |
| C-3 | 大曲库（>2 万首） | JSON 持久化 + 内存索引会成为瓶颈 ⇒ 迁 SQLite |
| C-4 | AI 偏好画像 | 本地计算"常听曲风/歌手"，提升推荐质量（不上传） |
| C-5 | 多更新源回退 | 现在 `updateURL` 单源；建议主源 + 国内镜像自动回退（配合 B-5 的发布方案） |
| C-6 | macOS / Linux 构建 | 配置就绪但从未构建测试；macOS 另需 Apple 公证（$99/年） |
| C-7 | 失败提示的克制风格 | `chatStore.ts:624` 的 `⚠️` 前缀按裁决**维持现状**（功能性警示图标）；若要与人格统一，下一版一并处理 |

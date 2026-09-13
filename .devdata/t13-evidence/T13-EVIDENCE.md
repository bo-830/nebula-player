# t13 — F3 协议层加固的运行期证据（media:// 包含性 + 扩展名白名单）

- 时间：t13 实施后（CORP 回退后的终版）
- 方式：`node scripts/probe-media-roots.mjs` + `node scripts/probe-media-accept.mjs`（CDP 驱动真实 dev 实例，从渲染进程发起 **子资源加载**）
- 为什么不用 `fetch`：应用页面 CSP 为 `connect-src 'self'`，跨源 `fetch(media://…)` 必被拒（与协议实现无关）；
  而 `img-src`/`media-src` 显式允许 `media:`，所以 `<img>` 加载才如实反映协议响应（拒绝 → error 事件，放行 → 解码成功）。

## ⚠️ 关键更正：`Cross-Origin-Resource-Policy` 已**移除**（captain 裁定，本文件相应结论已重测）

t13 上一轮曾在 `CORS_HEADERS` 里加入 `Cross-Origin-Resource-Policy: same-origin`，**这是错的并把封面打掉的风险做实**：
封面由 `Cover.tsx:21` 渲染为 `<img src="media://…">`，**没有** `crossOrigin` → 属 **no-cors** 请求，而 CORP 只对 no-cors 强制校验；
页面 origin（`file://` / `localhost:5173`）与资源 origin（`media://`）跨源 → `CORP: same-origin` 会直接拦掉封面。
**现已移除该头**，并把「为何保持 `ACAO = *`、为何不得加 CORP」写进 `protocol.ts` 的 `CORS_HEADERS` 注释。

移除后复测（`scripts/probe-media-accept.mjs`，原始输出 `t13-accept-matrix.txt`）：

| 检查 | 结果 |
|---|---|
| 5 格式逐个播放 | flac / wav / ogg / mp3 / m4a —— 全部 `mode=graph`、`signalPeak>0`（示例 223）、`playing=true`、`playerError=null`、`elementErrorCode=null`、seek 生效 |
| 封面（真实 UI，**plain no-cors `<img>`**） | 4 个 `img[src^="media://"]`：`tl-cover`×2 / `detail-cover` / `pb-cover` —— 全部 `complete=true, naturalWidth=512` |
| 迷你窗封面 | `complete=true, w=512, plain=true`（确认未设 crossOrigin） |
| 日志 `MediaElementAudioSource outputs zeroes…` | **0 次**（主窗与迷你窗均 0） |
| 越权路径 | `settings.json`→refused、根外 png→refused、`..\..\..\..\Windows\win.ini`→refused，均不返回内容 |
| 引擎 | `mode=graph`、`signalPeak=209`、`setSinkIdPhase=applied` |

## 夹具（区分「包含性」与「扩展名白名单」的关键）

| 夹具 | 位置 | 相对允许根 | 扩展名 |
|---|---|---|---|
| `probe-outside-roots.png` | `<userData>/` | **根之外** | 可服务（png） |
| `probe-inside-root.png` | `<userData>/covers/` | 根之内 | 可服务（png） |
| `settings.json` | `<userData>/` | 根之外 | 不可服务 |
| `probe-not-servable.txt` | 曲库目录 | 根之内 | 不可服务 |

> `probe-outside-roots.png` 是**决定性**夹具：若只有扩展名白名单而没有包含性校验，它会被放行。

## 实测结果（原始输出见 `t13-media-roots.json`）

| # | 请求 | 预期 | 实测 | 结论 |
|---|---|---|---|---|
| 1 | 真实曲目 `song-c.flac`（`<audio>`） | 放行 | `metadata:5`（时长 5s 读回） | ✅ 无回归 |
| 2 | 真实封面 `<userData>/covers/…png` | 放行 | `loaded, w=512` | ✅ 归一化用户资源仍可读 |
| 3 | `<userData>/probe-outside-roots.png`（**png 但根之外**） | 拒绝 | `blocked` | ✅ **包含性生效**（403，无字节） |
| 4 | 同一文件经 `…\user\..\user\covers\` 绕回根内 | 放行 | `loaded, w=512` | ✅ 用的是 **resolve+relative 归一化**，不是字符串前缀匹配 |
| 5 | `<userData>/settings.json`（含 API Key） | 拒绝 | `blocked` | ✅ 敏感文件不可读 |
| 6 | 曲库目录 + `..\..\..\..\Windows\win.ini` 越权 | 拒绝 | `blocked` | ✅ 路径穿越被拦截 |
| 7 | 曲库目录内 `probe-not-servable.txt` | 拒绝 | `blocked` | ✅ 扩展名白名单生效（404，无字节） |

补充核查（静态）：`protocol.ts` 的全部响应分支都带 CORS 头，
`\.\.\.CORS_HEADERS|headers:\s*CORS_HEADERS` 命中 **11** 处（204/405/400/403/404×2/416×2/206/200），**没有任何裸 `headers: { … }` 分支**。

## 仍开放（不在本任务 inScope，需补派）

- **`src/main/index.ts` 的导航/开窗守卫**（captain 对 F3 的第 ④ 项验收：`will-navigate` / `will-redirect` / `setWindowOpenHandler`）。
  t13 的 inScope 未包含该文件，故**未实施**；当前 `setWindowOpenHandler` 已存在（`window.ts`，`shell.openExternal` + `deny`），但**没有** `will-navigate`/`will-redirect` 守卫。

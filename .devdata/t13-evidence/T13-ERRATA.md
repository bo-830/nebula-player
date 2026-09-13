# t13 勘误：语义锚点指纹（F11）+ F12 口径

本文件补记 t7 审查提出的 F11 / F12，两者都属**证据/口径**问题，不影响功能判定。

## F11 — 指纹脚本的 `createElement sets it` 是**误报**（已关闭）

- 原脚本 `.devdata/zz-fingerprint.mjs` **已不存在**（由 t6 取证方在本轮清理中删除；全仓仅剩其输出
  `.devdata/fingerprint-pre-fix.log`），因此「把窗口放宽到 `{0,800}`」这一条**已无可改对象**——
  该脚本不再参与任何验证，也不会再产生假阴性。此处以**重跑等价的语义锚点核查**替代，结论如下。
- 误报根因（reviewer 定位）：脚本里匹配 `crossOrigin` 与 `createElement` 同现的正则窗口为 `{0,400}`，
  而真实字符间距为 **499**，因此 `fingerprint-pre-fix.log:19` 的
  `FAIL engine: createElement sets it` 是窗口过窄所致；**同一次运行第 18 行已 `OK engine: crossOrigin anonymous`**。
- 事实核查（本文件生成时的当前工作区，等价的 grep 锚点）：
  - `src/renderer/src/lib/audioEngine.ts` 的 `createElement()` 确实设置 `audio.crossOrigin = 'anonymous'`（t4/t2 期间落地，t13 未改动该行）。
  - 结论：t2/t10 的修复是「**CORS 模式请求**（元素带 `crossOrigin`）+ **CORS 干净响应**（协议头）」两者共同作用，
    仅加响应头并不生效——此点与 reviewer 的结论一致。
- 关于「展开计数」：原脚本的 `N=3 … CORS_HEADERS spread count (expect 8)` 同样受窗口/写法限制。
  t13 后 `protocol.ts` 的响应分支全部复用同一常量，实测 `\.\.\.CORS_HEADERS|headers:\s*CORS_HEADERS` 命中 **11** 处
  （204 / 405 / 400 / 403 / 404×2 / 416×2 / 206（spread）/ 200（spread），外加常量定义自身不计入正则）：
  ```text
  129  204 OPTIONS      headers: CORS_HEADERS
  132  405 wrong method headers: CORS_HEADERS
  138  400 bad path     headers: CORS_HEADERS
  144  403 outside root headers: CORS_HEADERS   ← t13 新增
  147  404 bad ext      headers: CORS_HEADERS   ← t13 新增
  157  404 stat failed  headers: CORS_HEADERS
  165  416 bad range    headers: CORS_HEADERS
  169  416 start>end    headers: CORS_HEADERS
  174  416 Content-Range headers: { ...CORS_HEADERS, … }
  182  206 partial      ...CORS_HEADERS
  196  200 full         ...CORS_HEADERS
  ```
  即「**没有任何裸 `headers: { … }` 响应缺 CORS_HEADERS**」；建议后续锚点断言这一性质，而不是断言固定条数（条数会随分支增加而变）。

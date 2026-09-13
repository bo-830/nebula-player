/**
 * A2 — mini-window lyric-request dedupe rule.
 *
 * Extracted from `MiniPlayer` so it can be driven by a real regression test:
 * `src/renderer/src/lib/__tests__/miniLyricsDedup.test.ts` imports these
 * functions directly, therefore breaking the rule (e.g. going back to "always
 * claim") makes that suite fail. A component-level test is impossible in this
 * repo (`vitest.config.ts` runs in a plain node environment, jsdom /
 * @testing-library are not installed), and a test in `src/main/**` cannot import
 * a renderer `.tsx` module (that project has no DOM lib, so `window.api` fails).
 *
 * Deliberately free of React/DOM/Electron imports so the node test environment
 * can load it.
 *
 * A holder is `{ current: string | null }` — structurally identical to
 * `React.MutableRefObject<string | null>`, so `MiniPlayer` passes its refs
 * straight in while tests use plain objects. No adapter is involved.
 *
 * The mini window receives `mini:state` about 4x/s; two things must not happen:
 *  - the same track must not trigger a `lyricsGet` on every push (the pre-fix
 *    guard compared against a render-closure value that was `null` on the first
 *    subscription, so it deduped nothing and fired ~4 IPC calls per second);
 *  - a slow response for the previous track must not paint over the current one
 *    (one frame of stale lyrics).
 */

/** the holder both the component's refs and the tests' plain objects satisfy */
export interface LyricIdHolder {
  current: string | null
}

/** a `mini:state` push with no track clears every holder */
export function clearLyricsHolders(...holders: LyricIdHolder[]): void {
  for (const holder of holders) holder.current = null
}

/**
 * MUTATION COPY (verifier, t41 复核 t44 / R4(b)) —— **只改被考察的那一条规则**：
 * `claimLyricsRequest` 退回"**永远 claim**"（= 修复前行为：守卫比较的是渲染闭包里的值，
 * 首次订阅时为 `null`，等于没有去重）。其余函数与
 * `src/renderer/src/lib/miniLyricsDedup.ts` **逐字相同**。
 */
export function claimLyricsRequest(_claimed: LyricIdHolder, _id: string): boolean {
  return true
}

/**
 * May a response for `id` be painted? True only while `id` is still the newest
 * one seen (strict newest-wins), so a late reply for a replaced track is dropped.
 */
export function acceptLyricsResponse(wanted: LyricIdHolder, id: string): boolean {
  return wanted.current === id
}

/** push bookkeeping: the newest id wins */
export function trackLyricsPush(wanted: LyricIdHolder, id: string): void {
  wanted.current = id
}

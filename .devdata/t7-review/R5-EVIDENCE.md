# r5 adversarial review — raw evidence (t7-review)

Read-only review of `C:\博830\vibecoding\nebula-player`. No file under `src/**` or `scripts/**`
was created, modified or deleted. All scratch output lives in `.devdata/t7-review/`.

## 1. Suite state at review time (20:29:24)

`npm.cmd test -- --reporter=verbose` → **14 files / 141 tests passed, exit 0**.

| file | tests |
|---|---|
| src/renderer/src/lib/__tests__/chatConfirm.test.ts | 13 |
| src/renderer/src/lib/__tests__/lyricsOffset.test.ts | 17 |
| src/renderer/src/lib/__tests__/miniLyricsDedup.test.ts | 8 |
| src/renderer/src/lib/__tests__/playerStoreSleep.test.ts | 15 |
| src/renderer/src/lib/__tests__/queue.test.ts | 9 |
| src/renderer/src/lib/__tests__/recommend.test.ts | 6 |
| src/renderer/src/lib/__tests__/search.test.ts | 9 |
| src/renderer/src/lib/__tests__/sleepTimer.test.ts | 20 |
| src/renderer/src/lib/__tests__/format.test.ts | 4 |
| src/main/__tests__/lrc.test.ts | 9 |
| src/main/__tests__/llmClientToolIds.test.ts | 4 |
| src/main/__tests__/mediaFormats.test.ts | 6 |
| src/main/__tests__/mediaRoots.test.ts | 9 |
| src/main/__tests__/scanner.test.ts | 12 |
| **total** | **141** |

Historical trajectory (from `.devdata/t6-evidence/tests-*.log`):

- 18:53–19:32 → `11 passed (11)` / `118 passed (118)` (tests-t6-r2-final, t13, t26, t14, t28)
- 20:02–20:07 → `13 passed (13)` / `138 passed (138)`; mediaFormats = **11** (tests-t41-pre.log:37-47)
- 20:11:26 → `14 passed (14)` / `141 passed (141)` (tests-t36.log); mediaFormats = 6, miniLyricsDedup = 8
- 20:14:09 / 20:17:54 / 20:27:28 → 141 (tests-t44, t44-final, t42)

138 − 5 (mediaFormats 11→6) + 8 (new miniLyricsDedup file) = 141. ✔

## 2. The removed A2 mirror block (old file, names verbatim)

`.devdata/t6-evidence/tests-t41-pre.log:43-47` (identical in tests-t40.log:34-38):

```
✓ src/main/__tests__/mediaFormats.test.ts > mini window lyrics dedupe (A2 rule — specification, see R4(b) status) > issues one lyricsGet for a sustained stream of the same track
✓ ... > issues one fetch per distinct track when the track changes
✓ ... > never paints a late response that belongs to the previous track
✓ ... > still paints the current track response after repeated pushes for it
✓ ... > re-fetches a track that comes back after playback stops
```

Original finding: `.devdata/t7-review/T14-R2-REVIEW.md:76-78` —
"`src/main/__tests__/mediaFormats.test.ts:59-141` … 该文件**不 import `MiniPlayer.tsx`**，而是在测试里
自己 newWindow() 复刻了 `claimed`/`wanted`/绘制门（`:61-96`）并断言测试本地的 `fetches`/`painted`。
把 `MiniPlayer.tsx:54` 与 `:63` 改回旧写法，**5 条用例全绿**".

Import graph now: `MiniPlayer.tsx:7-11` → `../lib/miniLyricsDedup`;
`miniLyricsDedup.test.ts:2-8` → `../miniLyricsDedup` (same file).
`src/main/mediaFormats.ts` (28 lines) exports only `DIRECT_EXTS`/`CONVERT`/`needsConvert`.

## 3. Mutation experiments (copies only; src untouched)

Script: `mutation-probe.mjs` (copies `src/` into `.devdata/t7-review/mutants/<case>/`).
The mutated copies were deleted after the run; results reproduced below.

| experiment | mutation | result |
|---|---|---|
| A control | none | `14 passed / 141 passed`, exit 0 |
| B | `MiniPlayer.tsx`: remove `trackLyricsPush(wanted, id)` + `if (!claimLyricsRequest(claimed, id)) return`, and make the response paint unconditional (`setLines(r.lines)`) = pre-fix behaviour | **`14 passed / 141 passed`, exit 0 — NOTHING FAILS** |
| C | `miniLyricsDedup.ts`: `claimLyricsRequest` → always claim | `3 failed / 138 passed`, exit 1 |
| D | `miniLyricsDedup.ts`: `acceptLyricsResponse` → always accept | `2 failed / 139 passed`, exit 1 |

C fails: `miniLyricsDedup.test.ts` "issues one lyricsGet for a sustained stream…",
"issues one fetch per distinct track when the track changes",
"claimLyricsRequest is a no-op for a repeated id but true for a new one".
D fails: "never paints a late response that belongs to the previous track",
"acceptLyricsResponse only accepts the newest id".

No test file imports `MiniPlayer.tsx` or `LyricsPanel.tsx` (grep over `src/**/*.test.ts`);
only `lyricsOffset.test.ts:294-295` reads them as **text**.

## 4. Witness helper (lyricsOffset.test.ts:282-340)

- locates code: `readFileSync(fileURLToPath(new URL('../../components/${name}', import.meta.url)))` (`:292`),
  i.e. resolved relative to the test file; no `try/catch`, so a moved/deleted file throws → loud fail.
- **no checksum/hash** anywhere in the file (only `readFileSync` at `:292`; `:296-297` merely assert `length > 0`).
- null path (`:305-330`): if any of the three `witness(...)` calls returns `null`, it requires
  **no** panel to contain both `offset` and `0.12`, then `console.warn` + `return` → PASS.

Simulation: `witness-discrimination.mjs` (read-only; runs the exact test logic on real + mutated
in-memory copies).

| scenario | verdict |
|---|---|
| baseline (real sources) | PASS |
| flip `+ offset` → `- offset` in LyricsPanel | FAIL |
| flip MiniPlayer `<=` branch only | FAIL |
| flip MiniPlayer `>` branch only | FAIL |
| flip both MiniPlayer branches | FAIL |
| grace `0.12` → `0.15` | FAIL |
| offset term dropped from MiniPlayer | FAIL |
| **grace renamed to `GRACE` (no literal 0.12) + sign flipped** | **PASS(warn)** |
| arithmetic extracted to helper, correct sign | PASS(warn) |
| **helper + sign flipped inside helper** | **PASS(warn)** |
| all offset arithmetic deleted (word `offset` still present) | FAIL |

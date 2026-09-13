# R5 — adversarial verification of the round-3 repairs (nebula-player)

READ-ONLY review. Nothing under `src/**` or `scripts/**` was created, modified or deleted.
All scratch lives in `.devdata/t7-review/r5/`. Tree was frozen throughout: the newest
`src/**`/`scripts/**` mtime is `2026/9/12 20:14:07` (`scripts/fingerprint-t13.mjs`), the full
suite ran at 20:30:20, and a re-check at ~20:36 showed no file newer than 20:14:07.

## Evidence inventory

| artifact | what it is |
| --- | --- |
| `.devdata/t7-review/r5/full-suite-verbose.log` | `npm.cmd test -- --reporter=verbose` — 14 files / 141 tests, 0 failures, exit 0 |
| `mutants/*.ts` + `cfg-*.config.ts` | minimal-edit COPIES of production modules (+1 `MUTANT` marker line) run against the REAL test files through a vitest `resolve.alias`; each run carries an alias witness |
| `shadow/**` | BYTE-IDENTICAL COPY of `lyricsOffset.test.ts` (sha256 asserted) + mutated COPIES of the two panels, because that test witnesses the panels by reading their source text relative to `import.meta.url` |
| `probes/*.review.test.ts` | probes importing the REAL production modules (no mutation); only `fetch`/`window.api` stubbed |

## (1) R2 duplicate tool-call ids — PARTIAL

* a) process-unique fallback — **VERIFIED**: `llmClient.ts:28-29`
  `let fallbackToolCallSeq = 0` / `const FALLBACK_TOOL_CALL_PREFIX = 'call_auto_'`, used at
  `llmClient.ts:198` `id: c.id || \`${FALLBACK_TOOL_CALL_PREFIX}${++fallbackToolCallSeq}\`` and
  `llmClient.ts:213` `id: tc.id ?? \`${FALLBACK_TOOL_CALL_PREFIX}${++fallbackToolCallSeq}\``;
  `withUniqueToolIds` (`llmClient.ts:38-46`) de-dupes provider-repeated ids within a response.
* b) "the streaming accumulator no longer merges parallel calls when a provider omits `index`"
  — **VIOLATED**. `llmClient.ts:174` is still literally `const i = tc.index ?? 0` and
  `llmClient.ts:176-178` appends into that slot, so two index-less parallel calls merge into one
  call whose name/arguments are concatenated. Probe (real module):
  `[probe A1] toolCalls = [{"id":"call_auto_1",...,"name":"search_musicplay_tracks","arguments":"{\"query\":\"a\"}{\"ids\":[\"t1\"]}"}]`.
  No test in the repo sends an index-less tool call (the real R2 test always sets `index`).
* c) renderer-side defence — **VERIFIED as a mechanism, but per-round only**.
  `chatStore.ts:411-420` `dedupeToolCalls` (applied at `:442` before the assistant message is
  built at `:445`) DROPS duplicate announcements — it does not "rewrite" ids — and
  `replaceToolMessage` (`chatStore.ts:383-395`) keeps one `tool` message per `tool_call_id`. Both
  halves are real and tested, but neither crosses a round boundary.

## (2) R4(a) F7(b) queue timer in 'one' mode — VERIFIED

`playerStoreSleep.test.ts:267-282`: multi-track queue + `mode:'one'` + `armQueueEnd`, driven
through the REAL store (`playerStore.ts:385-408 handleEnded` → `sleepTimer.ts:112-127 decideEnded`),
not a re-implementation. Deleting `sleepTimer.ts:121 if (ctx.playMode === 'one') return 'stop'`
fails it with exactly one assertion:
`playerStoreSleep.test.ts:277 expect(pause).toHaveBeenCalledTimes(1) // → expected "pause" to be called 1 times, but got 0 times`
(without the line, `handleEnded` takes the `loadCurrentInternal(get, set, s.index, true)` repeat
path at `playerStore.ts:403-404`: no pause, timer stays armed, no toast).
Inverting the comparison fails 3 tests, the same one at line 277 plus the two list-mode contrast
tests (`:190`, `:293`).

## (3) R4(b) A2 mini lyrics dedupe — VERIFIED

`MiniPlayer.tsx:6-11` imports `{acceptLyricsResponse, claimLyricsRequest, clearLyricsHolders, trackLyricsPush} from '../lib/miniLyricsDedup'`
and the test imports `'../miniLyricsDedup'`; both resolve to the SAME file
(`src/renderer/src/lib/miniLyricsDedup.ts`; machine-checked: `same file: true`, unique on disk, and
the test defines no local copy of the rule — it calls the production functions 9/6/4/4 times).
The test-side `newWindow()` is bookkeeping only (every decision comes from the module, `:48`, `:53`).

## (4) R4(c) F5 lyrics-offset sign convention — VERIFIED (with a demonstrated silent-pass path)

Three heads extracted by the test are character-identical to the components' RHS:

| head | component |
| --- | --- |
| `currentTime + 0.12 + offset` | `LyricsPanel.tsx:78 const t = currentTime + 0.12 + offset` |
| `display + 0.12 + offset` | `MiniPlayer.tsx:89 ... lines[i].t <= display + 0.12 + offset)` |
| `display + 0.12 + offset` | `MiniPlayer.tsx:90 ... lines[i].t > display + 0.12 + offset) break` |

The test obtains them from SOURCE TEXT at runtime — `readFileSync(fileURLToPath(new URL(\`../../components/${name}\`, import.meta.url)))`
(`lyricsOffset.test.ts:291-295`), extracted by the local `witness()` closure (`:305-308`) with
`OFFSET_TERM` (`:304`). There is no separate scan-helper module. When a head is `null` the test
takes the branch at `:321-330`: it asserts `expect(inlineArithmetic).toHaveLength(0)` where
`inlineArithmetic = [panel, mini].filter(f => f.includes('offset') && f.includes('0.12'))`, then
`console.warn(...)` and `return` — a genuine silent-pass path (see F3).

## (5) Whole suite — no failures

`Test Files 14 passed (14)`, `Tests 141 passed (141)`, `Duration 987ms`, exit 0. Nothing failed, so
no in-flight-edit attribution is needed; the mtime check above also rules one out.

## Discrimination table (mutation = revert of the exact fix, real test file, aliased copy of the module)

| test | fails when reverted? | why / observed |
| --- | --- | --- |
| `llmClientToolIds › two id-less calls of the same tool` | **yes** | `mutants/llmClient.revert.ts` (old `call_${name}` + dedupe off): `expected 'call_remove_from_playlist' not to be 'call_remove_from_playlist'` (`:71`) |
| `llmClientToolIds › never repeats a fallback id across successive rounds` | **yes** | `expected 'call_search_music' not to be 'call_search_music'` (`:93`) |
| `llmClientToolIds › de-duplicates ids the provider repeats verbatim` | **yes** | `expected 1 to be 2` (`:114`) |
| `llmClientToolIds › keeps provider-supplied unique ids untouched` | no (correct) | unaffected by the revert; sanity control |
| `chatConfirm › collapses duplicate ids …` | **yes** | `chatStore.noDedupe.ts`: `expected [ …(2) ] to have a length of 2 but got 3` (as expected: guard removed) |
| `chatConfirm › leaves a round with unique ids untouched` | no (correct) | unaffected |
| `playerStoreSleep › a multi-track queue timer fires on the first natural end in 'one' mode` | **yes** | line deleted → `:277 pause called 1 times, but got 0`; line inverted → same + 2 more |
| `playerStoreSleep › does not fire a 'queue' timer on a mid-queue natural end in list mode` | **yes** (inversion only) | `:293` `pause` unexpectedly called |
| `playerStoreSleep › keeps playing through the queue and only stops once the queue ends` | **yes** (inversion only) | `:190` `pause` unexpectedly called |
| `miniLyricsDedup › one lyricsGet for a sustained stream` | **yes** ("always claim") | `fetches` = 12× `track-a` instead of `['track-a']` (`:64`) |
| `miniLyricsDedup › one fetch per distinct track` | **yes** ("always claim") | `:72` |
| `miniLyricsDedup › claimLyricsRequest is a no-op for a repeated id` | **yes** ("always claim") | `:108 expected true to be false` |
| `miniLyricsDedup › never paints a late response of the previous track` | **yes** ("always paint") | `:80 expected true to be false` |
| `miniLyricsDedup › acceptLyricsResponse only accepts the newest id` | **yes** ("always paint") | `:119` |
| `lyricsOffset › the real panel call sites carry the + offset sign` | **yes** (both panels) | shadow tree, byte-identical test: `+ offset → - offset` in `LyricsPanel.tsx` → 1 failed / 16 passed; same for `MiniPlayer.tsx` and both — failing assertion is `:325 expect(inlineArithmetic).toHaveLength(0)`, NOT `:334` |
| `lyricsOffset › a line activates EARLIER …` / `the ±0.5 step moves …` | **no, by construction** | they exercise the test's own `GRACE`/`activeIndexAt` mirror, not production (F4) |
| probes `omittedIndex` A1/A2 | **n/a (no mutation)** | real `llmClient` merges index-less parallel calls; control A3 passes |
| probe `crossRoundId` | **n/a (no mutation)** | real `llmClient` + real `chatStore`: 2 announcements of `call_0`, only 1 `tool` message |
| probe `user turn once` | **n/a (no mutation)** | request carries `找一首歌` twice |

Raw logs: `mutations.log`, `mutations2.log`, `probes.log`, `lyrics-shadow.log`, `full-suite-verbose.log`.

## FINDINGS

**F1 — medium — `src/main/llmClient.ts:172-180` (specifically `:174`).** The round-3 claim that the
accumulator "no longer merges parallel calls when a provider omits `index`" is false: `const i = tc.index ?? 0`
puts every index-less entry into slot 0 and `:176-178` concatenates id/name/arguments. Real-module
probe, one delta with two index-less calls for two different tools:
`toolCalls = [{"id":"call_auto_1","function":{"name":"search_musicplay_tracks","arguments":"{\"query\":\"a\"}{\"ids\":[\"t1\"]}"}}]`
— one bogus call, so the model's parallel intent is destroyed and a real call is silently lost. The
same happens for one index-less call per delta. No test covers it.
*RequiredFix:* derive a per-delta positional slot when `tc.index` is undefined (append a slot per
entry of a multi-entry delta instead of defaulting to 0) and add a regression case with index-less
parallel calls that fails on `?? 0`.

**F2 — medium — `src/main/llmClient.ts:38-46` + `src/renderer/src/stores/chatStore.ts:411-420` + `:383-395`.**
The two R2 layers are both scoped per response / per round (`seen` is built inside
`withUniqueToolIds`; `dedupeToolCalls` runs once per round), so a provider that repeats one of its
OWN ids in a later round still reaches `replaceToolMessage`, which matches the FIRST `tool` message
with that id (`chatStore.ts:388`) and overwrites the earlier round's reply — the exact old HTTP-400
shape. Real-module probe (real `llmClient` feeding the real `chatStore`, only IPC faked): provider
returns `id:'call_0'` in round 1 and round 2 →
`ids from llmClient = ["call_0","call_0"]`, last request =
`[… {"role":"assistant","tool_calls":[{"id":"call_0",…"query":"a"}]}, {"role":"tool","tool_call_id":"call_0",…"count":0}, {"role":"assistant","tool_calls":[{"id":"call_0",…"query":"b"}]}]`
→ 2 announced ids, 1 tool reply (assertion `toHaveLength(2)` got 1); the control with distinct ids
passes. Reachable for any gateway that mints ids per response (e.g. `call_0`/`call_1` style);
OpenAI/DeepSeek-style globally unique ids are unaffected.
*RequiredFix:* make id uniqueness run-scoped (a `seen` set carried across the rounds of one run, in
`chatStore` before announcing, or in `llmClient` per conversation) and rewrite a repeat to a fresh
`call_auto_<seq>`.

**F3 — medium — `src/renderer/src/lib/__tests__/lyricsOffset.test.ts:321-330`.** Documented
silent-pass path: when all three heads are `null` (the arithmetic moved into a shared helper — the
refactor the comment at `:316-320` anticipates) and neither panel still holds a literal `0.12`, the
test `console.warn`s and `return`s green. Demonstrated in the shadow tree:
`helper-refactor` (panels delegate to `activeTime(...)`) → **17 passed**; and crucially
`helper-wrong-sign` (same delegation, helper computes `time + 0.12 - offset`) → **17 passed**, i.e.
the sign can be inverted with the guard asleep. As long as the panels keep the inline `0.12`
arithmetic the guard does bite (flip-panel / flip-mini / flip-both all fail at `:325`).
*RequiredFix:* do not `return` silently — when a head is null, re-point the witness at the helper
file (or fail), e.g. assert that the delegation target's source contains `+ offset` with the same
grace literal, and fail when no witness could be established.

**F4 — low — `src/renderer/src/lib/__tests__/lyricsOffset.test.ts:209-225` + `:231-280`.** The
numeric half of the R4(c) block is self-referential: `GRACE = 0.12` and `activeIndexAt` are the
test's own mirror, so those assertions cannot fail because of a production change. Only `:282-340`
touches production, and only as source text.
*RequiredFix:* export the grace constant / an `activeIndex(lines, currentTime, offset)` helper from
production and assert against it (the witness can stay as a second layer).

**F5 — low/medium (side finding, outside the four items) — `src/renderer/src/stores/chatStore.ts:163-174` + `:538-543`.**
`baseHistory` is built from `get().messages` AFTER the new user bubble was appended, and `runFrom`
then prepends `resume.userLlm` again, so the current user turn is shipped twice in every request.
Real-module probe output:
`[probe C] user turns in the request = [{"role":"user","content":"找一首歌"},{"role":"user","content":"找一首歌"}]`.
*RequiredFix:* exclude the current user turn from `baseHistory` (or drop `resume.userLlm` when the
tail of `baseHistory` is that same turn) and add an assertion that a request contains one user turn.

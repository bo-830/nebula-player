# t7 review (r6) — `media://` roots BLOCKER: adversarial re-verification

READ-ONLY review. Nothing under `src/**` or `scripts/**` was created, modified or deleted
(verified: the only files this session wrote are `.devdata/t7-review/roots-revert/**` and
`.devdata/t7-review/probe/**`, mtimes 20:30–20:34; `src/**` mtimes predate the session start).

## Evidence revision (hash-locked)

| file | sha256 | mtime |
|---|---|---|
| `src/main/mediaRoots.ts` | `6B4F257349BFFB1F99FAD7DC1F5E20EE1B0A1D9BF312673E0505498A4C615F95` | 19:58:03 |
| `src/main/__tests__/mediaRoots.test.ts` | `84767D1C11198B8132EEDA987486EB64DEB4B1D43AE2E600865EBA9067C4D986` | 19:59:28 |
| `src/main/protocol.ts` | `675CD48398E6D81EC937A27AE3D880861058D9B29FD264588A1DD5065B64C28F` | 19:58:33 |
| `src/main/ipc.ts` | `D571BA33187D41DC8D6A2092EE953613382F49DEA8E5E22F61148547073AEDBE` | 19:43:26 |
| `src/main/libraryStore.ts` | `B78D45FC1C5EAC1922E0D2B46C69EBA486002E03CB495923ADA2D77738B86664` | — |

Baseline copies under `.devdata/t7-review/roots-revert/baseline/` are byte-identical to the two
first rows; the test copy in `.../reverted/` is byte-identical too. Only
`.devdata/t7-review/roots-revert/reverted/src/main/mediaRoots.ts` (`0D30EDDD…`) is mutated.

## (1) `src/main/mediaRoots.ts` — VERIFIED

* Concurrent-first-resolve: `mediaRoots.ts:81-90` — `get()` returns the cached `pending` promise
  (`:82`) and, on the cold path, runs `const promise = populate().then(...)` → `pending = promise`
  (`:83-88`) with **no `await` between `populate()` and the assignment**, so no other task can
  interleave; every concurrent caller awaits the same population. `populate()` itself swallows a
  failing `readLibrary()` (`:68-77`) and still returns the static roots.
* `refresh()` recomputes: `:97-100` calls `populate()` (which re-evaluates `staticRoots()` at
  `:67`) and re-caches via `set()`.
* `staticRoots` is a function: `mediaRoots.ts:28` (type `() => Array<…>`), supplied as
  `protocol.ts:41` `staticRoots: () => [paths().covers, paths().decodeCache]` — also a function in
  the built bundle (`out/main/index.js:739`). `app.setPath('userData', …)` is `index.ts:20`, i.e.
  after `protocol.ts`'s module body is evaluated (`index.ts:10`), so an array literal would indeed
  have been wrong; the laziness is real and is pinned by the test at `mediaRoots.test.ts:66-76`.
* Ways a caller can still see stale/empty: `current()` before the promise settles (`probe P2`) —
  the request path avoids it because `protocol.ts:145` awaits `get()` before `isInsideRoots()` reads
  `current()` (`protocol.ts:109`); a **synchronous re-entrant** `get()` from inside
  `staticRoots()`/`readLibrary()` (`probe P7`, unreachable with today's callbacks); a **cached
  rejection** (`probe P3`, F4); a **failed library read during `refresh()` wiping the set**
  (`probe P5`, F5).

## (2) Wiring `protocol.ts` + `ipc.ts` — VERIFIED (with two gaps)

* Every media request awaits the promise before containment: `protocol.ts:145` `await roots.get()`
  → `:146` `isInsideRoots(filePath)` → `:109` `roots.current()`. `registerMediaProtocol()` is
  called once (`index.ts:223`) before the window (`:232`) and before `registerIpc` (`:237`).
* Scan handler order is flush-then-refresh: `ipc.ts:114` `await svc.library.flush()` → `:115`
  `await refreshMediaRoots()` → `:116` `return result`. `flush()` awaits `writeFile(tmp)` +
  `rename` (`libraryStore.ts:58-61`), so the refresh re-reads a library.json that already contains
  the new tracks — the order is load-bearing and correct.
* A scanned folder therefore becomes servable in the same process: the only track-adding write is
  `libraryStore.ts:167` inside `scanRoots`, reached only from the single `library:scan` handler
  (`ipc.ts:96`), which every renderer add-path uses (`App.tsx:148` drag-drop, `MainView.tsx:247-249`
  folder picker, `SettingsModal.tsx:89-103` settings import) via `preload/index.ts:50`.
* Paths that do **not** refresh: `library:remove` (`ipc.ts:121`) and `library:drop-missing`
  (`ipc.ts:125`) — removal only, so roots stay over-permissive (no "cannot play"), bounded by the
  directory-level root design. Error paths: `collectAudioFiles` swallows every fs error
  (`scanner.ts:41-45,55-62`) and per-file parse failures are caught (`libraryStore.ts:159-175`), so
  a permission-denied subtree does not abort the scan; a **cancelled** scan still returns and still
  hits `:114-115`. The one real "scan finished, no refresh" path is a rejected
  `flush()`/`refreshMediaRoots()`, see F2.

## (3) Existing unit tests — PASS

`npx.cmd vitest run src/main/__tests__/mediaRoots.test.ts --config vitest.config.ts --reporter=verbose`
→ `Test Files 1 passed (1)`, `Tests 9 passed (9)`, exit code 0 (captured as `VITEST_EXIT=0`).
All nine: `resolves EVERY concurrent first call to the fully populated set`, `reads the library only
once across concurrent and later callers`, `falls back to the static roots when the library cannot
be read`, `evaluates staticRoots lazily, at populate time`, `applies a folder that only appeared
after the first population`, `can be replaced again and drops directories that are gone`, `set()
replaces the set and is visible to later get() calls`, `a set() during an in-flight populate wins
over that populate`, `refresh() records the library even when nothing was served yet`.

## (4) Discrimination — COPY-LEVEL revert (no `src/**` mutation)

Harness: `.devdata/t7-review/roots-revert/{baseline,reverted}/src/main/**` + `vitest.roots.config.ts`
(`root` = project, `include` = `.devdata/t7-review/roots-revert/**/*.test.ts`). The patch applied to
the **copy** (`git diff --no-index`, logged) is exactly:

```diff
-  let pending: Promise<string[]> | null = null
+  let rootsLoaded = false
   const get = async (): Promise<string[]> => {
-    if (pending) return pending
-    const promise = populate().then((roots) => {
-      if (pending === promise) allowed = roots
-      return allowed
-    })
-    pending = promise
-    return promise
+    if (!rootsLoaded) { rootsLoaded = true; allowed = await populate() }
+    return allowed
   }
-  const refresh = async (): Promise<string[]> => { set(await populate()); return allowed }
+  const refresh = async (): Promise<string[]> => allowed   // no-op
```

| variant | result | exit |
|---|---|---|
| baseline (unmodified copies) | `Tests 9 passed (9)` | 0 |
| reverted (boolean latch + no-op refresh) | `Tests 5 failed \| 4 passed (9)` | 1 |

Failing assertions (verbatim):

1. `expected 0 to be greater than 0` — `mediaRoots.test.ts:33` (concurrent callers handed `[]`)
2. `expected [ 'C:\music' ] to include 'C:\newdir'` — `:91` (post-scan folder never becomes servable)
3. `expected [ 'C:\newdir' ] to include 'C:\third'` — `:104` (later refresh ignored)
4. `expected [ 'C:\slow' ] to include 'C:\manual'` — `:137` (in-flight populate overwrites `set()`)
5. `expected [] to include 'C:\scanned'` — `:148` (refresh before first serve is a no-op)

Extra adversarial probes against the **real** module (read-only import), all 7 passing:
`P1` 64 concurrent callers → one read, one identical populated array; `P2` `current()` is `[]` only
before settlement; `P3` cached rejection replayed (F4); `P4` NUL-path hypothesis **falsified**
(`path.resolve` accepts `\u0000` here) but a non-iterable document collapses the set; `P5`
`refresh()` wipes library roots on a failed read; `P6` `refresh()` re-evaluates `staticRoots()`;
`P7` synchronous re-entrancy escapes the cache.

## (5) Cache-busting `?n=<nonce>` — PARTIAL

* The query is ignored server-side: `protocol.ts:98-103` decodes `u.pathname` only. Probe
  `probe-pathfromrequest.mjs` extracts that function **verbatim** from `protocol.ts` and runs it:
  `decoded(plain) === decoded(?n=…) === decoded(?n=…&x=1#frag) === target` → true. (Control: the
  intuition that a query would corrupt the payload is also false — `Buffer.from('QUJD?n=1',
  'base64url')` is lenient and stops at `?`.)
* The nonce does change what a URL-keyed cache sees: `new Request(plain).url !==
  new Request(nonce).url` while the handler path is identical. RFC 9111 §4 makes method + target URI
  the primary cache key, so a nonce genuinely addresses a different entry and cannot be answered from
  the plain URL's entry.
* What a nonce **cannot** fix / prove: (a) it says nothing about the app's own URL — the renderer
  never appends a nonce (`renderer/src/lib/mediaUrl.ts:5-10`, `Cover.tsx:18`,
  `playerStore.ts:451`), so fresh-200-after-scan must be shown on the plain URL too or the
  production path stays unproven; (b) it does not clear element-level failure caches
  (`Cover.tsx:17,26` latches `failedSrc` per `src`); (c) whether Chromium stores/keys entries for
  the **non-standard** `media:` scheme (registered at `index.ts:63-72` without `standard: true`) is
  not provable from here — no Electron instance was launched, and external doc fetches were blocked
  by the sandbox (github.com/stackoverflow.com unreachable). Mitigation already present: the 200/206
  branches send `Cache-Control: no-cache` (`protocol.ts:190,204`) and 403 is not heuristically
  cacheable per RFC 9111 §4.2.2; the error branches send no cache header at all (F6).

## FINDINGS

1. **medium — `dist/win-unpacked/resources/app.asar` (18:52:21), `dist/*.exe`, `dist/latest.yml`:**
   the packaged/updatable artifact still carries the **pre-fix** code — the asar literally contains
   `let allowedRoots = []; let rootsLoaded = false; async function ensureRoots() { if (rootsLoaded)
   return; rootsLoaded = true; … allowedRoots = Array.from(roots) }` and neither
   `refreshMediaRoots` nor `createMediaRoots`. `out/main/index.js` (20:22:43) **does** contain the
   fix (promise cache `:701-709`, `refreshMediaRoots` `:742`, handler call `:1342`).
   *Fix:* rebuild/repackage (`npm run build:win`) and republish the feed before claiming the shipped
   app is fixed; never gather "fixed?" evidence from `dist/win-unpacked`.
2. **low-medium — `ipc.ts:115` + `libraryStore.ts:47-62`:** the refresh is downstream of an
   **unserialized** write. `LibraryService.flush()` has no write queue (contrast
   `store.ts:140-153`, which chains `this.writing`), and the 400 ms debounce timer (`:47-50`) can
   fire while the handler's own `flush()` is in flight; both bodies write the same
   `library.json.tmp`, so the loser's `fs.rename` fails ENOENT → the `library:scan` invoke rejects →
   `refreshMediaRoots()` never runs → the new folder 403s until the next scan/restart (the BLOCKER
   symptom by another route), and the UI shows 「扫描失败」 for a successful scan.
   *Fix:* serialize flushes like `JsonStore.flush` (`this.writing = this.writing.then(...)`) and make
   the refresh best-effort (`try { await refreshMediaRoots() } catch (e) { log('warn', …) }`).
3. **low — `mediaRoots.ts:83-88`:** `pending` is assigned *after* `populate()` is invoked, so a
   synchronous re-entrant `get()` (from `staticRoots()`/`readLibrary()`) escapes the cache and is
   handed `[]` (probe P7: 2 reads, second caller `[]`). Unreachable via `protocol.ts:41-43` today.
   *Fix:* `pending = Promise.resolve().then(populate).then(…)` so the cache is published before any
   supplied callback runs.
4. **low — `mediaRoots.ts:57,67,82`:** a rejection from `populate()` — reachable only through
   `staticRoots()` at `:67`, which sits **outside** the `try` — is cached and replayed for the whole
   session: every later `get()` rejects, `protocol.ts:145` throws, so **all** media requests fail
   (not a 403), and `current()` stays `[]`; only a new scan (`refresh()`) recovers (probe P3).
   *Fix:* don't cache a rejection (`pending = promise.catch(e => { pending = null; throw e })`) or
   move `staticRoots()` inside the `try`.
5. **low — `mediaRoots.ts:75-77,97-100`:** the bare `catch {}` cannot distinguish "no library yet"
   from "read failed", and `refresh()` replaces outright, so a transient/unparsable read drops
   **every** library root (probe P5 → currently playing file 403s mid-playback until another
   refresh), and a non-iterable library document collapses the set with no log line (probe P4).
   *Fix:* return a discriminated populate result and keep the previous roots on failure; log it.
6. **low — `protocol.ts:147,150,160,168,175`:** the 403/404/416 branches send no `Cache-Control`
   (unlike 200/206 at `:190,204`). `Cache-Control: no-store` on the error branches removes all
   doubt about a stale cached denial and makes the nonce workaround unnecessary.
7. **info — `protocol.ts:50-52`:** `setMediaRoots()` still has zero callers (tree-shaken out of
   `out/main/index.js`). The live hook is `refreshMediaRoots()` (`ipc.ts:115`); the dead export
   should be deleted or wired, not left as the same trap the BLOCKER came from.

## VERDICT

The BLOCKER is **closed in the source revision reviewed** (hash-locked above) and in `out/`: the
concurrent-first-resolve invariant genuinely holds for all reachable inputs, `refresh()` re-derives
from a lazy `staticRoots()`, the scan handler flushes before refreshing, and the copy-level revert
discriminates hard (9/9 pass vs 5 named failures). The discriminating evidence is sound — but it is
**source-level only**: the packaged asar/installers in `dist/**` still contain the pre-fix latch
(F1), the "no restart needed" guarantee still rests on an unserialized library write (F2), and the
nonce-based runtime evidence neither covers the app's own nonce-less URL nor proves that Chromium
caches (or keys) the non-standard `media:` scheme at all (F6).

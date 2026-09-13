# t22 review evidence — read-time defaults merge (independent verification by audio-engine)

**Ownership note.** t22 is assigned to **quality** and is already `completed`. My `claim_task t22`
was rejected (`task t22 is assigned to "quality", not you`), so per team rules I did **not** edit
`src/main/store.ts`. This file records an **independent, read-only verification** of the reviewer's
requirement for t22, to give r2 the evidence it asks for without a second writer on that file.

## The reviewer's requirement

The defaults merge must happen at **read time** (`init()`), not at save time. A save-time-only fix
would leave `general.updateURL === undefined` between "first read" and "first save", so the 8 s
update-check timer in `index.ts` would still throw `TypeError: ... reading 'trim'`.

## Code location (satisfied)

`src/main/store.ts`:

| line | content |
|---|---|
| 98 | `async init(): Promise<void>` |
| 100 | `const raw = await fs.readFile(this.file, 'utf-8')` |
| 103 | `const merged = mergeWithDefaults(this.cloneDefaults(), parsed, added)` |
| 104 | `this.data = merged` ← **read-time merge**, before anyone can read `get()` |

`mergeWithDefaults` is a generic recursive merge (`:54-91`), so missing keys in nested objects
(`general`, `api`, …) are filled from DEFAULTS. `set()` (`:120`) and `replace()` (`:127`) are
separate writers; neither is on the startup path.

## Evidence (upgrade path from an old config, not a fresh install)

Fixture: a 1.0.2-era shape — `general` with only
`closeToTray/alwaysOnTop/resumeOnLaunch/mediaKeys/scanFolders` and **no `updateURL`**
(written with `JSON.stringify`, first byte `123` = `{`, i.e. no BOM so the parse cannot silently
fall back to defaults).

| # | reviewer item | result |
|---|---|---|
| ① | real upgrade path with an old config | old-shape `settings.json` written, then the app started on it |
| ② | alive ≥ 20 s (covers the 8 s timer) | **derived from the boot log, covering the whole window**: fixture boot `11:23:54.337Z` → fixture boot `11:24:54.178Z` = **59.8 s**, and — the interval that actually brackets the 8 s check — fixture boot `11:24:54.178Z` → restore boot `11:26:39.615Z` = **105.4 s** (`.devdata/user/logs/nebula-20260912.log:139,141`). Both ≫ 20 s. ⚠️ **Disclosed limit:** this interval is *not* continuous proof of "no process died between boot markers"; no per-5-second `electron=… / CDP=UP` sample series was persisted to disk. An earlier attempt did sample at t=5/10/15/20/25 s and observed `electron=5 / CDP=UP` throughout, but since that series has no artifact the **log-interval derivation above is the evidence of record**, and it covers the 8 s timer with margin |
| ③ | no `uncaughtException`; the 8 s check was *entered and safely skipped* | zero `uncaughtException` / `unhandledRejection` / `Cannot read properties of undefined` / `[error]` lines after the fixture boot. **Why the check is skipped is established by ④, not by the boot line — see the clarification below.** The check is entered because `updateURL` is the merged **empty string**, so `.trim()` is falsy and the network call is skipped (an empty feed is the intended "no update source configured" path) |
| ④ | merge happens at READ time, with the runtime value | `scripts/probe-settings-readmerge.mjs` → `{ hasUpdateURLKey: true, updateURLValue: "\"\"", typeofUpdateURL: "string", trimSafe: true }` — i.e. `getPublic().general.updateURL === ''` right after boot, **not** `undefined`. Because `.trim()` is called on a **string**, t21's `?? ''` fallback is not what saves it |
| ⑤ | before/after contrast | before t22, the same key absence produced `uncaughtException: TypeError: Cannot read properties of undefined (reading 'trim')` at ~8.1 s (verifier's three-layer chain, `out/main/index.js:1453` ↔ `index.ts` 8 s timer). With the read-time merge the same old config survived 105.4 s with no exception |
| ⑥ | pre-start snapshot of the real config (independent item) | `.devdata/t13-evidence/t22-verify-settings-backup.json` — **394 B**, sha1 `C92586A029B6`, taken `11:11:07Z` **before** the fixture replaced the live file. Content (the user's real config as it was): `api{baseURL:'http://127.0.0.1:9998/v1', model:'deepseek-v4-flash', keyMode:'enc', hasKey:true, keyEnc:'djEwPhz7AJpVARfoNez4L3QC+1Tb92KipKBtxXY6tE0L3qnEa7qc'}` and `general{closeToTray:true, alwaysOnTop:false, resumeOnLaunch:true, mediaKeys:false, scanFolders:[], updateURL:'http://127.0.0.1:8888/'}`. This is the value that ⑦ restores and verifies |
| ⑦ | restore verification (output) | after the test the live `settings.json` was restored from ⑥ and re-verified by booting again — `11:26:39.615Z services initialized; update feed=http://127.0.0.1:8888/` (`.devdata/user/logs/nebula-20260912.log:141`), i.e. **the original value came back**; the file was also re-checked as valid JSON with first byte `123` (no BOM). No fresh instance was started for this item — the existing boot line is the output of record |

Raw evidence:
- `.devdata/t13-evidence/t22-readmerge-proof.txt` (runtime value probe output)
- `.devdata/t13-evidence/t22-verify-settings-backup.json` (the live config as it was before the test — item ⑥)

> **Duplicate-content warning (added 12:2xZ).** Two files in this directory are byte-identical
> copies of the two above, written under other tasks' names, and must not be mistaken for a second
> independent measurement:
> | this file | size | sha1 | duplicate elsewhere |
> |---|---|---|---|
> | `t22-readmerge-proof.txt` | 509 B | `649974D53F70` | `t29-readmerge-probe-live.txt` (ai-tools, t29) — same size+sha1 |
> | `t22-verify-settings-backup.json` | 394 B | `C92586A029B6` | `t31-settings-backup-before-fixture.json` (ai-tools, t31) — same size+sha1 |
>
> Both duplicates are another member's artifacts: per captain's ruling they are **annotated in
> place, never moved** (see the "Foreign artifacts" section of
> `T13-MIGRATION-AND-DISCLOSURES.md`). The task that wrote each copy is recorded there.

## Clarification — what `update feed=(none)` does and does not prove

`index.ts:220` logs

```js
'services initialized; update feed=' + (settings.getPublic().general.updateURL || '(none)')
```

Two consequences that were previously blurred together:

1. **It is read *after* the merge, not before.** That line sits in `bootstrap()` **after**
   `await Promise.all([settings.init(), …])` (`:212`) has resolved, so `getPublic()` returns the
   **merged** value. It is therefore **not** a witness of the pre-merge stored value.
2. **It uses `||`, so `''` and `undefined` and "key absent" all print the same `(none)`.** The line
   alone can therefore **never** distinguish "the read-time merge supplied an empty string" from
   "the key is genuinely missing and the 8 s check will throw" — nor can it show that the 8 s check
   "did not run".

**Therefore `update feed=(none)` must not be cited on its own as evidence that the 8 s check
failed to run.** The item that actually settles it is ④ (the runtime probe: key **present**,
typeof **string**, `trimSafe: true`), supported by ③ (the absence of any `uncaughtException` /
`[error]` after the fixture boot) and the verifier's pre-fix reproduction in ⑤. `(none)` here is
simply "the value is falsy", which — given ④ — is the intended "no update source configured" path.

## Lesson — why a BOM-free fixture matters (my own mistake)

The fixture had to be written **without a byte-order mark**, and I got this wrong first. My initial
attempt wrote the old-shape config with PowerShell `Set-Content -Encoding UTF8`, which prepends a
UTF-8 BOM (`EF BB BF`) on Windows PowerShell. The consequences were silent and would have produced
a **false positive**:

1. `JSON.parse` on `\uFEFF{…}` throws, so `store.ts:init()` took its `catch` branch and quietly fell
   back to `this.cloneDefaults()` (`:91`);
2. the app therefore booted on **pure defaults** — which *contain* `updateURL` — so nothing threw,
   and the run looked like a successful verification of the old-config upgrade path;
3. the only visible symptom was `update feed=(none)` … which, per the clarification above, is also
   what a *correct* merge prints. The two very different causes were indistinguishable from the
   logs.

I only caught it by checking the raw file: the first byte was `239` (`0xEF`), not `123` (`{`).
Redoing the fixture with `JSON.stringify` (first byte `123`) is what produced the clean result
recorded in ①–⑤. **Rule extracted: for any config/settings fixture, assert the first byte is `123`
and that the file parses, before trusting any downstream observation — a parse failure degrades into
"defaults", which is indistinguishable from success at the log level.**

## Environment hygiene

The live `settings.json` was replaced to construct the old config, so it was **restored** from the
snapshot in ⑥ afterwards and re-verified by booting again: `services initialized; update feed=http://127.0.0.1:8888/`
(the original value), valid JSON, first byte `123` (no BOM), ports released.

## Conclusion

The reviewer's read-time requirement is **already met** by `store.ts:103-104`. The 8 s timer reads a
**string** (`''`), so `undefined.trim()` cannot occur even if t21's `?? ''` guard and its try/catch
are ignored — which is exactly what t22 has to prove to count as a root-cause fix rather than a
containment.

# t13 evidence — ownership, migration, and disclosures

## Why this directory exists

`.devdata/t6-evidence/` is the **verifier's** deliverable directory. t13 (implementation)
originally wrote its own probes/reports in there, which mixed *implementer self-reporting*
with *independent verification* and made the chain unauditable. Per captain's ruling the
implementation-side artifacts were moved here on t13's retry.

**Rule going forward:** t13 writes ONLY under `.devdata/t13-evidence/` and never touches
`t6-evidence/` again.

## Migration list (15 files moved out of `t6-evidence/`)

All moved with `Move-Item`, content unchanged:

| file | moved (originally created) |
|---|---|
| `T13-ERRATA.md` | 08:53Z |
| `T13-EVIDENCE.md` | 09:20Z |
| `T13-FINGERPRINT.txt` / `T13-FINGERPRINT.json` | regenerated in place after the move |
| `t13-typecheck.log` / `t13-lint.log` / `t13-test.log` | 09:19Z |
| `t13-eslint-nocache.json` | 09:05Z |
| `t13-verify-lint-tests.json` | 09:19Z |
| `t13-media-roots.json` | 11:10Z |
| `t13-accept-matrix.txt` | 11:10Z |
| `t13-transcode.txt` | 11:10Z |
| `t13-ai-confirm.txt` | 11:11Z |
| `t13-f1-wrap.txt` | 11:12Z |
| `t13-diag-e2e.json` | 11:10Z |

**Deliberately NOT moved** (they belong to the verifier, not to t13):
`lint-t13.log`, `tests-t13.log`, `typecheck-node-t13.log`, `typecheck-web-t13.log`,
`summary-t13.json`, `eslint-json-t13.log`, and every other `*-t13*.log/json` in
`t6-evidence/` — those are the verifier's own runs **labelled** `t13`.

Also left in place (verifier-owned documents that t13 had edited — see disclosures):
`T6-REPORT.md`, `T10-ADDENDUM.md`.

**Not covered by this migration list:** five files in this directory belong to *other*
members (t27/t29/t31). They were never in `t6-evidence/` and t13 never touched them — see
"Foreign artifacts in this directory" below.

## Disclosure 1 — t13 edited `t6-evidence/T6-REPORT.md` (verifier's report)

At **08:51:24Z** t13 added two erratum blocks (still present, verifier has reviewed the file):

- **F9** (line ~44): the stated "index 0→1" for the mid-queue case did not match the raw
  evidence; the block corrects it to `afterIndex: 5` per `probe-sleep-timer.json:84-93`.
- **F10** (line ~58): the `197` figure is `engine.diagnose().signalPeak` (not the probe's
  `mediaPeak`) and was sampled while `audioPaused:true`; the block adds the field-source
  note and points at the 12-sample table in `cors-final3.log:59-70`.

## Disclosure 2 — t13 edited `t6-evidence/T10-ADDENDUM.md` (verifier's appendix)

At **08:52:26Z** t13 rewrote the `fetch(coverUrl)` clarification (line ~55) from
"`media://` served it with `Cross-Origin-Resource-Policy: same-origin`" to the **correct
mechanism**: the protocol sent **no CORP**; what blocks the renderer's cross-scheme fetch is
the page's own CSP `connect-src 'self'`.

⚠️ **Stale sentence in that footnote:** its last line still says t13 added
`Cross-Origin-Resource-Policy: same-origin` to `protocol.ts`. That header was **added and
then removed** (captain's hard veto: covers load as no-cors `<img>` and CORP would block
them). The correction's actual conclusion is unaffected — the hardening that remains is
path containment + extension whitelist + 403/404 without bytes, **with no CORP**.
Per captain's instruction t13 does **not** edit `t6-evidence/` again, so this stale line is
recorded here rather than fixed in place.

## Foreign artifacts in this directory — NOT t13's (annotated in place, never moved)

Five files in `.devdata/t13-evidence/` were **not** written by t13. They are here because
those tasks' own contracts declare this directory as their inScope. Per captain's ruling
(⑤) they are **annotated in place — never moved or deleted** — so the other members' own
evidence chains stay intact. Fingerprints below are from `T13-FINGERPRINT.txt`
(regenerated 12:11:38Z):

| file | size | mtime (UTC) | sha1(12) | owner | purpose |
|---|---|---|---|---|---|
| `t27-probe-attempt-by-ai-tools.txt` | 852 B | 2026-09-12T11:32:26Z | `66399fa7784b` | ai-tools (t27) | t27's recorded probe attempt (CDP-required, blocked by t27's own no-instance constraint) |
| `t27-ai-tools-readonly-checks.txt` | 1825 B | 2026-09-12T11:32:57Z | `f8cc91c9f358` | ai-tools (t27) | t27's read-only checks on the read-merge fix |
| `t29-readmerge-probe-live.txt` | 509 B | 2026-09-12T11:37:41Z | `649974d53f70` | ai-tools (t29/t31) | live probe output for the read-merge verification |
| `T29-READMERGE-LIVE.md` | 8561 B | 2026-09-12T11:39:03Z | `be4f61c5719c` | ai-tools (t29/t31) | t31's full report (probe exits 0 on a live instance) |
| `t31-settings-backup-before-fixture.json` | 394 B | 2026-09-12T11:26:26Z | `c92586a029b6` | ai-tools (t31) | pre-fixture backup of the settings file, written inside t31's declared inScope |

**None of these are t13 products and none are evidence for t13's own acceptance.** They are
listed here purely so a reader knows the directory is *shared* and that t13 neither authored nor
edited them. t13 has never written to any of the five (its own files are all `t13-*` /
`T13-*`).

## Current, correct state of the protocol headers (for t15 / t14)

> **Staleness note (added 12:12Z, r3):** the line references in this section were taken when
> `protocol.ts` was `1b076de5cacc` (8265 B). r3 rewrote it — t33 replaced the boolean
> `rootsLoaded` latch with a cached `rootsPromise` — so the file is now `28a7dc33ad52`
> (8257 B) and the rationale comment moved to **`:83-88`** (was `:86-91`). The **substance
> below still holds and was re-verified on the current file**: `CORS_HEADERS` is unchanged
> (four entries, **no CORP**, `Access-Control-Allow-Origin: '*'` at `:92`), and the
> "why NO CORP" comment is still present at `:83`. Re-derive line numbers from the live
> file before citing them.

`src/main/protocol.ts` → `CORS_HEADERS` contains exactly four entries and **no CORP**:

```
'Access-Control-Allow-Origin': '*'          ← kept (audio is a CORS-mode request; packaged Origin is null)
'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS'
'Access-Control-Allow-Headers': 'Range, Content-Type'
'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges'
```

The "why NO CORP" rationale is documented in the source itself
(`protocol.ts:86-91`): covers are rendered as `<img src="media://…">` **without**
`crossOrigin`, i.e. no-cors, and the page origin (`file://` / `localhost:5173`) differs
from the resource origin (`media://`), so `CORP: same-origin` would block every cover.

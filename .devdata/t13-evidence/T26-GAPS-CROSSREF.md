# t26 gaps → covered by t13/t24 run-time evidence (same frozen tree)

verified tree = the one t26 fingerprinted: `src/**` aggregate `b7ea6c857054a889…`,
latest src mtime `10:58:00Z`.

> **Scope of this document (after the verifier's §A.1–§A.3 cross-check, all accepted).** This is an
> **r2-tree** cross-reference. The verifier independently reproduced the tree identity with their
> own `t24-post-snapshot.json` (**8/8 MATCH**, 11:38:18Z), so §"Proof these artifacts are from that
> same tree" stands. **Both of its gap claims changed status:** Gap 1 is **accepted as an r2
> supplement** (with one field retracted as an empty control, and r3 now authoritative via the
> verifier's re-run — see below), and Gap 2 is **withdrawn** and replaced by the verifier's own
> artifact. Do not read this file as covering A1.

## Proof these artifacts are from that same tree

t26's per-file values vs the values recorded in `.devdata/t13-evidence/T13-FINGERPRINT.txt`
(all eight match exactly; independently reproduced by the verifier against their own
`t24-post-snapshot.json`, also 8/8):

| file | t26 recorded | t13/t24 recorded |
|---|---|---|
| `src/main/decodeService.ts` | `df1c81800a0d` | `df1c81800a0d` |
| `src/main/protocol.ts` | `1b076de5cacc` | `1b076de5cacc` |
| `src/main/index.ts` | `dabd3b68d59e` | `dabd3b68d59e` |
| `src/main/store.ts` | `7efc2b632049` | `7efc2b632049` |
| `src/main/window.ts` | `2806d7ab4233` | `2806d7ab4233` |
| `src/renderer/src/lib/audioEngine.ts` | `e01f4c0d66d5` | `e01f4c0d66d5` |
| `src/renderer/src/stores/playerStore.ts` | `512e558ed3b2` | `512e558ed3b2` |
| `src/renderer/src/components/MiniPlayer.tsx` | `a66cf9953912` | `a66cf9953912` |

The evidence files below were written at 11:10–11:12Z, i.e. **after** the last `src/**`
write (10:58:00Z), so they describe this tree.

(Note on aggregates: t26's `b7ea6c857054a889…` covers 71 files; a local recomputation that
also excludes `__tests__` yields 56 files and `d14a9f6b9e12a245`. The verifier has accepted this
explanation: **the two aggregates are not directly comparable, and the per-file hashes above are
the reliable comparison** — the 8/8 match is what establishes same-tree.)

> ⚠️ **Neither `b7ea6c857054a889…` nor any value in this file is a *current* value.** r3 has since
> rewritten several of these files (`protocol.ts` → `28a7dc33ad52`, `index.ts` → `18ef7c49c2eb`,
> `MiniPlayer.tsx` → `8A219676275A`, …). r2 verdicts stay valid for the r2 hashes; r3 steps must
> re-anchor. See `T13-MIGRATION-AND-DISCLOSURES.md` and the `r2:` column of `T13-FINGERPRINT.txt`.

## Gap 1 — F3 reverse case (over-privileged paths refused) — COVERED

`.devdata/t13-evidence/t13-media-roots.json` + `.devdata/t13-evidence/T13-EVIDENCE.md`

Probe `scripts/probe-media-roots.mjs` (runs against the live app, loads via `<img>` because
the page CSP `connect-src 'self'` blocks a cross-scheme `fetch`):

| request | result |
|---|---|
| real track `song-c.flac` (`<audio>`) | `metadata:5` (loads) ← **positive control** |
| real cover in `<userData>/covers` | `loaded, w=512` ← **positive control** |
| **`<userData>/probe-outside-roots.png`** (a *servable* extension outside every root) | **refused** ← proves containment, not just the extension rule |
| same file reached via `…\user\..\user\covers\…` | **loaded** ← proves `resolve`+`relative` normalisation, not string prefixing |
| `<userData>/settings.json` (holds the API key) | **refused** |
| `<library root>\..\..\..\..\Windows\win.ini` | **refused** |
| `.txt` beside the audio (in-root, non-whitelisted) | **refused** |

> ⚠️ **Do not read `controlInsideRoot: blocked` (in `t13-media-roots.json`) as "in-root paths were
> refused".** The verifier checked `scripts/probe-media-roots.mjs:128` and found that "control" is
> `tryImg(mediaUrl(track.path))` — i.e. it loads a **FLAC through an `<img>` element**, which fails
> for reasons unrelated to the root policy. It is an **empty control** (no signal in either
> direction), and must not be cited. The **valid positive controls are the first two rows of the
> table above** (`trackLoad` via `<audio>` → `metadata:5`, and `coverLoad` via `<img>` → `512`).

Also static: `protocol.ts` has **no** `Cross-Origin-Resource-Policy` (only a comment
explaining why it must not be added), and every response branch carries `CORS_HEADERS`.

**Tree-of-record caveat:** the table above was captured with `protocol.ts` = `1b076de5cacc`, i.e.
the **r2 tree**. The verifier has since re-run the reverse case on the **r3 tree**
(`protocol.ts` = `28a7dc33ad52`): **F3 rejections 6/6 `allPass`**
(`.devdata/t13-r2-evidence/t25-f3-rejections.json`, re-run 12:12Z), including the stronger
same-real-mp3-escapes-via-`..` isolation case plus an image-side control. **For r3, the verifier's
result is authoritative; this section stands only as the r2 supplement** — the two do not conflict.

## Gap 2 — A1 (discriminative mini-window offset sync) — **WITHDRAWN, then covered by the verifier**

> **Retraction (added after verifier's §A.3 cross-check).** An earlier revision of this section
> claimed that `.devdata/t13-evidence/` recorded the crossing experiment — the mini highlight
> moving `1 → 2 → 3` with the clock frozen — **and that the mini renderer received the `storage`
> event for `nebula.lyricsoffset`**. **That claim is not supported by any artifact and is hereby
> withdrawn.** Verified: no JSON/txt under `.devdata/t13-evidence/` carries a storage-event array,
> and the only file in the whole evidence tree that even mentions capturing one is the verifier's
> own `T26-VERIFICATION.md`. The distinction matters: the probe script *did* filter for `storage`
> events, so the capture was genuinely attempted (this was not an invented claim) — but **an
> attempt is not an artifact**, and no persisted output records the result.
>
> Worse, the artifact I very loosely pointed at — the verifier's
> `.devdata/t6-evidence/probe-lyrics-sync-crossing.json` (theirs, not mine, `10:40:37Z`) — has
> **no `storage` key at all**, and its own verdict fields read
> `highlightChangedWithOffset: false`, `resetReturnsToIdle: false`, `clickJump.error: "target line
> not found"`. So the crossing/highlight behaviour is **not** demonstrated by that file, let alone
> the storage event. Citing it as if it corroborated the claim was wrong.

**Current, properly-supported state of A1:** the verifier produced fresh, stronger run-time
evidence on the r2 tree — `.devdata/t13-r2-evidence/t25-a1-mini-offset.json` (**7/7**): the clock
is frozen at `14.95` (three identical `currentTime` readings), the mini window's highlight
**crosses lines and returns** as `offset` goes `0 → +0.5 → 0`, both windows agree step by step, and
the offset key is read back directly from the mini window's `localStorage`. **That is the A1
evidence of record.** This document therefore contributes nothing to Gap 2 — the gap is covered by
the verifier's own artifact, not by mine.

**What I must *not* keep claiming:** that the mini renderer's `storage` event was observed. If a
run ever captures it, it must be persisted as its own artifact before being cited; per the
captain's earlier ruling the array was **not captured** and the matter is closed as (A).

## Why these are legitimately separate from t26's run

t26 could not produce these on its own tree because the app instance died with
`0xC0000409` while running the dense multi-format probe (the same crash class tackled by
t21/t22/t23). The Gap-1 evidence above was captured **before** that instability, on the same
immutable tree, using the lighter probes — which is exactly why it survived.

> On the exit code itself, the verifier and I now use the same criterion (their
> `METHOD-probe-exitcode-vs-liveness.md` §3.0): **a probe's exit code is noise for liveness
> questions; judge "the app was alive" by electron process count + CDP reachability.** The
> `0xC0000409` value explains only my own probe's teardown (a Node/libuv teardown assertion), and
> it does **not** explain the verifier's separately recorded `ECONNREFUSED 9222` (exit 1) or
> `evaluate timed out` (exit 0) observations — both records stand, in parallel, and neither is used
> as evidence about the other's run.

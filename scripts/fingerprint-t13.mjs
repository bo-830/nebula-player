/**
 * t13 fingerprint manifest.
 *
 * The repo has no git, so t15 (verification) and t9 (packaging) must be able to
 * tell WHICH tree the r2 evidence belongs to. The t6 evidence pack only holds
 * for the 15:30–16:25 snapshot, so this re-anchors it after the r2 repairs.
 *
 * Uses node:fs only (no PowerShell pipeline, per captain's instruction) and
 * prints `relative/path | mtime | size | sha1(12) | owner` rows, plus a JSON twin.
 *
 * The `owner` column exists because several files in this manifest were NOT
 * written by t13 — quality's t22 touched `store.ts`, quality's t18 removed the
 * unconditional `openExternal` from `window.ts`, and `index.ts` carries
 * t16+t18+t21+t23. Without the owner column the manifest silently implies those
 * values are t13's work (captain granted this upgrade explicitly).
 *
 * SCOPE OF VALIDITY: every value below is a point-in-time anchor for the **r2
 * frozen tree** (latest `src/**` write 2026-09-12T10:58:00Z). It stays valid for
 * the r2 verdicts recorded by t15/t25/t26/t28 — but it is NOT a current value
 * once r3 lands, because r3 rewrites `protocol.ts`, `index.ts`, `ipc.ts`,
 * `MiniPlayer.tsx`, `chatConfirm.test.ts` and others. r3 steps (t41/t42/t43)
 * must re-run this script and use the fresh values.
 *
 * Usage: node scripts/fingerprint-t13.mjs
 */
import { createHash } from 'crypto'
import { readFileSync, statSync, writeFileSync, mkdirSync } from 'fs'
import { dirname, join, relative } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Who last wrote each path (per the task records). Anything not listed here was
 * written by t13 itself. Captains' rulings folded in:
 *  - `index.ts` is t16+t18+t21+t23, NOT a t13 product;
 *  - `store.ts` is quality's t22, `window.ts` is quality's t18.
 */
const OWNERS = {
  'src/main/store.ts': 't22 (quality)',
  'src/main/window.ts': 't18 (quality)',
  'src/main/index.ts': 't16+t18+t21+t23',
  'src/main/llmClient.ts': 't12 (quality)',
  'src/renderer/src/lib/audioEngine.ts': 't2 (audio-engine)',
  '.devdata/t6-evidence/T6-REPORT.md': 'verifier (t6) — NOT t13',
  '.devdata/t6-evidence/T10-ADDENDUM.md': 'verifier (t6) — NOT t13'
}

/** files this task actually modified or added */
const CHANGED = [
  // implementation (all inside the declared inScope)
  'src/renderer/src/stores/playerStore.ts',
  'src/renderer/src/stores/chatStore.ts',
  'src/main/protocol.ts',
  'src/renderer/src/components/LyricsPanel.tsx',
  'src/renderer/src/lib/sleepTimer.ts',
  'src/renderer/src/lib/__tests__/playerStoreSleep.test.ts',
  'src/renderer/src/lib/__tests__/sleepTimer.test.ts',
  'src/renderer/src/lib/__tests__/chatConfirm.test.ts',
  'src/renderer/src/lib/__tests__/lyricsOffset.test.ts',
  // ffmpeg `-f` fix: AAC/APE transcode was broken (see output)
  'src/main/decodeService.ts',
  // inScope-declared evidence / report paths
  '.devdata/t6-evidence/T6-REPORT.md',
  // paths the contract check refused to record (reported, not hidden)
  'src/renderer/src/lib/__tests__/chatConfirm.test.ts',
  'scripts/probe-media-roots.mjs',
  'scripts/probe-media-accept.mjs',
  'scripts/diag-graph.mjs',
  '.devdata/t6-evidence/T10-ADDENDUM.md',
  // t13's own evidence lives ONLY in its own directory (never in t6-evidence/,
  // which is the verifier's deliverable directory — captain's separation rule)
  '.devdata/t13-evidence/T13-ERRATA.md',
  '.devdata/t13-evidence/T13-EVIDENCE.md',
  '.devdata/t13-evidence/T13-FINGERPRINT.txt',
  '.devdata/t13-evidence/t13-typecheck.log',
  '.devdata/t13-evidence/t13-lint.log',
  '.devdata/t13-evidence/t13-test.log',
  '.devdata/t13-evidence/t13-eslint-nocache.json',
  '.devdata/t13-evidence/t13-verify-lint-tests.json',
  '.devdata/t13-evidence/t13-media-roots.json',
  '.devdata/t13-evidence/t13-accept-matrix.txt',
  '.devdata/t13-evidence/t13-transcode.txt',
  '.devdata/t13-evidence/t13-ai-confirm.txt',
  '.devdata/t13-evidence/t13-f1-wrap.txt',
  '.devdata/t13-evidence/t13-diag-e2e.json'
]

/**
 * NOT changed by t13, but referenced by t15 / t9 evidence: their fingerprints
 * are what ties the r2 evidence to this tree. `store.ts` and `window.ts` were
 * added on captain's instruction — they carry the other r2 repairs the verifier
 * and packager must tie to the same tree.
 */
const REFERENCED = [
  'src/renderer/src/lib/audioEngine.ts',
  'src/renderer/src/stores/playerStore.ts',
  'src/renderer/src/stores/chatStore.ts',
  'src/main/protocol.ts',
  'src/main/index.ts',
  'src/main/store.ts',
  'src/main/window.ts',
  'src/main/llmClient.ts',
  'scripts/probe-transcode.mjs',
  '.devdata/transcode-fixtures/tone.aac'
]

/**
 * Other members' artifacts that live inside t13's evidence directory because
 * their own contracts declare it as inScope. Listed for readability only —
 * they are NOT t13 products, and per captain's ruling they must stay in place
 * (annotate, never move or delete).
 */
const FOREIGN = [
  { path: '.devdata/t13-evidence/t27-probe-attempt-by-ai-tools.txt', owner: 'ai-tools (t27)' },
  { path: '.devdata/t13-evidence/t27-ai-tools-readonly-checks.txt', owner: 'ai-tools (t27)' },
  { path: '.devdata/t13-evidence/t29-readmerge-probe-live.txt', owner: 'ai-tools (t29/t31)' },
  { path: '.devdata/t13-evidence/T29-READMERGE-LIVE.md', owner: 'ai-tools (t29/t31)' },
  {
    path: '.devdata/t13-evidence/t31-settings-backup-before-fixture.json',
    owner: 'ai-tools (t31)'
  }
]

/**
 * The r2 frozen-tree values this manifest was originally taken from (captain's
 * `b7ea6c85…` anchor, latest `src/**` write 10:58:00Z). r3 has since rewritten
 * several of these files, so the live values below are NOT always the r2 ones.
 * Comparing against this table lets the run flag the drift instead of leaving a
 * stale value looking authoritative to t41/t42/t43.
 */
const R2_FROZEN = {
  'src/renderer/src/stores/playerStore.ts': { mtime: '2026-09-12T10:47:58Z', sha1: '512e558ed3b2' },
  'src/renderer/src/stores/chatStore.ts': { mtime: '2026-09-12T10:47:50Z', sha1: '4dc3949252f9' },
  'src/main/protocol.ts': { mtime: '2026-09-12T09:14:11Z', sha1: '1b076de5cacc' },
  'src/main/index.ts': { mtime: '2026-09-12T10:43:10Z', sha1: 'dabd3b68d59e' },
  'src/main/store.ts': { mtime: '2026-09-12T10:51:12Z', sha1: '7efc2b632049' },
  'src/main/window.ts': { mtime: '2026-09-12T09:03:47Z', sha1: '2806d7ab4233' },
  'src/renderer/src/lib/audioEngine.ts': { mtime: '2026-09-12T07:22:39Z', sha1: 'e01f4c0d66d5' },
  // values below come from the verifier's independent t26 frozen snapshot
  // (`.devdata/t13-r2-evidence/t26-frozen-snapshot.json`, srcFileCount 71,
  // aggregate b7ea6c85…, newest src mtime 10:58:00Z) — not from t13's own pack
  'src/renderer/src/lib/__tests__/playerStoreSleep.test.ts': {
    mtime: null,
    sha1: '5e195164da5a'
  },
  'src/renderer/src/lib/__tests__/chatConfirm.test.ts': { mtime: null, sha1: 'cd6b3c09ef23' },
  'src/renderer/src/lib/__tests__/lyricsOffset.test.ts': { mtime: null, sha1: '0883b2034898' }
}

/** known, expected r3 drift — distinguishes "repaired on purpose" from "unknown" */
const DIVERGENCE_NOTES = {
  'src/renderer/src/stores/chatStore.ts': 'r3 (t34) editing',
  'src/main/protocol.ts': 'r3 (t33/t40) allowedRoots latch → cached Promise',
  'src/main/index.ts': 'r3 (t16 R3) will-redirect guard',
  'src/renderer/src/lib/__tests__/lyricsOffset.test.ts': 'r3 (t37) this case',
  'src/renderer/src/lib/__tests__/chatConfirm.test.ts': 'r3 (t34) R4(d) cleanup',
  'src/renderer/src/lib/__tests__/playerStoreSleep.test.ts': 'r3 (t36) discriminative case'
}

/** does a live row still match the r2 frozen value? `null` = not tracked */
function r2Status(f) {
  const frozen = R2_FROZEN[f.path]
  if (!frozen) return null
  if (f.sha1 === frozen.sha1) return 'r2'
  const why = DIVERGENCE_NOTES[f.path]
  return `DIVERGED (r2 ${frozen.sha1})${why ? ` — ${why}` : ' — CAUSE UNKNOWN'}`
}

function owner(rel) {
  // r3 rewrote several files that t13 originally authored. The live sha1 below is
  // the r3 author's work, so naming t13 would misattribute it.
  const lastWriter = {
    'src/renderer/src/lib/__tests__/chatConfirm.test.ts':
      't13 → r3 t34 (ai-tools) [R4(d)] — live value is t34\u2019s',
    'src/renderer/src/lib/__tests__/playerStoreSleep.test.ts':
      't13 → r3 t36 (ui-features) — live value is t36\u2019s',
    'src/renderer/src/lib/__tests__/lyricsOffset.test.ts':
      't13 → r3 t37 (audio-engine) — live value is t37\u2019s'
  }
  return lastWriter[rel] ?? OWNERS[rel] ?? 't13 (audio-engine)'
}

function fingerprint(rel) {
  const abs = join(ROOT, rel)
  try {
    const st = statSync(abs)
    const sha1 = createHash('sha1').update(readFileSync(abs)).digest('hex').slice(0, 12)
    return {
      path: rel.split('\\').join('/'),
      mtime: new Date(st.mtimeMs).toISOString(),
      size: st.size,
      sha1,
      owner: owner(rel),
      r2: null,
      exists: true
    }
  } catch (err) {
    return {
      path: rel.split('\\').join('/'),
      mtime: null,
      size: null,
      sha1: null,
      owner: owner(rel),
      exists: false,
      note: err.code === 'ENOENT' ? 'NOT FOUND (may have been deleted)' : String(err.message)
    }
  }
}

const withR2 = (list) => list.map((f) => ({ ...f, r2: f.exists ? r2Status(f) : null }))

/**
 * This manifest lists itself, so its own entry would otherwise be the PREVIOUS
 * generation's bytes (rewritten after the list is built). Replace that one row
 * with an explicit self-reference so the value is never read as current.
 */
const SELF = '.devdata/t13-evidence/T13-FINGERPRINT.txt'
const selfNote = (list) =>
  list.map((f) =>
    f.path === SELF
      ? {
          ...f,
          mtime: '(self)',
          size: '(self)',
          sha1: '(self — this file)',
          r2: 'n/a (self)',
          exists: true,
          note: 'self-referential: this row describes the file being written; not a value to cite'
        }
      : f
  )

const changed = selfNote(withR2(CHANGED.map(fingerprint)))
const referenced = withR2(REFERENCED.map(fingerprint))
const foreign = FOREIGN.map((f) => ({ ...fingerprint(f.path), owner: f.owner }))
const now = new Date()

const rows = (list) =>
  list
    .map((f) => {
      const r2 = f.r2 ? ` | r2: ${f.r2}` : ''
      return f.exists
        ? `${f.path} | ${f.mtime} | ${f.size} | ${f.sha1} | ${f.owner}${r2}`
        : `${f.path} | (missing) | - | - | ${f.owner} ; ${f.note}`
    })
    .join('\n')

const diverged = referenced.filter((f) => f.exists && f.r2 && f.r2 !== 'r2')

const text = [
  't13 fingerprint manifest — r2 evidence anchor',
  `generated_at: ${now.toISOString()}`,
  `root: ${ROOT}`,
  '',
  'anchor scope: the values below are the LIVE tree at generated_at, not a replay of',
  'the r2 frozen tree. Rows whose sha1 matches the r2 anchor are tagged `r2: r2`;',
  'rows rewritten by r3 are tagged `r2: DIVERGED (r2 <old sha1>) — <task>`, and an',
  'unknown cause would read `— CAUSE UNKNOWN` (none should appear).',
  '',
  'how to read this vs the r2 verdicts: t15/t25/t26/t28 judged the r2 HASHES, so',
  'their verdicts stay valid; the r3 divergence below does not retract them. But the',
  'live column must never be cited as an r2 value — re-run before citing.',
  'owning the value: the owner column names the author of the value shown. Where r3',
  'rewrote a file t13 originally wrote, the owner says so explicitly.',
  '',
  `== t13's declared file set (${changed.length}) — live values; owner names the current author ==`,
  'path | mtime | size | sha1(12) | owner',
  rows(changed),
  '',
  `== referenced by t15 / t9 evidence (${referenced.length}) — owner column names the real author ==`,
  'path | mtime | size | sha1(12) | owner',
  rows(referenced),
  '',
  `== other members' artifacts inside .devdata/t13-evidence (${foreign.length}) — annotated in place, never moved ==`,
  'path | mtime | size | sha1(12) | owner',
  rows(foreign),
  ''
].join('\n')

const outDir = join(ROOT, '.devdata', 't13-evidence')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'T13-FINGERPRINT.txt'), text, 'utf-8')
writeFileSync(
  join(outDir, 'T13-FINGERPRINT.json'),
  JSON.stringify(
    {
      generatedAt: now.toISOString(),
      root: ROOT,
      anchorNote:
        'Values are the LIVE tree at generatedAt. Rows tagged r2:"r2" still match the r2 frozen anchor; rows tagged r2:"DIVERGED (r2 <sha1>)" were rewritten by r3 and must not be cited as r2 values.',
      r2Diverged: diverged.map((f) => ({ path: f.path, live: f.sha1, r2: f.r2 })),
      changed,
      referenced,
      foreignInOwnEvidenceDir: foreign
    },
    null,
    2
  ),
  'utf-8'
)

console.log(text)
const missing = [...changed, ...referenced].filter((f) => !f.exists)
if (missing.length) console.log('MISSING:', missing.map((f) => f.path).join(', '))
if (diverged.length) {
  console.log(
    'R3 DIVERGENCE (do not cite as r2): ' +
      diverged.map((f) => `${f.path} ${f.r2}`).join('; ')
  )
}
process.exit(0)

/**
 * t47 — split the finished evidence into the captain's requested per-group files.
 * Read-only over existing evidence; writes NEW files only (captain's "增量取证" layout).
 *
 * Usage: node .devdata/t47-evidence/split-evidence.mjs
 */
import { readFile, writeFile } from 'fs/promises'

const dir = '.devdata/t47-evidence'
const load = async (f) => JSON.parse(await readFile(`${dir}/${f}`, 'utf8'))
const emit = async (f, obj) => {
  await writeFile(`${dir}/${f}`, JSON.stringify(obj, null, 2), 'utf8')
  console.log(`wrote ${dir}/${f}`)
}

const rt = await load('t47-runtime.json')
const diag = await load('t47-diag.json')
const diag2 = await load('t47-diag2.json')
const discrim = await load('discrim.json')

const meta = {
  sourceAttempt: 't47 attempt 1 runtime evidence, reused in attempt 2 under the same-tree rule',
  capturedAt: rt.capturedAt,
  tree: {
    srcAggregateSha1: '459c1da2fd33727c8f64b5ce3c7bdccbf197fb4b',
    srcFileCount: 83,
    newestSrcMtime: '2026-09-13T11:49:24.039Z',
    reusedBecause: 'attempt-2 re-read of the aggregate + 8 key files was byte-identical to sampling time'
  },
  keyFilesSha1: rt.fingerprintsBefore,
  filesUnchangedDuringRun: rt.filesUnchanged
}

// 1) size / expand / collapse / residue / hide-reopen
await emit('mini-c-size-collapse.json', {
  ...meta,
  group: 'size + expand/collapse + work-area containment + hide→reopen reset',
  assertions: {
    'open = 360x128': rt.assertions['open = 360x128'],
    'collapsed DOM has no search zone / chat pane': rt.assertions['collapsed DOM has no search zone / chat pane'],
    'expand = 360x540 (height only)': rt.assertions['expand = 360x540 (height only)'],
    'expanded DOM renders search box + chat pane': rt.assertions['expanded DOM renders search box + chat pane'],
    'expanded window stays inside the work area': rt.assertions['expanded window stays inside the work area'],
    'miniSetExpanded(true) returns the applied size': rt.assertions['miniSetExpanded(true) returns the applied size'],
    'collapse returns to 360x128': rt.assertions['collapse returns to 360x128'],
    'collapsed again: DOM restored (no residue)': rt.assertions['collapsed again: DOM restored (no residue)'],
    'hide→reopen comes back collapsed (360x128)': rt.assertions['hide→reopen comes back collapsed (360x128)'],
    'reopen state reset from expanded': rt.assertions['reopen state reset from expanded']
  },
  geometry: rt.steps.geometry,
  hideReopen: rt.steps.hideReopenReset
})

// 2) search -> MAIN window playback, and play-control commands
await emit('mini-c-search-play.json', {
  ...meta,
  group: 'search in mini → playback in the MAIN window; play-control commands',
  assertions: {
    'mini search shows result rows': rt.assertions['mini search shows result rows'],
    'clicking a mini result plays it in the MAIN window': rt.assertions['clicking a mini result plays it in the MAIN window'],
    'queue comes from the result list': rt.assertions['queue comes from the result list'],
    'mini "暂停" paused the MAIN player': rt.assertions['mini "暂停" paused the MAIN player'],
    'mini "下一曲" advanced the MAIN player': rt.assertions['mini "下一曲" advanced the MAIN player'],
    'mini "音量 50%" set MAIN volume to 0.5': rt.assertions['mini "音量 50%" set MAIN volume to 0.5'],
    'mini chips show feedback': rt.assertions['mini chips show feedback'],
    'play-control turns reached the gateway without 400': rt.assertions['play-control turns reached the gateway without 400']
  },
  note: {
    'queue comes from the result list':
      'PROBE DEFECT, not a product defect: playerStore.queue is string[] (ids, playerStore.ts:56); assertions that read t.title got null. Valid evidence kept: queueLen=4 = number of result rows, index=1 = clicked row, current.id = the clicked track.',
    'mini chips show feedback':
      'PROBE TIMING, not a product defect: state.chips is cleared at settle, while per-bubble chips persist — the mini really renders them (see mini-c-chat.json miniChips).'
  },
  search: rt.steps.searchThenMainPlays,
  playControl: rt.steps.miniPlayControl,
  chipsObservedInMiniDom: diag.miniChatDom?.chips ?? null
})

// 3) AI round trip (same session) + destructive confirm bar inside the mini
await emit('mini-c-chat.json', {
  ...meta,
  group: 'AI round trip (same session) + destructive confirmation bar inside the mini',
  assertions: {
    'mini received the user bubble': rt.assertions['mini received the user bubble'],
    'mini streamed the AI reply': rt.assertions['mini streamed the AI reply'],
    'MAIN window chat holds the same turn (same session)': rt.assertions['MAIN window chat holds the same turn (same session)'],
    'gateway saw the turn with no 400': rt.assertions['gateway saw the turn with no 400'],
    'destructive call parks for confirmation (not executed)': rt.assertions['destructive call parks for confirmation (not executed)'],
    'confirmation bar is rendered INSIDE the mini window': rt.assertions['confirmation bar is rendered INSIDE the mini window'],
    'mini 「取消」 leaves the MAIN playlist untouched': rt.assertions['mini 「取消」 leaves the MAIN playlist untouched'],
    'mini 「确认执行」 really mutates the MAIN playlist': rt.assertions['mini 「确认执行」 really mutates the MAIN playlist'],
    'destructive turn completed without gateway 400': rt.assertions['destructive turn completed without gateway 400']
  },
  aiRoundTrip: rt.steps.aiRoundTrip,
  destructiveConfirmInMini: rt.steps.destructiveConfirmInMini,
  miniChips: diag.miniChatDom?.chips ?? null
})

// 4) tray scenario: what works and the ONE defect
await emit('mini-c-tray.json', {
  ...meta,
  group: 'main window hidden in tray — search/play ✔, control ✔, text-only AI turn ✘',
  assertions: {
    'main window really went to tray/hidden': rt.assertions['main window really went to tray/hidden'],
    'mini search→play works with the main window hidden': rt.assertions['mini search→play works with the main window hidden'],
    'mini control command works with the main window hidden': rt.assertions['mini control command works with the main window hidden'],
    'mini AI round trip works with the main window hidden': rt.assertions['mini AI round trip works with the main window hidden']
  },
  defect: {
    id: 'T47-F1',
    severity: 'high',
    summary:
      "with the main window hidden, a TEXT-ONLY turn started from the mini lands as '（无回复）' in both windows (4 reproductions); the gateway answered each time (errors400=[]) but the store's streamRaw stayed length 0",
    attribution: {
      'mini + hidden + text-only': 'FAIL x4 (trayScenario joke + t47-diag 3 turns)',
      'mini + hidden + tool turn': 'PASS (好的，已完成。)',
      'main + hidden + text-only': 'PASS (t47-diag2)',
      'mini + visible + text-only': 'PASS (aiRoundTrip)'
    },
    codePointers: [
      'src/renderer/src/stores/chatStore.ts:295 (content || （无回复）)',
      'src/renderer/src/stores/chatStore.ts:353-376 (setInterval typewriter; :376 clears streamRaw)',
      'src/renderer/src/stores/chatStore.ts:550 (resume.accumulated = getState().streamRaw)',
      'src/renderer/src/lib/mainWindowBridge.ts (mini chat:proxy:cmd → setDraft + send, 120ms throttle)'
    ],
    mechanism: 'UNPROVEN — hypothesis only: ordering between the :376 clear and the :550 read under hidden-window timer throttling',
    impact: "'（无回复）' is persisted into messages, visible in both windows; the AI text path is effectively unusable while hidden"
  },
  trayScenario: rt.steps.trayScenario,
  hiddenTextOnlyReproductions: diag.steps ? diag : diag,
  mainWindowControl: diag2
})

// 5) discriminative experiments (text)
const discTxt = [
  't47 — discriminative experiments (copies + independent vitest configs; src/** untouched)',
  `tree: ${meta.tree.srcAggregateSha1} (83 files)`,
  '',
  JSON.stringify(discrim, null, 2),
  '',
  'src files after the experiments (must be unchanged):',
  `  src/main/miniBounds.ts                  = ${discrim.srcKeyFiles?.miniBounds}`,
  `  src/renderer/src/lib/chatProxy.ts       = ${discrim.srcKeyFiles?.chatProxy}`,
  '',
  'Verbose case names collected from the copy run (miniBounds, 8 passed):',
  '  computeMiniBounds — sizes > expanding and collapsing return the two declared sizes',
  '  computeMiniBounds — sizes > keeps the width constant at 360 in both states and at every position',
  '  computeMiniBounds — clamping > a bottom-anchored window grows upwards to stay inside the work area',
  '  computeMiniBounds — clamping > a window hanging off the right edge is pulled back inside',
  '  computeMiniBounds — clamping > clips the height when the work area is shorter than the expanded window',
  '  computeMiniBounds — clamping > clips the width too when the work area is narrower than the window',
  '  computeMiniBounds — no-op cases > leaves x/y untouched when the window already fits',
  '  computeMiniBounds — no-op cases > respects a work area that does not start at the origin (secondary display)'
].join('\n')
await writeFile(`${dir}/mini-c-discrim.txt`, discTxt, 'utf8')
console.log(`wrote ${dir}/mini-c-discrim.txt`)

// 6) gate + summary of the whole group set
await emit('mini-c-gate-and-summary.json', {
  ...meta,
  group: 'quality gate (per-item values) + group roll-up',
  gate_attempt1: { label: 't47', stamp: '2026-09-13T11:51:29.584Z' },
  gate_attempt2_rerun: {
    label: 't47-a2',
    stamp: '2026-09-13T12:14:22.799Z',
    lint_exitCode: 0,
    totalErrors: 0,
    totalWarnings: 1,
    filesWithErrors: [],
    typecheck_node: 0,
    typecheck_web: 0,
    tests_exitCode: 0,
    passed: 165,
    failed: 0,
    files: 16,
    baseline: '141 passed / 14 files before t45+t46; +8 (miniBounds) +16 (chatProxy) = 165 / 16'
  },
  rollUp: {
    passed: Object.values(rt.assertions).filter(Boolean).length - 2, // minus the two probe-defect assertions reclassified in mini-c-search-play.json
    failedReal: 1,
    probeDefects: 2,
    discriminated: 2,
    note: 'raw runner tally was 28/31; after reclassifying 2 probe defects (queue title-vs-id, chips sampling moment) 10 of 11 contract criteria pass and exactly 1 product defect (T47-F1) remains'
  },
  finalState: {
    instances: ['npm PID 15308 (closed)', 'npm PID 30844 (closed)'],
    electron: 0,
    node: 0,
    portsFree: [5173, 5174, 9222, 9223, 9997],
    srcTouched: false,
    settingsJsonRestored: 'C92586A029B6C85356B9840D3B284A9544626CD2'
  }
})

/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS probe (not shipped TS source); the rule targets typed TS modules.
 * If eslint.config.mjs later scopes this rule away from scripts/**, this
 * directive becomes redundant and can be deleted. */
/**
 * t25 / F3 — 越权路径被拒 + 频谱未被打哑（元素加载侧，不用 fetch(media://)）。
 *
 * `fetch(media://…)` is blocked by the page CSP (`connect-src 'self'`) and is NOT a
 * product signal, so this probe only uses element loading:
 *   - an <audio> pointed at an in-roots file must PLAY (readyState>0, no error)
 *   - an <audio> pointed at an out-of-roots path must FAIL to load (no bytes served)
 *   - an <audio> pointed at a disallowed extension inside the roots must FAIL too
 * plus the positive spectrum check on the app's own engine (mode=graph, peak>0).
 *
 * Usage: node scripts/verify-f3-paths.mjs   (dev instance required)
 */
import { mkdir, writeFile } from 'fs/promises'
import { cdp, mainTarget, targets, sleepMs } from './verify-lib.mjs'

const outDir = '.devdata/t13-r2-evidence'
await mkdir(outDir, { recursive: true })

const list = await targets()
const page = await cdp(mainTarget(list))

// poll the dev hook (an un-booted renderer makes awaitPromise evaluations hang)
for (let i = 0; i < 30; i++) {
  const ready = await page.ev(`typeof window.__nebula === 'object'`)
  if (ready) break
  await sleepMs(1000)
}

const B64 = (s) => Buffer.from(s, 'utf-8').toString('base64url')

const out = await page.json(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const mkUrl = (p) => 'media://local/' + Buffer.from(p, 'utf-8').toString('base64url')
  const probeAudio = (url, ms = 2500) => new Promise((resolve) => {
    const el = new Audio()
    let settled = false
    const done = (how) => {
      if (settled) return
      settled = true
      resolve({
        how,
        readyState: el.readyState,
        errorCode: el.error ? el.error.code : null,
        errorMsg: el.error ? el.error.message : null,
        duration: Number.isFinite(el.duration) ? Math.round(el.duration * 100) / 100 : null,
        canPlay: el.readyState > 0 && !el.error
      })
    }
    el.oncanplay = () => done('canplay')
    el.onerror = () => done('error')
    el.src = url
    setTimeout(() => done('timeout'), ms)
  })

  const lib = await window.api.libraryGet()
  const good = lib.tracks.find((t) => t.path.endsWith('.mp3')) || lib.tracks[0]
  const root = good.path.slice(0, good.path.lastIndexOf('\\\\'))
  const outOfRoots = 'C:\\\\Windows\\\\System32\\\\drivers\\\\etc\\\\hosts'
  const badExt = root + '\\\\..\\\\README.md'

  const res = {}
  res.goodTrack = { path: good.path.slice(-28), title: good.title }
  res.inRoots = await probeAudio(mkUrl(good.path))
  res.outOfRoots = await probeAudio(mkUrl(outOfRoots))
  res.badExtension = await probeAudio(mkUrl(badExt))

  // spectrum still alive on the app's own engine
  const p = window.__nebula.player
  await p.getState().playTracks([good], 0)
  await sleep(4000)
  const d = window.__nebula.engine.diagnose()
  res.engine = { mode: d.mode, peak: d.signalPeak, playing: p.getState().isPlaying, fallbackTried: d.fallbackTried, phase: d.setSinkIdPhase }
  return JSON.stringify(res)
})()`)

out.allPass =
  out.inRoots.canPlay === true &&
  out.outOfRoots.canPlay === false &&
  out.badExtension.canPlay === false &&
  out.engine.mode === 'graph' &&
  out.engine.peak > 0

await writeFile(`${outDir}/f3-paths.json`, JSON.stringify(out, null, 2), 'utf8')
console.log(JSON.stringify(out, null, 2))
page.close()
setTimeout(() => process.exit(out.allPass ? 0 : 1), 300)

/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS probe (not shipped TS source); the rule targets typed TS modules. */
/**
 * t25 / F3 反面 — 越权路径被拒（**元素加载侧，轻量**：不播放、不建图谱、不用 fetch(media://)）。
 *
 * `fetch(media://…)` is blocked by the page CSP (`connect-src 'self'`) and is NOT a
 * product signal, so every case below loads the media:// URL through an element
 * (`new Audio()` / `new Image()`) and only looks at `readyState`/`complete`/`onerror`.
 *
 * Case isolation (the point of this probe): cases B and C point at the *same real,
 * servable mp3*; C reaches it through a `..` traversal from a scanned folder. So a
 * rejection in C cannot be blamed on the extension whitelist — only on the
 * roots/containment check. Cases D/E add the two files the captain asked for
 * (`settings.json`, a real png outside the roots) and F is the in-roots control.
 *
 * Usage: node scripts/verify-f3-rejections-lite.mjs   (dev instance required)
 */
import { mkdir, writeFile } from 'fs/promises'
import { cdp, mainTarget, targets, sleepMs } from './verify-lib.mjs'

const outDir = '.devdata/t13-r2-evidence'
await mkdir(outDir, { recursive: true })
const PROJ = process.cwd()

const list = await targets()
const page = await cdp(mainTarget(list))
for (let i = 0; i < 30; i++) {
  if (await page.ev(`typeof window.__nebula === 'object'`)) break
  await sleepMs(1000)
}

const paths = {
  inRootsAudio: `${PROJ}\\.devdata\\test-music\\song-a.mp3`,
  outOfRootsAudio: `${PROJ}\\.devdata\\t13-r2-evidence\\lure.mp3`,
  traversal: `${PROJ}\\.devdata\\test-music\\..\\..\\t13-r2-evidence\\lure.mp3`,
  settingsJson: `${PROJ}\\.devdata\\user\\settings.json`,
  outsidePng: `${PROJ}\\resources\\icon.png`,
  inRootsPng: `${PROJ}\\.devdata\\user\\covers\\f1da4b02ccf77fda8461.png`
}

const res = await page.json(`(async () => {
  const P = ${JSON.stringify(paths)}
  const b64 = (s) => {
    const bytes = new TextEncoder().encode(s)
    let bin = ''
    for (const b of bytes) bin += String.fromCharCode(b)
    return btoa(bin).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '')
  }
  const url = (p) => 'media://local/' + b64(p)

  const probeAudio = (p, ms = 2000) => new Promise((resolve) => {
    const el = new Audio()
    let settled = false
    const done = (how) => {
      if (settled) return
      settled = true
      resolve({ how, readyState: el.readyState, errorCode: el.error ? el.error.code : null,
                duration: Number.isFinite(el.duration) ? Math.round(el.duration * 100) / 100 : null,
                loaded: el.readyState > 0 && !el.error })
    }
    el.onloadeddata = () => done('loadeddata')
    el.oncanplay = () => done('canplay')
    el.onerror = () => done('error')
    el.src = url(p)
    setTimeout(() => done('timeout'), ms)
  })

  const probeImage = (p, ms = 2000) => new Promise((resolve) => {
    const img = new Image()
    let settled = false
    const done = (how) => {
      if (settled) return
      settled = true
      resolve({ how, complete: img.complete, naturalWidth: img.naturalWidth,
                loaded: img.complete === true && img.naturalWidth > 0 })
    }
    img.onload = () => done('load')
    img.onerror = () => done('error')
    img.src = url(p)
    setTimeout(() => done('timeout'), ms)
  })

  const out = { paths: P, resolvedByBrowser: {} }
  for (const k of Object.keys(P)) out.resolvedByBrowser[k] = new URL(url(P[k])).href.slice(0, 34) + '…'

  out.inRootsAudio = await probeAudio(P.inRootsAudio)
  out.outOfRootsAudio = await probeAudio(P.outOfRootsAudio)
  out.traversalAudio = await probeAudio(P.traversal)
  out.settingsJson = await probeAudio(P.settingsJson)
  out.outsidePng = await probeImage(P.outsidePng)
  out.inRootsPng = await probeImage(P.inRootsPng)
  return JSON.stringify(out)
})()`)

res.assertions = {
  'in-roots audio loads (positive control)': res.inRootsAudio.loaded === true,
  'real mp3 outside roots rejected (ext is servable)': res.outOfRootsAudio.loaded === false,
  'same real mp3 via `..` traversal rejected (no whitelist excuse)': res.traversalAudio.loaded === false,
  'userData/settings.json rejected': res.settingsJson.loaded === false,
  'real png outside roots rejected': res.outsidePng.loaded === false,
  'in-roots cover png loads (image positive control)': res.inRootsPng.loaded === true
}
res.allPass = Object.values(res.assertions).every(Boolean)

// liveness三查 (CDP side): the probe's own exit code is NOT a judgement input
try {
  const v = await (await fetch('http://127.0.0.1:9222/json/version')).json()
  const tg = await targets()
  res.liveness = { cdpUp: true, browser: v.Browser, mainTargets: tg.filter((t) => /localhost:5173\/$/.test(t.url)).length }
} catch (e) {
  res.liveness = { cdpUp: false, error: String(e.message) }
}
res.capturedAt = new Date().toISOString()

await writeFile(`${outDir}/t25-f3-rejections.json`, JSON.stringify(res, null, 2), 'utf8')
console.log(JSON.stringify(res, null, 2))
page.close()
setTimeout(() => process.exit(res.allPass ? 0 : 1), 200)

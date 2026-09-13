/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS probe (not shipped TS source); the rule targets typed TS modules.
 * If eslint.config.mjs later scopes this rule away from scripts/**, this
 * directive becomes redundant and can be deleted. */
/**
 * t6 — one-shot state dump of the main window + mini window.
 * Used to explain why a probe could not reach the lyrics panel (the panel needs a
 * `current` track; a player error or a closed mini window changes what is testable).
 *
 * Usage: node scripts/verify-state-dump.mjs
 */
import { targets, cdp, mainTarget, miniTarget } from './verify-lib.mjs'

const list = await targets()
console.log('targets:', list.map((t) => `${t.type} ${t.url}`).join(' | '))

let mainInfo = null
try {
  const page = await cdp(mainTarget(list))
  mainInfo = await page.json(`(async () => JSON.stringify({
    hook: !!window.__nebula,
    rows: document.querySelectorAll('.tl-row').length,
    tabs: document.querySelectorAll('.detail-tab').length,
    tracks: window.__nebula ? window.__nebula.library.getState().tracks.length : -1,
    current: window.__nebula && window.__nebula.player.getState().current ? window.__nebula.player.getState().current.title : null,
    playing: window.__nebula ? window.__nebula.player.getState().isPlaying : null,
    error: window.__nebula ? window.__nebula.player.getState().error : null,
    lyricsWrap: !!document.querySelector('.lyrics-wrap'),
    lyricLines: document.querySelectorAll('.lyric-line').length,
    placeholder: !!document.querySelector('.detail .empty-title'),
    detailText: document.querySelector('.detail') ? document.querySelector('.detail').innerText.slice(0, 140) : null,
    audioSrc: (() => { const a = document.querySelector('audio'); return a ? (a.currentSrc || '').slice(0, 40) : null })(),
    audioErr: (() => { const a = document.querySelector('audio'); return a && a.error ? { code: a.error.code, msg: a.error.message } : null })()
  }))()`)
  page.close()
} catch (e) {
  mainInfo = { error: String(e.message) }
}

let miniInfo = null
try {
  const mini = await cdp(miniTarget(list))
  miniInfo = await mini.json(`JSON.stringify({
    title: document.querySelector('.mini-title') ? document.querySelector('.mini-title').innerText : null,
    active: document.querySelector('.mini-lyric-line.active') ? document.querySelector('.mini-lyric-line.active').innerText : null,
    lines: document.querySelectorAll('.mini-lyric-line').length
  })`)
  mini.close()
} catch (e) {
  miniInfo = { error: String(e.message) }
}

console.log(JSON.stringify({ main: mainInfo, mini: miniInfo }, null, 2))
process.exit(0)

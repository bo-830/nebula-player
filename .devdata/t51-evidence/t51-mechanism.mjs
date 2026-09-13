/**
 * t51 — independent test of t50's mechanism claim.
 *
 * Claim under test: "when the main window is hidden, queued `chat:chunk` events are
 * delivered AFTER the `chatComplete` invoke resolves, so a reader that samples the
 * store at resolve time sees ''."
 *
 * Method (no src changes): monkey-patch `window.api.chatComplete` in the renderer to
 * timestamp its resolution, and subscribe to the chat store to timestamp every
 * `streamRaw` mirror. If a mirror lands AFTER the resolve, the claim is reproduced;
 * if all mirrors land before it, it is not.
 *
 * Usage: node .devdata/t51-evidence/t51-mechanism.mjs
 */
import { writeFile } from 'node:fs/promises'
import { cdp, mainTarget, miniTarget, targets, sleepMs } from '../../scripts/verify-lib.mjs'

const OUT = '.devdata/t51-evidence'
const page = await cdp(mainTarget(await targets()))
const ev = (e) => page.ev(e)
const js = (e) => page.json(e)
const miniEv = async (e) => {
  const m = await cdp(miniTarget(await targets()))
  try {
    return await m.ev(e)
  } finally {
    m.close()
  }
}
const miniJson = async (e) => {
  const m = await cdp(miniTarget(await targets()))
  try {
    return await m.json(e)
  } finally {
    m.close()
  }
}

const runOne = async (label, { hidden }) => {
  // fresh instrumentation
  await ev(`(() => {
    if (!window.__t51m) {
      window.__t51m = { versions: 0 }
      const orig = window.api.chatComplete
      window.api.chatComplete = async function (payload) {
        const t0 = performance.now()
        const res = await orig.call(window.api, payload)
        window.__t51m.lastResolve = { t: performance.now(), t0, text: String((res && res.text) || '').slice(0, 60) }
        return res
      }
      window.__t51m.patched = true
    }
    window.__t51m.lastResolve = null
    window.__t51m.events = []
    if (window.__t51m.unsub) try { window.__t51m.unsub() } catch (e) {}
    window.__t51m.unsub = window.__nebula.chat.subscribe((s) => {
      const e = { t: Math.round(performance.now() * 10) / 10, busy: s.busy, rawLen: (s.streamRaw || '').length, msgs: s.messages.length }
      const a = window.__t51m.events
      const p = a[a.length - 1]
      if (!p || p.rawLen !== e.rawLen || p.busy !== e.busy || p.msgs !== e.msgs) a.push(e)
      if (a.length > 300) a.shift()
    })
    return 1
  })()`)

  await fetch('http://127.0.0.1:9997/__reset', { method: 'POST' })
  await ev(`(() => { window.__nebula.chat.getState().clear(); return 1 })()`)
  await sleepMs(600)
  await ev(`(() => { window.__t51m.events = []; return 1 })()`)

  // expand the mini so its textarea exists, then send from the mini (the proxied path)
  await miniEv(`(() => {
    const b = document.querySelector('button[aria-expanded]')
    if (b && b.getAttribute('aria-expanded') !== 'true') b.click()
    return 1
  })()`)
  await sleepMs(1400)
  const typed = await miniEv(`(() => {
    const el = document.querySelector('.mini-chat-input textarea')
    if (!el) return 'missing'
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, ${JSON.stringify(label)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return 'ok'
  })()`)
  await sleepMs(250)
  const sent = await miniEv(`(() => {
    const el = document.querySelector('.mini-chat-input textarea')
    if (!el) return 'missing'
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
    return 'ok'
  })()`)
  await sleepMs(7000)

  const probe = await js(`JSON.stringify({
    visibility: document.visibilityState,
    patched: !!window.__t51m.patched,
    resolve: window.__t51m.lastResolve,
    events: window.__t51m.events,
    finalContent: (() => {
      const c = window.__nebula.chat.getState()
      const last = [...c.messages].reverse().find((m) => m.role === 'assistant')
      return last ? String(last.content) : null
    })(),
    streamRawLen: (window.__nebula.chat.getState().streamRaw || '').length
  })`)

  const resolveT = probe.resolve ? probe.resolve.t : null
  const mirrors = probe.events.filter((e) => e.rawLen > 0)
  const mirrorsAfterResolve = resolveT === null ? [] : mirrors.filter((e) => e.t > resolveT)
  const mirrorsBeforeResolve = resolveT === null ? [] : mirrors.filter((e) => e.t <= resolveT)
  return {
    label,
    hidden,
    typed,
    sent,
    visibility: probe.visibility,
    resolveTextFromInvoke: probe.resolve ? probe.resolve.text : null,
    resolveAtMs: resolveT,
    mirroredChunks: mirrors,
    mirrorsBeforeResolve,
    mirrorsAfterResolve,
    finalContent: probe.finalContent,
    streamRawLenAtRead: probe.streamRawLen,
    events: probe.events,
    claimReproduced_chunkAfterResolve: mirrorsAfterResolve.length > 0,
    pass: !!probe.finalContent && !String(probe.finalContent).includes('（无回复）')
  }
}

const out = { capturedAt: new Date().toISOString(), note: 'hidden main window (left hidden by the main runtime probe)' }
out.turns = []
for (let i = 1; i <= 2; i++) {
  const r = await runOne(`机制第${i}次：一句话回答`, { hidden: true })
  out.turns.push(r)
  console.log(`turn ${i}: visibility=${r.visibility} resolveText="${r.resolveTextFromInvoke}" mirrorsBefore=${r.mirrorsBeforeResolve.length} mirrorsAfter=${r.mirrorsAfterResolve.length} content="${r.finalContent}"`)
}
out.summary = {
  turns: out.turns.length,
  allGetRealText: out.turns.every((t) => t.pass),
  anyChunkAfterResolve: out.turns.some((t) => t.claimReproduced_chunkAfterResolve),
  anyChunkBeforeResolve: out.turns.some((t) => t.mirrorsBeforeResolve.length > 0),
  invokeResolveTextNonEmpty: out.turns.map((t) => t.resolveTextFromInvoke)
}
await writeFile(`${OUT}/mini-g-mechanism.json`, JSON.stringify(out, null, 2), 'utf8')
console.log(JSON.stringify(out.summary, null, 2))
setTimeout(() => process.exit(0), 200)

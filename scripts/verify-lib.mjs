/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS E2E probe (not shipped TS source); the rule targets typed TS modules.
 * If eslint.config.mjs later scopes this rule away from scripts/**, this
 * directive becomes redundant and can be deleted. */
/**
 * Shared CDP helper for the t6 verification probes.
 *
 * The dev app exposes `window.__nebula` (player/library/playlists/chat/ui/engine)
 * only when `npm run dev` runs with the remote-debugging port (9222).
 *
 * Usage:
 *   import { cdp, mainTarget, miniTarget } from './verify-lib.mjs'
 *   const page = await cdp(mainTarget())
 *   const out = await page.ev(`JSON.stringify({ playing: window.__nebula.player.getState().isPlaying })`)
 */

export const PORT = Number(process.env.CDP_PORT ?? 9222)

export async function targets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json`)
  if (!res.ok) throw new Error(`CDP /json HTTP ${res.status}`)
  return res.json()
}

export function mainTarget(list) {
  const t = list.find(
    (x) => x.type === 'page' && x.url.includes('localhost:5173') && !x.url.includes('#mini')
  )
  if (!t) throw new Error('dev page not found: ' + JSON.stringify(list.map((x) => x.url)))
  return t
}

export function miniTarget(list) {
  const t = list.find((x) => x.type === 'page' && x.url.includes('#mini'))
  if (!t) throw new Error('mini window not found: ' + JSON.stringify(list.map((x) => x.url)))
  return t
}

/** connect to one CDP target and expose ev/raw/close */
export async function cdp(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })
  let id = 0
  const pending = new Map()
  ws.onmessage = (evMsg) => {
    const m = JSON.parse(evMsg.data)
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m)
      pending.delete(m.id)
    }
  }
  const raw = (method, params = {}) =>
    new Promise((resolve) => {
      const i = ++id
      pending.set(i, resolve)
      ws.send(JSON.stringify({ id: i, method, params }))
    })
  return {
    raw,
    /** evaluate an expression; returns the value, throws on page exception */
    async ev(expr) {
      const r = await raw('Runtime.evaluate', {
        expression: expr,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true
      })
      if (r?.result?.exceptionDetails) {
        throw new Error('page exception: ' + JSON.stringify(r.result.exceptionDetails))
      }
      if (r?.exceptionDetails) {
        throw new Error('page exception: ' + JSON.stringify(r.exceptionDetails))
      }
      return r?.result?.result?.value
    },
    /** evaluate an expression that returns JSON text and parse it (always returns an object) */
    async json(expr) {
      const v = await this.ev(expr)
      if (typeof v === 'string') return JSON.parse(v)
      if (v && typeof v === 'object') return v
      throw new Error('json(): page returned ' + JSON.stringify(v))
    },
    /** evaluate an expression that returns JSON text, keeping the raw string */
    async jsonText(expr) {
      const v = await this.ev(expr)
      return typeof v === 'string' ? v : JSON.stringify(v)
    },
    close() {
      try {
        ws.close()
      } catch {
        /* ignore */
      }
    }
  }
}

export const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms))

/** run a node-side step list and print each result; throws on the first failure */
export async function expect(label, actual, expected = undefined) {
  const ok = expected === undefined ? Boolean(actual) : actual === expected
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label}${expected === undefined ? '' : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`
  )
  if (!ok) process.exitCode = 1
  return ok
}

/** JSON.stringify a value for embedding into a Runtime.evaluate expression */
export const J = (v) => JSON.stringify(v)

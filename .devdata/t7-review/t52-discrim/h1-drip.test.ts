/**
 * t52 / H1 — does the POSITIVE effect (catch-up ⇒ drop) really lose text?
 *
 * This case removes the confounder that made the verifier's 300 ms runtime probe inconclusive:
 * here the typewriter interval ticks at its true 22 ms cadence (no background throttling exists in
 * vitest/node), and the two deltas of ONE round are separated by a real gap (≈100 ms / ≈2000 ms)
 * while the round stays open until after the second delta.
 *
 * Expected if H1 holds: the reveal cursor catches up after the first delta (tick 1 reveals 4 of 4
 * chars, tick 2 sees shown >= raw and calls closeStream(), which clears streamConvId), so the second
 * delta is rejected by the guard — from the closure buffer AND the store mirror alike. Both the
 * pre-fix arm and the fixed arm truncate: t50 never touched the guard (:375) or the typewriter
 * (:379-393). The two control arms isolate the two halves of that mechanism.
 *
 * Every arm is a full copy of `src/**` under .devdata/t7-review/t52-discrim/ — no repository source
 * is executed or modified.
 */
import { describe, expect, it } from 'vitest'

const SEG1 = 'AAAA'
const SEG2 = 'BBBB'

type Arm = {
  label: string
  expect: 'truncated' | 'full'
  load: () => Promise<{ useChatStore: { getState: () => any; setState: (p: any) => void; subscribe: (cb: (s: any) => void) => () => void } }>
}

const ARMS: Record<string, Arm> = {
  pre: {
    label: 'pre  (shipped 1.0.4 semantics)',
    expect: 'truncated',
    load: () => import('./pre/src/renderer/src/stores/chatStore')
  },
  cur: {
    label: 'cur  (t50 fix)',
    expect: 'truncated',
    load: () => import('./cur/src/renderer/src/stores/chatStore')
  },
  noclose: {
    label: 'cur + catch-up no longer tears the stream down',
    expect: 'full',
    load: () => import('./noclose/src/renderer/src/stores/chatStore')
  },
  noguard: {
    label: 'cur + guard no longer keyed on streamConvId',
    expect: 'full',
    load: () => import('./noguard/src/renderer/src/stores/chatStore')
  }
}

interface Delivery {
  seg1At: number | null
  seg2At: number | null
  resolvedAt: number | null
}

/** one round, two deltas separated by a real gap; the round resolves only after the second delta */
function installDripWindow(gapMs: number): Delivery {
  const handlers: Array<(p: { id: string; delta: string }) => void> = []
  const delivery: Delivery = { seg1At: null, seg2At: null, resolvedAt: null }
  ;(globalThis as unknown as { window: unknown }).window = {
    api: {
      chatLoad: async () => ({ messages: [] }),
      chatSave: async () => true,
      chatAbort: () => {},
      onChatChunk: (cb: (p: { id: string; delta: string }) => void) => {
        handlers.push(cb)
        return () => {
          const i = handlers.indexOf(cb)
          if (i >= 0) handlers.splice(i, 1)
        }
      },
      chatComplete: (payload: { id: string }) =>
        new Promise((resolve) => {
          const send = (delta: string): void => {
            for (const h of handlers.slice()) h({ id: payload.id, delta })
          }
          send(SEG1)
          delivery.seg1At = performance.now()
          setTimeout(() => {
            send(SEG2)
            delivery.seg2At = performance.now()
          }, gapMs)
          setTimeout(() => {
            delivery.resolvedAt = performance.now()
            resolve({ id: payload.id, finishReason: 'stop', toolCalls: [] })
          }, gapMs + 60)
        })
    }
  }
  return delivery
}

async function runCell(armKey: string, gapMs: number): Promise<Record<string, unknown>> {
  const delivery = installDripWindow(gapMs)
  const { useChatStore } = await ARMS[armKey].load()
  useChatStore.setState({
    messages: [],
    bubbles: [],
    busy: false,
    pendingConfirm: null,
    draft: '',
    streamRaw: '',
    streamShown: 0,
    chips: []
  })

  const events: Array<{ t: number; rawLen: number; shown: number; busy: boolean; msgs: number }> = []
  const t0 = performance.now()
  const unsub = useChatStore.subscribe((s: any) => {
    const e = {
      t: Math.round((performance.now() - t0) * 10) / 10,
      rawLen: String(s.streamRaw ?? '').length,
      shown: Number(s.streamShown ?? 0),
      busy: s.busy === true,
      msgs: Array.isArray(s.messages) ? s.messages.length : 0
    }
    const p = events[events.length - 1]
    if (!p || p.rawLen !== e.rawLen || p.shown !== e.shown || p.busy !== e.busy || p.msgs !== e.msgs) events.push(e)
  })

  useChatStore.getState().setDraft('hi')
  await useChatStore.getState().send()
  await new Promise((r) => setTimeout(r, 150))
  unsub()

  const content = String(useChatStore.getState().messages.at(-1)?.content ?? '')
  const row = {
    arm: armKey,
    gapMs,
    content,
    truncated: content === SEG1,
    maxRawLenSeen: events.reduce((m, e) => Math.max(m, e.rawLen), 0),
    seg1At: delivery.seg1At === null ? null : Math.round((delivery.seg1At - t0) * 10) / 10,
    seg2At: delivery.seg2At === null ? null : Math.round((delivery.seg2At - t0) * 10) / 10,
    resolvedAt: delivery.resolvedAt === null ? null : Math.round((delivery.resolvedAt - t0) * 10) / 10,
    trace: events
  }
  console.log('T52-H1-ROW ' + JSON.stringify(row))
  return row
}

describe('t52 / H1 — catch-up (追尾) truncation, no-throttle fixture', () => {
  for (const gap of [100, 2000]) {
    for (const arm of ['pre', 'cur', 'noclose', 'noguard'] as const) {
      const spec = ARMS[arm]
      const what = spec.expect === 'truncated' ? `truncates to ${SEG1}` : `keeps ${SEG1}${SEG2}`
      it(`${arm} / gap ${gap}ms ⇒ ${what}`, async () => {
        const r = await runCell(arm, gap)
        if (spec.expect === 'truncated') {
          expect(r.content).toBe(SEG1)
          expect(r.maxRawLenSeen).toBeLessThanOrEqual(SEG1.length) // the late delta never reached the mirror
        } else {
          expect(r.content).toBe(`${SEG1}${SEG2}`)
          expect(r.maxRawLenSeen).toBeGreaterThanOrEqual(`${SEG1}${SEG2}`.length)
        }
      }, 20000)
    }
  }
})

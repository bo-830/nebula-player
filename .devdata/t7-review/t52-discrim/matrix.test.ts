/**
 * t52 reviewer discriminator — the "late chat:chunk delivery" matrix.
 *
 * Question this answers (captain's item 1): t50's root cause requires that, BEFORE the fix,
 * a `chat:chunk` delta is delivered AFTER the `chat:complete` invoke reply resolves.
 * t50/t51 could not observe that ordering on the fixed tree. Here it is reproduced on a
 * COPY of the pre-fix code, so the missing step is closed at the discriminating level:
 *
 *   fixture `emitAfterResolve: true` == the delta is delivered in a macrotask after the round
 *   promise resolves (the ordering the hidden/tray case shows), instrumented with timestamps.
 *
 * Matrix: 3 variants x 2 delivery orders
 *   pre  (shipped 1.0.4 semantics) : no drain + read the shared mirror
 *   half (drain, mirror read)      : isolates which half of the fix is load-bearing
 *   cur  (t50 fix)                 : drain + read the stream's own buffer
 *
 * Every variant is a full copy of `src/**` under `.devdata/t7-review/t52-discrim/`;
 * no repository source is executed or modified. Run through
 * `npx vitest run --config .devdata/t7-review/t52-discrim/vitest.config.ts`.
 */
import { describe, expect, it } from 'vitest'

interface Chunk {
  id: string
  delta: string
}

type Loader = () => Promise<{ useChatStore: { getState: () => any; setState: (p: any) => void } }>

const ARMS: Record<string, { label: string; load: Loader }> = {
  pre: {
    label: 'pre  (no drain, read mirror)',
    load: () => import('./pre/src/renderer/src/stores/chatStore')
  },
  half: {
    label: 'half (drain, read mirror)',
    load: () => import('./half/src/renderer/src/stores/chatStore')
  },
  cur: {
    label: 'cur  (drain, read own buffer)',
    load: () => import('./cur/src/renderer/src/stores/chatStore')
  }
}

let timeline: { resolveTs: number | null; deliverTs: number | null } = { resolveTs: null, deliverTs: null }

/** the fake window shape the repo's own chatConfirm suite uses, plus timestamps */
function installFakeWindow(text: string, emitAfterResolve: boolean): void {
  const handlers: Array<(p: Chunk) => void> = []
  timeline = { resolveTs: null, deliverTs: null }
  ;(globalThis as unknown as { window: unknown }).window = {
    api: {
      chatLoad: async () => ({ messages: [] }),
      chatSave: async () => true,
      chatAbort: () => {},
      onChatChunk: (cb: (p: Chunk) => void) => {
        handlers.push(cb)
        return () => {
          const i = handlers.indexOf(cb)
          if (i >= 0) handlers.splice(i, 1)
        }
      },
      chatComplete: async (payload: { id: string }) => {
        const deliver = (): void => {
          timeline.deliverTs = performance.now()
          for (const h of handlers.slice()) h({ id: payload.id, delta: text })
        }
        if (emitAfterResolve) setTimeout(deliver, 0)
        else deliver()
        timeline.resolveTs = performance.now()
        return { id: payload.id, finishReason: 'stop', toolCalls: [] }
      }
    }
  }
}

const SENTINEL = '（无回复）'

async function runCell(armKey: string, emitAfterResolve: boolean): Promise<Record<string, unknown>> {
  const text = `ANSWER[${armKey}/${emitAfterResolve ? 'LATE' : 'SYNC'}]`
  installFakeWindow(text, emitAfterResolve)
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
  useChatStore.getState().setDraft('hi')
  await useChatStore.getState().send()

  const deliveredAtSettle = timeline.deliverTs !== null
  const answer = String(useChatStore.getState().messages.at(-1)?.content ?? '')
  await new Promise((r) => setTimeout(r, 60))
  const deliveredAfterSettle = timeline.deliverTs !== null
  const lagMs =
    timeline.deliverTs !== null && timeline.resolveTs !== null
      ? Math.round((timeline.deliverTs - timeline.resolveTs) * 1000) / 1000
      : null
  const row = {
    arm: armKey,
    delivery: emitAfterResolve ? 'late' : 'sync',
    answer,
    text,
    deliveredAtSettle,
    deliveredAfterSettle,
    lagMs,
    answerAfter60ms: String(useChatStore.getState().messages.at(-1)?.content ?? ''),
    mirrorAfter60ms: String(useChatStore.getState().streamRaw ?? '')
  }
  console.log('T52-ROW ' + JSON.stringify(row))
  return row
}

describe('t52 / T47-F1 — late-delivery matrix on copied trees', () => {
  it('pre-fix copy + LATE delta ⇒ 「（无回复）」 reproduced; the delta lands after settle and is dropped', async () => {
    const r = await runCell('pre', true)
    expect(r.deliveredAtSettle).toBe(false) // the delta had NOT arrived when the turn settled
    expect(r.answer).toBe(SENTINEL) // ⇒ the fallback was persisted
    expect(r.answerAfter60ms).toBe(SENTINEL) // ⇒ and never recovered
    expect(r.deliveredAfterSettle).toBe(true) // the delta did arrive… (lagMs below)
    expect(r.mirrorAfter60ms).toBe('') // …and was dropped by the guard (t47's recorded shape)
  })

  it('pre-fix copy + SYNC delta ⇒ the SAME pre-fix code keeps the answer (ordering is the discriminator)', async () => {
    const r = await runCell('pre', false)
    expect(r.deliveredAtSettle).toBe(true)
    expect(r.answer).toBe(r.text)
  })

  it('fixed tree + LATE delta ⇒ answer survives the exact ordering that broke the pre-fix code', async () => {
    const r = await runCell('cur', true)
    expect(typeof r.lagMs).toBe('number')
    expect(r.lagMs as number).toBeGreaterThan(0) // the delta DID arrive after the resolve …
    expect(r.answer).toBe(r.text) // … and the drain+buffer kept it
  })

  it('fixed tree + SYNC delta ⇒ unchanged easy case (no regression)', async () => {
    const r = await runCell('cur', false)
    expect(r.answer).toBe(r.text)
  })

  it('drain-only variant + LATE delta ⇒ records which half of the fix carries this case', async () => {
    const r = await runCell('half', true)
    expect(r.lagMs as number).toBeGreaterThan(0) // same late ordering as the other arms
    expect(r.answer).toBe(r.text) // measured, not assumed (see T52-ROW lines / report §12)
  })
})

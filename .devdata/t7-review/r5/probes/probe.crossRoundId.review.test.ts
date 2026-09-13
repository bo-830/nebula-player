import { afterEach, describe, expect, it, vi } from 'vitest'
import { chatComplete } from '../../../../src/main/llmClient'
import { useChatStore } from '../../../../src/renderer/src/stores/chatStore'
import { useLibraryStore } from '../../../../src/renderer/src/stores/libraryStore'
import type { ChatMessage, LLMMessage } from '../../../../src/shared/types'

/**
 * t7-r5 PROBE (no mutation — real src/main/llmClient.ts + real
 * src/renderer/src/stores/chatStore.ts; only `fetch` and `window.api` are stubbed,
 * the same way src/renderer/src/lib/__tests__/chatConfirm.test.ts stubs them).
 *
 * Question: R2 makes fallback ids process-unique, but does the round-3 defence
 * also cover a PROVIDER that repeats one of its own ids across two rounds?
 * `withUniqueToolIds(seen)` builds a fresh `seen` per response and
 * `dedupeToolCalls` runs per round, so nothing crosses the round boundary.
 * If the two layers miss it, `replaceToolMessage` (chatStore.ts:383-395)
 * overwrites round 1's tool reply with round 2's — exactly the F2/HTTP-400 shape.
 */
function sseResponse(lines: string[]): Response {
  const body = `${lines.join('\n')}\n\n`
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body))
      controller.close()
    }
  })
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function chunk(delta: unknown): string {
  return `data: ${JSON.stringify({ choices: [{ delta, finish_reason: null }] })}`
}

type Round = { id: string; name: string; args: string } | null

const CONFIG = { baseURL: 'http://127.0.0.1:9/v1', model: 'm', apiKey: 'k' }

let captured: LLMMessage[][] = []
let idsFromClient: string[] = []

/** drive the real chatStore with a real llmClient whose provider script is `rounds` */
function installWindow(rounds: Round[]): void {
  captured = []
  idsFromClient = []
  let i = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const r = rounds[Math.min(i, rounds.length - 1)]
      i += 1
      if (!r) return sseResponse([chunk({ content: '好的。' }), `data: [DONE]`])
      return sseResponse([
        chunk({ tool_calls: [{ id: r.id, function: { name: r.name, arguments: r.args } }] }),
        `data: [DONE]`
      ])
    })
  )
  const handlers: Array<(p: { id: string; delta: string }) => void> = []
  ;(globalThis as unknown as { window: unknown }).window = {
    api: {
      chatLoad: async () => ({ messages: [] as ChatMessage[] }),
      chatSave: async () => true,
      chatAbort: () => {},
      onChatChunk: (cb: (p: { id: string; delta: string }) => void) => {
        handlers.push(cb)
        return () => {
          const k = handlers.indexOf(cb)
          if (k >= 0) handlers.splice(k, 1)
        }
      },
      // the REAL llmClient builds the tool calls; only IPC is faked
      chatComplete: async (payload: { id: string; messages: LLMMessage[]; tools: unknown[] }) => {
        captured.push(payload.messages.map((m) => ({ ...m })))
        const out = await chatComplete(CONFIG, payload.messages, payload.tools, (d) => {
          for (const h of handlers.slice()) h({ id: payload.id, delta: d })
        })
        for (const tc of out.toolCalls) idsFromClient.push(tc.id)
        return { id: payload.id, finishReason: out.finishReason, toolCalls: out.toolCalls }
      }
    }
  }
}

async function run(rounds: Round[]): Promise<LLMMessage[]> {
  installWindow(rounds)
  useLibraryStore.setState({ map: {} })
  useChatStore.getState().clear()
  useChatStore.setState({ pendingConfirm: null, busy: false, draft: '', chips: [] })
  useChatStore.getState().setDraft('找一首歌')
  await useChatStore.getState().send()
  return captured.at(-1) ?? []
}

const said = (msgs: LLMMessage[], id: string): number =>
  msgs.filter((m) => m.role === 'assistant').flatMap((m) => (m.tool_calls ?? []).map((t) => t.id))
    .filter((x) => x === id).length
const answered = (msgs: LLMMessage[], id: string): number =>
  msgs.filter((m) => m.role === 'tool' && m.tool_call_id === id).length

afterEach(() => {
  vi.unstubAllGlobals()
  useChatStore.getState().clear()
})

describe('R2 residual — a provider id repeated ACROSS rounds', () => {
  it('CONTROL: distinct provider ids per round keep one answer per announced call', async () => {
    const last = await run([
      { id: 'call_a', name: 'search_music', args: '{"query":"a"}' },
      { id: 'call_b', name: 'search_music', args: '{"query":"b"}' },
      null
    ])
    console.log('[probe B/control] ids from llmClient =', JSON.stringify(idsFromClient))
    console.log('[probe B/control] last request =', JSON.stringify(last))
    expect(idsFromClient.slice(0, 2)).toEqual(['call_a', 'call_b'])
    expect(said(last, 'call_a')).toBe(1)
    expect(said(last, 'call_b')).toBe(1)
    expect(answered(last, 'call_a')).toBe(1)
    expect(answered(last, 'call_b')).toBe(1)
    expect(last.filter((m) => m.role === 'tool')).toHaveLength(2)
  })

  it('a provider that repeats `call_0` in two rounds leaves the first call unanswered', async () => {
    const last = await run([
      { id: 'call_0', name: 'search_music', args: '{"query":"a"}' },
      { id: 'call_0', name: 'search_music', args: '{"query":"b"}' },
      null
    ])
    console.log('[probe B] ids from llmClient =', JSON.stringify(idsFromClient))
    console.log('[probe B] last request =', JSON.stringify(last))
    // the provider's ids are passed through untouched in BOTH rounds
    expect(idsFromClient.slice(0, 2)).toEqual(['call_0', 'call_0'])
    // two assistant messages announce `call_0` …
    expect(said(last, 'call_0')).toBe(2)
    // … but the F2 invariant (one tool reply per announced call) is broken:
    expect(last.filter((m) => m.role === 'tool')).toHaveLength(2)
  })
})

/**
 * Side observation (outside the four R2/R4 items): chatStore.send() builds
 * `baseHistory` from `get().messages` AFTER appending the new user bubble
 * (chatStore.ts:163-174) and then prepends `resume.userLlm` again in runFrom()
 * (chatStore.ts:538-543), so the current user turn is shipped twice.
 */
describe('chatStore request shape (side probe)', () => {
  it('sends the current user turn exactly once', async () => {
    const last = await run([null])
    const userTurns = last.filter((m) => m.role === 'user')
    console.log('[probe C] user turns in the request =', JSON.stringify(userTurns))
    expect(userTurns).toHaveLength(1)
  })
})

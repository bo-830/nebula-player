import { afterEach, describe, expect, it, vi } from 'vitest'
import { chatComplete } from '../../../../src/main/llmClient'

/**
 * t7-r5 PROBE (no mutation — imports the real src/main/llmClient.ts).
 *
 * Targets the R2 claim: "the streaming accumulator (`const i = tc.index ?? 0`)
 * no longer merges parallel calls when a provider omits `index`". The real R2
 * suite only ever sends explicit `index` values, so this case is uncovered there.
 *
 * The SSE helpers below are copied from the real test file
 * (src/main/__tests__/llmClientToolIds.test.ts:20-38) so the transport is identical.
 */
function sseResponse(lines: string[]): Response {
  const body = `${lines.join('\n')}\n\n`
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body))
      controller.close()
    }
  })
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' }
  })
}

function chunk(delta: unknown): string {
  return `data: ${JSON.stringify({ choices: [{ delta, finish_reason: null }] })}`
}

const CONFIG = { baseURL: 'http://127.0.0.1:9/v1', model: 'm', apiKey: 'k' }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('R2 accumulator — parallel calls when the provider omits `index`', () => {
  it('ONE delta with two index-less parallel calls stays two calls', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse([
          chunk({
            tool_calls: [
              { function: { name: 'search_music', arguments: '{"query":"a"}' } },
              { function: { name: 'play_tracks', arguments: '{"ids":["t1"]}' } }
            ]
          }),
          `data: [DONE]`
        ])
      )
    )

    const out = await chatComplete(CONFIG, [{ role: 'user', content: 'x' }], [], () => {})
    console.log('[probe A1] toolCalls =', JSON.stringify(out.toolCalls))
    expect(out.toolCalls.map((t) => t.function.name)).toEqual(['search_music', 'play_tracks'])
  })

  it('two deltas with one index-less call each stay two calls', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse([
          chunk({ tool_calls: [{ function: { name: 'search_music', arguments: '{"query":"a"}' } }] }),
          chunk({ tool_calls: [{ function: { name: 'play_tracks', arguments: '{"ids":["t1"]}' } }] }),
          `data: [DONE]`
        ])
      )
    )

    const out = await chatComplete(CONFIG, [{ role: 'user', content: 'x' }], [], () => {})
    console.log('[probe A2] toolCalls =', JSON.stringify(out.toolCalls))
    expect(out.toolCalls.map((t) => t.function.name)).toEqual(['search_music', 'play_tracks'])
  })

  it('CONTROL — the same two calls WITH explicit index stay two calls (probe harness is sound)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse([
          chunk({
            tool_calls: [
              { index: 0, function: { name: 'search_music', arguments: '{"query":"a"}' } },
              { index: 1, function: { name: 'play_tracks', arguments: '{"ids":["t1"]}' } }
            ]
          }),
          `data: [DONE]`
        ])
      )
    )

    const out = await chatComplete(CONFIG, [{ role: 'user', content: 'x' }], [], () => {})
    console.log('[probe A3/control] toolCalls =', JSON.stringify(out.toolCalls))
    expect(out.toolCalls.map((t) => t.function.name)).toEqual(['search_music', 'play_tracks'])
  })
})

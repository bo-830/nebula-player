import { afterEach, describe, expect, it, vi } from 'vitest'
import { chatComplete } from '../llmClient'

/**
 * R2 regression guard — fallback tool-call ids must be unique.
 *
 * When a provider omits `tool_calls[].id`, the client used to invent a
 * deterministic one (`call_${name}` / `call_${index}`). Two rounds that both
 * omit the id produced the SAME string, and the renderer's `replaceToolMessage`
 * matches on `tool_call_id` — so the second round's tool reply OVERWROTE the
 * first round's, leaving the newest assistant message with an unanswered
 * tool_call and making the provider reject the follow-up with HTTP 400 (the F2
 * failure returning through the back door).
 *
 * These cases exercise the real streaming parser against a mocked `fetch`, and
 * fail on the old deterministic fallback.
 */

/** build a text/event-stream body from raw SSE lines */
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

describe('fallback tool-call ids (R2)', () => {
  it('gives two id-less calls of the same tool distinct ids within one response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse([
          chunk({
            tool_calls: [
              {
                index: 0,
                function: { name: 'remove_from_playlist', arguments: '{"playlist":"a"}' }
              },
              {
                index: 1,
                function: { name: 'remove_from_playlist', arguments: '{"playlist":"b"}' }
              }
            ]
          }),
          `data: [DONE]`
        ])
      )
    )

    const out = await chatComplete(CONFIG, [{ role: 'user', content: 'x' }], [], () => {})
    expect(out.toolCalls).toHaveLength(2)
    const [first, second] = out.toolCalls
    // the old fallback produced `call_remove_from_playlist` twice
    expect(first.id).not.toBe(second.id)
    expect(new Set(out.toolCalls.map((t) => t.id)).size).toBe(2)
  })

  it('never repeats a fallback id across successive rounds', async () => {
    const idLessRound = (): Response =>
      sseResponse([
        chunk({
          tool_calls: [{ index: 0, function: { name: 'search_music', arguments: '{"query":"x"}' } }]
        }),
        `data: [DONE]`
      ])

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => idLessRound())
    )
    const round1 = await chatComplete(CONFIG, [{ role: 'user', content: 'x' }], [], () => {})
    const round2 = await chatComplete(CONFIG, [{ role: 'user', content: 'x' }], [], () => {})

    // old behaviour: both rounds got `call_search_music`, so the renderer's
    // replaceToolMessage would overwrite round 1's tool reply with round 2's
    expect(round1.toolCalls[0].id).not.toBe(round2.toolCalls[0].id)
  })

  it('de-duplicates ids that the provider itself repeats verbatim', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse([
          chunk({
            tool_calls: [
              { index: 0, id: 'call_same', function: { name: 'search_music', arguments: '{}' } },
              { index: 1, id: 'call_same', function: { name: 'search_music', arguments: '{}' } }
            ]
          }),
          `data: [DONE]`
        ])
      )
    )

    const out = await chatComplete(CONFIG, [{ role: 'user', content: 'x' }], [], () => {})
    expect(out.toolCalls).toHaveLength(2)
    expect(new Set(out.toolCalls.map((t) => t.id)).size).toBe(2)
    // the first occurrence keeps what the provider sent
    expect(out.toolCalls[0].id).toBe('call_same')
  })

  it('keeps provider-supplied unique ids untouched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sseResponse([
          chunk({
            tool_calls: [
              { index: 0, id: 'call_abc', function: { name: 'search_music', arguments: '{}' } },
              { index: 1, id: 'call_def', function: { name: 'play_tracks', arguments: '{}' } }
            ]
          }),
          `data: [DONE]`
        ])
      )
    )

    const out = await chatComplete(CONFIG, [{ role: 'user', content: 'x' }], [], () => {})
    expect(out.toolCalls.map((t) => t.id)).toEqual(['call_abc', 'call_def'])
  })
})

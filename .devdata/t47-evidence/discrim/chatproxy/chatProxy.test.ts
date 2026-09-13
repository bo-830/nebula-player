import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../../../../shared/types'
import {
  buildChatSnapshot,
  clampText,
  DEFAULT_BUBBLE_LIMIT,
  DEFAULT_TEXT_LIMIT,
  type ChatProxySource
} from './chatProxy'

/**
 * The mini window mirrors the chat run through `buildChatSnapshot`; these tests
 * pin the bounding rules that keep that IPC payload small and leak-free.
 * Removing the bubble cap or the text truncation turns this suite red.
 */

function bubble(i: number, content = `消息 ${i}`): ChatMessage {
  return { id: `b${i}`, role: i % 2 === 0 ? 'user' : 'assistant', content, chips: [], ts: i }
}

function source(over: Partial<ChatProxySource> = {}): ChatProxySource {
  return {
    bubbles: [],
    chips: [],
    streamRaw: '',
    streamShown: 0,
    busy: false,
    pendingConfirm: null,
    ...over
  }
}

describe('buildChatSnapshot — bubble cap', () => {
  it('keeps only the newest 20 bubbles, in chronological order', () => {
    const bubbles = Array.from({ length: 25 }, (_, i) => bubble(i))
    const snap = buildChatSnapshot(source({ bubbles }))

    expect(snap.bubbles).toHaveLength(DEFAULT_BUBBLE_LIMIT)
    expect(snap.bubbles[0].id).toBe('b5') // anything older than the newest 20 is dropped
    expect(snap.bubbles.at(-1)?.id).toBe('b24')
    // order is preserved (not reversed)
    expect(snap.bubbles.map((b) => b.id)).toEqual(bubbles.slice(-20).map((b) => b.id))
  })

  it('passes short histories through untouched', () => {
    const bubbles = [bubble(1), bubble(2)]
    expect(buildChatSnapshot(source({ bubbles })).bubbles.map((b) => b.id)).toEqual(['b1', 'b2'])
  })

  it('honours an explicit bubbleLimit', () => {
    const bubbles = Array.from({ length: 10 }, (_, i) => bubble(i))
    const snap = buildChatSnapshot(source({ bubbles }), { bubbleLimit: 3 })
    expect(snap.bubbles.map((b) => b.id)).toEqual(['b7', 'b8', 'b9'])
  })

  it('falls back to the default when a limit is not a usable number', () => {
    const bubbles = Array.from({ length: 25 }, (_, i) => bubble(i))
    for (const bad of [0, -5, Number.NaN]) {
      expect(buildChatSnapshot(source({ bubbles }), { bubbleLimit: bad }).bubbles).toHaveLength(20)
    }
  })
})

describe('buildChatSnapshot — text truncation', () => {
  it('caps each bubble at the configured limit and marks the cut', () => {
    const long = 'x'.repeat(50)
    const snap = buildChatSnapshot(source({ bubbles: [bubble(1, long)] }), { textLimit: 10 })
    expect(snap.bubbles[0].content).toBe(`${'x'.repeat(10)}…`)
  })

  it('leaves text at or under the limit byte-for-byte intact', () => {
    const exact = 'y'.repeat(10)
    expect(
      buildChatSnapshot(source({ bubbles: [bubble(1, exact)] }), { textLimit: 10 }).bubbles[0]
        .content
    ).toBe(exact)
    expect(buildChatSnapshot(source({ bubbles: [bubble(1, 'short')] })).bubbles[0].content).toBe(
      'short'
    )
  })

  it('caps the streaming text too (and never lets streamShown outrun it)', () => {
    const snap = buildChatSnapshot(source({ streamRaw: 'z'.repeat(100), streamShown: 100 }), {
      textLimit: 20
    })
    expect(snap.streamRaw).toBe(`${'z'.repeat(20)}…`)
    expect(snap.streamShown).toBeLessThanOrEqual(snap.streamRaw.length)
  })

  it('defaults the per-bubble cap to 4000 characters', () => {
    expect(DEFAULT_TEXT_LIMIT).toBe(4000)
    const snap = buildChatSnapshot(source({ bubbles: [bubble(1, 'a'.repeat(4001))] }))
    expect(snap.bubbles[0].content).toHaveLength(4001) // 4000 chars + the ellipsis
  })

  it('clampText is a no-op below the limit and empty for junk limits', () => {
    expect(clampText('abc', 10)).toBe('abc')
    expect(clampText('abcd', 3)).toBe('abc…')
    expect(clampText('abcd', 0)).toBe('')
  })
})

describe('buildChatSnapshot — pendingConfirm stays minimal', () => {
  it('exposes only the summary (no tool name / args / call id)', () => {
    const rich = {
      toolCallId: 'call_rm',
      name: 'remove_from_playlist',
      summary: '把《A》从夜跑歌单移出',
      finalText: '模型原文',
      args: '{"playlist":"夜跑"}'
    }
    const snap = buildChatSnapshot(source({ pendingConfirm: rich }))
    expect(snap.pendingConfirm).toEqual({ summary: '把《A》从夜跑歌单移出' })
    expect(Object.keys(snap.pendingConfirm ?? {})).toEqual(['summary'])
    expect(JSON.stringify(snap)).not.toContain('call_rm')
    expect(JSON.stringify(snap)).not.toContain('remove_from_playlist')
  })

  it('is null while nothing waits for the user', () => {
    expect(buildChatSnapshot(source()).pendingConfirm).toBeNull()
  })

  it('truncates a very long summary as well', () => {
    const snap = buildChatSnapshot(source({ pendingConfirm: { summary: 's'.repeat(100) } }), {
      textLimit: 8
    })
    expect(snap.pendingConfirm?.summary).toBe(`${'s'.repeat(8)}…`)
  })
})

describe('buildChatSnapshot — stable empty state', () => {
  it('returns the full shape for an empty store', () => {
    const snap = buildChatSnapshot(source())
    expect(snap).toEqual({
      bubbles: [],
      chips: [],
      streamRaw: '',
      streamShown: 0,
      busy: false,
      pendingConfirm: null
    })
  })

  it('never throws on a null/undefined source and keeps the same shape', () => {
    const empty = buildChatSnapshot(source())
    expect(buildChatSnapshot(null)).toEqual(empty)
    expect(buildChatSnapshot(undefined)).toEqual(empty)
  })

  it('copies arrays instead of aliasing store state', () => {
    const chips = ['已移出 2 首']
    const bubbles = [bubble(1)]
    const snap = buildChatSnapshot(source({ chips, bubbles }))
    chips.push('mutated')
    bubbles[0].content = 'mutated'
    expect(snap.chips).toEqual(['已移出 2 首'])
    expect(snap.bubbles[0].content).toBe('消息 1')
  })

  it('carries busy through unchanged', () => {
    expect(buildChatSnapshot(source({ busy: true })).busy).toBe(true)
    expect(buildChatSnapshot(source({ busy: false })).busy).toBe(false)
  })
})

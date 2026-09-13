import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ChatMessage, LLMMessage, LLMToolCall } from '../../../../shared/types'
import { dedupeToolCalls, useChatStore } from '../../stores/chatStore'
import { useLibraryStore } from '../../stores/libraryStore'
import { usePlaylistStore } from '../../stores/playlistStore'
import {
  ASSISTANT_NAME,
  buildSystemPrompt,
  executeTool,
  isDestructiveTool,
  summarizeDestructiveTool
} from '../tools'

/**
 * ④ AI 破坏性操作二次确认
 *  - tools.ts: destructive calls are intercepted and return needsConfirm
 *  - chatStore.ts: the tool loop pauses, the user decides, the loop continues
 *    while keeping assistant(tool_calls)→tool messages correctly interleaved
 */

const PLAYLIST_ID = 'pl-night'
const TRACK_IDS = ['t1', 't2']

function toolCall(name: string, args: Record<string, unknown>, id: string): LLMToolCall {
  return { id, type: 'function', function: { name, arguments: JSON.stringify(args) } }
}

function toolMessages(messages: LLMMessage[]): LLMMessage[] {
  return messages.filter((m) => m.role === 'tool')
}

/**
 * F2 invariant: every tool_call_id announced by an assistant message must be
 * answered by exactly ONE tool message. A parked round that leaves any id
 * unanswered makes the next request invalid and OpenAI-compatible gateways
 * answer it with HTTP 400.
 */
function expectEveryToolCallAnswered(messages: LLMMessage[]): void {
  const ids = messages
    .filter((m) => m.role === 'assistant')
    .flatMap((m) => (m.tool_calls ?? []).map((tc) => tc.id))
  expect(ids.length).toBeGreaterThan(0)
  const answered = toolMessages(messages).map((m) => m.tool_call_id)
  for (const id of ids) {
    expect(answered.filter((a) => a === id).length, `tool_call ${id} answered exactly once`).toBe(1)
  }
  expect(answered.length).toBe(new Set(answered).size) // no duplicate answers
}

function send(text: string): Promise<void> {
  useChatStore.getState().setDraft(text)
  return useChatStore.getState().send()
}

/**
 * J: the same permissive fake `window.api` used by the send failures below
 * (a round that fails before reaching the gateway must not be affected by the
 * gateway double of `installFakeWindow`).
 */
function installFakeWindowForSendFailure(error: Error): void {
  const glob = globalThis as unknown as { window: Record<string, unknown> }
  glob.window = {
    api: {
      chatLoad: async () => ({ messages: [] as ChatMessage[] }),
      chatComplete: async () => {
        throw error
      },
      chatAbort: (): void => {},
      onChatChunk: () => (): void => {}
    }
  }
}

// ---- J: 薇拉 Vela persona helpers -------------------------------------------

/**
 * Genuine pictographic emoji only. Deliberately EXCLUDES typographic symbols
 * that a blunt sentence legitimately uses — `→` (U+2192, the 设置 → AI 配置
 * pointer), CJK brackets/ellipsis (U+3000-U+303F), `–` (U+2013) and friends —
 * so "no emoji" means "no smileys/pictographs", not "no punctuation".
 *
 * The variation selector (U+FE0F) is intentionally NOT in the class: it is a
 * combining modifier, not a glyph of its own, and putting it next to others
 * trips `no-misleading-character-class`.
 */
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}]/u

const emojiIn = (text: string): string[] => text.match(new RegExp(EMOJI_RE, 'gu')) ?? []

/**
 * Component files are real .tsx sources: vitest runs in a pure node
 * environment with no jsdom and no @testing-library, so their user-visible copy
 * is pinned against the actual source text (and the title copy is additionally
 * pinned against `ASSISTANT_NAME` from tools.ts).
 */
const HERE = fileURLToPath(new URL('.', import.meta.url))
const componentSource = (file: string): string =>
  readFileSync(resolve(HERE, '..', '..', 'components', file), 'utf8')
const readChatPanel = (): string => componentSource('ChatPanel.tsx')
const readMiniChat = (): string => componentSource('MiniChat.tsx')

/** the `const SUGGESTIONS = [...]` string literals of a component file */
function suggestionsOf(src: string): string[] {
  const block = /const SUGGESTIONS = \[([\s\S]*?)\]/.exec(src)
  if (!block) throw new Error('no SUGGESTIONS block found')
  return [...block[1].matchAll(/'([^']*)'/g)].map((m) => m[1])
}

let capturedRounds: LLMMessage[][] = []

/**
 * `emitAfterResolve` models the ordering observed in a HIDDEN (tray) main
 * window: the `chat:complete` invoke reply is delivered BEFORE the queued
 * `chat:chunk` event messages, so the deltas land a macrotask after the round
 * promise resolves. Reading the shared store snapshot right after `await`
 * therefore sees an empty buffer even though the model answered with text.
 */
function installFakeWindow(
  rounds: Array<{ text: string; toolCalls: LLMToolCall[]; emitAfterResolve?: boolean }>
): void {
  capturedRounds = []
  let round = 0
  const glob = globalThis as unknown as { window: Record<string, unknown> }
  const handlers: Array<(p: { id: string; delta: string }) => void> = []
  glob.window = {
    api: {
      chatLoad: async () => ({ messages: [] as ChatMessage[] }),
      chatSave: async () => true,
      chatAbort: () => {},
      onChatChunk: (cb: (p: { id: string; delta: string }) => void) => {
        handlers.push(cb)
        return () => {
          const i = handlers.indexOf(cb)
          if (i >= 0) handlers.splice(i, 1)
        }
      },
      chatComplete: async (payload: { id: string; messages: LLMMessage[] }) => {
        capturedRounds.push(payload.messages.map((m) => ({ ...m })))
        const step = rounds[round++] ?? { text: '', toolCalls: [] }
        if (step.text) {
          const deliver = (): void => {
            for (const h of handlers.slice()) h({ id: payload.id, delta: step.text })
          }
          if (step.emitAfterResolve) setTimeout(deliver, 0)
          else deliver()
        }
        return {
          id: payload.id,
          finishReason: step.toolCalls.length ? 'tool_calls' : 'stop',
          toolCalls: step.toolCalls
        }
      }
    }
  }
}

beforeEach(() => {
  usePlaylistStore.setState({
    playlists: [
      {
        id: PLAYLIST_ID,
        name: '夜跑',
        trackIds: [...TRACK_IDS],
        order: 1,
        createdAt: 1,
        updatedAt: 1
      }
    ],
    loaded: true
  })
  useLibraryStore.setState({ map: {} })
  const chats = useChatStore.getState()
  chats.clear()
  useChatStore.setState({
    pendingConfirm: null,
    busy: false,
    streamRaw: '',
    streamShown: 0,
    chips: [],
    draft: ''
  })
})

afterEach(() => {
  useChatStore.getState().clear()
  vi.useRealTimers()
})

describe('destructive tool guard (tools.ts)', () => {
  it('knows which tools are destructive', () => {
    expect(isDestructiveTool('remove_from_playlist')).toBe(true)
    // additive / reversibly-toggled tools are NOT destructive
    for (const name of [
      'add_to_playlist',
      'create_playlist',
      'favorite_tracks',
      'search_music',
      'play_tracks',
      'set_volume',
      'set_play_mode'
    ]) {
      expect(isDestructiveTool(name)).toBe(false)
    }
  })

  it('summarises the pending operation for the confirmation bar', () => {
    const summary = summarizeDestructiveTool('remove_from_playlist', {
      playlist: '夜跑',
      ids: TRACK_IDS
    })
    expect(summary).toContain('夜跑')
    expect(summary).toContain('2 首')
  })

  it('does NOT execute remove_from_playlist without user approval', async () => {
    const before = usePlaylistStore.getState().playlists[0].trackIds
    const res = await executeTool(
      'remove_from_playlist',
      JSON.stringify({ playlist: '夜跑', ids: TRACK_IDS }),
      { runId: 'run-1', toolCallId: 'call-1', nonce: 'n1' }
    )
    expect(res.needsConfirm).toBe(true)
    expect(res.ok).toBe(false)
    expect(res.content).toContain('等待用户确认')
    expect(res.chip?.startsWith('待确认：')).toBe(true)
    expect(res.confirmSummary).toContain('夜跑')
    expect(res.confirmToken).toBeTruthy()
    // nothing happened
    expect(usePlaylistStore.getState().playlists[0].trackIds).toEqual(before)
  })

  it('cannot be self-approved: a token only authorises its own run + call', async () => {
    const args = JSON.stringify({ playlist: '夜跑', ids: TRACK_IDS })
    const pending = await executeTool('remove_from_playlist', args, {
      runId: 'run-1',
      toolCallId: 'call-1',
      nonce: 'n1'
    })

    const otherCall = await executeTool('remove_from_playlist', args, {
      runId: 'run-1',
      toolCallId: 'call-other',
      nonce: 'n1',
      confirmToken: pending.confirmToken
    })
    expect(otherCall.needsConfirm).toBe(true)

    const otherRun = await executeTool('remove_from_playlist', args, {
      runId: 'run-other',
      toolCallId: 'call-1',
      nonce: 'n1',
      confirmToken: pending.confirmToken
    })
    expect(otherRun.needsConfirm).toBe(true)

    const tampered = await executeTool('remove_from_playlist', args, {
      runId: 'run-1',
      toolCallId: 'call-1',
      nonce: 'n1',
      confirmToken: `${pending.confirmToken}x`
    })
    expect(tampered.needsConfirm).toBe(true)

    const noDeps = await executeTool('remove_from_playlist', args)
    expect(noDeps.needsConfirm).toBe(true)

    // the token minted for this exact call is the only way through
    const approved = await executeTool('remove_from_playlist', args, {
      runId: 'run-1',
      toolCallId: 'call-1',
      nonce: 'n1',
      confirmToken: pending.confirmToken
    })
    expect(approved.needsConfirm).toBeUndefined()
    expect(approved.ok).toBe(true)
    expect(usePlaylistStore.getState().playlists[0].trackIds).toEqual([])
  })

  it('leaves non-destructive tools untouched (no confirmation, executed at once)', async () => {
    const created = await executeTool('create_playlist', JSON.stringify({ name: '晨跑' }))
    expect(created.needsConfirm).toBeUndefined()
    expect(created.ok).toBe(true)
    expect(usePlaylistStore.getState().playlists.some((p) => p.name === '晨跑')).toBe(true)

    const bad = await executeTool('remove_from_playlist', '{not json}')
    expect(bad.needsConfirm).toBeUndefined()
    expect(bad.content).toBe('参数解析失败')

    const unknown = await executeTool('nope', '{}')
    expect(unknown.ok).toBe(false)
    expect(unknown.content).toContain('未知工具')
  })
})

describe('chat confirmation flow (chatStore.ts)', () => {
  it('pauses the turn on a destructive call and continues as soon as the user confirms', async () => {
    installFakeWindow([
      {
        text: '好的，我来把这两首移出「夜跑」。',
        toolCalls: [
          toolCall('remove_from_playlist', { playlist: '夜跑', ids: TRACK_IDS }, 'call_rm')
        ]
      },
      { text: '已移出 2 首歌曲。', toolCalls: [] }
    ])

    await send('把《A》和《B》从夜跑歌单里删掉')

    const parked = useChatStore.getState()
    expect(parked.pendingConfirm?.toolCallId).toBe('call_rm')
    expect(parked.pendingConfirm?.summary).toContain('夜跑')
    expect(parked.busy).toBe(false)
    // still on the first round: no model round happened after the pause
    expect(capturedRounds.length).toBe(1)
    // nothing executed yet
    expect(usePlaylistStore.getState().playlists[0].trackIds).toEqual(TRACK_IDS)

    await useChatStore.getState().confirm()

    expect(usePlaylistStore.getState().playlists[0].trackIds).toEqual([])
    expect(useChatStore.getState().pendingConfirm).toBeNull()
    expect(useChatStore.getState().busy).toBe(false)
    // final bubble = the model narration of round 1 + the post-approval reply,
    // i.e. the whole turn (same contract as the inline path); the seeded resume
    // stream must not duplicate the narration
    const confirmedText = useChatStore.getState().messages.at(-1)?.content ?? ''
    expect(confirmedText).toBe('好的，我来把这两首移出「夜跑」。已移出 2 首歌曲。')
    expect(confirmedText.indexOf('好的，我来把这两首移出「夜跑」。')).toBe(0)
    expect(confirmedText.split('好的，我来把这两首移出「夜跑」。').length - 1).toBe(1)
    expect(
      useChatStore
        .getState()
        .messages.at(-1)
        ?.chips?.some((c) => c.includes('已移出'))
    ).toBe(true)

    // second model round: assistant(tool_calls) → tool, exactly one tool message
    const round2 = capturedRounds[1]
    const assistantIdx = round2.findIndex(
      (m) => m.role === 'assistant' && (m.tool_calls?.length ?? 0) > 0
    )
    const tools = toolMessages(round2)
    expect(assistantIdx).toBeGreaterThanOrEqual(0)
    expect(tools.length).toBe(1)
    expect(tools[0].tool_call_id).toBe('call_rm')
    expect(round2.indexOf(tools[0])).toBe(assistantIdx + 1)
    expect(tools[0].content).toContain('移除了')
  })

  it('tells the model the user cancelled and keeps the sequence intact (no duplicate tool message)', async () => {
    installFakeWindow([
      {
        text: '需要把这两首移出「夜跑」吗？',
        toolCalls: [
          toolCall('remove_from_playlist', { playlist: '夜跑', ids: TRACK_IDS }, 'call_rm')
        ]
      },
      { text: '好的，已取消，没有改动歌单。', toolCalls: [] }
    ])

    await send('把《A》和《B》从夜跑歌单里删掉')
    expect(useChatStore.getState().pendingConfirm).not.toBeNull()

    await useChatStore.getState().cancel()

    expect(usePlaylistStore.getState().playlists[0].trackIds).toEqual(TRACK_IDS)
    expect(useChatStore.getState().pendingConfirm).toBeNull()
    // cancelled turns also keep the whole narration, without duplicating it
    const cancelledText = useChatStore.getState().messages.at(-1)?.content ?? ''
    expect(cancelledText).toBe('需要把这两首移出「夜跑」吗？好的，已取消，没有改动歌单。')
    expect(cancelledText.indexOf('需要把这两首移出「夜跑」吗？')).toBe(0)
    expect(cancelledText.split('需要把这两首移出「夜跑」吗？').length - 1).toBe(1)

    const round2 = capturedRounds[1]
    expect(round2.filter((m) => m.role === 'tool').length).toBe(1)
    expect(round2.filter((m) => m.role === 'tool' && m.tool_call_id === 'call_rm').length).toBe(1)
    const cancelled = round2.find((m) => m.role === 'tool')
    expect(cancelled?.content).toContain('用户已取消该操作')
  })

  it('runs non-destructive calls inline without any confirmation', async () => {
    installFakeWindow([
      {
        text: '先找一下歌。',
        toolCalls: [toolCall('search_music', { query: '夜', limit: 5 }, 'call_search')]
      },
      { text: '曲库里暂时没有匹配的歌曲。', toolCalls: [] }
    ])

    await send('找一首歌')

    expect(useChatStore.getState().pendingConfirm).toBeNull()
    expect(capturedRounds.length).toBe(2)
    const tools = toolMessages(capturedRounds[1])
    const assistantIdx = capturedRounds[1].findIndex(
      (m) => m.role === 'assistant' && (m.tool_calls?.length ?? 0) > 0
    )
    expect(tools.length).toBe(1)
    expect(tools[0].tool_call_id).toBe('call_search')
    // tool result really came from search_music (executed inline, no pause)
    expect(tools[0].content).toContain('"count"')
    expect(capturedRounds[1].indexOf(tools[0])).toBe(assistantIdx + 1)
    // final bubble keeps the whole turn: pre-tool narration + closing reply
    const finalText = useChatStore.getState().messages.at(-1)?.content ?? ''
    expect(finalText).toContain('先找一下歌。')
    expect(finalText).toContain('曲库里暂时没有匹配的歌曲。')
  })

  it('blocks new messages while a confirmation is pending', async () => {
    installFakeWindow([
      {
        text: '确认一下。',
        toolCalls: [
          toolCall('remove_from_playlist', { playlist: '夜跑', ids: TRACK_IDS }, 'call_rm')
        ]
      }
    ])

    await send('删掉夜跑歌单里的歌')
    expect(useChatStore.getState().pendingConfirm).not.toBeNull()

    await send('再帮我删一首')
    // the new prompt was ignored: still the same parked call, no extra round
    expect(capturedRounds.length).toBe(1)
    expect(useChatStore.getState().pendingConfirm?.toolCallId).toBe('call_rm')
  })

  // ---- F2: a parked round must answer EVERY tool_call_id (else HTTP 400) ----
  it('answers every tool call of the round when the destructive one is not last', async () => {
    installFakeWindow([
      {
        text: '先查一下，然后移出，再建一个歌单。',
        toolCalls: [
          toolCall('search_music', { query: '夜', limit: 5 }, 'call_search'),
          toolCall('remove_from_playlist', { playlist: '夜跑', ids: TRACK_IDS }, 'call_rm'),
          toolCall('create_playlist', { name: '晨跑' }, 'call_create')
        ]
      },
      { text: '好了。', toolCalls: [] }
    ])

    await send('整理一下歌单')

    // parked on the destructive call, with the round acknowledged in full.
    // F2 semantics: hitting the confirmation point parks the round and ENDS it —
    // no further model request is issued, so exactly one round has been captured.
    expect(useChatStore.getState().pendingConfirm?.toolCallId).toBe('call_rm')
    expect(capturedRounds.length).toBe(1) // no model round after the pause
    // nothing was executed by the parked round
    expect(usePlaylistStore.getState().playlists[0].trackIds).toEqual(TRACK_IDS)

    // The follow-up request only exists AFTER the user confirms, so every
    // assertion about "the round the model sees next" must be evaluated here.
    await useChatStore.getState().confirm()

    const round1 = capturedRounds[1]
    expect(round1).toBeTruthy()
    expectEveryToolCallAnswered(round1)
    const byId = (id: string): LLMMessage | undefined =>
      toolMessages(round1).find((m) => m.tool_call_id === id)
    // non-destructive call before the park: really executed
    expect(byId('call_search')?.content).toContain('"count"')
    // the parked call: acknowledged, never executed
    expect(byId('call_rm')?.content).toContain('移除了')
    // the call AFTER the park: acknowledged as deferred, never executed
    expect(byId('call_create')?.content).toContain('未执行该调用')
    expect(usePlaylistStore.getState().playlists.some((p) => p.name === '晨跑')).toBe(false)
    // exactly one tool message per announced id (no duplicates, none missing)
    expect(toolMessages(round1).length).toBe(3)

    // confirming really executed the removal, and the id was REPLACED not added
    expect(usePlaylistStore.getState().playlists[0].trackIds).toEqual([])
    // three announced ids → exactly three answers, no duplicates
    expect(toolMessages(round1).filter((m) => m.tool_call_id === 'call_rm').length).toBe(1)
  })

  it('keeps the narration produced before the pause when the resumed round emits no text', async () => {
    installFakeWindow([
      {
        text: '我来把这两首移出「夜跑」。',
        toolCalls: [
          toolCall('remove_from_playlist', { playlist: '夜跑', ids: TRACK_IDS }, 'call_rm')
        ]
      },
      // F4: a pure tool-call round with NO text delta
      { text: '', toolCalls: [] }
    ])

    await send('把《A》和《B》从夜跑歌单里删掉')
    expect(useChatStore.getState().pendingConfirm).not.toBeNull()

    await useChatStore.getState().confirm()

    // the confirmation narration must survive a text-less resumed round
    const finalText = useChatStore.getState().messages.at(-1)?.content ?? ''
    expect(finalText).toContain('我来把这两首移出「夜跑」。')
    expect(finalText).not.toBe('（无回复）')
  })
})

/**
 * R2 — a round must not announce the same `tool_call_id` twice.
 *
 * `replaceToolMessage` matches on `tool_call_id`, so two announced calls sharing
 * an id collapse into ONE tool reply: the assistant message keeps an unanswered
 * call and the provider answers the follow-up with HTTP 400. The old
 * deterministic fallback ids in `llmClient` (`call_${name}` / `call_${i}`) made
 * exactly that collision reachable across rounds; it now mints process-unique
 * ids, and the store keeps the invariant as well.
 *
 * This drives the production `dedupeToolCalls` (exported from chatStore) rather
 * than a copy of the rule.
 */
describe('tool_call_id uniqueness per round (R2)', () => {
  const NAMES = ['search_music', 'play_tracks', 'create_playlist']

  it('collapses duplicate ids so every announced id can be answered exactly once', () => {
    const round: LLMToolCall[] = [
      toolCall(NAMES[0], { query: 'a' }, 'call_same'),
      toolCall(NAMES[1], { ids: ['t1'] }, 'call_unique'),
      toolCall(NAMES[2], { name: 'x' }, 'call_same') // provider repeated an id
    ]

    const unique = dedupeToolCalls(round)

    // without the guard the round would announce 3 calls but the chain could
    // only ever hold 2 tool replies for them (the duplicate id overwrites)
    expect(round).toHaveLength(3)
    expect(unique).toHaveLength(2)
    expect(unique.map((tc) => tc.id)).toEqual(['call_same', 'call_unique'])
    expect(new Set(unique.map((tc) => tc.id)).size).toBe(unique.length)

    // the surviving call is the FIRST occurrence (stable order, no surprise swap)
    expect(unique[0].function.name).toBe(NAMES[0])

    // each unique id can be answered exactly once — the F2 invariant holds
    const answered = new Map<string, number>()
    for (const tc of unique) answered.set(tc.id, (answered.get(tc.id) ?? 0) + 1)
    expect([...answered.values()].every((n) => n === 1)).toBe(true)
  })

  it('leaves a round with unique ids untouched', () => {
    const round: LLMToolCall[] = NAMES.map((name, i) => toolCall(name, {}, `call_${i}`))
    expect(dedupeToolCalls(round)).toEqual(round)
  })
})

/**
 * t50 / T47-F1 — a text-only round must keep its text when the `chat:chunk`
 * events are delivered AFTER the `chat:complete` reply.
 *
 * Reproduced symptom: with the main window in the tray (hidden), a text-only
 * turn driven through the mini window landed as "（无回复）" in BOTH windows,
 * while the same path worked with the mini window visible and while the hidden
 * window sent directly — so the loss is an ORDERING effect, not a routing one.
 * In a hidden window Chromium delivers the queued event messages after the
 * invoke reply, so a run that sampled the text right after `await`ing the round
 * saw an empty buffer and `finalize` persisted the fallback.
 *
 * The store now keeps the round's text in the stream that owns it and lets the
 * queued events settle before sampling, so the late delta is not lost. Reverting
 * either half (sampling the store snapshot directly, or dropping the settle
 * yield) makes this case fail — verified by mutation.
 */
describe('text-only round with late chunks (t50 / T47-F1)', () => {
  it('keeps the answer when the chunk event lands after the invoke reply', async () => {
    installFakeWindow([
      {
        text: '音乐家为什么总能准时？因为他们懂得把握节拍。',
        toolCalls: [],
        emitAfterResolve: true
      }
    ])

    await send('给我讲个关于音乐的笑话')

    const last = useChatStore.getState().messages.at(-1)
    expect(last?.role).toBe('assistant')
    expect(last?.content).not.toBe('（无回复）')
    expect(last?.content).toContain('把握节拍')
    expect(useChatStore.getState().busy).toBe(false)
  })

  it('still persists the fallback when the model genuinely answers with no text', async () => {
    installFakeWindow([{ text: '', toolCalls: [], emitAfterResolve: true }])

    await send('空回复')

    // an empty answer is not a bug — the sentinel is correct here
    expect(useChatStore.getState().messages.at(-1)?.content).toBe('（无回复）')
  })
})

/**
 * J: 薇拉 Vela — naming + persona. The prompt is the product surface the user
 * actually feels, so it is asserted string by string; dropping the name or any
 * one of the four rules turns these cases red (checked by mutation).
 */
describe('薇拉 Vela persona (J)', () => {
  it('names the assistant and states all four persona rules', () => {
    const prompt = buildSystemPrompt()

    // 0) the name
    expect(ASSISTANT_NAME).toBe('薇拉 Vela')
    expect(prompt).toContain(ASSISTANT_NAME)

    // ① 执行类：只回一句结果、短句、先给结论、不寒暄（example quoted verbatim）
    expect(prompt).toContain('星舰领航员')
    expect(prompt).toContain('执行类指令只回一句结果：先给结论，不寒暄')
    expect(prompt).toContain('例如「已暂停。下一首是《X》」。')

    // ② 推荐/闲聊：温和有见地，可卖萌、可用 emoji，仅限此类且单条最多 1–2 个
    expect(prompt).toContain('深夜电台 DJ')
    expect(prompt).toContain('可以卖萌、可以用 emoji（仅此类回复，单条最多 1–2 个）')

    // ③ 破坏性操作：直白说明影响范围并等确认，禁止软化/卖萌/emoji
    expect(prompt).toContain('破坏性操作必须直白，禁止软化、禁止卖萌、禁止 emoji')
    expect(prompt).toContain('用一句不加修饰的话说明将要删除的对象和数量')

    // ④ 失败/能力边界：一句原因 + 指路，不承诺做不到的事
    expect(prompt).toContain('失败与能力边界：一句话说明原因，再加一句指路')
    expect(prompt).toContain('设置 → AI 配置')
    expect(prompt).toContain('稍后再试')
    expect(prompt).toContain('最接近的 3 首')
    expect(prompt).toContain('不要卖惨')
    expect(prompt).toContain('不要承诺做不到的事')

    // 自称/称呼约束
    expect(prompt).toContain('自称「我」，称用户「你」')
    expect(prompt).toContain('不要用「主人」「亲爱的」这类称呼')

    // the live-state lines must survive the rewrite
    expect(prompt).toContain('本地曲库：共')
    expect(prompt).toContain('用户听歌口味：')
  })

  it('splits the emoji allowance to casual replies only (prompt stays emoji-free)', () => {
    const prompt = buildSystemPrompt()

    // The allowance is granted in WORDS and scoped to one persona line; the
    // prompt text itself carries no emoji (the only non-CJK glyphs are the
    // en/em dashes and the "设置 → AI 配置" arrow).
    expect(emojiIn(prompt)).toEqual([])
    const allowance = prompt.split('\n').find((l) => l.includes('可以卖萌'))
    expect(allowance).toBeTruthy()
    expect(allowance).toContain('仅此类回复')
    expect(allowance).toContain('单条最多 1–2 个')

    // the destructive rule itself is written without any decoration
    const destructive = prompt.split('\n').find((l) => l.includes('禁止软化'))
    expect(destructive).toBeTruthy()
    expect(emojiIn(destructive ?? '')).toEqual([])

    // the plain-arrow pointer is shared by the rule and the failure message
    expect(prompt).toContain('设置 → AI 配置')
  })

  it('summarises a destructive call with object + count and without any emoji', () => {
    const summary = summarizeDestructiveTool('remove_from_playlist', {
      playlist: '夜跑',
      ids: TRACK_IDS
    })
    expect(summary).toMatch(/^从歌单《夜跑》移除 2 首：/)
    expect(summary).toContain('t1')
    expect(summary).toContain('t2')
    expect(emojiIn(summary)).toEqual([])
  })

  it('names the affected tracks (up to 3) instead of ids when they are known', () => {
    useLibraryStore.setState({
      map: {
        t1: { id: 't1', title: '雨夜行', artist: 'A', album: 'X' },
        t2: { id: 't2', title: '夜跑', artist: 'B', album: 'X' }
      } as never
    })
    const summary = summarizeDestructiveTool('remove_from_playlist', {
      playlist: '夜跑',
      ids: TRACK_IDS
    })
    expect(summary).toBe('从歌单《夜跑》移除 2 首：《雨夜行》、《夜跑》')
    expect(emojiIn(summary)).toEqual([])
  })

  it('keeps the count and caps the track list at 3 for a longer removal', () => {
    const summary = summarizeDestructiveTool('remove_from_playlist', {
      playlist: '夜跑',
      ids: ['t1', 't2', 't3', 't4']
    })
    expect(summary).toContain('移除 4 首')
    expect(summary).toContain('等 4 首')
    expect(emojiIn(summary)).toEqual([])
  })

  it('stays blunt and emoji-free when no track was specified', () => {
    const summary = summarizeDestructiveTool('remove_from_playlist', { playlist: '夜跑' })
    expect(summary).toContain('未指定歌曲')
    expect(summary).toContain('数量 0')
    expect(emojiIn(summary)).toEqual([])
  })

  it('shows the same name and persona suggestions in the main window and the mini window', () => {
    const panel = readChatPanel()
    const mini = readMiniChat()

    // the title literal exists in BOTH component sources and matches the prompt
    for (const src of [panel, mini]) {
      expect(src).toContain(`const ASSISTANT_TITLE = '${ASSISTANT_NAME}'`)
    }
    expect(panel).toContain('{ASSISTANT_TITLE}')
    expect(mini).toContain('{ASSISTANT_TITLE}')

    // ≥3 persona suggestions, identical in both windows (no drift)
    const panelSuggestions = suggestionsOf(panel)
    expect(panelSuggestions.length).toBeGreaterThanOrEqual(3)
    expect(panelSuggestions).toEqual(suggestionsOf(mini))
    expect(panelSuggestions).toEqual([
      '放点适合雨天的歌',
      '把这首歌加进夜跑歌单',
      '这张专辑是什么风格？',
      '暂停，然后告诉我下一首是什么'
    ])
    for (const s of panelSuggestions) expect(s.trim().length).toBeGreaterThan(0)

    // clicking a suggestion fills the textarea (setDraft + focus), never sends
    expect(panel).toMatch(/setDraft\(s\)\s*\n\s*taRef\.current\?\.focus\(\)/)
    expect(panel).not.toMatch(/setDraft\(s\)[\s\S]{0,80}getState\(\)\.send\(\)/)
  })

  it('sends the text a suggestion filled in, unchanged', async () => {
    installFakeWindow([{ text: '好，放点适合雨天的歌。', toolCalls: [] }])
    const [suggestion] = suggestionsOf(readChatPanel())

    await send(suggestion)

    const user = useChatStore.getState().messages.find((m) => m.role === 'user')
    expect(user?.content).toBe(suggestion)
  })

  it('answers a failure in one sentence plus a pointer, without a promise it cannot keep', async () => {
    installFakeWindowForSendFailure(new Error('尚未配置模型名称，请先在「设置 → AI 配置」中填写'))

    await send('帮我放首歌')

    const text = useChatStore.getState().messages.at(-1)?.content ?? ''
    expect(text).toContain('尚未配置模型名称')
    // 指路：the pointer uses the same plain arrow as the system prompt rule
    expect(text).toContain('设置 → AI 配置')
    expect(text).toContain('接口地址、API Key 与网络连接')
    // 一句话 + 指路：no wall of text, no cap-in-hand apology, no promise
    // about what happens next.
    expect(text.split('\n').filter((l) => l.trim()).length).toBeLessThanOrEqual(2)
    expect(text).not.toContain('对不起对不起')
    expect(text).not.toContain('马上就好')
    expect(useChatStore.getState().busy).toBe(false)

    // KNOWN GAP (t54 report): `chatStore.ts` prefixes the message with the ⚠️
    // pictograph. That file is OUTSIDE this task's inScope, so the glyph is
    // asserted as-is instead of being edited here; the failure text is
    // otherwise persona-consistent (one sentence + pointer, no emoji besides
    // that one). Removing it is a one-character change needing its own
    // contract on `src/renderer/src/stores/chatStore.ts`.
    expect(text.startsWith('⚠️ 无法获取 AI 回复：')).toBe(true)
    expect(emojiIn(text.replace('⚠️', ''))).toEqual([])
  })
})

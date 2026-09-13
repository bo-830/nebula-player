import { create } from 'zustand'
import type { ChatMessage } from '../types'
import type { LLMMessage, LLMToolCall } from '../../../shared/types'
import { uid } from '../lib/format'
import { buildSystemPrompt, executeTool, toolsForLLM } from '../lib/tools'
import { useUiStore } from './uiStore'

const HISTORY_LIMIT = 40
/** safety net for the tool loop (non-destructive tools auto-execute) */
const MAX_ROUNDS = 6

let saveTimer: ReturnType<typeof setTimeout> | null = null
function persistHistory(messages: ChatMessage[]): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void window.api.chatSave(messages.slice(-HISTORY_LIMIT - 10))
  }, 300)
}

export interface ChatBubble {
  id: string
  role: 'user' | 'assistant'
  content: string
  chips: string[]
  ts: number
  streaming?: boolean
  error?: boolean
}

/** a destructive tool call parked until the user approves or cancels it */
export interface PendingConfirm {
  /** id of the tool call (the `tool` message that answers it) */
  toolCallId: string
  /** tool name, e.g. remove_from_playlist */
  name: string
  /** human-readable operation summary shown in the confirmation bar */
  summary: string
  /** model text of the round that issued the call */
  finalText: string
  args: string
}

interface ChatState {
  messages: ChatMessage[] // persisted: user + final assistant turns
  bubbles: ChatBubble[] // rendered history (same as messages + in-flight)
  collapsed: boolean
  busy: boolean
  streamRaw: string
  streamShown: number
  chips: string[]
  draft: string
  /** confirmation bar state (null while nothing waits for the user) */
  pendingConfirm: PendingConfirm | null
  load: () => Promise<void>
  setCollapsed: (v: boolean) => void
  setDraft: (v: string) => void
  send: () => Promise<void>
  /** 确认执行 the parked destructive tool, then keep talking to the model */
  confirm: () => Promise<void>
  /** 取消 the parked destructive tool, tell the model, then continue */
  cancel: () => Promise<void>
  abort: () => void
  clear: () => void
}

/**
 * Everything needed to keep building the SAME assistant turn after a pause.
 * `chain` is the ordered assistant(tool_calls)→tool(...) transcript: keeping it
 * alive (instead of restarting the turn) is what stops providers from rejecting
 * the follow-up request with HTTP 400.
 */
/**
 * Handle returned by `openStream`: the caller owns teardown and — crucially —
 * reads the round's text from the stream itself rather than from `streamRaw`.
 * See `next()` below for why that distinction is load-bearing.
 */
interface StreamHandle {
  /** detach this stream's listener (idempotent) */
  unsub: () => void
  /**
   * Settle, then report the text accumulated so far.
   *
   * t50 / T47-F1: a run must NOT sample the shared `streamRaw` snapshot directly
   * after `await`ing a round. In a hidden (tray) window Chromium can deliver the
   * queued `chat:chunk` event messages AFTER the `chat:complete` invoke reply, so
   * an immediate read sees `''`, `settleRun` → `finalize` persists the
   * `'（无回复）'` fallback, and the model's answer is lost even though it
   * streamed fine. That is exactly the reported symptom: the same turn worked
   * with the mini window visible and when the hidden window sent directly, and
   * failed only for the hidden + proxied combination. Yielding one macrotask
   * lets those already-queued events run first, so a delta that was already in
   * flight when the round resolved still lands in this buffer before `next()`
   * reports it; and because `next()` reports the buffer instead of the store
   * snapshot, reporting can no longer out-run the accumulation.
   *
   * t58 / H1 — what this does NOT cover, measured rather than assumed: the
   * buffer is the stream's own memory, but WHETHER a delta reaches it is decided
   * by the chunk guard, which is keyed on the module-level `streamConvId`. That
   * was previously cleared by the typewriter reveal timer the moment its cursor
   * caught up with `streamRaw` (`closeStream()` in the reveal branch), so a round
   * that was still streaming lost every delta after the first catch-up — a real
   * truncation of long answers, since the reveal runs at ~227 chars/s and real
   * models drip at ~30–100 chars/s. "Arrives in time" was therefore never the
   * whole story: an earlier version of this comment claimed the buffered deltas
   * were "never dropped", which was too strong. Catch-up now stops only the
   * reveal timer (`stopRevealTimer`) and leaves ownership intact, so the guard
   * holds for the whole round; only a real end (`finishRun`, `unsub`) clears
   * `streamConvId`, which is what keeps a straggler from leaking into the next
   * round.
   */
  next: () => Promise<string>
}

interface RunResume {
  convId: string
  runId: string
  nonce: string
  userLlm: LLMMessage
  baseHistory: LLMMessage[]
  chain: LLMMessage[]
  accumulated: string
  chips: string[]
  round: number
  toolCalls: LLMToolCall[]
  /** set while the run is parked on a destructive call (mirrors the store) */
  pending: PendingConfirm | null
  /** subscribe to model chunks; `seed` restores text produced before a pause */
  openStream: (seed: string) => StreamHandle
}

let convId = ''
let streamTimer: ReturnType<typeof setInterval> | null = null
let streamConvId = ''

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  bubbles: [],
  collapsed: true,
  busy: false,
  streamRaw: '',
  streamShown: 0,
  chips: [],
  draft: '',
  pendingConfirm: null,

  load: async () => {
    const res = await window.api.chatLoad()
    const messages = (res.messages ?? []).filter(
      (m: ChatMessage) => m.role === 'user' || m.role === 'assistant'
    )
    set({ messages, bubbles: messages.map((m) => ({ ...m, chips: m.chips ?? [] })) })
  },

  setCollapsed: (v) => set({ collapsed: v }),
  setDraft: (v) => set({ draft: v }),

  abort: () => {
    // a parked confirmation has no in-flight request: just drop the call
    const pending = get().pendingConfirm
    if (pending) {
      closeStream()
      set({
        pendingConfirm: null,
        busy: false,
        chips: [],
        streamRaw: '',
        streamShown: 0,
        draft: ''
      })
      convId = ''
      pendingResume = null
      pendingConfirmToken = ''
      return
    }
    if (convId) window.api.chatAbort(convId)
  },

  clear: () => {
    get().abort()
    closeStream()
    set({
      messages: [],
      bubbles: [],
      streamRaw: '',
      streamShown: 0,
      chips: [],
      pendingConfirm: null,
      busy: false
    })
    persistHistory([])
  },

  send: async () => {
    const text = get().draft.trim()
    if (!text || get().busy || get().pendingConfirm) return
    set({ draft: '', busy: true, streamRaw: '', streamShown: 0, chips: [], pendingConfirm: null })

    const userMsg: ChatMessage = {
      id: uid(),
      role: 'user',
      content: text,
      chips: [],
      ts: Date.now()
    }
    const history = [...get().messages, userMsg]
    set({
      messages: history,
      bubbles: history.map((m) => ({ ...m, chips: m.chips ?? [] })),
      streamRaw: ''
    })
    persistHistory(history)

    const userLlm: LLMMessage = { role: 'user', content: text }
    const baseHistory = history
      .slice(-HISTORY_LIMIT)
      .map((m): LLMMessage => ({ role: m.role, content: m.content }))
    // keep the assistant(tool_calls)→tool(...) interleaved chain in ORDER so
    // providers (OpenAI/DeepSeek) accept each tool message as a response to a
    // preceding assistant message that carries the matching tool_calls.
    const conv = uid()
    convId = conv
    const resume: RunResume = {
      convId: conv,
      runId: uid(),
      nonce: uid(),
      userLlm,
      baseHistory,
      chain: [],
      accumulated: '',
      chips: [],
      round: 0,
      toolCalls: [],
      pending: null,
      openStream: (seed) => openStream(conv, seed)
    }

    try {
      await runFrom(resume, set, get)
      settleRun(set, get, resume.accumulated, resume.chips)
    } catch (err) {
      handleRunError(set, get, err, resume.accumulated, resume.chips)
      finishRun(set, get)
    }
  },

  confirm: async () => {
    const pending = get().pendingConfirm
    if (!pending || get().busy) return
    const resume = pendingResume
    set({ pendingConfirm: null, busy: true, draft: '' })
    if (!resume) {
      finishRun(set, get)
      return
    }
    const toolCall = resume.toolCalls.find((tc) => tc.id === pending.toolCallId) ?? {
      id: pending.toolCallId,
      type: 'function' as const,
      function: { name: pending.name, arguments: pending.args }
    }
    // the user approved → run the SAME call with the token minted for it.
    // F6: executeTool must never escape as an unhandled rejection — it runs
    // outside the run's try block, so a throw here would leave busy=true with
    // pendingConfirm=null and lock the panel until a reload.
    let result: Awaited<ReturnType<typeof executeTool>>
    try {
      result = await executeTool(pending.name, toolCall.function.arguments, {
        runId: resume.runId,
        toolCallId: pending.toolCallId,
        nonce: resume.nonce,
        confirmToken: pendingConfirmToken
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      resume.chain = replaceToolMessage(resume.chain, pending.toolCallId, {
        role: 'tool',
        tool_call_id: pending.toolCallId,
        content: `操作执行失败：${msg}`
      })
      handleRunError(set, get, err, resume.accumulated, resume.chips)
      finishRun(set, get)
      return
    }
    resume.chips = [...resume.chips, ...(result.chip ? [result.chip] : [])]
    resume.chain = replaceToolMessage(resume.chain, pending.toolCallId, {
      role: 'tool',
      tool_call_id: pending.toolCallId,
      content: result.content
    })
    set({ chips: resume.chips })
    try {
      await runFrom(resume, set, get)
      settleRun(set, get, resume.accumulated, resume.chips)
    } catch (err) {
      handleRunError(set, get, err, resume.accumulated, resume.chips)
      finishRun(set, get)
    }
  },

  cancel: async () => {
    const pending = get().pendingConfirm
    if (!pending || get().busy) return
    const resume = pendingResume
    set({ pendingConfirm: null, busy: true, draft: '' })
    if (!resume) {
      finishRun(set, get)
      return
    }
    resume.chips = [...resume.chips, `已取消：${pending.summary}`]
    // one tool message per tool_call_id: REPLACE the "waiting" placeholder
    resume.chain = replaceToolMessage(resume.chain, pending.toolCallId, {
      role: 'tool',
      tool_call_id: pending.toolCallId,
      content: `用户已取消该操作：${pending.summary}。请勿重复执行，改为询问用户还需要什么。`
    })
    set({ chips: resume.chips })
    try {
      await runFrom(resume, set, get)
      settleRun(set, get, resume.accumulated, resume.chips)
    } catch (err) {
      handleRunError(set, get, err, resume.accumulated, resume.chips)
      finishRun(set, get)
    }
  }
}))

/** append the finished assistant turn; called from `settleRun` */
function finalize(
  set: (p: Partial<ChatState>) => void,
  get: () => ChatState,
  content: string,
  chips: string[],
  isError: boolean
): void {
  const asst: ChatMessage = {
    id: uid(),
    role: 'assistant',
    content: content || '（无回复）',
    chips,
    ts: Date.now()
  }
  const messages = [...get().messages, asst]
  set({
    messages,
    bubbles: messages.map((m) => ({ ...m, chips: m.chips ?? [] })),
    chips: [],
    streamRaw: '',
    streamShown: 0
  })
  persistHistory(messages)
  void isError
}

/** end of a run: finalize it (unless parked for a confirmation) and reset the loop state */
function settleRun(
  set: (p: Partial<ChatState>) => void,
  get: () => ChatState,
  accumulated: string,
  chips: string[]
): void {
  if (get().pendingConfirm) return
  finishRun(set, get)
  finalize(set, get, accumulated.trim(), chips, false)
}

let pendingResume: RunResume | null = null
let pendingConfirmToken = ''

function closeStream(): void {
  if (streamTimer) {
    clearInterval(streamTimer)
    streamTimer = null
  }
  streamConvId = ''
}

/**
 * t58 / H1: stop ONLY the typewriter reveal, keeping the stream's ownership
 * (`streamConvId`) valid for the rest of the round.
 *
 * The reveal cursor catching up with `streamRaw` means "nothing left to reveal
 * right now" — it does NOT mean the round is over: more deltas can still arrive
 * (a real model drips at ~30–100 chars/s while this timer reveals at ~227
 * chars/s, so catching up mid-answer is the normal case, not an edge case).
 * Calling `closeStream()` here used to clear `streamConvId`, so the chunk guard
 * then rejected every remaining delta of the round and the answer was persisted
 * truncated. The next arriving delta restarts the timer (see `openStream`), and
 * `streamShown` is left where it stopped, so the reveal simply continues.
 */
function stopRevealTimer(): void {
  if (streamTimer) {
    clearInterval(streamTimer)
    streamTimer = null
  }
}

/**
 * subscribe to model chunks for one conversation; returns the unsubscriber.
 * `seed` restores the text produced before a confirmation pause, so the turn's
 * final bubble keeps the model's earlier narration.
 */
function openStream(rid: string, seed: string): StreamHandle {
  let accumulated = seed
  let closed = false
  streamConvId = rid
  // F4: publish the seed immediately. `runFrom` reads the accumulated text back
  // from the store after each round, so a resumed round that emits no text at
  // all would otherwise overwrite it with '' and drop the narration the model
  // produced before the confirmation pause.
  useChatStore.setState({ streamRaw: seed })
  const unsub = window.api.onChatChunk((p) => {
    if (closed || p.id !== rid || streamConvId !== rid) return
    accumulated += p.delta
    useChatStore.setState({ streamRaw: accumulated })
    // typewriter reveal pacing
    if (!streamTimer) {
      streamTimer = setInterval(() => {
        const s = useChatStore.getState()
        if (!s.streamRaw) {
          useChatStore.setState({ streamShown: 0 })
          return
        }
        if (s.streamShown >= s.streamRaw.length) {
          // t58 / H1: catch-up ends the REVEAL, not the round. `closeStream()`
          // would clear `streamConvId` and the guard above would then drop every
          // later delta of this same round (truncated answers); the stream stays
          // owned by this round until `finishRun` / `unsub` ends it for real.
          stopRevealTimer()
          useChatStore.setState({ streamShown: s.streamRaw.length })
          return
        }
        useChatStore.setState({ streamShown: Math.min(s.streamRaw.length, s.streamShown + 5) })
      }, 22)
    }
  })
  return {
    unsub: () => {
      closed = true
      unsub()
      if (streamConvId === rid) closeStream()
    },
    next: async () => {
      // let already-queued `chat:chunk` events deliver before reporting the text
      // (t50 / T47-F1), then report THIS stream's buffer — never the store
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      return accumulated
    }
  }
}

function finishRun(set: (p: Partial<ChatState>) => void, get: () => ChatState): void {
  closeStream()
  set({ busy: false, streamShown: get().streamRaw.length, streamRaw: '' })
  convId = ''
  pendingResume = null
  pendingConfirmToken = ''
}

/** keep exactly one `tool` message per tool_call_id */
function replaceToolMessage(
  chain: LLMMessage[],
  toolCallId: string,
  message: LLMMessage
): LLMMessage[] {
  const idx = chain.findIndex((m) => m.role === 'tool' && m.tool_call_id === toolCallId)
  if (idx >= 0) {
    const next = chain.slice()
    next[idx] = message
    return next
  }
  return [...chain, message]
}

/**
 * R2 defence: a round must announce each `tool_call_id` at most once.
 *
 * `replaceToolMessage` matches on `tool_call_id`, so a round carrying the same id
 * twice would collapse two announced calls into ONE tool reply — the newest
 * assistant message would keep an unanswered call and the provider would reject
 * the follow-up with HTTP 400 (the F2 failure re-entering through the
 * id-collision door). `llmClient` now mints process-unique fallback ids; this
 * guard keeps the invariant on the renderer side as well: duplicates are
 * announced once and executed once, preserving their original order.
 *
 * Exported so the chatConfirm regression suite drives THIS function instead of a
 * copy of the rule.
 */
export function dedupeToolCalls(toolCalls: LLMToolCall[]): LLMToolCall[] {
  const seen = new Set<string>()
  const unique: LLMToolCall[] = []
  for (const tc of toolCalls) {
    if (seen.has(tc.id)) continue
    seen.add(tc.id)
    unique.push(tc)
  }
  return unique
}

/**
 * Complete every tool call of the round in order. Returns true when the round
 * was parked for a confirmation.
 *
 * F2: a parked round must still answer EVERY tool_call_id exactly once before
 * the turn pauses. Otherwise the next request ships an assistant message whose
 * tool_calls have unanswered ids and OpenAI-compatible gateways reject it with
 * HTTP 400. So hitting `needsConfirm` does not return immediately: the
 * remaining calls of the round first get a "deferred" placeholder (they are
 * NOT executed — the model re-issues them next turn).
 */
async function completeToolCalls(
  resume: RunResume,
  roundText: string,
  incomingToolCalls: LLMToolCall[],
  set: (p: Partial<ChatState>) => void,
  get: () => ChatState
): Promise<boolean> {
  // R2 defence: announce/execute each tool_call_id at most once, so the round's
  // chain can never contain two calls that would collapse into one tool reply
  const toolCalls = dedupeToolCalls(incomingToolCalls)
  resume.chain = [
    ...resume.chain,
    { role: 'assistant', content: roundText || '', tool_calls: toolCalls }
  ]
  resume.toolCalls = toolCalls
  let parked = false
  /**
   * F2: write a tool answer and, once the round is parked, keep the snapshot the
   * user's confirm/cancel will resume from in sync — otherwise the remaining
   * placeholders added after the park would be dropped from the next request
   * and its tool_calls would be left unanswered (HTTP 400).
   */
  const answerToolCall = (toolCallId: string, content: string): void => {
    resume.chain = replaceToolMessage(resume.chain, toolCallId, {
      role: 'tool',
      tool_call_id: toolCallId,
      content
    })
    if (!parked || !pendingResume) return
    pendingResume = {
      ...pendingResume,
      chain: resume.chain.slice(),
      chips: resume.chips.slice()
    }
  }
  for (const tc of toolCalls) {
    // once parked, every remaining call is only acknowledged, never executed
    if (parked) {
      answerToolCall(tc.id, '等待用户确认前一项操作：本轮未执行该调用，请在用户答复后重新发起。')
      continue
    }

    // F6: a throwing tool must not deadlock the panel — it becomes an error
    // tool-message and the round continues (busy is reset by the caller)
    let result: Awaited<ReturnType<typeof executeTool>>
    try {
      result = await executeTool(tc.function.name, tc.function.arguments, {
        runId: resume.runId,
        toolCallId: tc.id,
        nonce: resume.nonce
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      answerToolCall(tc.id, `工具执行失败：${msg}`)
      resume.chips = [...resume.chips, `执行失败：${tc.function.name}`]
      set({ chips: [...resume.chips] })
      continue
    }
    if (result.chip) resume.chips = [...resume.chips, result.chip]

    if (result.needsConfirm) {
      // park the turn: no further model round until the user decides
      const pending: PendingConfirm = {
        toolCallId: tc.id,
        name: tc.function.name,
        summary: result.confirmSummary ?? tc.function.name,
        finalText: roundText,
        args: tc.function.arguments
      }
      parked = true
      pendingConfirmToken = result.confirmToken ?? ''
      pendingResume = {
        ...resume,
        chain: resume.chain.slice(),
        chips: resume.chips.slice(),
        pending
      }
      answerToolCall(tc.id, result.content)
      set({
        pendingConfirm: pending,
        chips: resume.chips,
        busy: false,
        streamShown: get().streamRaw.length,
        streamRaw: ''
      })
    } else {
      answerToolCall(tc.id, result.content)
    }

    // reflect chips immediately on the in-flight bubble
    set({ chips: [...resume.chips] })
  }
  return parked
}

/** run model rounds from resume.round until the model stops asking for tools */
async function runFrom(
  resume: RunResume,
  set: (p: Partial<ChatState>) => void,
  get: () => ChatState
): Promise<void> {
  const stream = resume.openStream(resume.accumulated)
  try {
    while (resume.round < MAX_ROUNDS) {
      const roundStart = resume.accumulated.length
      const messages: LLMMessage[] = [
        { role: 'system', content: buildSystemPrompt() },
        ...resume.baseHistory,
        resume.userLlm,
        ...resume.chain
      ]
      const done = await window.api.chatComplete({
        id: resume.convId,
        messages,
        tools: toolsForLLM()
      })
      resume.round++
      // t50 / T47-F1: sample the stream's own buffer (after letting queued chunk
      // events settle), never `getState().streamRaw`. In a hidden window the
      // deltas can arrive after this round's invoke reply, and a snapshot read
      // here would lose them — persisting '（无回复）' for a turn the model
      // actually answered.
      resume.accumulated = await stream.next()
      const roundText = resume.accumulated.slice(roundStart)

      if (done.toolCalls.length > 0) {
        const parked = await completeToolCalls(resume, roundText, done.toolCalls, set, get)
        if (parked) return
        continue
      }
      break
    }
  } finally {
    stream.unsub()
  }
}

function handleRunError(
  set: (p: Partial<ChatState>) => void,
  get: () => ChatState,
  err: unknown,
  accumulated: string,
  chips: string[]
): void {
  const rawMsg = err instanceof Error ? err.message : String(err)
  // strip the Electron IPC wrapper: "Error invoking remote method 'chat:complete': Error: …"
  const msg = rawMsg.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '')
  if (/取消|abort/i.test(msg)) {
    finalize(set, get, accumulated.trim(), chips, false)
  } else {
    set({ chips: [] })
    useUiStore.getState().toast('AI 回复失败', 'error')
    finalize(
      set,
      get,
      `⚠️ 无法获取 AI 回复：${msg}\n\n请检查「设置 → AI 配置」中的接口地址、API Key 与网络连接。`,
      [],
      true
    )
  }
}

import type { ChatMessage, ChatProxySnapshot } from '../../../shared/types'

/**
 * Pure projection of the main window's chat state into the read-only snapshot
 * the mini window mirrors.
 *
 * The mini window is a separate renderer and must not own any chat state, so
 * the main window publishes a bounded snapshot instead of the whole run:
 *   - only the newest `bubbleLimit` bubbles travel over IPC,
 *   - every bubble's text is capped at `textLimit` characters,
 *   - a parked destructive call is reduced to its human-readable summary
 *     (the tool name / args / call id stay in the main window),
 *   - the empty state is a stable, fully-shaped object so the floating pane
 *     never has to defend against missing fields.
 *
 * No React / no IPC here: `lib/__tests__/chatProxy.test.ts` drives this
 * function directly, so weakening a limit turns that suite red.
 */

/** the slice of chat state the snapshot is built from (structural subset) */
export interface ChatProxySource {
  bubbles: ChatMessage[]
  chips: string[]
  streamRaw: string
  streamShown: number
  busy: boolean
  pendingConfirm: { summary: string } | null
}

export interface ChatSnapshotOptions {
  /** keep at most the newest N bubbles (default 20) */
  bubbleLimit?: number
  /** cap each bubble's text at N characters (default 4000) */
  textLimit?: number
}

export const DEFAULT_BUBBLE_LIMIT = 20
export const DEFAULT_TEXT_LIMIT = 4000

/** cut text at `limit`, appending an ellipsis only when it was actually cut */
export function clampText(text: string, limit: number): string {
  const value = typeof text === 'string' ? text : ''
  if (!Number.isFinite(limit) || limit <= 0) return ''
  return value.length > limit ? `${value.slice(0, limit)}…` : value
}

export function buildChatSnapshot(
  state: ChatProxySource | null | undefined,
  opts: ChatSnapshotOptions = {}
): ChatProxySnapshot {
  const bubbleLimit = normaliseLimit(opts.bubbleLimit, DEFAULT_BUBBLE_LIMIT)
  const textLimit = normaliseLimit(opts.textLimit, DEFAULT_TEXT_LIMIT)
  const bubbles = Array.isArray(state?.bubbles) ? state.bubbles : []
  const pending = state?.pendingConfirm
  const streamRaw = typeof state?.streamRaw === 'string' ? state.streamRaw : ''
  const streamShown = Number.isFinite(state?.streamShown) ? Math.max(0, state?.streamShown ?? 0) : 0

  return {
    // newest N, in chronological order
    bubbles: bubbles.slice(-bubbleLimit).map((b) => ({
      id: b.id,
      role: b.role,
      content: clampText(b.content, textLimit),
      chips: Array.isArray(b.chips) ? [...b.chips] : [],
      ts: b.ts
    })),
    chips: Array.isArray(state?.chips) ? [...state.chips] : [],
    streamRaw: clampText(streamRaw, textLimit),
    // never let the reveal cursor outrun the (possibly truncated) stream
    streamShown: Math.min(streamShown, clampText(streamRaw, textLimit).length),
    busy: state?.busy === true,
    pendingConfirm: pending ? { summary: clampText(pending.summary, textLimit) } : null
  }
}

/** options.limit wins when it is a positive finite number, else the default */
function normaliseLimit(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback
}

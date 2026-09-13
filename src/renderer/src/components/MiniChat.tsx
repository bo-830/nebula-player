import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Bot, Send, Sparkles, Square, TriangleAlert } from 'lucide-react'
import type { ChatProxySnapshot } from '../../../shared/types'

/**
 * J: same assistant, same name — kept as a literal because this file may only
 * export components (`react-refresh/only-export-components`). The test suite
 * pins it against `ASSISTANT_NAME` in `tools.ts` so main window and mini window
 * can never show two different names.
 */
const ASSISTANT_TITLE = '薇拉 Vela'

/**
 * empty-state prompts; clicking one fills the input (never sends on its own).
 * Same persona, same behaviour as the main-window panel.
 */
const SUGGESTIONS = [
  '放点适合雨天的歌',
  '把这首歌加进夜跑歌单',
  '这张专辑是什么风格？',
  '暂停，然后告诉我下一首是什么'
]

const EMPTY: ChatProxySnapshot = {
  bubbles: [],
  chips: [],
  streamRaw: '',
  streamShown: 0,
  busy: false,
  pendingConfirm: null
}

/**
 * AI chat pane of the expanded mini window.
 *
 * There is NO chat store and no AI tool loop in this renderer: the pane renders
 * the snapshot pushed by the main window (`chat:proxy:state`) and sends every
 * intent back as a command (`chat:proxy:cmd`). That keeps the destructive-tool
 * confirmation and the tool loop in exactly one process.
 */
export function MiniChat(): React.JSX.Element {
  const [snap, setSnap] = useState<ChatProxySnapshot>(EMPTY)
  const [draft, setDraft] = useState('')
  const bodyRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    return window.api.onChatProxyState((s) => setSnap(s))
  }, [])

  const pending = snap.pendingConfirm
  const busy = snap.busy
  const blocked = busy || !!pending

  // keep the newest message in view
  useLayoutEffect(() => {
    const el = bodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [snap.bubbles.length, snap.streamShown, pending])

  const cmd = (c: Parameters<typeof window.api.chatProxyCmd>[0]): void => window.api.chatProxyCmd(c)

  const send = (): void => {
    const text = draft.trim()
    if (!text || blocked) return
    cmd({ kind: 'send', text })
    setDraft('') // the main window owns the run; the bubble comes back via the snapshot
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    // Enter sends, Shift+Enter inserts a newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const fill = (text: string): void => {
    setDraft(text)
    taRef.current?.focus()
  }

  const streaming = snap.streamRaw.slice(0, snap.streamShown)
  const showStream = busy && streaming.length > 0

  return (
    <div className="mini-chat no-drag">
      <div
        className="mini-chat-head"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          fontSize: 11,
          letterSpacing: 1,
          color: '#bde9ff',
          borderBottom: '1px solid var(--border)'
        }}
      >
        <Bot size={12} style={{ color: 'var(--accent)' }} />
        {ASSISTANT_TITLE}
      </div>
      <div className="mini-chat-body" ref={bodyRef}>
        {snap.bubbles.length === 0 && !showStream && !pending ? (
          <div className="mini-chat-empty">
            <Sparkles size={16} />
            <div>我是{ASSISTANT_TITLE} —— 找歌、控播放，说一句就行</div>
            <div className="mini-chat-suggestions">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className="chat-chip"
                  style={{ cursor: 'pointer' }}
                  onClick={() => fill(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {snap.bubbles.map((b) => (
              <div key={b.id}>
                {b.chips && b.chips.length > 0 && (
                  <div className="chat-chips">
                    {b.chips.map((c, i) => (
                      <span key={i} className="chat-chip">
                        {c}
                      </span>
                    ))}
                  </div>
                )}
                <div className={`chat-msg ${b.role === 'user' ? 'user' : 'ai'}`}>
                  {b.content || ' '}
                </div>
              </div>
            ))}

            {showStream && (
              <div>
                {snap.chips.length > 0 && (
                  <div className="chat-chips">
                    {snap.chips.map((c, i) => (
                      <span key={i} className="chat-chip">
                        {c}
                      </span>
                    ))}
                  </div>
                )}
                <div className="chat-msg ai">
                  {streaming}
                  {snap.streamShown < snap.streamRaw.length && <span className="caret" />}
                </div>
              </div>
            )}
          </>
        )}

        {pending && (
          <div
            className="chat-msg ai"
            style={{
              alignSelf: 'stretch',
              maxWidth: '100%',
              boxShadow:
                'inset 0 0 0 1px rgba(255, 95, 138, 0.35), 0 0 14px rgba(255, 95, 138, 0.12)'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontWeight: 600,
                color: '#ffb3c1'
              }}
            >
              <TriangleAlert size={13} />
              需要你确认的破坏性操作
            </div>
            <div style={{ marginTop: 5 }}>{pending.summary}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button
                className="btn primary"
                disabled={busy}
                onClick={() => cmd({ kind: 'confirm' })}
              >
                确认执行
              </button>
              <button className="btn" disabled={busy} onClick={() => cmd({ kind: 'cancel' })}>
                取消
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mini-chat-input">
        <textarea
          ref={taRef}
          rows={1}
          placeholder={
            pending
              ? '请先确认或取消上面的操作…'
              : busy
                ? 'AI 正在回复…'
                : 'Enter 发送 · Shift+Enter 换行'
          }
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {busy ? (
          <button
            className="mini-chat-send"
            title="停止生成"
            onClick={() => cmd({ kind: 'abort' })}
          >
            <Square size={13} fill="currentColor" />
          </button>
        ) : (
          <button
            className="mini-chat-send"
            title="发送"
            disabled={blocked || !draft.trim()}
            onClick={send}
          >
            <Send size={14} />
          </button>
        )}
        <button
          className="mini-chat-send ghost"
          title="清空对话"
          disabled={busy}
          onClick={() => cmd({ kind: 'clear' })}
        >
          <Bot size={13} />
        </button>
      </div>
    </div>
  )
}

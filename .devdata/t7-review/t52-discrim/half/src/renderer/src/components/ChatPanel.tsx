import { useEffect, useRef } from 'react'
import {
  AlertTriangle,
  Bot,
  ChevronDown,
  ChevronUp,
  Eraser,
  Send,
  Square,
  Sparkles
} from 'lucide-react'
import { useChatStore, type ChatBubble } from '../stores/chatStore'

/**
 * J: the panel title carries the assistant's name. It is deliberately a literal
 * here instead of an import of `ASSISTANT_NAME`, because this file may only
 * export components (`react-refresh/only-export-components`); the test suite
 * pins this copy against `ASSISTANT_NAME` in `tools.ts` so the two cannot drift.
 */
const ASSISTANT_TITLE = '薇拉 Vela'

/**
 * Empty-state prompts with the persona attached: casual discovery, an execution
 * command and a knowledge question. Clicking one only fills the textarea (it
 * never sends on its own), so the user can edit before sending.
 */
const SUGGESTIONS = [
  '放点适合雨天的歌',
  '把这首歌加进夜跑歌单',
  '这张专辑是什么风格？',
  '暂停，然后告诉我下一首是什么'
]

export function ChatPanel(): React.JSX.Element {
  const collapsed = useChatStore((s) => s.collapsed)
  const setCollapsed = useChatStore((s) => s.setCollapsed)
  const busy = useChatStore((s) => s.busy)
  const bubbles = useChatStore((s) => s.bubbles)
  const streamRaw = useChatStore((s) => s.streamRaw)
  const streamShown = useChatStore((s) => s.streamShown)
  const chips = useChatStore((s) => s.chips)
  const draft = useChatStore((s) => s.draft)
  const setDraft = useChatStore((s) => s.setDraft)
  const pendingConfirm = useChatStore((s) => s.pendingConfirm)

  const bodyRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = bodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [bubbles.length, streamRaw.length, collapsed, pendingConfirm])

  const send = (): void => {
    if (!busy && !pendingConfirm) void useChatStore.getState().send()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const streamingBubble = busy ? (
    <div key="streaming" className="anim-in">
      {chips.length > 0 && (
        <div className="chat-chips">
          {chips.map((c, i) => (
            <span key={i} className="chat-chip">
              {c}
            </span>
          ))}
        </div>
      )}
      {streamRaw && (
        <div className="chat-msg ai">
          {streamRaw.slice(0, streamShown)}
          {streamShown < streamRaw.length && <span className="caret" />}
        </div>
      )}
    </div>
  ) : null

  // 破坏性操作确认条：AI 的破坏性工具已暂停，等用户拍板（样式复用现有类 + 内联样式）
  const confirmBar = pendingConfirm ? (
    <div key="confirm" className="anim-in">
      <div
        className="chat-msg ai"
        style={{
          alignSelf: 'stretch',
          maxWidth: '100%',
          boxShadow: 'inset 0 0 0 1px rgba(255, 95, 138, 0.35), 0 0 14px rgba(255, 95, 138, 0.12)'
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
          <AlertTriangle size={14} />
          需要你确认的破坏性操作
        </div>
        <div style={{ marginTop: 6, color: 'var(--text)' }}>{pendingConfirm.summary}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button
            className="btn primary"
            disabled={busy}
            onClick={() => void useChatStore.getState().confirm()}
          >
            确认执行
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={() => void useChatStore.getState().cancel()}
          >
            取消
          </button>
        </div>
      </div>
      <div className="chat-chips" style={{ marginTop: 6 }}>
        <span className="chat-chip err">该操作尚未执行</span>
      </div>
    </div>
  ) : null

  return (
    <div className={`chat ${collapsed ? 'collapsed' : ''} ${busy ? 'chat-busy' : ''}`}>
      <div className="chat-head">
        <div className="chat-title">
          <span className="chat-status" />
          <Bot size={15} style={{ color: 'var(--accent)' }} />
          {ASSISTANT_TITLE}
        </div>
        <div className="chat-head-actions">
          {!collapsed && (
            <button
              className="tb-btn"
              title="清空对话"
              onClick={() => {
                if (useChatStore.getState().messages.length > 0) useChatStore.getState().clear()
              }}
            >
              <Eraser size={14} />
            </button>
          )}
          <button
            className="tb-btn"
            title={collapsed ? '展开聊天' : '收起聊天'}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="chat-body" ref={bodyRef}>
          {bubbles.length === 0 && !busy ? (
            <div className="chat-empty">
              <div>
                <Sparkles size={20} style={{ marginBottom: 8, color: 'var(--accent-purple)' }} />
                <div>
                  我是{ASSISTANT_TITLE}，你的音乐领航员 —— 用一句话指挥播放器，或随便聊聊音乐。
                </div>
                <div style={{ fontSize: 11, marginTop: 10 }}>试试：</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      className="chip-badge"
                      style={{ cursor: 'pointer', padding: '5px 12px' }}
                      onClick={() => {
                        setDraft(s)
                        taRef.current?.focus()
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {bubbles.map((m) => (
                <Bubble key={m.id} bubble={m} />
              ))}
              {streamingBubble}
              {confirmBar}
            </>
          )}
        </div>
      )}

      <div className="chat-input">
        <textarea
          ref={taRef}
          placeholder={
            pendingConfirm
              ? '请先确认或取消上面的操作…'
              : collapsed
                ? '输入指令或问题…（点击展开查看回复）'
                : '输入指令或问题，Enter 发送…'
          }
          value={draft}
          rows={collapsed ? 1 : 2}
          disabled={false}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {busy ? (
          <button
            className="chat-send"
            title="停止生成"
            onClick={() => useChatStore.getState().abort()}
          >
            <Square size={14} fill="currentColor" />
          </button>
        ) : (
          <button
            className="chat-send"
            title="发送"
            onClick={send}
            disabled={!!pendingConfirm || !draft.trim()}
          >
            <Send size={15} />
          </button>
        )}
      </div>
      {!collapsed && (
        <div className="chat-hint">
          Enter 发送 · Shift+Enter 换行 · {ASSISTANT_TITLE} 的指令会直接操控播放器
        </div>
      )}
    </div>
  )
}

function Bubble({ bubble }: { bubble: ChatBubble }): React.JSX.Element {
  return (
    <div className="anim-in">
      {bubble.chips && bubble.chips.length > 0 && (
        <div className="chat-chips">
          {bubble.chips.map((c, i) => (
            <span key={i} className="chat-chip">
              {c}
            </span>
          ))}
        </div>
      )}
      <div className={`chat-msg ${bubble.role === 'user' ? 'user' : 'ai'}`}>
        {bubble.content || ' '}
      </div>
    </div>
  )
}

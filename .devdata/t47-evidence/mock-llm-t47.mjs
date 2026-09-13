/**
 * t47 — minimal OpenAI-compatible mock gateway for the MINI-WINDOW verification.
 *
 * Why a new mock instead of `scripts/mock-llm-confirm.mjs`:
 *   that one only knows remove_from_playlist / recommend_music / search_music, so it
 *   cannot drive the play-control acceptance items (`control_player`, `set_volume`).
 *   This mock adds those routes and keeps the same SSE wire format the app parses.
 *
 * Routes by the LAST user message:
 *   暂停/继续/播放 → control_player {action:'pause'|'play'}
 *   下一曲/下一首/上一首 → control_player {action:'next'|'prev'}
 *   音量           → set_volume {percent:50}
 *   歌单 + 删掉/移除 → remove_from_playlist (destructive → app must confirm first)
 *   随机/来一首     → search_music (follow-up plays the first hit)
 *   anything else  → plain streaming text answer
 *
 * Usage: node .devdata/t47-evidence/mock-llm-t47.mjs [port]
 * Control: GET /__log   POST /__reset
 */
import { createServer } from 'http'

const port = Number(process.argv[2] ?? process.env.MOCK_T47_PORT ?? 9997)
const state = { seq: 0, requests: [], errors400: [] }

const sse = (res, chunks) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  })
  for (const c of chunks) res.write(`data: ${JSON.stringify(c)}\n\n`)
  res.write('data: [DONE]\n\n')
  res.end()
}

const textChunk = (t) => ({ choices: [{ delta: { content: t }, finish_reason: null }] })
const textDone = { choices: [{ delta: {}, finish_reason: 'stop' }] }
const callChunk = (id, name, args) => ({
  choices: [
    {
      delta: {
        tool_calls: [
          { index: 0, id, type: 'function', function: { name, arguments: JSON.stringify(args) } }
        ]
      },
      finish_reason: null
    }
  ]
})
const callDone = { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }

const toolsOf = (messages) =>
  messages.flatMap((m) => (m.tool_calls ?? []).map((tc) => tc.function?.name ?? tc.name))

function route(messages) {
  const last = messages[messages.length - 1]
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  const text = String(lastUser?.content ?? '')

  // after a tool result came back → finish the turn with plain text
  if (last?.role === 'tool') {
    const content = String(last.content ?? '')
    if (content.includes('"tracks"')) {
      const id = content.match(/"id":"([^"]+)"/)?.[1] ?? ''
      if (id) return [callChunk(`call_play_${state.seq}`, 'play_tracks', { ids: [id], start_index: 0 }), callDone]
    }
    return [textChunk('好的，已完成。'), textDone]
  }

  if (/暂停/.test(text)) return [callChunk(`call_pause_${state.seq}`, 'control_player', { action: 'pause' }), callDone]
  if (/继续播放|恢复播放|^播放$/.test(text))
    return [callChunk(`call_play_${state.seq}`, 'control_player', { action: 'play' }), callDone]
  if (/下一曲|下一首/.test(text))
    return [callChunk(`call_next_${state.seq}`, 'control_player', { action: 'next' }), callDone]
  if (/上一曲|上一首/.test(text))
    return [callChunk(`call_prev_${state.seq}`, 'control_player', { action: 'prev' }), callDone]
  if (/音量/.test(text)) return [callChunk(`call_vol_${state.seq}`, 'set_volume', { percent: 50 }), callDone]
  if (/歌单/.test(text) && /删掉|删除|移除|移出/.test(text)) {
    const ids = text.match(/\b([a-z0-9_-]{6,})\b/gi) ?? []
    return [
      callChunk(`call_rm_${state.seq}`, 'remove_from_playlist', { playlist: '夜跑', ids: ids.slice(0, 2) }),
      callDone
    ]
  }
  if (/随机|来一首|放首歌|推荐/.test(text))
    return [callChunk(`call_search_${state.seq}`, 'search_music', { query: '', limit: 3 }), callDone]

  return [
    textChunk(`我是 NEBULA 测试网关的第 ${state.seq} 轮回复。`),
    textChunk('已收到你的问题。'),
    textDone
  ]
}

createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/v1/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        object: 'list',
        data: ['deepseek-v4-flash', 'deepseek-v4-pro'].map((id) => ({ id, object: 'model' }))
      })
    )
    return
  }
  if (req.method === 'GET' && req.url === '/__log') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        requests: state.requests,
        errors400: state.errors400,
        tools: state.requests.flatMap((r) => r.tools)
      })
    )
    return
  }
  if (req.method === 'POST' && req.url === '/__reset') {
    state.requests.length = 0
    state.errors400.length = 0
    state.seq = 0
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end('{"ok":true}')
    return
  }
  if (req.method === 'POST' && req.url?.startsWith('/v1/chat/completions')) {
    let body = ''
    req.on('data', (d) => {
      body += d
    })
    req.on('end', () => {
      let payload
      try {
        payload = JSON.parse(body)
      } catch {
        state.errors400.push('unparseable body')
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'bad json' } }))
        return
      }
      const messages = payload.messages ?? []
      state.seq += 1
      const chunks = route(messages)
      state.requests.push({
        n: state.seq,
        stream: payload.stream !== false,
        model: payload.model,
        tools: toolsOf(messages),
        emitted: chunks.flatMap((c) => (c.choices?.[0]?.delta?.tool_calls ?? []).map((t) => t.function?.name)),
        lastUser: String([...messages].reverse().find((m) => m.role === 'user')?.content ?? '').slice(0, 120),
        messageCount: messages.length
      })
      // the app asks for a stream; answer the same way in both cases
      if (payload.stream === false) {
        const toolCalls = chunks.flatMap((c) => c.choices?.[0]?.delta?.tool_calls ?? [])
        const content = chunks
          .map((c) => c.choices?.[0]?.delta?.content ?? '')
          .join('')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content,
                  tool_calls: toolCalls.map((t) => ({
                    id: t.id,
                    type: 'function',
                    function: t.function
                  }))
                }
              }
            ]
          })
        )
        return
      }
      sse(res, chunks)
    })
    return
  }
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end('{"error":"not found"}')
}).listen(port, '127.0.0.1', () => {
  console.log(`t47 mock LLM on http://127.0.0.1:${port}/v1`)
})

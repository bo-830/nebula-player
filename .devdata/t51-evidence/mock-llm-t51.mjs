/**
 * t51 addendum — mock gateway with a MIXED round (text + tool call in the same
 * response) so the "seed restoration" boundary of `StreamHandle.next()` is testable.
 *
 * Route added for the addendum:
 *   user text contains 两段 → round 1 emits [text '第一段：', tool call get_player_state]
 *   after the tool result     → round 2 emits [text '第二段：结束。']
 * With the fix, the final assistant bubble must contain BOTH halves (the seed from
 * round 1 must survive into round 2's `await stream.next()`).
 *
 * Usage: node .devdata/t51-evidence/mock-llm-t51.mjs [port=9998]
 */
import { createServer } from 'http'

const port = Number(process.argv[2] ?? 9998)
const state = { seq: 0, requests: [], errors400: [], mixedRound: false }

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
const toolsOf = (ms) => ms.flatMap((m) => (m.tool_calls ?? []).map((tc) => tc.function?.name ?? tc.name))

function route(messages) {
  const last = messages[messages.length - 1]
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  const text = String(lastUser?.content ?? '')

  if (last?.role === 'tool') {
    // finish the mixed round: the seed '第一段：' must still be in the bubble
    if (state.mixedRound) {
      state.mixedRound = false
      return [textChunk('第二段：结束。'), textDone]
    }
    const content = String(last.content ?? '')
    if (content.includes('"tracks"')) {
      const id = content.match(/"id":"([^"]+)"/)?.[1] ?? ''
      if (id) return [callChunk(`call_play_${state.seq}`, 'play_tracks', { ids: [id], start_index: 0 }), callDone]
    }
    return [textChunk('好的，已完成。'), textDone]
  }

  if (/两段/.test(text)) {
    state.mixedRound = true
    return [textChunk('第一段：'), callChunk(`call_state_${state.seq}`, 'get_player_state', {}), callDone]
  }
  if (/暂停/.test(text)) return [callChunk(`call_pause_${state.seq}`, 'control_player', { action: 'pause' }), callDone]
  if (/下一曲|下一首/.test(text))
    return [callChunk(`call_next_${state.seq}`, 'control_player', { action: 'next' }), callDone]
  if (/音量/.test(text)) return [callChunk(`call_vol_${state.seq}`, 'set_volume', { percent: 50 }), callDone]
  if (/歌单/.test(text) && /删掉|删除|移除|移出/.test(text)) {
    const ids = text.match(/\b([a-z0-9_-]{6,})\b/gi) ?? []
    return [
      callChunk(`call_rm_${state.seq}`, 'remove_from_playlist', { playlist: '夜跑', ids: ids.slice(0, 2) }),
      callDone
    ]
  }
  return [
    textChunk(`我是 NEBULA 测试网关的第 ${state.seq} 轮回复。`),
    textChunk('已收到你的问题。'),
    textDone
  ]
}

createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/v1/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ object: 'list', data: [{ id: 'deepseek-v4-flash', object: 'model' }] }))
    return
  }
  if (req.method === 'GET' && req.url === '/__log') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ requests: state.requests, errors400: state.errors400, mixedRoundPending: state.mixedRound }))
    return
  }
  if (req.method === 'POST' && req.url === '/__reset') {
    state.requests.length = 0
    state.errors400.length = 0
    state.seq = 0
    state.mixedRound = false
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
        state.errors400.push('bad json')
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end('{"error":{"message":"bad json"}}')
        return
      }
      const messages = payload.messages ?? []
      state.seq += 1
      const chunks = route(messages)
      state.requests.push({
        n: state.seq,
        tools: toolsOf(messages),
        emitted: chunks.flatMap((c) => (c.choices?.[0]?.delta?.tool_calls ?? []).map((t) => t.function?.name)),
        emittedText: chunks.map((c) => c.choices?.[0]?.delta?.content ?? '').join(''),
        lastUser: String([...messages].reverse().find((m) => m.role === 'user')?.content ?? '').slice(0, 120),
        messageCount: messages.length
      })
      sse(res, chunks)
    })
    return
  }
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end('{"error":"not found"}')
}).listen(port, '127.0.0.1', () => {
  console.log(`t51 addendum mock on http://127.0.0.1:${port}/v1`)
})

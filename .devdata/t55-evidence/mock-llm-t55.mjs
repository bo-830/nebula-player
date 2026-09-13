/**
 * t55 — mock OpenAI-compatible gateway for the 薇拉 Vela persona verification.
 *
 * Two jobs:
 *  1. drive the runtime flows the acceptance needs (exec-class tool call, chat
 *     class text, destructive confirm chain, failure path);
 *  2. capture the REQUEST BODIES IN FULL — including the whole `system` message
 *     — so the verification can prove the persona prompt really travels on the
 *     wire at runtime (a static read of tools.ts cannot prove that).
 *
 * PROVENANCE WARNING (must survive into the report): every assistant text below
 * is authored by THIS SCRIPT, not by a model. Runtime proof that the app *sends*
 * the persona prompt is real; runtime proof that a model *obeys* it is not
 * available in this environment and is reported as un-verified.
 *
 * Usage: node .devdata/t55-evidence/mock-llm-t55.mjs [port] [wireFile]
 * Control: GET /__log   POST /__reset
 */
import { createServer } from 'http'
import { appendFileSync, writeFileSync } from 'fs'

const port = Number(process.argv[2] ?? 9997)
const wireFile = process.argv[3] ?? '.devdata/t55-evidence/t55-wire-requests.jsonl'
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

/**
 * Gateway-authored sample texts. WARM is what a persona-compliant model *would*
 * be asked to produce; OVER deliberately breaks the ≤2 emoji cap so the run can
 * show whether ANY app-side clamp exists (it does not — the cap is prompt-only).
 */
const EXEC_CLOSE = '已暂停。'
const WARM = '雨天适合听慢一点的，鼓点轻、留白多，像窗上那层水汽。先试试《雨夜行》，嫌闷我再换清亮的 🌧️🎧'
const OVER = '当然可以呀～这种天气最适合窝着听歌了！我一放音乐整个人都软下来 ✨🌈🎶💫🌙'

function route(messages) {
  const last = messages[messages.length - 1]
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  const text = String(lastUser?.content ?? '')

  // after a tool result → finish the turn
  if (last?.role === 'tool') {
    const content = String(last.content ?? '')
    if (/pause|暂停/.test(content)) return [textChunk(EXEC_CLOSE), textDone]
    if (content.includes('用户已取消')) return [textChunk('已取消，歌单没有改动。'), textDone]
    return [textChunk('已完成。'), textDone]
  }

  if (/暂停/.test(text)) {
    return [callChunk(`call_pause_${state.seq}`, 'control_player', { action: 'pause' }), callDone]
  }
  if (/歌单/.test(text) && /删掉|删除|移除|移出/.test(text)) {
    const ids = text.match(/\b([a-z0-9_-]{6,})\b/gi) ?? []
    return [
      callChunk(`call_rm_${state.seq}`, 'remove_from_playlist', {
        playlist: '夜跑',
        ids: ids.slice(0, 2)
      }),
      callDone
    ]
  }
  if (/OVERCAP/.test(text)) return [textChunk(OVER), textDone]
  if (/推荐|雨天|闲聊|聊聊|风格/.test(text)) return [textChunk(WARM), textDone]
  return [textChunk('已收到。'), textDone]
}

createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/v1/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        object: 'list',
        data: ['deepseek-v4-flash', 'deepseek-v4-pro'].map((id) => ({
          id,
          object: 'model',
          owned_by: 't55-mock'
        }))
      })
    )
    return
  }
  if (req.method === 'GET' && req.url === '/__log') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ requests: state.requests, errors400: state.errors400 }))
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
      // FULL bodies, no truncation — this is the wire capture
      const record = {
        n: state.seq,
        model: payload.model,
        stream: payload.stream !== false,
        at: new Date().toISOString(),
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
          tool_calls: m.tool_calls,
          tool_call_id: m.tool_call_id
        })),
        emitted: chunks.flatMap((c) =>
          (c.choices?.[0]?.delta?.tool_calls ?? []).map((t) => t.function?.name)
        )
      }
      state.requests.push(record)
      try {
        appendFileSync(wireFile, JSON.stringify(record) + '\n', 'utf8')
      } catch {
        /* capture is best-effort */
      }
      writeFileSync(wireFile.replace(/\.jsonl$/, '.state.json'), JSON.stringify(state, null, 2), 'utf8')

      const asJson = () => {
        const toolCalls = chunks.flatMap((c) => c.choices?.[0]?.delta?.tool_calls ?? [])
        const content = chunks.map((c) => c.choices?.[0]?.delta?.content ?? '').join('')
        return JSON.stringify({
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
              },
              finish_reason: chunks.some(
                (c) => c.choices?.[0]?.finish_reason === 'tool_calls'
              )
                ? 'tool_calls'
                : 'stop'
            }
          ]
        })
      }
      if (payload.stream === false) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(asJson())
        return
      }
      sse(res, chunks)
    })
    return
  }
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end('{"error":"not found"}')
}).listen(port, '127.0.0.1', () => {
  console.log(`t55 mock LLM on http://127.0.0.1:${port}/v1 (wire ${wireFile})`)
})

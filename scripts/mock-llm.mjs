/**
 * Mock OpenAI-compatible server for E2E testing of the AI pipeline.
 * GET /v1/models       → ok
 * POST /v1/chat/completions → if last message role==='tool' → final text
 *                             else → tool_calls (search_music)
 * Usage: node scripts/mock-llm.mjs [port]
 */
import { createServer } from 'http'

const port = Number(process.argv[2] ?? 9999)

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

const toolCallChunk = {
  choices: [
    {
      delta: {
        tool_calls: [
          {
            index: 0,
            id: 'call_mock_1',
            type: 'function',
            function: {
              name: 'search_music',
              arguments: '{"query":"歌","limit":3}'
            }
          }
        ]
      },
      finish_reason: null
    }
  ]
}
const toolCallDone = { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }
const textChunk = (t) => ({ choices: [{ delta: { content: t }, finish_reason: null }] })
const textDone = { choices: [{ delta: {}, finish_reason: 'stop' }] }

const SUPPORTED = ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp']

createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/v1/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        object: 'list',
        data: SUPPORTED.map((id) => ({ id }))
      })
    )
    return
  }
  if (req.method === 'POST' && req.url === '/v1/chat/completions') {
    let body = ''
    req.on('data', (d) => (body += d))
    req.on('end', () => {
      const json = JSON.parse(body || '{}')
      const messages = json.messages ?? []
      const last = messages[messages.length - 1]
      // validate the model id — mimic a gateway 400 for unsupported model
      const model = json.model ?? ''
      if (!SUPPORTED.includes(model)) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            error: {
              message: `The supported API model names are ${SUPPORTED.join(', ')}, but you passed ${model}.`
            }
          })
        )
        return
      }
      // strict tool-sequence validation (mimics OpenAI/DeepSeek)
      const msgs = json.messages ?? []
      const toolIds = new Set()
      let lastAssistantCalls = []
      for (const m of msgs) {
        if (m.role === 'assistant' && m.tool_calls) lastAssistantCalls = m.tool_calls
        if (m.role === 'tool') {
          if (!lastAssistantCalls.some((tc) => tc.id === m.tool_call_id)) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(
              JSON.stringify({
                error: { message: `Messages with role 'tool' must be a response to a preceding message with 'tool_calls'` }
              })
            )
            return
          }
          void toolIds
        }
      }
      try {
        const lastUser = [...messages].reverse().find((m) => m.role === 'user')
        const wantsRecommend = String(lastUser?.content ?? '').includes('推荐')
        if (last?.role === 'tool') {
          const content = String(last.content ?? '')
          if (content.includes('"tracks"')) {
            // search result → now ask the app to play the first match
            let id = 'unknown'
            try {
              const parsed = JSON.parse(content)
              id = parsed.tracks?.[0]?.id ?? 'unknown'
            } catch {
              // ignore
            }
            const playCall = {
              choices: [
                {
                  delta: {
                    tool_calls: [
                      {
                        index: 0,
                        id: 'call_mock_play',
                        type: 'function',
                        function: { name: 'play_tracks', arguments: JSON.stringify({ ids: [id], start_index: 0 }) }
                      }
                    ]
                  },
                  finish_reason: null
                }
              ]
            }
            sse(res, [playCall, toolCallDone])
          } else if (content.includes('"recommendations"')) {
            sse(res, [textChunk('根据你的口味，我最推荐以下几首（理由见列表）。'), textDone])
          } else {
            sse(res, [textChunk('好的，已经开始播放了。'), textDone])
          }
        } else if (wantsRecommend) {
          const recCall = {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_mock_rec',
                      type: 'function',
                      function: { name: 'recommend_music', arguments: JSON.stringify({ limit: 5 }) }
                    }
                  ]
                },
                finish_reason: null
              }
            ]
          }
          sse(res, [recCall, toolCallDone])
        } else {
          sse(res, [toolCallChunk, toolCallDone])
        }
      } catch (err) {
        res.writeHead(500)
        res.end(String(err))
      }
    })
    return
  }
  res.writeHead(404)
  res.end('not found')
}).listen(port, '127.0.0.1', () => {
  console.log(`mock LLM listening on http://127.0.0.1:${port}/v1`)
})

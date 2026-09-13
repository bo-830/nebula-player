/**
 * t57 — drip-capable mock gateway for the H1 probe.
 *
 * Emits ONE answer as THREE SSE deltas separated by a configurable gap, so the
 * typewriter's reveal cursor can catch up between deltas (that is the condition
 * reviewer's H1 needs: chunk guard + closeStream() on catch-up).
 *
 *   POST /__gap?ms=300   set the inter-segment gap (0 = single burst)
 *   POST /__reset        clear the request log
 *   GET  /__log          { requests: [...] }  with per-delta write timestamps
 *
 * Usage: node .devdata/t57-evidence/mock-llm-t57.mjs [port=9999]
 */
import { createServer } from 'http'

const port = Number(process.argv[2] ?? 9999)
const SEGMENTS = ['第一段滴注内容。', '第二段滴注内容。', '第三段滴注内容。']
const state = { gapMs: 300, seq: 0, requests: [], errors400: [] }

const sseHead = (res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  })
}
const textChunk = (t) => ({ choices: [{ delta: { content: t }, finish_reason: null }] })
const textDone = { choices: [{ delta: {}, finish_reason: 'stop' }] }
const writeChunk = (res, chunk) => res.write(`data: ${JSON.stringify(chunk)}\n\n`)

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)

  if (req.method === 'GET' && url.pathname === '/v1/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ object: 'list', data: [{ id: 'deepseek-v4-flash', object: 'model' }] }))
    return
  }
  if (req.method === 'POST' && url.pathname === '/__gap') {
    state.gapMs = Number(url.searchParams.get('ms') ?? 0)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ gapMs: state.gapMs }))
    return
  }
  if (req.method === 'POST' && url.pathname === '/__reset') {
    state.requests.length = 0
    state.errors400.length = 0
    state.seq = 0
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end('{"ok":true}')
    return
  }
  if (req.method === 'GET' && url.pathname === '/__log') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ gapMs: state.gapMs, requests: state.requests, errors400: state.errors400 }))
    return
  }
  if (req.method === 'POST' && url.pathname.startsWith('/v1/chat/completions')) {
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
      const lastUser = String([...messages].reverse().find((m) => m.role === 'user')?.content ?? '')
      state.seq += 1
      const rec = {
        n: state.seq,
        gapMs: state.gapMs,
        lastUser: lastUser.slice(0, 100),
        expectedText: SEGMENTS.join(''),
        segments: SEGMENTS,
        deltaWrittenAtMs: [],
        finishedAtMs: null
      }
      state.requests.push(rec)

      const t0 = Date.now()
      sseHead(res)
      const send = (i) => {
        writeChunk(res, textChunk(SEGMENTS[i]))
        rec.deltaWrittenAtMs.push(Date.now() - t0)
        if (i === SEGMENTS.length - 1) {
          writeChunk(res, textDone)
          res.write('data: [DONE]\n\n')
          res.end()
          rec.finishedAtMs = Date.now() - t0
          return
        }
        setTimeout(() => send(i + 1), Math.max(0, state.gapMs))
      }
      send(0)
    })
    return
  }
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end('{"error":"not found"}')
}).listen(port, '127.0.0.1', () => {
  console.log(`t57 drip mock on http://127.0.0.1:${port}/v1 (gap=${state.gapMs}ms, ${SEGMENTS.length} segments)`)
})

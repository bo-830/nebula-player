/**
 * t59 — mock gateway: sequence-tagged segments (so consecutive rounds are distinguishable)
 * with a configurable inter-segment gap.
 *
 *   POST /__gap?ms=100   inter-segment gap (0 = single burst)
 *   POST /__reset        reset the request log
 *   GET  /__log          { requests: [...] } incl. per-segment write times
 *
 * Usage: node .devdata/t59-evidence/mock-llm-t59.mjs [port=9999]
 */
import { createServer } from 'http'

const port = Number(process.argv[2] ?? 9999)
const state = { gapMs: 0, seq: 0, requests: [], errors400: [] }
const sseHead = (res) =>
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  })
const textChunk = (t) => ({ choices: [{ delta: { content: t }, finish_reason: null }] })
const textDone = { choices: [{ delta: {}, finish_reason: 'stop' }] }

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
      // tool round? keep the tool chain working: pause/next/volume/remove
      const removeIds = (lastUser.match(/\b([a-z0-9_-]{6,})\b/gi) ?? []).slice(0, 2)
      const tool = /暂停/.test(lastUser)
        ? { name: 'control_player', args: { action: 'pause' } }
        : /下一曲/.test(lastUser)
          ? { name: 'control_player', args: { action: 'next' } }
          : /歌单/.test(lastUser) && /删掉|移除/.test(lastUser)
            ? { name: 'remove_from_playlist', args: { playlist: '夜跑', ids: removeIds } }
            : null
      const isToolRound = !!tool
      const tag = `第${state.seq}轮`
      const segments = isToolRound ? [tag] : [`${tag}-甲段。`, `${tag}-乙段。`, `${tag}-丙段。`]
      const rec = {
        n: state.seq,
        gapMs: state.gapMs,
        lastUser: lastUser.slice(0, 80),
        segments,
        expectedText: segments.join(''),
        tool: tool ? tool.name : null,
        deltaWrittenAtMs: [],
        finishedAtMs: null
      }
      state.requests.push(rec)
      const t0 = Date.now()
      sseHead(res)
      if (isToolRound) {
        res.write(
          `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: `call_${state.seq}`, type: 'function', function: { name: tool.name, arguments: JSON.stringify(tool.args) } }] }, finish_reason: null }] })}\n\n`
        )
        res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] })}\n\n`)
        res.write('data: [DONE]\n\n')
        rec.finishedAtMs = Date.now() - t0
        res.end()
        return
      }
      const send = (i) => {
        res.write(`data: ${JSON.stringify(textChunk(segments[i]))}\n\n`)
        rec.deltaWrittenAtMs.push(Date.now() - t0)
        if (i === segments.length - 1) {
          res.write(`data: ${JSON.stringify(textDone)}\n\n`)
          res.write('data: [DONE]\n\n')
          rec.finishedAtMs = Date.now() - t0
          res.end()
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
}).listen(port, '127.0.0.1', () => console.log(`t59 mock on http://127.0.0.1:${port}/v1`))

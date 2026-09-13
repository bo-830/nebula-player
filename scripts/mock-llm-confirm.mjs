/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS E2E probe (not shipped TS source); the rule targets typed TS modules.
 * If eslint.config.mjs later scopes this rule away from scripts/**, this
 * directive becomes redundant and can be deleted. */
/**
 * t6/t17 — mock OpenAI-compatible gateway for the destructive-confirmation E2E
 * probe.
 *
 * Unlike the generic scripts/mock-llm.mjs this one:
 *   - can emit a DESTRUCTIVE tool call (`remove_from_playlist`),
 *   - can emit a MULTI-CALL round where the destructive call is NOT last
 *     (`search_music → remove_from_playlist → create_playlist`) — the exact
 *     shape that makes F2 observable,
 *   - validates the tool sequence like a real gateway: every `tool_call_id` of
 *     every assistant round must be answered exactly once, in order, and no new
 *     round may start while an older one is still unanswered (F2 → HTTP 400),
 *   - records every request, every 400 and a compact transcript so a probe can
 *     assert "0 x 400" / "one tool message per tool_call_id".
 *
 * Usage: node scripts/mock-llm-confirm.mjs [port] [logfile]
 *   GET  /__log   → JSON { requests, errors400, transcript }
 *   POST /__reset → clears the log
 *   --selftest    → run the synthetic sequence checks and exit (no server, no
 *                   dev instance, no port binding needed)
 *
 * Triggering the multi-call scenario (used by scripts/verify-ai-confirm.mjs):
 *   - user text contains 「多步」/「连锁」/「批量」(e.g. 多步删除测试), or
 *   - env MOCK_LLM_CONFIRM_MULTI=1 forces it for every destructive request.
 * Legacy single-call behaviour is unchanged; it is still the default.
 *
 * Exported helpers: validateSequence, multiCallRound, MULTI_CALL_INTENT_RE.
 */
import { createServer } from 'http'
import { writeFile } from 'fs/promises'
import { fileURLToPath, pathToFileURL } from 'url'

const SELFTEST = process.argv.includes('--selftest')
const port = Number(process.argv[2] ?? 9998)
const logFile = process.argv[3] ?? ''

const SUPPORTED = ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp']

const state = { requests: [], errors400: [], transcript: [], seq: 0 }

const json400 = (res, message) => {
  state.errors400.push(message)
  res.writeHead(400, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: { message } }))
}

/** ids of the tool calls carried by one assistant message */
function toolCallIds(m) {
  return (m.tool_calls ?? []).map((tc) => tc.id)
}

/**
 * Gateway-style tool-sequence validation. Returns an error string (→ HTTP 400)
 * or null when the transcript is acceptable.
 *
 * Rules (all enforced, none weakened):
 *   R1 every assistant round that is followed by another message must have ALL
 *      of its tool_call_ids answered — the F2 guard: a round parked after the
 *      first `needsConfirm` leaves the remaining ids unanswered, and the next
 *      request is then rejected;
 *   R2 a `tool` message must answer a call of the immediately preceding
 *      assistant round (stray tool messages → 400);
 *   R3 a `tool_call_id` may be answered at most once.
 */
export function validateSequence(messages) {
  const answered = new Set()
  /** ids of the currently open assistant round (null = no open round) */
  let openRound = null
  /** assistant rounds that still have unanswered ids, in order */
  let unanswered = null

  for (const m of messages) {
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      // a new assistant round supersedes the previous one: by now R1 must hold
      if (unanswered) {
        return `assistant message with tool_calls arrived while a previous round was not fully answered (missing tool response for tool_call_id=${unanswered.missing.join(', ')})`
      }
      answered.clear()
      openRound = toolCallIds(m)
      unanswered = { ids: openRound.slice(), answered: [], missing: openRound.slice() }
      continue
    }

    if (m.role === 'tool') {
      const id = m.tool_call_id
      if (!openRound || !openRound.includes(id)) {
        return `Messages with role 'tool' must be a response to a preceding message with 'tool_calls' (tool_call_id=${id})`
      }
      if (answered.has(id)) return `duplicate tool message for tool_call_id=${id}`
      answered.add(id)
      unanswered.answered.push(id)
      unanswered.missing = unanswered.ids.filter((x) => !answered.has(x))
      if (unanswered.missing.length === 0) unanswered = null // R1 satisfied for this round
    }
  }

  // a trailing user message (or the end of the transcript) closes the open round
  if (unanswered) {
    return `every tool_call_id must have a matching 'tool' response (missing tool response for tool_call_id=${unanswered.missing.join(', ')})`
  }
  return null
}

/** multi-call round: search_music → remove_from_playlist → create_playlist
 *  the destructive call is deliberately NOT last, so a store that parks on the
 *  first needsConfirm leaves `call_rm`/`call_pl` without a tool response. */
export function multiCallRound(seq, ids = ['t1', 't2']) {
  return [
    {
      id: `call_search_${seq}`,
      name: 'search_music',
      args: { query: '夜跑', limit: 3 }
    },
    {
      id: `call_rm_${seq}`,
      name: 'remove_from_playlist',
      args: { playlist: '夜跑', ids: ids.slice(0, 2) }
    },
    {
      id: `call_pl_${seq}`,
      name: 'create_playlist',
      args: { name: '晨跑' }
    }
  ]
}

const MULTI_CALL_INTENT_RE = /多步|连锁|批量/

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

/** one SSE payload for the whole multi-call round (index must ascend: the
 *  client accumulates deltas keyed by `index`) */
function multiCallChunks(toolCalls) {
  return [
    {
      choices: [
        {
          delta: {
            tool_calls: toolCalls.map((tc, index) => ({
              index,
              id: tc.id,
              type: 'function',
              function: { name: tc.name, arguments: JSON.stringify(tc.args) }
            }))
          },
          finish_reason: null
        }
      ]
    },
    callDone
  ]
}

/** the answer to give after a `tool` result came back */
function followUpChunks(content) {
  if (content.includes('"tracks"')) {
    const id = content.match(/"id":"([^"]+)"/)?.[1] ?? ''
    return [callChunk(`call_play_${state.seq}`, 'play_tracks', { ids: [id], start_index: 0 }), callDone]
  }
  if (content.includes('"recommendations"')) {
    return [textChunk('根据你的口味，我最推荐这几首。'), textDone]
  }
  if (content.includes('用户已取消')) {
    return [textChunk('好的，已取消，没有改动任何歌单。'), textDone]
  }
  if (content.includes('等待用户确认')) {
    // gateways never see this tool result in practice; answer defensively
    return [textChunk('这项操作需要你在聊天框确认。'), textDone]
  }
  return [textChunk('好的，操作已完成。'), textDone]
}

function startServer() {
  createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/v1/models') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ object: 'list', data: SUPPORTED.map((id) => ({ id })) }))
      return
    }
    if (req.method === 'GET' && req.url === '/__log') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(state))
      if (logFile) void writeFile(logFile, JSON.stringify(state, null, 2), 'utf8')
      return
    }
    if (req.method === 'POST' && req.url === '/__reset') {
      state.requests.length = 0
      state.errors400.length = 0
      state.transcript.length = 0
      state.seq = 0
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{"ok":true}')
      return
    }
    if (req.method === 'POST' && req.url === '/v1/chat/completions') {
      let body = ''
      req.on('data', (d) => (body += d))
      req.on('end', () => {
        const json = JSON.parse(body || '{}')
        const messages = json.messages ?? []
        const model = json.model ?? ''
        if (!SUPPORTED.includes(model)) {
          json400(
            res,
            `The supported API model names are ${SUPPORTED.join(', ')}, but you passed ${model}.`
          )
          return
        }
        state.seq++
        state.requests.push({
          n: state.seq,
          messages: messages.map((m) => ({
            role: m.role,
            content: typeof m.content === 'string' ? m.content.slice(0, 400) : m.content,
            tool_calls: m.tool_calls?.map((tc) => ({
              id: tc.id,
              name: tc.function?.name,
              args: tc.function?.arguments
            })),
            tool_call_id: m.tool_call_id
          }))
        })
        const bad = validateSequence(messages)
        if (bad) {
          json400(res, bad)
          return
        }

        const last = messages[messages.length - 1]
        const lastUser = [...messages].reverse().find((m) => m.role === 'user')
        const userText = String(lastUser?.content ?? '')
        const multiIntent = MULTI_CALL_INTENT_RE.test(userText) || process.env.MOCK_LLM_CONFIRM_MULTI === '1'

        if (last?.role === 'tool') {
          const content = String(last.content ?? '')
          sse(res, followUpChunks(content))
          return
        }

        // destructive intent → single call, or the multi-call F2 shape
        if (/移出|移除|删掉|删除/.test(userText) && /歌单/.test(userText)) {
          if (multiIntent) {
            const ids = userText.match(/\b([a-z0-9_-]{6,})\b/gi) ?? ['t1', 't2']
            const round = multiCallRound(state.seq, ids)
            sse(res, multiCallChunks(round))
            return
          }
          const ids = userText.match(/\b([a-z0-9_-]{6,})\b/gi) ?? []
          sse(res, [
            callChunk(`call_rm_${state.seq}`, 'remove_from_playlist', {
              playlist: '夜跑',
              ids: ids.slice(0, 2)
            }),
            callDone
          ])
          return
        }
        if (userText.includes('推荐')) {
          sse(res, [callChunk(`call_rec_${state.seq}`, 'recommend_music', { limit: 3 }), callDone])
          return
        }
        // default: a harmless search chain
        sse(res, [
          callChunk(`call_search_${state.seq}`, 'search_music', { query: '歌', limit: 3 }),
          callDone
        ])
      })
      return
    }
    res.writeHead(404)
    res.end('not found')
  }).listen(port, '127.0.0.1', () => {
    console.log(
      `confirm-mock LLM listening on http://127.0.0.1:${port}/v1 (log ${logFile || 'in-memory'})`
    )
  })
}

// ---------------------------------------------------------------- selftest --

const asstCall = (id, name) => ({
  role: 'assistant',
  content: '',
  tool_calls: [{ id, type: 'function', function: { name, arguments: '{}' } }]
})
const asstCalls = (...calls) => ({
  role: 'assistant',
  content: '',
  tool_calls: calls.map(([id, name]) => ({
    id,
    type: 'function',
    function: { name, arguments: '{}' }
  }))
})
const toolMsg = (id, content = 'ok') => ({ role: 'tool', tool_call_id: id, content })
const userMsg = (content) => ({ role: 'user', content })

/** single-call round that is correctly answered */
const goodSingle = [userMsg('找一首歌'), asstCall('c1', 'search_music'), toolMsg('c1')]
/** F2: multi-call round parked after the first needsConfirm */
const multiParked = [
  userMsg('多步删除测试'),
  asstCalls(['call_search', 'search_music'], ['call_rm', 'remove_from_playlist'], ['call_pl', 'create_playlist']),
  toolMsg('call_search')
]
/** the same round after the fix: every id answered */
const multiComplete = [
  ...multiParked,
  toolMsg('call_rm'),
  toolMsg('call_pl')
]

function runSelftest() {
  // the multi-call round must really carry the destructive call in the middle
  const round = multiCallRound(7, ['t1', 't2'])
  const names = round.map((c) => c.name)
  const destructIndex = names.indexOf('remove_from_playlist')
  const roundShape =
    round.length === 3 &&
    names[0] === 'search_music' &&
    destructIndex === 1 &&
    names[2] === 'create_playlist' &&
    round.every((c, i) => c.id.endsWith('_7') || i === 0) &&
    JSON.parse(round[1].args ? JSON.stringify(round[1].args) : '{}').playlist === '夜跑' &&
    round[2].args.name === '晨跑'

  // ...and must survive a client that accumulates deltas keyed by `index`
  const chunks = multiCallChunks(round)
  const accumulated = []
  for (const c of chunks) {
    for (const tc of c.choices?.[0]?.delta?.tool_calls ?? []) {
      accumulated[tc.index] = { id: tc.id, name: tc.function.name }
    }
  }
  const roundRoundTrips =
    accumulated.length === 3 &&
    accumulated[0].id === round[0].id &&
    accumulated[1].name === 'remove_from_playlist' &&
    accumulated[2].id === round[2].id

  const cases = [
    { label: '合法：单调用轮，tool 已回复', expected: null, messages: goodSingle },
    { label: '合法：一轮多调用，全部 tool_call_id 都已回复（修复后）', expected: null, messages: multiComplete },
    {
      label: '合法：answer 之后接新的一轮 user 提问',
      expected: null,
      messages: [...multiComplete, userMsg('再找一首')]
    },
    {
      label: '合法：一轮多调用，全部回复后 assistant 再发新一轮',
      expected: null,
      messages: [...multiComplete, asstCall('c2', 'play_tracks'), toolMsg('c2')]
    },
    { label: '违规-F2：多调用轮缺 tool 回复（parked after needsConfirm）', expected: '400', messages: multiParked },
    {
      label: '违规-F2：只回复了最后一个 id，中间 id 仍缺失',
      expected: '400',
      messages: [multiParked[0], multiParked[1], toolMsg('call_search'), toolMsg('call_pl')]
    },
    { label: '违规：tool_call_id 重复回复', expected: '400', messages: [...goodSingle, toolMsg('c1')] },
    { label: '违规：stray tool 无对应 tool_calls', expected: '400', messages: [userMsg('x'), toolMsg('ghost')] },
    {
      label: '违规：上一轮未答完就开新一轮 assistant',
      expected: '400',
      messages: [...multiParked, asstCall('c_other', 'search_music'), toolMsg('c_other')]
    }
  ]

  const results = cases.map((c) => {
    const error = validateSequence(c.messages)
    const got = error ? '400' : 'ok'
    const want = c.expected ?? 'ok'
    return { label: c.label, expected: want, got, pass: got === want, error }
  })

  const structure = [
    { label: '多调用场景：3 个调用且破坏性调用不在末位', pass: roundShape, error: roundShape ? null : `names=${names.join('→')}` },
    { label: '多调用场景：SSE 分片可被 index 累加还原', pass: roundRoundTrips, error: roundRoundTrips ? null : JSON.stringify(accumulated) }
  ]

  const checks = [...structure, ...results]
  const failed = checks.filter((c) => !c.pass)

  console.log('mock-llm-confirm --selftest (no dev instance required)')
  console.log(`multi-call round: ${names.join(' → ')}  (destructive index ${destructIndex})`)
  console.log('')
  for (const c of checks) {
    console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.label}`)
    if (!c.pass)
      console.log(
        `          got=${c.got ?? 'n/a'} expected=${c.expected ?? 'structure'} error=${c.error ?? ''}`
      )
  }
  console.log('')
  console.log(
    `${failed.length === 0 ? 'OK' : 'FAILED'} — ${checks.length - failed.length}/${checks.length} checks passed`
  )
  if (failed.length) process.exitCode = 1
}

if (SELFTEST) {
  runSelftest()
} else {
  const invokedDirectly =
    process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href
  if (invokedDirectly) {
    startServer()
  } else {
    console.log(
      `mock-llm-confirm imported as a module (${fileURLToPath(import.meta.url)}); server not started`
    )
  }
}

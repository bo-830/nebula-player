/**
 * t54 (J / 薇拉 Vela) mutation check.
 *
 * Discriminative evidence: for every required piece of the persona (the name and
 * each of the four rules, plus the blunt destructive summary) the test suite
 * must go RED when that piece is removed or weakened. Every mutation is
 * restored byte-identically afterwards (sha256 compared) and residue is
 * checked, so no mutated code can leak into the final tree.
 *
 * Usage: node .devdata/t54-evidence/mutation-check.mjs
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const TOOLS = 'src/renderer/src/lib/tools.ts'
const TEST = 'src/renderer/src/lib/__tests__/chatConfirm.test.ts'
const sha = (buf) => createHash('sha256').update(buf).digest('hex')

const originalTools = readFileSync(TOOLS, 'utf8')
const originalTest = readFileSync(TEST, 'utf8')
const baseTools = sha(originalTools)
const baseTest = sha(originalTest)
console.log(`baseline tools.ts   sha256=${baseTools.slice(0, 16)} (${originalTools.length} B)`)
console.log(`baseline test file  sha256=${baseTest.slice(0, 16)} (${originalTest.length} B)\n`)

/** run the persona/prompt suites; returns true when they FAIL (mutation caught) */
function runTests() {
  const res = spawnSync(
    'npx.cmd',
    ['vitest', 'run', 'src/renderer/src/lib/__tests__/chatConfirm.test.ts'],
    { cwd: process.cwd(), shell: true, encoding: 'utf8' }
  )
  const out = `${res.stdout ?? ''}${res.stderr ?? ''}`
  const m = /Tests\s+(\d+) failed \| (\d+) passed/.exec(out)
  const allPassed = /Tests\s+(\d+) passed \((\d+)\)/.exec(out)
  return {
    exit: res.status,
    detail: m ? `${m[1]} failed | ${m[2]} passed` : allPassed ? `${allPassed[1]} passed` : 'no summary',
    failedLines: out
      .split('\n')
      .filter((l) => l.includes('FAIL ') || l.includes('AssertionError'))
      .slice(0, 2)
  }
}

const mutations = [
  {
    id: 'M1-name',
    what: 'prompt no longer names the assistant',
    file: 'tools',
    find: '你是「${ASSISTANT_NAME}」',
    replace: '你是「音乐助手」'
  },
  {
    id: 'M2-rule-exec',
    what: 'rule ① (one-sentence exec reply) removed',
    file: 'tools',
    find: '执行类指令只回一句结果：先给结论，不寒暄',
    replace: '回复可以随意展开'
  },
  {
    id: 'M3-rule-casual',
    what: 'rule ② (warm casual tone + emoji allowance) removed',
    file: 'tools',
    find: '可以卖萌、可以用 emoji（仅此类回复，单条最多 1–2 个）',
    replace: '保持正式'
  },
  {
    id: 'M4-rule-destructive',
    what: 'rule ③ (blunt destructive confirmation, no softening) removed',
    file: 'tools',
    find: '用一句不加修饰的话说明将要删除的对象和数量',
    replace: '用轻松俏皮的话提一下'
  },
  {
    id: 'M5-rule-failure',
    what: 'rule ④ (failure = one sentence + pointer) removed',
    file: 'tools',
    find: '失败与能力边界：一句话说明原因，再加一句指路',
    replace: '失败时可以随意解释'
  },
  {
    id: 'M6-summary-count',
    what: 'destructive summary loses the object + count shape',
    file: 'tools',
    find: 'return `从${who}移除 ${ids.length} 首：${describeTracks(ids)}`',
    replace: 'return `准备收拾点东西`'
  },
  {
    id: 'M7-title-literal',
    what: 'panel copy drifts (component shows a different name)',
    file: 'component',
    find: "const ASSISTANT_TITLE = '薇拉 Vela'",
    replace: "const ASSISTANT_TITLE = 'AI 音乐助手'"
  }
]

const results = []
for (const mut of mutations) {
  const path = mut.file === 'tools' ? TOOLS : 'src/renderer/src/components/ChatPanel.tsx'
  const before = readFileSync(path, 'utf8')
  if (!before.includes(mut.find)) {
    console.log(`!! ${mut.id}: anchor not found — mutation cannot be applied`)
    results.push({ id: mut.id, status: 'ANCHOR-MISSING' })
    continue
  }
  writeFileSync(path, before.replace(mut.find, mut.replace))
  const run = runTests()
  writeFileSync(path, before)
  const restored = sha(readFileSync(path, 'utf8')) === sha(before)
  const caught = run.exit !== 0
  results.push({ id: mut.id, status: caught ? 'CAUGHT' : 'MISSED', run, restored })
  console.log(
    `${caught ? 'CAUGHT ' : 'MISSED '} ${mut.id} (${mut.what}) → exit=${run.exit} ${run.detail} | restored=${restored}`
  )
  if (run.failedLines.length) for (const l of run.failedLines) console.log(`           ${l.trim()}`)
}

// ---- final integrity ----
const finalTools = sha(readFileSync(TOOLS, 'utf8'))
const finalTest = sha(readFileSync(TEST, 'utf8'))
const residue = readdirSync('.').filter((n) => /MUTATION|\.bak$|^zz/i.test(n))
const clean =
  finalTools === baseTools && finalTest === baseTest && residue.length === 0 &&
  results.every((r) => r.status === 'CAUGHT' && r.restored !== false)

console.log('\n=== summary ===')
for (const r of results) console.log(`  ${r.id.padEnd(22)} ${r.status}`)
console.log(`tools.ts identical after round-trip : ${finalTools === baseTools}`)
console.log(`test file identical after round-trip: ${finalTest === baseTest}`)
console.log(`residue (MUTATION/*.bak/zz*): ${residue.length === 0 ? 'none' : residue.join(',')}`)
console.log(`ALL MUTATIONS CAUGHT AND TREE RESTORED: ${clean}`)
process.exit(clean ? 0 : 1)

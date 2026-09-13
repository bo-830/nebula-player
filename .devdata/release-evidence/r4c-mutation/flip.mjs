/**
 * t43/t41 — R4(c) 真实 `src` 取反实验（captain 正式指派给 verifier）。
 *
 * 只做一件事：把两个面板里的 `+ offset` 改成 `- offset`（或反向还原）。
 * 安全性：断言无 CRLF、断言替换次数符合预期、以 utf8 写回（不加 BOM）。
 * Usage: node .devdata/release-evidence/r4c-mutation/flip.mjs flip|restore
 */
import { copyFileSync, readFileSync, writeFileSync } from 'fs'

const mode = process.argv[2]
const E = '.devdata/release-evidence/r4c-mutation'
const targets = [
  { file: 'src/renderer/src/components/LyricsPanel.tsx', expect: 1 },
  { file: 'src/renderer/src/components/MiniPlayer.tsx', expect: 2 }
]

for (const t of targets) {
  const cur = readFileSync(t.file, 'utf8')
  if (cur.includes('\r')) throw new Error(`${t.file}: CRLF found — refusing to touch`)
  const src = `${E}/${t.file.split('/').pop()}.orig`
  const base = readFileSync(src, 'utf8')

  let next
  if (mode === 'flip') {
    const hits = (base.match(/\+ offset/g) ?? []).length
    if (hits !== t.expect) throw new Error(`${t.file}: expected ${t.expect} x '+ offset', found ${hits}`)
    next = base.replace(/\+ offset/g, '- offset')
  } else if (mode === 'restore') {
    // start from the pristine backup, not from whatever is on disk
    next = base
  } else {
    throw new Error('usage: flip|restore')
  }
  writeFileSync(t.file, next, 'utf8')
  console.log(`${mode}: ${t.file} -> ${next.length} B (backup ${base.length} B)`)
}

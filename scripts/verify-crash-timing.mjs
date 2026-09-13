/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS probe (not shipped TS source); the rule targets typed TS modules.
 * If eslint.config.mjs later scopes this rule away from scripts/**, this
 * directive becomes redundant and can be deleted. */
/**
 * t6 — is the dev app's death correlated with the 8 s silent update check?
 *
 * `src/main/index.ts:258` schedules `checkUpdate(updateURL)` 8 s after launch and
 * `src/main/index.js` registers no `unhandledRejection` guard, while the network is
 * unreachable for the configured placeholder feed (`updates.example.com`). This
 * probe polls CDP every 1 s and reports the exact uptime at which the main window
 * target disappears, so the timing can be compared with the 8 s mark.
 *
 * Usage: node scripts/verify-crash-timing.mjs [seconds]
 */
import { writeFile } from 'fs/promises'

const LIMIT = Number(process.argv[2] ?? 90)
const started = Date.now()
const samples = []
let diedAt = null

while ((Date.now() - started) / 1000 < LIMIT) {
  let ok = false
  let urls = []
  try {
    const res = await fetch('http://127.0.0.1:9222/json')
    const list = await res.json()
    urls = list.map((t) => t.url)
    ok = urls.some((u) => u.endsWith('5173/'))
  } catch {
    ok = false
  }
  const t = Math.round(((Date.now() - started) / 1000) * 10) / 10
  samples.push({ t, alive: ok, targets: urls.length })
  if (!ok) {
    diedAt = t
    break
  }
  await new Promise((r) => setTimeout(r, 1000))
}

const out = {
  startedAt: new Date(started).toISOString(),
  limitSeconds: LIMIT,
  diedAtSeconds: diedAt,
  stillAliveAfter: diedAt === null ? Math.round((Date.now() - started) / 1000) : null,
  updateCheckScheduledAtSeconds: 8,
  correlatedWithUpdateCheck: diedAt !== null && diedAt >= 7 && diedAt <= 12,
  lastSamples: samples.slice(-8),
  totalSamples: samples.length
}
await writeFile('.devdata/t6-evidence/crash-timing.json', JSON.stringify(out, null, 2), 'utf8')
console.log(JSON.stringify(out, null, 2))
process.exit(0)

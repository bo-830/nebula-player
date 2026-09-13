/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS probe (not shipped TS source); the rule targets typed TS modules.
 * If eslint.config.mjs later scopes this rule away from scripts/**, this
 * directive becomes redundant and can be deleted. */
/**
 * t15 / F5 — lyric-offset sign semantics (t7 finding: UI copy vs implementation).
 *
 * Proves the ACTUAL behaviour with the shipped lyric file and the real formulas,
 * and reports the real control copy so the claim can be checked:
 *   - panel : active = max{ i : lines[i].t <= currentTime + 0.12 + offset }   (LyricsPanel)
 *   - mini  : same expression                                                 (MiniPlayer:87)
 *   - click : seek(lines[i].t - offset)                                       (LyricsPanel:204)
 *   - readout: formatOffset(offset) → "+0.5s" / "-0.5s" / "0.0s"
 *
 * Boundary-crossing cases use the shipped line times 11.00 / 15.50:
 *   t=15.0 + offset  0    → 15.12 → line 11.00
 *   t=15.0 + offset +0.5  → 15.62 → line 15.50   (crosses forward)
 *   t=15.0 + offset −0.5  → 14.62 → line 11.00   (crosses back)
 *
 * Usage: node scripts/verify-f5-sign.mjs
 */
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { createServer } from 'vite'

const outDir = '.devdata/t13-r2-evidence'
await mkdir(outDir, { recursive: true })

const PROBE_MODULE = 'scripts/__f5_probe.ts'
const PROBE_SOURCE = `
const panelSrc = (globalThis as any).__f5panel as string
const miniSrc = (globalThis as any).__f5mini as string
const offSrc = (globalThis as any).__f5off as string

const res: any = await (globalThis as any).window.api.lyricsGet({ path: 'x', mtime: 0, size: 0 })
const lines: Array<{ t: number; text: string }> = res.lines

const activeAt = (currentTime: number, offset: number): number => {
  const t = currentTime + 0.12 + offset
  let idx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].t >= 0 && lines[i].t <= t) idx = i
    else if (lines[i].t >= 0 && lines[i].t > t) break
  }
  return idx
}
const at = (ct: number, off: number) => ({ currentTime: ct, offset: off, index: activeAt(ct, off), text: lines[activeAt(ct, off)]?.text ?? null })

const fmt: any = await import('/src/renderer/src/lib/lyricsOffset.ts')

const out = {
  lineTimes: lines.slice(0, 5).map((l) => ({ t: l.t, text: l.text })),
  cases: {
    t10_9_off0: at(10.9, 0),
    t10_9_offPlus05: at(10.9, 0.5),
    t10_9_offMinus05: at(10.9, -0.5),
    t15_0_off0: at(15.0, 0),
    t15_0_offPlus05: at(15.0, 0.5),
    t15_4_off0: at(15.4, 0),
    t15_4_offMinus05: at(15.4, -0.5)
  },
  positiveOffsetCrossesForward: activeAt(15.0, 0.5) > activeAt(15.0, 0),
  negativeOffsetCrossesBackward: activeAt(15.4, -0.5) < activeAt(15.4, 0),
  clickSemantics: {
    lineIndex3T: lines[3]?.t,
    seekAtOffset0: Math.max(0, (lines[3]?.t ?? 0) - 0),
    seekAtOffsetPlus05: Math.max(0, (lines[3]?.t ?? 0) - 0.5),
    positiveOffsetSeeksEarlier: Math.max(0, (lines[3]?.t ?? 0) - 0.5) < (lines[3]?.t ?? 0)
  },
  formatShown: { plus: fmt.formatOffset(0.5), minus: fmt.formatOffset(-0.5), zero: fmt.formatOffset(0) },
  uiCopy: {
    hasQianYi: panelSrc.includes('歌词提前'),
    hasYanHou: panelSrc.includes('歌词延后'),
    minusHandlerIsNegative: /adjustOffset\\(current\\.id, -OFFSET_STEP\\)/.test(panelSrc),
    plusHandlerIsPositive: /adjustOffset\\(current\\.id, OFFSET_STEP\\)/.test(panelSrc),
    readoutUsesFormatOffset: /formatOffset\\(offset\\)/.test(panelSrc)
  },
  formulas: {
    panelActive: /currentTime \\+ 0\\.12 \\+ offset/.test(panelSrc),
    miniActive: /display \\+ 0\\.12 \\+ offset/.test(miniSrc),
    clickSeek: /seek\\(Math\\.max\\(0, l\\.t - offset\\)\\)/.test(panelSrc),
    offsetModuleDoc: (offSrc.match(/正数[^\\n]*|负数[^\\n]*/g) || []).slice(0, 2)
  }
}
;(out as any).allPass =
  out.positiveOffsetCrossesForward === true &&
  out.negativeOffsetCrossesBackward === true &&
  out.clickSemantics.positiveOffsetSeeksEarlier === true &&
  out.formatShown.plus.startsWith('+') &&
  out.formatShown.minus.startsWith('-') &&
  out.formulas.panelActive &&
  out.formulas.miniActive &&
  out.formulas.clickSeek &&
  out.uiCopy.minusHandlerIsNegative &&
  out.uiCopy.plusHandlerIsPositive
export default out
`

// expose the sources on globalThis (parsed by the TS module) and the lyrics API
globalThis.__f5panel = await readFile('src/renderer/src/components/LyricsPanel.tsx', 'utf8')
globalThis.__f5mini = await readFile('src/renderer/src/components/MiniPlayer.tsx', 'utf8')
globalThis.__f5off = await readFile('src/renderer/src/lib/lyricsOffset.ts', 'utf8')
globalThis.window = {
  api: {
    lyricsGet: async () => {
      const raw = await readFile('.devdata/test-music/song-long.lrc', 'utf8')
      const lines = []
      for (const line of raw.split(/\r?\n/)) {
        const m = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/)
        if (!m) continue
        lines.push({ t: Number(m[1]) * 60 + Number(m[2]), text: m[3].trim() })
      }
      lines.sort((a, b) => a.t - b.t)
      return { lines, source: 'lrc' }
    }
  }
}

await writeFile(PROBE_MODULE, PROBE_SOURCE, 'utf8')
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  server: { middlewareMode: true, watch: null, hmr: false },
  appType: 'custom',
  logLevel: 'error'
})
let out
try {
  const mod = await server.ssrLoadModule('/' + PROBE_MODULE)
  out = mod.default
} finally {
  await server.close()
  await rm(PROBE_MODULE, { force: true })
}

await writeFile(`${outDir}/f5-lyrics-sign.json`, JSON.stringify(out, null, 2), 'utf8')
console.log(JSON.stringify(out, null, 2))
process.exit(out && out.allPass ? 0 : 1)

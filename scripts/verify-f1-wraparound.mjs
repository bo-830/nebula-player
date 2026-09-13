/* eslint-disable @typescript-eslint/explicit-function-return-type --
 * plain JS probe (not shipped TS source); the rule targets typed TS modules.
 * If eslint.config.mjs later scopes this rule away from scripts/**, this
 * directive becomes redundant and can be deleted. */
/**
 * t15 / F1 — independent evidence for the list-mode wrap-around fix.
 *
 * F1 (t7 BLOCKER): `playerStore.next()` used to cap the advance at the last index
 * and never wrap back to 0, so a natural end on the last track silently stopped
 * playback instead of looping the queue.
 *
 * The probe drives the REAL store (no copy of the logic) with the audio engine's
 * DOM entry points stubbed — the same technique the repo's own vitest suite uses
 * (`playerStoreSleep.test.ts` stubs pause/setVolume) — and asserts:
 *   A. no timer, queue=3, index=2 → natural end     ⇒ wraps to index 0
 *   B. no timer, queue=3, index=2 → manual next()   ⇒ wraps to index 0
 *   C. no timer, queue=3, index=0 → natural end     ⇒ advances to 1   (control)
 *   D. queue timer armed, index=2 → natural end     ⇒ STOPS at 2, timer cleared (t1 must hold)
 *   E. single-track queue, index=0 → natural end    ⇒ stays on 0, no stop
 *
 * A temporary TS module is generated so Vite's SSR resolver can load the app's
 * extensionless TS imports; it is deleted right after the run.
 *
 * Usage: node scripts/verify-f1-wraparound.mjs
 */
import { mkdir, rm, writeFile } from 'fs/promises'
import { createServer } from 'vite'

const outDir = '.devdata/t13-r2-evidence'
await mkdir(outDir, { recursive: true })

const PROBE_MODULE = 'scripts/__f1_probe.ts'
const PROBE_SOURCE = `
// ---- minimal browser environment -------------------------------------------------
const bag = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => (bag.has(k) ? bag.get(k)! : null),
  setItem: (k: string, v: string) => void bag.set(k, String(v)),
  removeItem: (k: string) => void bag.delete(k),
  clear: () => bag.clear(),
  key: (i: number) => [...bag.keys()][i] ?? null,
  get length() {
    return bag.size
  }
}
;(globalThis as any).window = {
  api: { decodeEnsure: async () => 'media://fake', playerPushState: () => {} }
}

const engineMod: any = await import('/src/renderer/src/lib/audioEngine.ts')
const playerMod: any = await import('/src/renderer/src/stores/playerStore.ts')
const libMod: any = await import('/src/renderer/src/stores/libraryStore.ts')
const engine = engineMod.audioEngine

const pauses: string[] = []
const loads: string[] = []
engine.pause = () => void pauses.push('pause')
engine.play = async () => {}
engine.load = async (u: string) => void loads.push(u)
engine.seek = () => {}
engine.setVolume = () => {}
engine.init = () => {}
engine.on = () => {}

const usePlayerStore = playerMod.usePlayerStore
const useLibraryStore = libMod.useLibraryStore

const mk = (id: string) => ({
  id, path: 'C:/fake/' + id + '.mp3', title: id, artist: 'a', album: 'b', duration: 3, ext: 'mp3', mtime: 1, size: 1
})
const tracks = [mk('t0'), mk('t1'), mk('t2')]
useLibraryStore.setState({ tracks, map: Object.fromEntries(tracks.map((t: any) => [t.id, t])) })

const settle = () => new Promise((r) => setTimeout(r, 150))
const reset = (over: Record<string, unknown> = {}) => {
  pauses.length = 0
  loads.length = 0
  usePlayerStore.setState({
    queue: ['t0', 't1', 't2'], index: 2, current: tracks[2], isPlaying: true, mode: 'list',
    sleep: null, sleepRemaining: null, error: null, ...over
  })
}

const out: Record<string, any> = {}

reset()
usePlayerStore.getState().handleEnded()
await settle()
out.A = { index: usePlayerStore.getState().index, pauses: pauses.length, loads: loads.length, pass: usePlayerStore.getState().index === 0 && pauses.length === 0 }

reset()
usePlayerStore.getState().next()
await settle()
out.B = { index: usePlayerStore.getState().index, pauses: pauses.length, pass: usePlayerStore.getState().index === 0 && pauses.length === 0 }

reset({ index: 0, current: tracks[0] })
usePlayerStore.getState().handleEnded()
await settle()
out.C = { index: usePlayerStore.getState().index, pass: usePlayerStore.getState().index === 1 }

reset()
usePlayerStore.setState({ sleep: { mode: 'queue', deadline: null, minutes: null, startMode: 'list' } })
usePlayerStore.getState().handleEnded()
await settle()
out.D = {
  index: usePlayerStore.getState().index,
  pauses: pauses.length,
  sleepCleared: usePlayerStore.getState().sleep === null,
  pass: pauses.length === 1 && usePlayerStore.getState().sleep === null
}

reset({ queue: ['t0'], index: 0, current: tracks[0] })
usePlayerStore.getState().handleEnded()
await settle()
out.E = { index: usePlayerStore.getState().index, pauses: pauses.length, pass: usePlayerStore.getState().index === 0 && pauses.length === 0 }

out.allPass = ['A', 'B', 'C', 'D', 'E'].every((k) => out[k].pass === true)
export default out
`

await writeFile(PROBE_MODULE, PROBE_SOURCE, 'utf8')
const server = await createServer({
  configFile: false,
  root: process.cwd(),
  server: { middlewareMode: true },
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

await writeFile(`${outDir}/f1-wraparound.json`, JSON.stringify(out, null, 2), 'utf8')
console.log(JSON.stringify(out, null, 2))
process.exit(out && out.allPass ? 0 : 1)

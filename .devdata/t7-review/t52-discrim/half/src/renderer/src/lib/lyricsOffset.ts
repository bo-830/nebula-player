/**
 * Per-track lyric offset calibration.
 *
 * Online LRC files are frequently 0.5–2s off, so the user can nudge the whole
 * lyric track earlier/later in ±0.5s steps. The value is remembered per track
 * in localStorage so switching songs restores each track's own calibration.
 *
 * A positive offset means "the audio is behind the lyric timestamps" (typical
 * for early-coded LRC): a line stamped t should become active at played time
 * t - offset. Concretely the active-line test is `t <= currentTime + 0.12 +
 * offset`, and clicking a line seeks to `line.t - offset`, so the offset shifts
 * both the highlight and the jump by exactly the same amount. Negative values
 * pull late lyrics forward instead.
 *
 * Pure logic (no React/DOM beyond localStorage) so it stays unit-testable.
 * localStorage counts as an external store, so components consume it through
 * `getOffsetSnapshot` + `subscribeOffsets` (useSyncExternalStore) rather than
 * copying the value into React state inside an effect.
 */

/** localStorage key holding a `{ [trackId]: seconds }` map. */
export const STORAGE_KEY = 'nebula.lyricsoffset'

/** smallest/largest calibration the UI can reach (safety clamp). */
const MAX_ABS_OFFSET = 30

/** step applied by adjustOffset / the panel buttons. */
export const OFFSET_STEP = 0.5

const EPSILON = 1e-6

type OffsetMap = Record<string, number>

/** subscribers (React via useSyncExternalStore, plus cross-window storage). */
const listeners = new Set<() => void>()

function emit(): void {
  for (const cb of Array.from(listeners)) cb()
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function clamp(seconds: number): number {
  if (!Number.isFinite(seconds)) return 0
  return round1(Math.min(MAX_ABS_OFFSET, Math.max(-MAX_ABS_OFFSET, seconds)))
}

function readMap(): OffsetMap {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: OffsetMap = {}
    for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        const value = clamp(v)
        if (value !== 0) out[id] = value
      }
    }
    return out
  } catch {
    // unavailable/corrupt storage → no calibration, never throw
    return {}
  }
}

function writeMap(map: OffsetMap): void {
  try {
    if (Object.keys(map).length === 0) {
      window.localStorage.removeItem(STORAGE_KEY)
      return
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // private mode / quota → calibration simply does not persist
  }
}

/** offset in seconds for a track (0 when unknown / no calibration). */
export function getOffset(trackId: string | null | undefined): number {
  if (!trackId) return 0
  return readMap()[trackId] ?? 0
}

/** store an absolute offset for a track; 0 removes the entry. */
export function setOffset(trackId: string | null | undefined, seconds: number): number {
  if (!trackId) return 0
  const next = clamp(seconds)
  const map = readMap()
  if (next === 0) delete map[trackId]
  else map[trackId] = next
  writeMap(map)
  emit()
  return next
}

/** nudge a track's offset by `delta` seconds (default ±0.5s step). */
export function adjustOffset(
  trackId: string | null | undefined,
  delta: number = OFFSET_STEP
): number {
  if (!trackId) return 0
  return setOffset(trackId, getOffset(trackId) + delta)
}

/** forget a track's calibration. */
export function clearOffset(trackId: string | null | undefined): void {
  setOffset(trackId, 0)
}

/** display helper: `+0.5s` / `-1.0s` / `0.0s`. */
export function formatOffset(seconds: number): string {
  const v = clamp(seconds)
  if (v === 0) return '0.0s'
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}s`
}

/** true when the value is a non-zero calibration (UI highlight helper). */
export function hasOffset(seconds: number): boolean {
  return Math.abs(clamp(seconds)) > EPSILON
}

// ---------- external-store binding for React ----------

/** subscribe to offset writes (single value store, so no selector needed). */
export function subscribeOffsets(onChange: () => void): () => void {
  listeners.add(onChange)
  const onStorage = (e: StorageEvent): void => {
    if (e.key === STORAGE_KEY) onChange()
  }
  try {
    window.addEventListener('storage', onStorage)
  } catch {
    // no window (unit tests) → in-process listeners still work
  }
  return () => {
    listeners.delete(onChange)
    try {
      window.removeEventListener('storage', onStorage)
    } catch {
      // ignore
    }
  }
}

/**
 * Stable snapshot getter for useSyncExternalStore. The snapshot is a primitive
 * number, so React can compare it by value and never loops.
 */
export function getOffsetSnapshot(trackId: string | null | undefined): () => number {
  return () => getOffset(trackId)
}

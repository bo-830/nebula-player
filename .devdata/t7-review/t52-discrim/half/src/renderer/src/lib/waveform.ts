import type { Track } from '../types'

const cache = new Map<string, Promise<number[]>>()

/** Fetch (and memoize) the precomputed waveform envelope for a track. */
export function waveformFor(track: Track): Promise<number[]> {
  let p = cache.get(track.id)
  if (!p) {
    p = window.api
      .waveformGet({
        path: track.path,
        mtime: track.mtime,
        size: track.size,
        duration: track.duration
      })
      .catch((err) => {
        cache.delete(track.id)
        throw err
      })
    cache.set(track.id, p)
  }
  return p
}

export function clearWaveform(id: string): void {
  cache.delete(id)
}

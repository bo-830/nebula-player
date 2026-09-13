/**
 * Audio container/format decisions.
 *
 * Deliberately free of Electron imports (unlike `decodeService`, which pulls in
 * `store`/`protocol`) so the decisions can be unit tested in a plain Node
 * environment. `decodeService` re-exports `needsConvert` to keep its public API.
 */

/** extensions Chromium/<audio> plays natively */
export const DIRECT_EXTS = new Set(['.mp3', '.wav', '.flac', '.ogg', '.opus', '.m4a'])

/** ext -> target extension for conversion */
export const CONVERT: Record<string, string> = {
  '.ape': 'wav',
  '.aac': 'm4a'
}

/**
 * Decide whether a media path must be transcoded before Chromium can play it.
 * Returns the target extension, or null when the file is directly playable.
 * Unknown extensions also return null (handled by the caller).
 */
export function needsConvert(path: string): string | null {
  const idx = path.lastIndexOf('.')
  const ext = idx >= 0 ? path.slice(idx).toLowerCase() : ''
  if (DIRECT_EXTS.has(ext)) return null
  return CONVERT[ext] ?? null
}

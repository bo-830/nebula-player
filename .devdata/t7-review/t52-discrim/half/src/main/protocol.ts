import { Readable } from 'stream'
import { createReadStream, promises as fs } from 'fs'
import { extname, isAbsolute, join, relative, resolve } from 'path'
import { protocol } from 'electron'
import { paths } from './store'
import { createMediaRoots } from './mediaRoots'

const MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.ape': 'audio/x-ape',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}

/**
 * Only these extensions may be served, and only from inside the roots below.
 * Anything else is a 404 without a body — the scheme is reachable from page
 * content (img-src/media-src allow `media:`), so it must not double as an
 * arbitrary-file reader (e.g. `<userData>/settings.json` holds the API key).
 */
const SERVABLE_EXTS = new Set(Object.keys(MIME))

/**
 * Root set backing `isInsideRoots`. The state machine itself lives in
 * `./mediaRoots` — it is Electron-free and unit tested there, because this
 * module cannot be imported under vitest (`electron` / `store` at module scope).
 * The two real-world sources are supplied here.
 */
const roots = createMediaRoots({
  // A function on purpose: `paths()` must be evaluated after
  // `app.setPath('userData', …)`, which runs after this module's body in dev.
  staticRoots: () => [paths().covers, paths().decodeCache],
  readLibrary: async () =>
    JSON.parse(await fs.readFile(join(paths().userData, 'library.json'), 'utf-8'))
})

/**
 * Replace the servable roots outright. Used by `refreshMediaRoots()` after a
 * scan, and available to callers that know the set precisely.
 */
export function setMediaRoots(next: Array<string | null | undefined>): void {
  roots.set(next)
}

/**
 * Re-derive the roots from `library.json`. MUST be called once a scan has
 * changed the library: the set is otherwise pinned to the startup snapshot, so
 * a directory scanned during this session keeps returning 403 for every
 * directly-playable file inside it (only `.ape`/`.aac` survived, because their
 * transcoded output lands in the decode-cache root) until the app restarts.
 */
export async function refreshMediaRoots(): Promise<string[]> {
  return roots.refresh()
}

/**
 * The renderer runs on http://localhost:5173 (dev) / file:// (packaged) while
 * media files are served from the custom media:// scheme, so every response is
 * cross-origin as far as Chromium is concerned. Without an explicit allow
 * header a <audio> element routed through MediaElementAudioSourceNode renders
 * pure zeroes ("outputs zeroes due to CORS access restrictions"), which kills
 * the live spectrum, and with crossOrigin='anonymous' the load fails outright.
 * The scheme is registered as corsEnabled in index.ts; this header is the other
 * half of that contract and must be on EVERY response branch — including the
 * Range (206/416) replies, otherwise seeking would trigger the cross-origin
 * check again and silence the graph mid-playback.
 *
 * ── Why `Access-Control-Allow-Origin` must stay `*` (accepted ruling) ──
 * The packaged renderer is loaded from `file://`, so its origin is `null`; a
 * narrowed or echoed origin would stop the response being CORS-clean and mute
 * the spectrum again. `<audio>` is a CORS-mode request (audioEngine sets
 * `crossOrigin = 'anonymous'`), so it needs the wildcard.
 *
 * ── Why there is deliberately NO `Cross-Origin-Resource-Policy` ──
 * Covers are rendered as `<img src="media://…">` WITHOUT `crossOrigin`, i.e. a
 * no-cors request, and CORP is enforced for no-cors requests. The page origin
 * (`file://` / `localhost:5173`) differs from the resource origin (`media://`),
 * so `CORP: same-origin` would block every cover. Do not add it. The exposure
 * is bounded by the path/extension validation below plus the navigation guards
 * in index.ts instead.
 */
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges'
}

function pathFromRequest(url: string): string {
  // media://local/<base64url-of-absolute-path>
  const u = new URL(url)
  const b64 = u.pathname.replace(/^\//, '')
  return Buffer.from(b64, 'base64url').toString('utf-8')
}

/** true when `filePath` resolves inside one of the registered roots */
function isInsideRoots(filePath: string): boolean {
  if (!isAbsolute(filePath)) return false
  const target = resolve(filePath)
  return roots.current().some((root) => {
    const rel = relative(root, target)
    // '' means the root itself; a '..' prefix or absolute result escapes it
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
  })
}

/** Rewrites a filesystem path into a media:// URL. */
export function mediaUrlFor(filePath: string): string {
  const b64 = Buffer.from(filePath, 'utf-8').toString('base64url')
  return 'media://local/' + b64
}

/**
 * stream protocol with full Range support so the <audio> element can seek
 * inside MP3/WAV/FLAC/OGG/M4A without buffering the whole file.
 */
export function registerMediaProtocol(): void {
  protocol.handle('media', async (request) => {
    // CORS preflight (media elements never send it, but keep the scheme correct)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(null, { status: 405, headers: CORS_HEADERS })
    }
    let filePath: string
    try {
      filePath = pathFromRequest(request.url)
    } catch {
      return new Response(null, { status: 400, headers: CORS_HEADERS })
    }

    // containment first (403) then extension whitelist (404) — never serve bytes
    // `roots.get()` (not a bare latch) so concurrent cold-start requests all
    // await the same population instead of racing past an empty root set.
    await roots.get()
    if (!isInsideRoots(filePath)) {
      return new Response(null, { status: 403, headers: CORS_HEADERS })
    }
    if (!SERVABLE_EXTS.has(extname(filePath).toLowerCase())) {
      return new Response(null, { status: 404, headers: CORS_HEADERS })
    }

    let size: number
    let mtime: number
    try {
      const st = await fs.stat(filePath)
      size = st.size
      mtime = st.mtimeMs
    } catch {
      return new Response(null, { status: 404, headers: CORS_HEADERS })
    }

    const mime = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
    const range = request.headers.get('range')

    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range)
      if (!m) return new Response(null, { status: 416, headers: CORS_HEADERS })
      const start = m[1] ? parseInt(m[1], 10) : 0
      let end = m[2] ? parseInt(m[2], 10) : size - 1
      if (Number.isNaN(start) || Number.isNaN(end)) {
        return new Response(null, { status: 416, headers: CORS_HEADERS })
      }
      if (start > end || start >= size) {
        return new Response(null, {
          status: 416,
          headers: { ...CORS_HEADERS, 'Content-Range': `bytes */${size}` }
        })
      }
      end = Math.min(end, size - 1)
      const body = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream
      return new Response(body, {
        status: 206,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': mime,
          'Content-Length': String(end - start + 1),
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache'
        }
      })
    }

    const body = Readable.toWeb(createReadStream(filePath)) as ReadableStream
    return new Response(body, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': mime,
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes',
        'Last-Modified': new Date(mtime).toUTCString(),
        'Cache-Control': 'no-cache'
      }
    })
  })
}

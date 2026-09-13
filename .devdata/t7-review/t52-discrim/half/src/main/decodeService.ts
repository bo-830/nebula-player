import { createHash } from 'crypto'
import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import { join } from 'path'
import ffmpegStatic from 'ffmpeg-static'
import { paths } from './store'
import { mediaUrlFor } from './protocol'
import { DIRECT_EXTS, needsConvert } from './mediaFormats'

// Format decisions live in ./mediaFormats (free of Electron imports, unit
// tested); re-exported here so this module's public API is unchanged.
export { needsConvert }

/** shared resolve: packaged apps must use the asar-unpacked ffmpeg binary */
export function ffmpegBin(): string {
  let bin = ffmpegStatic as unknown as string | null
  if (!bin) throw new Error('ffmpeg-static resolved no binary path')
  if (bin.includes('app.asar')) {
    bin = bin.replace('app.asar', 'app.asar.unpacked')
  }
  return bin
}

/** extension of a media path, lower-cased, using the same rule as `needsConvert` */
function fileExt(mediaPath: string): string {
  const idx = mediaPath.lastIndexOf('.')
  return idx >= 0 ? mediaPath.slice(idx).toLowerCase() : ''
}

function cacheFileFor(mediaPath: string, targetExt: string): string {
  return join(
    paths().decodeCache,
    `${createHash('sha1').update(mediaPath.toLowerCase()).digest('hex')}.${targetExt}`
  )
}

function runFfmpeg(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true })
    let stderr = ''
    child.stderr.on('data', (d) => {
      stderr += String(d)
      if (stderr.length > 8192) stderr = stderr.slice(-4096)
    })
    child.on('error', (err) => reject(new Error(`无法启动解码器: ${err.message}`)))
    child.on('close', (code) => {
      if (code === 0) resolve()
      else
        reject(
          new Error(`解码失败 (${code}): ${stderr.split('\n').filter(Boolean).pop() ?? '未知错误'}`)
        )
    })
  })
}

/**
 * Ensure the given file is playable by Chromium. Returns a media:// URL.
 * APE → WAV (decode), AAC(ADTS) → M4A (lossless remux). Results cached by
 * path hash; cache cleaned of entries older than 7 days on startup.
 */
export async function ensurePlayable(mediaPath: string): Promise<string> {
  // A3: `needsConvert` is now the real call site (it was imported only to be
  // re-exported, while the same decision was duplicated here). It returns the
  // conversion target for transcodable containers and null both for natively
  // playable files and for unknown extensions, so the two null cases are told
  // apart by the exported DIRECT_EXTS list — unknown still fails loudly. The
  // extension is taken with the exact same rule as `needsConvert` (last dot,
  // lower-cased, absent → ''), so the two decisions can no longer drift.
  const ext = fileExt(mediaPath)
  const targetExt = needsConvert(mediaPath)
  if (!targetExt) {
    if (DIRECT_EXTS.has(ext)) return mediaUrlFor(mediaPath)
    throw new Error(`不支持的音频格式: ${ext}`)
  }
  const out = cacheFileFor(mediaPath, targetExt)

  try {
    const st = await fs.stat(out)
    if (st.size > 0) return mediaUrlFor(out)
  } catch {
    // not cached yet
  }

  await fs.mkdir(paths().decodeCache, { recursive: true })
  const tmp = out + '.tmp'
  await fs.rm(tmp, { force: true }).catch(() => {})
  const bin = ffmpegBin()
  // `tmp` ends in `.tmp`, so ffmpeg cannot infer the container from the output
  // extension and aborts with "Error opening output files: Invalid argument".
  // Spell the muxer out with `-f` instead of renaming the temp file (keeping the
  // atomic `rename(tmp, out)` contract that makes the cache POX-safe).
  const args =
    targetExt === 'm4a'
      ? ['-y', '-i', mediaPath, '-c', 'copy', '-movflags', '+faststart', '-f', 'mp4', tmp]
      : ['-y', '-i', mediaPath, '-vn', '-c:a', 'pcm_s16le', '-f', 'wav', tmp]
  try {
    await runFfmpeg(bin, args)
    await fs.rename(tmp, out)
  } catch (err) {
    // remux may fail for unusual aac streams → fall back to wav decode
    if (targetExt === 'm4a') {
      const wavOut = cacheFileFor(mediaPath, 'wav')
      await fs.rm(tmp, { force: true }).catch(() => {})
      const wavTmp = wavOut + '.tmp'
      await runFfmpeg(bin, ['-y', '-i', mediaPath, '-vn', '-c:a', 'pcm_s16le', '-f', 'wav', wavTmp])
      await fs.rename(wavTmp, wavOut)
      return mediaUrlFor(wavOut)
    }
    throw err
  }
  return mediaUrlFor(out)
}

export async function cleanupCache(): Promise<void> {
  try {
    const dir = paths().decodeCache
    const entries = await fs.readdir(dir)
    const cutoff = Date.now() - 7 * 24 * 3600 * 1000
    for (const name of entries) {
      const full = join(dir, name)
      try {
        const st = await fs.stat(full)
        if (st.mtimeMs < cutoff) await fs.rm(full, { force: true })
      } catch {
        // ignore
      }
    }
  } catch {
    // no cache dir yet
  }
}

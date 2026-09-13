import { createHash } from 'crypto'
import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import { join } from 'path'
import { paths } from './store'
import { ffmpegBin } from './decodeService'

/**
 * Precompute a normalized amplitude envelope (waveform) for a track so the
 * spectrum can keep visualizing in direct-playback mode (where the Web Audio
 * analyser is unavailable). Output: array of 0..255, 20 buckets/second.
 * Cached as JSON keyed by path+mtime+size.
 */
export async function getWaveform(input: {
  path: string
  mtime: number
  size: number
  duration: number
}): Promise<number[]> {
  const hash = createHash('sha1')
    .update(`${input.path.toLowerCase()}|${input.mtime}|${input.size}`)
    .digest('hex')
  const wfDir = join(paths().userData, 'waveforms')
  const cacheFile = join(wfDir, `${hash}.json`)
  const rawFile = join(paths().decodeCache, `wf-${hash}.f32`)

  try {
    const cached = await fs.readFile(cacheFile, 'utf-8')
    return JSON.parse(cached) as number[]
  } catch {
    // compute
  }

  const bin = ffmpegBin()

  // mono 8 kHz float32 → small-ish temp file (no stdout pipes)
  await fs.mkdir(wfDir, { recursive: true })
  await fs.mkdir(paths().decodeCache, { recursive: true })
  await fs.rm(rawFile, { force: true }).catch(() => {})

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      bin,
      ['-y', '-i', input.path, '-vn', '-ac', '1', '-ar', '8000', '-f', 'f32le', rawFile],
      {
        windowsHide: true
      }
    )
    let stderr = ''
    child.stderr.on('data', (d) => {
      stderr += String(d)
      if (stderr.length > 8192) stderr = stderr.slice(-4096)
    })
    child.on('error', (err) => reject(new Error(`ffmpeg 启动失败: ${err.message}`)))
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`波形计算失败 (${code})`))
    })
  })

  const raw = await fs.readFile(rawFile)
  await fs.rm(rawFile, { force: true }).catch(() => {})
  const samples = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4))

  const duration = Math.max(1, input.duration)
  const buckets = Math.max(80, Math.min(1600, Math.round(duration * 20)))
  const per = Math.max(1, Math.floor(samples.length / buckets))
  const env = new Array<number>(buckets)
  for (let b = 0; b < buckets; b++) {
    let peak = 0
    const start = b * per
    const end = Math.min(samples.length, start + per)
    for (let i = start; i < end; i++) {
      const v = Math.abs(samples[i])
      if (v > peak) peak = v
    }
    // soft knee for perceived dynamics
    env[b] = Math.round(Math.min(1, peak * 1.6) * 255)
  }

  await fs.writeFile(cacheFile, JSON.stringify(env), 'utf-8')
  return env
}

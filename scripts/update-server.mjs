/**
 * Local generic update feed for E2E: serves latest.yml (configurable version)
 * + the installer from dist. Usage: node scripts/update-server.mjs <port> <version>
 */
import { createServer } from 'http'
import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const port = Number(process.argv[2] ?? 8888)
const version = process.argv[3] ?? '1.0.2'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const exeName = `nebula-player-${version}-setup.exe`
const srcExe = join(root, 'dist', 'nebula-player-1.0.0-setup.exe')

// prepare feed dir
const feedDir = join(root, '.devdata', 'update-feed')
await fs.mkdir(feedDir, { recursive: true })
const exePath = join(feedDir, exeName)
await fs.copyFile(srcExe, exePath)
const size = (await fs.stat(exePath)).size
const sha512 = createHash('sha512').update(await fs.readFile(exePath)).digest('base64')
const latest = {
  version,
  files: [{ url: exeName, sha512, size }],
  path: exeName,
  sha512,
  releaseDate: new Date().toISOString(),
  releaseName: `NEBULA ${version}`
}
await fs.writeFile(join(feedDir, 'latest.yml'), JSON.stringify(latest, null, 2), 'utf-8')
console.log(`feed ready: version ${version}, file ${size} bytes`)

createServer(async (req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0])
  const f = join(feedDir, url === '/' ? 'latest.yml' : url.replace(/^\//, ''))
  try {
    const data = await fs.readFile(f)
    const type = f.endsWith('.yml') ? 'text/yaml' : 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': data.length })
    res.end(data)
  } catch {
    res.writeHead(404)
    res.end('not found')
  }
}).listen(port, '127.0.0.1', () => console.log(`update server on http://127.0.0.1:${port}/`))

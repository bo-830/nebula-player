/**
 * Generate app icons from build/icon.svg:
 *   build/icon.png (1024) — electron-builder auto source
 *   build/icon.ico      — Windows installer/executable
 *   resources/icon.png  — tray + window fallback
 * Usage: node scripts/gen-icons.mjs
 */
import { promises as fs } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = join(root, 'build', 'icon.svg')
const outDir = join(root, 'build', 'icons')
const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024]

await fs.mkdir(outDir, { recursive: true })

for (const size of sizes) {
  await sharp(svg).resize(size, size).png().toFile(join(outDir, `icon-${size}.png`))
  process.stdout.write(`  ✓ icon-${size}.png\n`)
}

const ico = await pngToIco(
  [16, 24, 32, 48, 64, 128, 256].map((s) => join(outDir, `icon-${s}.png`))
)
await fs.writeFile(join(root, 'build', 'icon.ico'), ico)
process.stdout.write('  ✓ icon.ico\n')

await fs.copyFile(join(outDir, 'icon-1024.png'), join(root, 'build', 'icon.png'))
await fs.copyFile(join(outDir, 'icon-256.png'), join(root, 'resources', 'icon.png'))
process.stdout.write('  ✓ icon.png (1024) + resources/icon.png (256)\n')

import sharp from 'sharp'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const svg = readFileSync(join(__dirname, 'icon.svg'))
const out = join(__dirname, '..', 'public')

const sizes = [
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'icon-192.png',         size: 192 },
  { file: 'icon-512.png',         size: 512 },
]

for (const { file, size } of sizes) {
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(join(out, file))
  console.log(`✓ ${file} (${size}×${size})`)
}

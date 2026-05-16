import sharp from 'sharp'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const src   = join(__dir, '..', 'public', 'ICON.png')
const out   = join(__dir, '..', 'public')

const sizes = [
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'icon-192.png',         size: 192 },
  { file: 'icon-512.png',         size: 512 },
]

for (const { file, size } of sizes) {
  await sharp(src).resize(size, size).png().toFile(join(out, file))
  console.log(`✓ ${file}`)
}

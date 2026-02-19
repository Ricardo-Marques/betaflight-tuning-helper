import sharp from 'sharp'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const SVG_PATH = resolve(import.meta.dirname, '..', 'public', 'logo.svg')
const OUT_DIR = resolve(import.meta.dirname, '..', 'public')

const svg = readFileSync(SVG_PATH)

const sizes = [192, 512] as const

for (const size of sizes) {
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(resolve(OUT_DIR, `pwa-${size}x${size}.png`))

  console.log(`Generated pwa-${size}x${size}.png`)
}

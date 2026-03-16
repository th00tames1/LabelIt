#!/usr/bin/env node
/**
 * generate-icon.js
 * Generates resources/icon.ico and resources/icon.png for the LabelingTool app.
 *
 * Uses `sharp` (already a project dependency) to render the SVG design.
 * ICO file is built manually — wraps PNG-compressed images in the ICO container.
 *
 * Usage:  node scripts/generate-icon.js
 */

'use strict'

const sharp = require('sharp')
const path = require('path')
const fs = require('fs')

// ─── SVG Icon Design ─────────────────────────────────────────────────────────
// A dark-themed bounding-box / polygon labeling tool icon
const createSvg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <!-- Background -->
  <rect width="${size}" height="${size}" rx="${size * 0.16}" fill="#0f0f0f"/>

  <!-- Outer frame (canvas border) -->
  <rect
    x="${size * 0.12}" y="${size * 0.12}"
    width="${size * 0.76}" height="${size * 0.76}"
    rx="${size * 0.06}" fill="#1a1a2e" stroke="#2a2a4a" stroke-width="${size * 0.016}"
  />

  <!-- Bounding box annotation -->
  <rect
    x="${size * 0.22}" y="${size * 0.24}"
    width="${size * 0.38}" height="${size * 0.28}"
    rx="${size * 0.025}" fill="rgba(99,102,241,0.18)"
    stroke="#6366f1" stroke-width="${size * 0.022}" stroke-dasharray="${size * 0.06},${size * 0.025}"
  />

  <!-- Corner handles on bounding box -->
  <rect x="${size * 0.205}" y="${size * 0.225}" width="${size * 0.06}" height="${size * 0.06}" rx="${size * 0.012}" fill="#6366f1"/>
  <rect x="${size * 0.575}" y="${size * 0.225}" width="${size * 0.06}" height="${size * 0.06}" rx="${size * 0.012}" fill="#6366f1"/>
  <rect x="${size * 0.205}" y="${size * 0.505}" width="${size * 0.06}" height="${size * 0.06}" rx="${size * 0.012}" fill="#6366f1"/>
  <rect x="${size * 0.575}" y="${size * 0.505}" width="${size * 0.06}" height="${size * 0.06}" rx="${size * 0.012}" fill="#6366f1"/>

  <!-- Polygon annotation (second annotation) -->
  <polygon
    points="${size*0.50},${size*0.34} ${size*0.70},${size*0.40} ${size*0.72},${size*0.60} ${size*0.54},${size*0.66} ${size*0.44},${size*0.56}"
    fill="rgba(34,197,94,0.12)" stroke="#22c55e" stroke-width="${size * 0.018}" stroke-linejoin="round"
  />

  <!-- Polygon vertices -->
  <circle cx="${size*0.50}" cy="${size*0.34}" r="${size*0.025}" fill="#22c55e"/>
  <circle cx="${size*0.70}" cy="${size*0.40}" r="${size*0.025}" fill="#22c55e"/>
  <circle cx="${size*0.72}" cy="${size*0.60}" r="${size*0.025}" fill="#22c55e"/>
  <circle cx="${size*0.54}" cy="${size*0.66}" r="${size*0.025}" fill="#22c55e"/>
  <circle cx="${size*0.44}" cy="${size*0.56}" r="${size*0.025}" fill="#22c55e"/>

  <!-- Small accent dot bottom-right -->
  <circle cx="${size * 0.78}" cy="${size * 0.78}" r="${size * 0.045}" fill="#6366f1" opacity="0.7"/>
</svg>
`

// ─── ICO Builder ─────────────────────────────────────────────────────────────
// Wraps multiple PNG buffers into a single .ico file.
// Modern ICO format supports PNG-compressed images (Windows Vista+).
function buildIco(images) {
  // images: Array<{ width: number, height: number, png: Buffer }>
  // Sort smallest to largest (ICO convention)
  images.sort((a, b) => a.width - b.width)

  const count = images.length
  const HEADER_SIZE = 6        // ICONDIR header
  const DIR_ENTRY_SIZE = 16    // ICONDIRENTRY per image
  const dataStart = HEADER_SIZE + DIR_ENTRY_SIZE * count

  // Calculate offsets
  let offset = dataStart
  const offsets = images.map((img) => {
    const o = offset
    offset += img.png.length
    return o
  })

  const totalSize = offset
  const buf = Buffer.alloc(totalSize)
  let pos = 0

  // ICONDIR header
  buf.writeUInt16LE(0, pos);     pos += 2  // reserved
  buf.writeUInt16LE(1, pos);     pos += 2  // type: 1 = icon
  buf.writeUInt16LE(count, pos); pos += 2  // number of images

  // ICONDIRENTRY entries
  for (let i = 0; i < count; i++) {
    const { width, height, png } = images[i]
    // ICO convention: width/height 0 means 256
    buf.writeUInt8(width === 256 ? 0 : width, pos);   pos++
    buf.writeUInt8(height === 256 ? 0 : height, pos); pos++
    buf.writeUInt8(0, pos); pos++   // color count (0 = no palette)
    buf.writeUInt8(0, pos); pos++   // reserved
    buf.writeUInt16LE(1, pos);  pos += 2  // color planes
    buf.writeUInt16LE(32, pos); pos += 2  // bits per pixel
    buf.writeUInt32LE(png.length, pos);   pos += 4  // size of image data
    buf.writeUInt32LE(offsets[i], pos);   pos += 4  // offset to image data
  }

  // Image data
  for (const img of images) {
    img.png.copy(buf, pos)
    pos += img.png.length
  }

  return buf
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const resourcesDir = path.join(__dirname, '..', 'resources')
  fs.mkdirSync(resourcesDir, { recursive: true })

  const SIZES = [16, 32, 48, 64, 128, 256]
  const images = []

  console.log('Generating icon assets...')

  const sourceSvgPath = path.join(__dirname, '..', 'Labelit_Logo.svg')
  let sourceSvgBuffer = null
  if (fs.existsSync(sourceSvgPath)) {
    sourceSvgBuffer = fs.readFileSync(sourceSvgPath)
    console.log('Using Labelit_Logo.svg as source')
  }

  for (const size of SIZES) {
    let png
    if (sourceSvgBuffer) {
      png = await sharp(sourceSvgBuffer, { density: 300 })
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9 })
        .toBuffer()
    } else {
      const svg = Buffer.from(createSvg(size))
      png = await sharp(svg, { density: 96 })
        .resize(size, size)
        .png({ compressionLevel: 9 })
        .toBuffer()
    }

    images.push({ width: size, height: size, png })
    console.log(`  ✓ ${size}x${size}px`)
  }

  // Save the 512x512 PNG for documentation / macOS use
  let largePng
  if (sourceSvgBuffer) {
    largePng = await sharp(sourceSvgBuffer, { density: 300 })
      .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer()
  } else {
    const svgLarge = Buffer.from(createSvg(512))
    largePng = await sharp(svgLarge, { density: 96 })
      .resize(512, 512)
      .png({ compressionLevel: 9 })
      .toBuffer()
  }

  const pngPath = path.join(resourcesDir, 'icon.png')
  fs.writeFileSync(pngPath, largePng)
  console.log(`  ✓ icon.png (512x512) → ${pngPath}`)

  // Build .ico file
  const icoBuf = buildIco(images)
  const icoPath = path.join(resourcesDir, 'icon.ico')
  fs.writeFileSync(icoPath, icoBuf)
  console.log(`  ✓ icon.ico (${SIZES.join('+')}px) → ${icoPath}`)

  // Also save individual size PNGs for electron-builder linux/mac
  const icnsDir = path.join(resourcesDir, 'icons')
  fs.mkdirSync(icnsDir, { recursive: true })
  for (const img of images) {
    const p = path.join(icnsDir, `${img.width}x${img.width}.png`)
    fs.writeFileSync(p, img.png)
  }
  fs.writeFileSync(path.join(icnsDir, '512x512.png'), largePng)
  console.log(`  ✓ icons/ directory → ${icnsDir}`)

  console.log('\nDone! Run `npm run build:win` to package the app.')
}

main().catch((err) => {
  console.error('Icon generation failed:', err.message)
  process.exit(1)
})

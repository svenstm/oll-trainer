/**
 * Generates the app icons from an OLL pattern.
 *
 * No image dependency: the artwork is axis-aligned rounded rectangles, so it
 * rasterises in a few lines and encodes straight to PNG with node's own zlib.
 * Adding a renderer to draw six squares would cost more than it is worth.
 *
 * Run: pnpm data:icons
 */

import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

import { CASES_BY_ID } from '../src/core/data/cases'
import type { Pattern } from '../src/core/types'

/** OLL 21: a symmetric plus with four corner tabs, legible down to a favicon. */
const ICON_CASE = 21

const BACKGROUND: RGB = [0x0b, 0x0f, 0x14]
const ORIENTED: RGB = [0xf2, 0xc5, 0x3d]
const UNORIENTED: RGB = [0x3a, 0x44, 0x53]

type RGB = readonly [number, number, number]

class Canvas {
  readonly pixels: Uint8Array

  constructor(readonly size: number) {
    this.pixels = new Uint8Array(size * size * 4)
  }

  /** Rounded rectangle, in pixel coordinates. `radius` of 0 is a plain rect. */
  fillRoundedRect(x: number, y: number, w: number, h: number, radius: number, colour: RGB): void {
    const r = Math.min(radius, w / 2, h / 2)
    const left = Math.max(0, Math.floor(x))
    const top = Math.max(0, Math.floor(y))
    const right = Math.min(this.size, Math.ceil(x + w))
    const bottom = Math.min(this.size, Math.ceil(y + h))

    for (let py = top; py < bottom; py++) {
      for (let px = left; px < right; px++) {
        // Sample the pixel centre, so edges land where they look like they should.
        const cx = px + 0.5
        const cy = py + 0.5
        if (cx < x || cx > x + w || cy < y || cy > y + h) continue
        if (r > 0 && !insideRounded(cx - x, cy - y, w, h, r)) continue
        const at = (py * this.size + px) * 4
        this.pixels[at] = colour[0]
        this.pixels[at + 1] = colour[1]
        this.pixels[at + 2] = colour[2]
        this.pixels[at + 3] = 255
      }
    }
  }
}

function insideRounded(x: number, y: number, w: number, h: number, r: number): boolean {
  const nearestX = x < r ? r : x > w - r ? w - r : x
  const nearestY = y < r ? r : y > h - r ? h - r : y
  const dx = x - nearestX
  const dy = y - nearestY
  return dx * dx + dy * dy <= r * r
}

/**
 * The same layout <OllFace> draws: a 3x3 U face with the top row of each side
 * face as a tab outside it. The art spans units 9..91 of a 100-unit box.
 */
function drawPattern(canvas: Canvas, pattern: Pattern, originPx: number, spanPx: number): void {
  const unit = spanPx / 82
  const at = (u: number) => originPx + (u - 9) * unit

  const CELL = 18
  const STEP = 21
  const FACE = 20
  const TAB = 8
  const near = FACE - 3 - TAB
  const far = FACE + 3 * STEP - 3

  const box = (u: number, v: number, w: number, h: number, slot: number) => {
    const oriented = pattern[slot] === 1
    if (!oriented && slot >= 9) return
    canvas.fillRoundedRect(
      at(u),
      at(v),
      w * unit,
      h * unit,
      (slot < 9 ? 2.5 : 1.5) * unit,
      oriented ? ORIENTED : UNORIENTED,
    )
  }

  for (let slot = 0; slot < 9; slot++) {
    box(FACE + (slot % 3) * STEP, FACE + Math.floor(slot / 3) * STEP, CELL, CELL, slot)
  }
  for (let k = 0; k < 3; k++) {
    const along = FACE + k * STEP
    box(along, near, CELL, TAB, 9 + k)
    box(far, along, TAB, CELL, 12 + k)
    box(along, far, CELL, TAB, 15 + k)
    box(near, along, TAB, CELL, 18 + k)
  }
}

interface IconSpec {
  file: string
  size: number
  /** Fraction of the canvas the artwork occupies. */
  inset: number
  /** Corner radius as a fraction of the canvas; 0 for full-bleed. */
  radius: number
}

const ICONS: readonly IconSpec[] = [
  // "any": a rounded tile, the way a desktop or Android launcher shows it.
  { file: 'pwa-192.png', size: 192, inset: 0.82, radius: 0.22 },
  { file: 'pwa-512.png', size: 512, inset: 0.82, radius: 0.22 },
  // "maskable": the launcher applies its own shape, so the background must
  // reach every edge and the artwork must stay inside the safe zone.
  { file: 'pwa-maskable-512.png', size: 512, inset: 0.58, radius: 0 },
  // iOS applies its own mask too, and dislikes transparency.
  { file: 'apple-touch-icon.png', size: 180, inset: 0.74, radius: 0 },
  { file: 'favicon-32.png', size: 32, inset: 0.9, radius: 0.22 },
]

function render(spec: IconSpec): Buffer {
  const canvas = new Canvas(spec.size)
  canvas.fillRoundedRect(0, 0, spec.size, spec.size, spec.radius * spec.size, BACKGROUND)
  const span = spec.size * spec.inset
  drawPattern(canvas, CASES_BY_ID.get(ICON_CASE)!.pattern, (spec.size - span) / 2, span)
  return encodePng(canvas)
}

// --- PNG ------------------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng(canvas: Canvas): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(canvas.size, 0)
  header.writeUInt32BE(canvas.size, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // truecolour with alpha
  // compression, filter and interlace methods are all 0.

  // Each scanline is prefixed with its filter type; 0 means "none".
  const stride = canvas.size * 4
  const raw = Buffer.alloc((stride + 1) * canvas.size)
  for (let y = 0; y < canvas.size; y++) {
    raw[y * (stride + 1)] = 0
    Buffer.from(canvas.pixels.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array()),
  ])
}

for (const spec of ICONS) {
  const png = render(spec)
  writeFileSync(`public/${spec.file}`, png)
  console.log(
    `public/${spec.file}  ${spec.size}x${spec.size}  ${(png.length / 1024).toFixed(1)} kB`,
  )
}

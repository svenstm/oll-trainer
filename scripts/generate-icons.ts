/**
 * Generates every app icon from an OLL pattern, as a seal.
 *
 * The mark is Sune — the case the site is named after — drawn as a yellow
 * stamp: a yellow block, a dark carved plate, and the oriented stickers cut
 * back out in yellow. The plate showing through the gutters is what makes it
 * read as a cube face rather than a scatter of squares.
 *
 * Small sizes drop the outer ring and use chunkier cells. A favicon is 16px of
 * pixels; the ring that makes the large icon look stamped just turns to mud
 * down there, so the small ones are a deliberately simpler drawing of the same
 * mark rather than a scaled copy.
 *
 * Only the U face is drawn. The 12 side stickers an <OllFace> diagram needs to
 * identify a case are illegible at these sizes, and an icon has to be a mark
 * before it is a diagram.
 *
 * No image dependency: the artwork is axis-aligned rounded rectangles, so it
 * rasterises in a few lines and encodes straight to PNG with node's own zlib.
 *
 * Run: pnpm data:icons
 */

import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

import { CASES_BY_ID } from '../src/core/data/cases'
import type { Pattern } from '../src/core/types'

/** OLL 27, Sune. The pun the whole site rests on, so it is the mark. */
const ICON_CASE = 27

type RGB = readonly [number, number, number]

/** Matches --sticker-up and a shade just off --bg, so the icon looks native. */
const YELLOW: RGB = [0xf2, 0xc5, 0x3d]
const DARK: RGB = [0x14, 0x1a, 0x22]

/**
 * Geometry in a 512-unit design space, scaled to whatever the target size is.
 */
interface Style {
  /** Corner radius of the outer block. 0 for the icons a launcher masks. */
  tileRadius: number
  /** Width of the dark seal ring; 0 leaves it off. */
  ring: number
  /** Gap between the block's edge and the ring. */
  ringInset: number
  /** Inset of the dark plate the stickers sit on. */
  plateInset: number
  plateRadius: number
  /** Gap between stickers, which is what shows the plate as grid lines. */
  gutter: number
  cellRadius: number
}

/** The full mark: ring and all. For anything big enough to show it. */
const SEAL: Style = {
  tileRadius: 96,
  ring: 30,
  ringInset: 26,
  plateInset: 122,
  plateRadius: 24,
  gutter: 15,
  cellRadius: 11,
}

/** No ring, bigger plate, chunkier cells: what survives 16 pixels. */
const SMALL: Style = {
  tileRadius: 76,
  ring: 0,
  ringInset: 0,
  plateInset: 66,
  plateRadius: 34,
  gutter: 24,
  cellRadius: 15,
}

/**
 * For the icons a launcher masks to its own shape (Android maskable, iOS).
 *
 * Full bleed, so no transparent corner can show through the mask, and no ring:
 * a frame is the one element a circle crop cuts, and a clipped frame reads as
 * a mistake. Everything stays inside the safe zone — the middle 80%.
 */
const MASKED: Style = {
  tileRadius: 0,
  ring: 0,
  ringInset: 0,
  // The safe zone is a circle of 80% diameter, so the largest square that fits
  // inside it sits at an inset of ~111. A little under that, for margin.
  plateInset: 124,
  plateRadius: 34,
  gutter: 20,
  cellRadius: 14,
}

/**
 * iOS masks with a squircle, which is far more generous than Android's circle,
 * so the mark can be bigger here without risking a corner. Filling the tile
 * matters on a home screen, where a small mark in a big field looks unfinished.
 */
const APPLE: Style = { ...MASKED, plateInset: 92, plateRadius: 40, gutter: 24, cellRadius: 16 }

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

/** One rounded rect of the mark, in 512-unit design coordinates. */
interface Shape {
  x: number
  y: number
  size: number
  radius: number
  colour: RGB
}

/**
 * The mark, as a flat list of rounded rects in painting order.
 *
 * Both the raster and the SVG build from this, so they cannot drift apart.
 * The ring is painted as a dark square with a yellow square on top rather than
 * a stroke, because that is all the rasteriser can do and it keeps the two
 * renderers honest.
 */
function sealShapes(pattern: Pattern, style: Style): Shape[] {
  const shapes: Shape[] = [{ x: 0, y: 0, size: 512, radius: style.tileRadius, colour: YELLOW }]

  if (style.ring > 0) {
    const outer = style.ringInset
    shapes.push({
      x: outer,
      y: outer,
      size: 512 - 2 * outer,
      radius: Math.max(0, style.tileRadius - outer),
      colour: DARK,
    })
    const inner = outer + style.ring
    shapes.push({
      x: inner,
      y: inner,
      size: 512 - 2 * inner,
      radius: Math.max(0, style.tileRadius - inner),
      colour: YELLOW,
    })
  }

  const plate = style.plateInset
  const plateSpan = 512 - 2 * plate
  shapes.push({
    x: plate,
    y: plate,
    size: plateSpan,
    radius: style.plateRadius,
    colour: DARK,
  })

  // Three cells and four gutters across, so the plate frames the grid evenly.
  const cell = (plateSpan - 4 * style.gutter) / 3
  for (let slot = 0; slot < 9; slot++) {
    // Unoriented stickers are simply left as plate, which is the dark cell.
    if (pattern[slot] !== 1) continue
    shapes.push({
      x: plate + style.gutter + (slot % 3) * (cell + style.gutter),
      y: plate + style.gutter + Math.floor(slot / 3) * (cell + style.gutter),
      size: cell,
      radius: style.cellRadius,
      colour: YELLOW,
    })
  }

  return shapes
}

interface IconSpec {
  file: string
  size: number
  style: Style
}

const ICONS: readonly IconSpec[] = [
  // Shown as provided, at a size that carries the full mark.
  { file: 'pwa-192.png', size: 192, style: SEAL },
  { file: 'pwa-512.png', size: 512, style: SEAL },
  // Both of these get masked by the platform.
  { file: 'pwa-maskable-512.png', size: 512, style: MASKED },
  { file: 'apple-touch-icon.png', size: 180, style: APPLE },
  { file: 'favicon-32.png', size: 32, style: SMALL },
]

/**
 * favicon.ico carries the small sizes a tab or bookmark actually asks for, so
 * every size in it uses the simple mark. A bookmark showing a different
 * drawing from the tab beside it would just look like two icons.
 */
const ICO_SIZES = [16, 32, 48] as const

function render(size: number, style: Style): Buffer {
  const canvas = new Canvas(size)
  const scale = size / 512
  for (const shape of sealShapes(CASES_BY_ID.get(ICON_CASE)!.pattern, style)) {
    canvas.fillRoundedRect(
      shape.x * scale,
      shape.y * scale,
      shape.size * scale,
      shape.size * scale,
      shape.radius * scale,
      shape.colour,
    )
  }
  return encodePng(canvas)
}

function renderSvg(style: Style): string {
  const hex = (c: RGB) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')
  const rects = sealShapes(CASES_BY_ID.get(ICON_CASE)!.pattern, style)
    .map(
      (s) =>
        `  <rect x="${round(s.x)}" y="${round(s.y)}" width="${round(s.size)}" ` +
        `height="${round(s.size)}" rx="${round(s.radius)}" fill="${hex(s.colour)}" />`,
    )
    .join('\n')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Sunetzu">
  <!-- GENERATED by scripts/generate-icons.ts (pnpm data:icons). Do not edit. -->
${rects}
</svg>
`
}

const round = (n: number) => Math.round(n * 100) / 100

// --- ICO ------------------------------------------------------------------

/**
 * An ICO wrapping PNGs, which every browser in use understands. The directory
 * stores 0 for a 256px side, so nothing here needs the special case.
 */
function encodeIco(images: readonly { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // 1 = icon
  header.writeUInt16LE(images.length, 4)

  let offset = 6 + images.length * 16
  const entries: Buffer[] = []
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16)
    entry[0] = size >= 256 ? 0 : size
    entry[1] = size >= 256 ? 0 : size
    entry[2] = 0 // palette size
    entry[3] = 0 // reserved
    entry.writeUInt16LE(1, 4) // colour planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    offset += png.length
  }

  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)])
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

// --- write ----------------------------------------------------------------

for (const spec of ICONS) {
  const png = render(spec.size, spec.style)
  writeFileSync(`public/${spec.file}`, png)
  console.log(
    `public/${spec.file}  ${spec.size}x${spec.size}  ${(png.length / 1024).toFixed(1)} kB`,
  )
}

const ico = encodeIco(ICO_SIZES.map((size) => ({ size, png: render(size, SMALL) })))
writeFileSync('public/favicon.ico', ico)
console.log(`public/favicon.ico  ${ICO_SIZES.join('/')}  ${(ico.length / 1024).toFixed(1)} kB`)

// Browsers prefer the SVG over the .ico, and they use it in tabs — small.
// Giving it the full ringed mark would put the busy drawing exactly where
// there is no room for it, so it matches the other favicons instead.
writeFileSync('public/icon.svg', renderSvg(SMALL))
console.log('public/icon.svg')

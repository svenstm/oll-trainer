/**
 * The 21-slot OLL pattern, and the enumeration of all 57 cases from
 * combinatorics alone.
 *
 * Slots 0-8 are the U face, row-major as drawn (row 0 nearest B). Slots 9-20
 * are the top row of each side face, three per side, in B R F L order; within
 * a side they run in the order they are drawn around the U face, so slot 9 is
 * the B sticker above U slot 0 and slot 12 is the R sticker beside U slot 2.
 * Both the slot layout and the y-rotation action are derived from `cube.ts`
 * geometry rather than transcribed.
 */

import { applyMoves, FACELETS, U, type Cube } from './cube'
import type { Pattern } from './types'

export const SLOT_COUNT = 21
export const ORIENTED_SLOTS = 9

/** Outward normals of the four side faces, in the B R F L order the slots use. */
const SIDE_NORMALS = [
  [0, 0, -1],
  [1, 0, 0],
  [0, 0, 1],
  [-1, 0, 0],
] as const

function buildSlotFacelets(): readonly number[] {
  const uSlots = [0, 1, 2, 3, 4, 5, 6, 7, 8]
  const slots = [...uSlots]
  for (const normal of SIDE_NORMALS) {
    // A side's three slots line up with the U slots it borders, in the same
    // drawing order, which is what makes <OllFace> able to lay them out.
    const bordering = uSlots.filter((slot) => {
      const pos = FACELETS[slot]!.pos
      return pos[0] * normal[0] + pos[1] * normal[1] + pos[2] * normal[2] === 1
    })
    for (const slot of bordering) {
      const pos = FACELETS[slot]!.pos
      const index = FACELETS.findIndex(
        (f) =>
          f.pos[0] === pos[0] &&
          f.pos[1] === pos[1] &&
          f.pos[2] === pos[2] &&
          f.normal[0] === normal[0] &&
          f.normal[1] === normal[1] &&
          f.normal[2] === normal[2],
      )
      slots.push(index)
    }
  }
  return Object.freeze(slots)
}

/** Slot index -> facelet index. */
export const SLOT_FACELETS: readonly number[] = buildSlotFacelets()

const FACELET_SLOT = new Map<number, number>(SLOT_FACELETS.map((facelet, slot) => [facelet, slot]))

/** Slot index the sticker in each slot moves to under one y rotation. */
function buildRotationMap(): readonly number[] {
  // Applying a move to a cube whose "colours" are facelet indices reads out the
  // permutation directly: `moved[to]` is the index the sticker came from.
  const labelled: Cube = Array.from({ length: 54 }, (_, i) => i)
  const moved = applyMoves(labelled, 'y')
  return Object.freeze(SLOT_FACELETS.map((facelet) => FACELET_SLOT.get(moved[facelet]!)!))
}

/** `ROTATION_SOURCE[s]` is the slot whose value lands in slot `s` after one y. */
const ROTATION_SOURCE = buildRotationMap()

export function rotatePattern(pattern: Pattern, quarterTurns = 1): Pattern {
  let out = pattern
  for (let i = 0; i < ((quarterTurns % 4) + 4) % 4; i++) {
    out = ROTATION_SOURCE.map((source) => out[source]!)
  }
  return out
}

export function patternFromCube(cube: Cube): Pattern {
  return SLOT_FACELETS.map((facelet) => (cube[facelet] === U ? 1 : 0))
}

export function patternKey(pattern: Pattern): string {
  return pattern.join('')
}

export function patternFromKey(key: string): Pattern {
  return [...key].map((c) => (c === '1' ? 1 : 0))
}

export function patternsEqual(a: Pattern, b: Pattern): boolean {
  return patternKey(a) === patternKey(b)
}

/** The lexicographically smallest of a pattern's four U-rotations. */
export function canonicalPattern(pattern: Pattern): Pattern {
  let best = pattern
  for (let turns = 1; turns < 4; turns++) {
    const candidate = rotatePattern(pattern, turns)
    if (patternKey(candidate) < patternKey(best)) best = candidate
  }
  return best
}

/** How many y turns take `from` to `to`, or null if they are different cases. */
export function rotationBetween(from: Pattern, to: Pattern): number | null {
  for (let turns = 0; turns < 4; turns++) {
    if (patternsEqual(rotatePattern(from, turns), to)) return turns
  }
  return null
}

export const SOLVED_PATTERN: Pattern = Object.freeze(
  Array.from({ length: SLOT_COUNT }, (_, slot) => (slot < 9 ? 1 : 0)),
) as Pattern

export function isWellFormedPattern(pattern: Pattern): boolean {
  return (
    pattern.length === SLOT_COUNT &&
    pattern.every((slot) => slot === 0 || slot === 1) &&
    pattern.reduce<number>((sum, slot) => sum + slot, 0) === ORIENTED_SLOTS
  )
}

// ---------------------------------------------------------------------------
// Enumeration
// ---------------------------------------------------------------------------

/**
 * The last layer's four corners, each as the slots its U colour can sit in,
 * ordered by twist: index 0 is oriented, then clockwise as seen from outside
 * the corner. The handedness flips with the sign of x·z, which is what makes
 * "twists sum to 0 mod 3" the right constraint for all four at once.
 */
function buildCornerTwists(): readonly (readonly [number, number, number])[] {
  const corners: (readonly [number, number, number])[] = []
  for (let slot = 0; slot < 9; slot++) {
    const pos = FACELETS[SLOT_FACELETS[slot]!]!.pos
    if (pos[0] === 0 || pos[2] === 0) continue
    const xSlot = sideSlotAt(pos, [pos[0], 0, 0])
    const zSlot = sideSlotAt(pos, [0, 0, pos[2]])
    corners.push(pos[0] * pos[2] === 1 ? [slot, xSlot, zSlot] : [slot, zSlot, xSlot])
  }
  return corners
}

/** The last layer's four edges, as [oriented slot, flipped slot]. */
function buildEdgeFlips(): readonly (readonly [number, number])[] {
  const edges: (readonly [number, number])[] = []
  for (let slot = 0; slot < 9; slot++) {
    const pos = FACELETS[SLOT_FACELETS[slot]!]!.pos
    const nonZero = (pos[0] === 0 ? 0 : 1) + (pos[2] === 0 ? 0 : 1)
    if (nonZero !== 1) continue
    edges.push([slot, sideSlotAt(pos, [pos[0], 0, pos[2]])])
  }
  return edges
}

function sideSlotAt(pos: readonly number[], normal: readonly number[]): number {
  const facelet = FACELETS.findIndex(
    (f) =>
      f.pos[0] === pos[0] &&
      f.pos[1] === pos[1] &&
      f.pos[2] === pos[2] &&
      f.normal[0] === normal[0] &&
      f.normal[1] === normal[1] &&
      f.normal[2] === normal[2],
  )
  return FACELET_SLOT.get(facelet)!
}

export const CORNER_TWISTS = buildCornerTwists()
export const EDGE_FLIPS = buildEdgeFlips()

/**
 * All 57 OLL cases, from first principles: four corners twisted 0/1/2 summing
 * to 0 mod 3 (27), four edges flipped with an even number flipped (8), giving
 * 216 last-layer orientations; quotient by the four U-rotations and drop the
 * solved state. Burnside — not a plain division — because two states are fixed
 * by a quarter turn and twelve by a half turn: (216 + 2 + 12 + 2) / 4 = 58.
 *
 * Returned canonicalised and sorted, so the output is stable across runs.
 */
export function enumerateOllPatterns(): Pattern[] {
  const seen = new Map<string, Pattern>()
  const solvedKey = patternKey(SOLVED_PATTERN)

  for (const twists of vectors(4, 3, 3)) {
    for (const flips of vectors(4, 2, 2)) {
      const slots: (0 | 1)[] = Array.from({ length: SLOT_COUNT }, () => 0)
      slots[4] = 1 // the U centre is always oriented
      CORNER_TWISTS.forEach((corner, i) => {
        slots[corner[twists[i]!]!] = 1
      })
      EDGE_FLIPS.forEach((edge, i) => {
        slots[edge[flips[i]!]!] = 1
      })
      const canonical = canonicalPattern(slots)
      const key = patternKey(canonical)
      if (key !== solvedKey) seen.set(key, canonical)
    }
  }

  return [...seen.keys()].sort().map((key) => seen.get(key)!)
}

/** All length-`n` vectors over 0..`base`-1 whose sum is 0 mod `modulus`. */
function vectors(n: number, base: number, modulus: number): number[][] {
  const out: number[][] = []
  const current: number[] = []
  const walk = (depth: number, sum: number) => {
    if (depth === n) {
      if (sum % modulus === 0) out.push([...current])
      return
    }
    for (let value = 0; value < base; value++) {
      current.push(value)
      walk(depth + 1, sum + value)
      current.pop()
    }
  }
  walk(0, 0)
  return out
}

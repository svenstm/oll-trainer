/**
 * A facelet cube model, derived from geometry rather than hand-written
 * permutation tables.
 *
 * Every sticker is a (position, outward normal) pair of integer vectors in
 * {-1,0,1}³. A move is a quarter-turn rotation matrix applied to whichever
 * layers it touches, acting on both vectors at once. That makes face turns,
 * slice turns, wide turns and whole-cube rotations one mechanism instead of
 * four hand-transcribed tables, which is where transcription errors live.
 *
 * Coordinates are right-handed: +x right, +y up, +z toward the viewer.
 */

/** Face ids, in the URFDLB order the 54-facelet array is laid out in. */
export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'] as const
export type Face = (typeof FACES)[number]

/**
 * 54 face ids. Index 0-8 is U, 9-17 R, 18-26 F, 27-35 D, 36-44 L, 45-53 B;
 * within a face, row-major as that face is drawn in the standard net.
 */
export type Cube = readonly number[]

export const U = 0
export const R = 1
export const F = 2
export const D = 3
export const L = 4
export const B = 5

export const SOLVED: Cube = Object.freeze(Array.from({ length: 54 }, (_, i) => Math.floor(i / 9)))

type Vec = readonly [number, number, number]
type Axis = 0 | 1 | 2

/**
 * Per face: outward normal, and how position changes as the drawn row and
 * column advance. `origin` is the position of that face's row 0, column 0.
 */
const FACE_GEOMETRY: readonly { normal: Vec; origin: Vec; rowDir: Vec; colDir: Vec }[] = [
  // U — drawn with B at the top, so rows run back to front.
  { normal: [0, 1, 0], origin: [-1, 1, -1], rowDir: [0, 0, 1], colDir: [1, 0, 0] },
  // R — seen from the right, so columns run front to back.
  { normal: [1, 0, 0], origin: [1, 1, 1], rowDir: [0, -1, 0], colDir: [0, 0, -1] },
  { normal: [0, 0, 1], origin: [-1, 1, 1], rowDir: [0, -1, 0], colDir: [1, 0, 0] },
  // D — drawn below F, so rows run front to back.
  { normal: [0, -1, 0], origin: [-1, -1, 1], rowDir: [0, 0, -1], colDir: [1, 0, 0] },
  { normal: [-1, 0, 0], origin: [-1, 1, -1], rowDir: [0, -1, 0], colDir: [0, 0, 1] },
  // B — seen from behind, so columns run right to left.
  { normal: [0, 0, -1], origin: [1, 1, -1], rowDir: [0, -1, 0], colDir: [-1, 0, 0] },
]

export interface Facelet {
  readonly pos: Vec
  readonly normal: Vec
}

function buildFacelets(): readonly Facelet[] {
  const out: Facelet[] = []
  for (const face of FACE_GEOMETRY) {
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        out.push({
          pos: [
            face.origin[0] + row * face.rowDir[0] + col * face.colDir[0],
            face.origin[1] + row * face.rowDir[1] + col * face.colDir[1],
            face.origin[2] + row * face.rowDir[2] + col * face.colDir[2],
          ],
          normal: face.normal,
        })
      }
    }
  }
  return out
}

/** Index -> (position, normal). The inverse of `FACELET_INDEX`. */
export const FACELETS: readonly Facelet[] = buildFacelets()

function key(pos: Vec, normal: Vec): string {
  return `${pos[0]},${pos[1]},${pos[2]}|${normal[0]},${normal[1]},${normal[2]}`
}

const FACELET_INDEX = new Map<string, number>(FACELETS.map((f, i) => [key(f.pos, f.normal), i]))

/** Quarter turn clockwise as seen from the positive end of each axis. */
const ROTATE: readonly ((v: Vec) => Vec)[] = [
  (v) => [v[0], v[2], -v[1]],
  (v) => [-v[2], v[1], v[0]],
  (v) => [v[1], -v[0], v[2]],
]

function rotate(v: Vec, axis: Axis, quarterTurns: number): Vec {
  const turn = ROTATE[axis]!
  let out = v
  for (let i = 0; i < ((quarterTurns % 4) + 4) % 4; i++) out = turn(out)
  return out
}

/**
 * `dir` is how many clockwise-from-positive-axis quarter turns one clockwise
 * turn of this move is. It is -1 for D, L, B (whose faces are clockwise when
 * seen from the *negative* end) and for the slices that follow them, M and E.
 */
interface MoveDef {
  axis: Axis
  dir: 1 | -1
  /** Which axis coordinates the move takes with it. */
  layers: readonly number[]
}

const MOVE_DEFS: Readonly<Record<string, MoveDef>> = {
  U: { axis: 1, dir: 1, layers: [1] },
  D: { axis: 1, dir: -1, layers: [-1] },
  E: { axis: 1, dir: -1, layers: [0] },
  u: { axis: 1, dir: 1, layers: [1, 0] },
  d: { axis: 1, dir: -1, layers: [-1, 0] },
  y: { axis: 1, dir: 1, layers: [1, 0, -1] },

  R: { axis: 0, dir: 1, layers: [1] },
  L: { axis: 0, dir: -1, layers: [-1] },
  M: { axis: 0, dir: -1, layers: [0] },
  r: { axis: 0, dir: 1, layers: [1, 0] },
  l: { axis: 0, dir: -1, layers: [-1, 0] },
  x: { axis: 0, dir: 1, layers: [1, 0, -1] },

  F: { axis: 2, dir: 1, layers: [1] },
  B: { axis: 2, dir: -1, layers: [-1] },
  S: { axis: 2, dir: 1, layers: [0] },
  f: { axis: 2, dir: 1, layers: [1, 0] },
  b: { axis: 2, dir: -1, layers: [-1, 0] },
  z: { axis: 2, dir: 1, layers: [1, 0, -1] },
}

export interface Move {
  /** Normalised base, e.g. `Rw` and `r` both parse to `r`. */
  base: string
  /** 1, 2 or 3 clockwise quarter turns. */
  amount: 1 | 2 | 3
}

const MOVE_TOKEN = /^([URFDLB]w|[URFDLBMESurfdlbxyz])(2'|'2|2|')?$/

/** Permutation cache: `perm[to] = from`. */
const permCache = new Map<string, readonly number[]>()

function permutationFor(move: Move): readonly number[] {
  const cacheKey = `${move.base}${move.amount}`
  const cached = permCache.get(cacheKey)
  if (cached) return cached

  const def = MOVE_DEFS[move.base]!
  const quarterTurns = def.dir * move.amount
  const perm = Array.from({ length: 54 }, (_, i) => i)
  for (let from = 0; from < 54; from++) {
    const facelet = FACELETS[from]!
    if (!def.layers.includes(facelet.pos[def.axis])) continue
    const to = FACELET_INDEX.get(
      key(
        rotate(facelet.pos, def.axis, quarterTurns),
        rotate(facelet.normal, def.axis, quarterTurns),
      ),
    )!
    perm[to] = from
  }
  const frozen = Object.freeze(perm)
  permCache.set(cacheKey, frozen)
  return frozen
}

export class MoveSyntaxError extends Error {
  constructor(token: string) {
    super(`Not a move: ${JSON.stringify(token)}`)
    this.name = 'MoveSyntaxError'
  }
}

export function parseMove(token: string): Move {
  const match = MOVE_TOKEN.exec(token)
  if (!match) throw new MoveSyntaxError(token)
  const raw = match[1]!
  // `Rw` and `r` are the same move; normalise so the two spellings compare equal.
  const base = raw.length === 2 ? raw[0]!.toLowerCase() : raw
  const suffix = match[2] ?? ''
  const amount = suffix === '' ? 1 : suffix === "'" ? 3 : 2
  return { base, amount }
}

export function parseMoves(sequence: string): Move[] {
  return tokenize(sequence).map(parseMove)
}

/** Splits on whitespace, and tolerates the `(x y)` grouping algorithms are often written with. */
export function tokenize(sequence: string): string[] {
  return sequence
    .replace(/[()[\]]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
}

export function formatMove(move: Move): string {
  return move.base + (move.amount === 1 ? '' : move.amount === 2 ? '2' : "'")
}

export function formatMoves(moves: readonly Move[]): string {
  return moves.map(formatMove).join(' ')
}

export function invertMove(move: Move): Move {
  return { base: move.base, amount: (4 - move.amount) as 1 | 2 | 3 }
}

/**
 * Token-based, so wide and slice moves survive. The old app inverted with a
 * regex over `R/F/L/B` and would have mangled `r`, `M` and `Rw`.
 */
export function invertMoves(sequence: string): string {
  return formatMoves(parseMoves(sequence).reverse().map(invertMove))
}

export function applyMove(cube: Cube, move: Move): Cube {
  const perm = permutationFor(move)
  return perm.map((from) => cube[from]!)
}

export function applyMoves(cube: Cube, sequence: string | readonly Move[]): Cube {
  const moves = typeof sequence === 'string' ? parseMoves(sequence) : sequence
  let out = cube
  for (const move of moves) out = applyMove(out, move)
  return out
}

export function isSolved(cube: Cube): boolean {
  return cube.every((face, i) => face === SOLVED[i])
}

export function cubesEqual(a: Cube, b: Cube): boolean {
  return a.length === b.length && a.every((face, i) => face === b[i])
}

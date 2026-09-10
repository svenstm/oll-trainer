/**
 * Picking and reframing scrambles.
 *
 * A case is drilled from all four angles by rewriting the scramble rather than
 * by asking for an extra U turn, so the same case does not always arrive as
 * the same sequence of moves. The rewrite is token-based and its table is
 * *derived* from the cube model, not hand-written: the old app remapped faces
 * with a case-insensitive regex over `R/F/L/B`, which silently corrupts the
 * `r`, `f` and `l` that real algorithms contain.
 */

import {
  applyMoves,
  cubesEqual,
  formatMove,
  parseMoves,
  SOLVED,
  type Move,
  type Cube,
} from './cube'
import { CASES_BY_ID } from './data/cases'
import { SCRAMBLES } from './data/scrambles'
import { rotationBetween } from './pattern'
import type { OllCase, Pattern, Rotation } from './types'

export const ROTATIONS: readonly Rotation[] = ['', 'y', 'y2', "y'"]

const QUARTER_TURNS: Readonly<Record<Rotation, number>> = { '': 0, y: 1, y2: 2, "y'": 3 }

const BASES = 'URFDLBMESurfdlbxyz'.split('')
const AMOUNTS = [1, 2, 3] as const

const ALL_MOVES: readonly Move[] = BASES.flatMap((base) =>
  AMOUNTS.map((amount) => ({ base, amount }) as Move),
)

function cubeFor(moves: readonly Move[]): Cube {
  return applyMoves(SOLVED, moves)
}

/**
 * For each move, the move that leaves the case turned one quarter further on.
 * Found by comparing `y' m y` against every move rather than transcribed, so
 * slices and wide turns cannot be got backwards — and the direction is fixed
 * by search too, since `y m y'` turns the case the other way.
 */
function buildConjugation(): ReadonlyMap<string, Move> {
  const table = new Map<string, Move>()
  const byCube = ALL_MOVES.map((move) => ({ move, cube: cubeFor([move]) }))
  for (const move of ALL_MOVES) {
    const conjugated = applyMoves(SOLVED, [
      { base: 'y', amount: 3 },
      move,
      { base: 'y', amount: 1 },
    ])
    const match = byCube.find((candidate) => cubesEqual(candidate.cube, conjugated))
    if (match) table.set(formatMove(move), match.move)
  }
  return table
}

const CONJUGATE_BY_Y = buildConjugation()

/** The move that does to a `y`-turned cube what `move` does to this one. */
function conjugate(move: Move, quarterTurns: number): Move {
  let out = move
  for (let i = 0; i < quarterTurns; i++) {
    const next = CONJUGATE_BY_Y.get(formatMove(out))
    // Every move in the notation has a conjugate; if one ever did not, leaving
    // it alone would silently produce a scramble for a different case.
    if (!next) throw new Error(`No y-conjugate for ${formatMove(out)}`)
    out = next
  }
  return out
}

/**
 * Rewrites a scramble so it produces the same case turned by `rotation`, while
 * still starting from a cube held the usual way.
 */
export function applyRotation(sequence: string, rotation: Rotation): string {
  const quarterTurns = QUARTER_TURNS[rotation]
  if (quarterTurns === 0) return sequence
  return parseMoves(sequence)
    .map((move) => formatMove(conjugate(move, quarterTurns)))
    .join(' ')
}

export function scramblesFor(caseId: number): readonly string[] {
  return SCRAMBLES[caseId] ?? []
}

export interface PickedScramble {
  caseId: number
  scramble: string
  rotation: Rotation
}

/**
 * Picks one of a case's scrambles and an angle to show it from. `random` is
 * injected so tests stay deterministic; `rotation` is passed in by learn mode,
 * which chooses the angle itself to keep coverage even.
 */
export function pickScramble(
  caseId: number,
  random: () => number = Math.random,
  rotation?: Rotation,
): PickedScramble {
  const options = scramblesFor(caseId)
  if (options.length === 0) throw new Error(`No scrambles for OLL ${caseId}`)
  if (!CASES_BY_ID.has(caseId)) throw new Error(`No such case: OLL ${caseId}`)

  const base = options[Math.floor(random() * options.length)]!
  const angle = rotation ?? ROTATIONS[Math.floor(random() * ROTATIONS.length)]!
  return { caseId, scramble: applyRotation(base, angle), rotation: angle }
}

/** The rotation that undoes each quarter turn, indexed by quarter turns. */
const UNTURN: readonly Rotation[] = ['', "y'", 'y2', 'y']

export interface DrawnSolution {
  /** The rotation to hold the cube by first, or '' when it is already square. */
  hold: Rotation
  /** The case's canonical algorithm, unchanged. */
  alg: string
}

/**
 * The solution for a case *as drawn*.
 *
 * A case is stored in the one orientation its algorithm is written for, but it
 * is served at any of four angles — so on three of them the bare algorithm
 * does not solve the cube in the user's hands. Rather than rewrite the
 * algorithm into an unrecognisable conjugate, this returns the cube rotation
 * that squares the angle on screen up with the algorithm; `hold` then `alg` is
 * a sequence that really does orient the last layer.
 */
export function solutionAsDrawn(ollCase: OllCase, drawn: Pattern): DrawnSolution {
  // Symmetric cases (H, Pi, the two dot cases that survive a half turn) match
  // at more than one angle; `rotationBetween` finds the smallest, so those ask
  // for no rotation at all — correctly, since the algorithm solves them from
  // either side. A null cannot happen for a case's own pattern, and asking for
  // no rotation is the safe reading if it ever did.
  const quarterTurns = rotationBetween(ollCase.pattern, drawn) ?? 0
  return { hold: UNTURN[quarterTurns]!, alg: ollCase.alg }
}

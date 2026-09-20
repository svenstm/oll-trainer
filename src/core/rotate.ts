/**
 * Turning a sequence of moves to match a cube held a quarter turn further on.
 *
 * Split out of `scramble.ts`, which reaches for the generated case data: the
 * binder in `scripts/verify-cases.ts` needs this table to tell a genuinely new
 * algorithm from one of ours written from another angle, and a generator that
 * imports its own previous output is a generator that can bootstrap a stale
 * answer. Nothing here knows about cases, scrambles or the app.
 *
 * The table is *derived* from the cube model, not hand-written: the old app
 * remapped faces with a case-insensitive regex over `R/F/L/B`, which silently
 * corrupts the `r`, `f` and `l` that real algorithms contain.
 */

import {
  applyMoves,
  cubesEqual,
  formatMove,
  parseMoves,
  SOLVED,
  type Cube,
  type Move,
} from './cube'
import type { Rotation } from './types'

export const ROTATIONS: readonly Rotation[] = ['', 'y', 'y2', "y'"]

export const QUARTER_TURNS: Readonly<Record<Rotation, number>> = { '': 0, y: 1, y2: 2, "y'": 3 }

/** The rotation that undoes each quarter turn, indexed by quarter turns. */
export const UNTURN: readonly Rotation[] = ['', "y'", 'y2', 'y']

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
export function conjugate(move: Move, quarterTurns: number): Move {
  let out = move
  for (let i = 0; i < ((quarterTurns % 4) + 4) % 4; i++) {
    const next = CONJUGATE_BY_Y.get(formatMove(out))
    // Every move in the notation has a conjugate; if one ever did not, leaving
    // it alone would silently produce a scramble for a different case.
    if (!next) throw new Error(`No y-conjugate for ${formatMove(out)}`)
    out = next
  }
  return out
}

/**
 * Rewrites a sequence so it does to a cube turned by `rotation` what the
 * original does to this one, while still starting from a cube held the usual
 * way.
 */
export function applyRotation(sequence: string, rotation: Rotation): string {
  return turnSequence(sequence, QUARTER_TURNS[rotation])
}

/** `applyRotation`, by quarter turns rather than by name. */
export function turnSequence(sequence: string, quarterTurns: number): string {
  const turns = ((quarterTurns % 4) + 4) % 4
  if (turns === 0) return sequence
  return parseMoves(sequence)
    .map((move) => formatMove(conjugate(move, turns)))
    .join(' ')
}

/** A move sequence in the one spelling this project compares by. */
export function normaliseAlg(sequence: string): string {
  // Sheets write primes as a typographic apostrophe, and bracket their
  // finger-trick groupings; `parseMoves` drops the brackets, but the quotes
  // have to go first or they tokenise as part of the move.
  return parseMoves(sequence.replace(/[‘’ʼ]/g, "'")).map(formatMove).join(' ')
}

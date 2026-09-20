/**
 * Picking scrambles, and stating the solution for the angle on screen.
 *
 * A case is drilled from all four angles by rewriting the scramble rather than
 * by asking for an extra U turn, so the same case does not always arrive as
 * the same sequence of moves. The rewriting itself lives in `rotate.ts`.
 */

import { CASES_BY_ID } from './data/cases'
import { SCRAMBLES } from './data/scrambles'
import { rotationBetween } from './pattern'
import { applyRotation, ROTATIONS, UNTURN } from './rotate'
import type { OllCase, Pattern, Rotation, SourceKey } from './types'

export { applyRotation, ROTATIONS }

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

/** One line of the reveal: hold the cube like this, then turn it like that. */
export interface DrawnAlg {
  /** The rotation to hold the cube by first, or '' when it is already square. */
  hold: Rotation
  alg: string
}

export interface DrawnAlternative extends DrawnAlg {
  source: SourceKey
}

export interface DrawnSolution extends DrawnAlg {
  /** Other sheets' algorithms, squared up to the same drawn angle. */
  alternatives: readonly DrawnAlternative[]
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
 *
 * The alternatives come back from the same call rather than a second one, and
 * already rotated. Two calls would let a caller put a squared-up canonical
 * algorithm next to an unrotated alternative — a line that looks like a
 * solution and does not solve the cube on screen, which is the exact failure
 * storing patterns uncanonicalised exists to prevent.
 */
export function solutionAsDrawn(ollCase: OllCase, drawn: Pattern): DrawnSolution {
  // Symmetric cases (H, Pi, the two dot cases that survive a half turn) match
  // at more than one angle; `rotationBetween` finds the smallest, so those ask
  // for no rotation at all — correctly, since the algorithm solves them from
  // either side. A null cannot happen for a case's own pattern, and asking for
  // no rotation is the safe reading if it ever did.
  const quarterTurns = rotationBetween(ollCase.pattern, drawn) ?? 0
  return {
    hold: UNTURN[quarterTurns]!,
    alg: ollCase.alg,
    // An alternative is written for its own angle, so what has to be undone is
    // only the part of the drawn rotation it does not already account for.
    alternatives: ollCase.alternatives.map((alternative) => ({
      hold: UNTURN[(quarterTurns - alternative.quarterTurns + 4) % 4]!,
      alg: alternative.alg,
      source: alternative.source,
    })),
  }
}

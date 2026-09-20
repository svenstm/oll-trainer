/**
 * Picking scrambles.
 *
 * A case is drilled from all four angles by rewriting the scramble rather than
 * by asking for an extra U turn, so the same case does not always arrive as
 * the same sequence of moves. The rewriting itself lives in `rotate.ts`.
 */

import { CASES_BY_ID } from './data/cases'
import { SCRAMBLES } from './data/scrambles'
import { applyRotation, ROTATIONS } from './rotate'
import type { Rotation } from './types'

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

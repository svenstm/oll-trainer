/**
 * Binds the hand-entered algorithm table to the combinatorial enumeration.
 *
 * Every check here exists to make a typo in `oll-algorithms.ts` fail loudly
 * instead of shipping a case that shows the wrong picture. Weakening any of
 * them to land data faster defeats the point of generating the data at all.
 */

import { applyMoves, invertMoves, SOLVED, type Cube } from '../src/core/cube'
import {
  SLOT_FACELETS,
  canonicalPattern,
  enumerateOllPatterns,
  isWellFormedPattern,
  patternFromCube,
  patternKey,
} from '../src/core/pattern'
import type { OllGroup, Pattern } from '../src/core/types'
import { OLL_ALGORITHMS, type AlgorithmEntry } from './oll-algorithms'

/** Group sizes, from the plan. They sum to 57. */
export const GROUP_SIZES: Readonly<Record<OllGroup, number>> = {
  'All Edges Oriented Correctly': 7,
  'No Edges Flipped Correctly': 8,
  'L-Shapes': 6,
  'Lightning Bolts': 6,
  'P-Shapes': 4,
  'I-Shapes': 4,
  'Fish-Shapes': 4,
  'Knight Move Shapes': 4,
  'Awkward Shapes': 4,
  'T-Shapes': 2,
  Squares: 2,
  'C-Shapes': 2,
  'W-Shapes': 2,
  'Corners Correct, Edges Flipped': 2,
}

/** U-face slots holding the last layer's edges and corners. */
const U_EDGE_SLOTS = [1, 3, 5, 7]
const U_CORNER_SLOTS = [0, 2, 6, 8]

/**
 * How many of the four last-layer edges each group leaves oriented. Four means
 * the cross is already made, zero is the dot cases, and everything else has
 * exactly two — which is what a "shape" group means.
 */
function expectedOrientedEdges(group: OllGroup): number {
  if (group === 'All Edges Oriented Correctly') return 4
  if (group === 'No Edges Flipped Correctly') return 0
  return 2
}

/**
 * Exactly three cases leave all four corners oriented: the edge-flip states
 * quotient to four orbits (none, two adjacent, two opposite, all four), one of
 * which is the solved cube. Which id is which is the check that distinguishes
 * OLL 28 from OLL 57 — they are otherwise the only pair a numbering swap
 * would slip past the bijection test.
 */
const CORNERS_ALL_ORIENTED = [20, 28, 57]
const CORNERS_ALL_ORIENTED_SHAPE: Readonly<Record<number, string>> = {
  20: 'all',
  28: 'adjacent',
  57: 'opposite',
}

/** U edge slots 1 and 7 face each other, as do 3 and 5. */
function isOppositePair(slots: readonly number[]): boolean {
  const pair = [...slots].sort().join()
  return pair === '1,7' || pair === '3,5'
}

/** Oriented corner counts for the seven OCLL cases, which are named after them. */
const OCLL_ORIENTED_CORNERS: Readonly<Record<number, number>> = {
  21: 0, // H
  22: 0, // Pi
  23: 2, // U
  24: 2, // T
  25: 2, // L
  26: 1, // Anti-Sune
  27: 1, // Sune
}

export interface BoundCase extends AlgorithmEntry {
  pattern: Pattern
}

export class VerificationError extends Error {}

function fail(problems: string[]): never {
  throw new VerificationError(`\n  - ${problems.join('\n  - ')}`)
}

/** Facelets the last layer does not touch. All of them must stay solved. */
const UNTOUCHED_FACELETS = Array.from({ length: 54 }, (_, i) => i).filter(
  (i) => !SLOT_FACELETS.includes(i),
)

function countOriented(pattern: Pattern, slots: readonly number[]): number {
  return slots.filter((slot) => pattern[slot] === 1).length
}

/**
 * Derives each case's pattern from its algorithm and checks the whole table.
 * Returns the 57 bound cases, sorted by id.
 */
export function bindCases(entries: readonly AlgorithmEntry[] = OLL_ALGORITHMS): BoundCase[] {
  const problems: string[] = []

  const ids = entries.map((e) => e.id).sort((a, b) => a - b)
  const expectedIds = Array.from({ length: 57 }, (_, i) => i + 1)
  if (ids.join() !== expectedIds.join()) {
    problems.push(`ids are not exactly 1..57 (got ${entries.length} entries)`)
  }

  for (const [group, size] of Object.entries(GROUP_SIZES)) {
    const actual = entries.filter((e) => e.group === group).length
    if (actual !== size) problems.push(`group ${group}: expected ${size} cases, got ${actual}`)
  }

  const bound: BoundCase[] = []
  for (const entry of entries) {
    let cube: Cube
    try {
      // The algorithm solves the case, so its inverse *creates* the case.
      cube = applyMoves(SOLVED, invertMoves(entry.alg))
    } catch (error) {
      problems.push(`OLL ${entry.id} (${entry.name}): ${(error as Error).message}`)
      continue
    }

    const stray = UNTOUCHED_FACELETS.filter((i) => cube[i] !== SOLVED[i])
    if (stray.length > 0) {
      // Either the algorithm is wrong, or it leaves a net cube rotation.
      problems.push(
        `OLL ${entry.id} (${entry.name}): disturbs ${stray.length} facelets outside the last layer`,
      )
      continue
    }

    const pattern = patternFromCube(cube)
    if (!isWellFormedPattern(pattern)) {
      problems.push(`OLL ${entry.id} (${entry.name}): pattern is not 9-of-21 oriented`)
      continue
    }

    const orientedEdges = countOriented(pattern, U_EDGE_SLOTS)
    if (orientedEdges !== expectedOrientedEdges(entry.group)) {
      problems.push(
        `OLL ${entry.id} (${entry.name}): group ${entry.group} implies ` +
          `${expectedOrientedEdges(entry.group)} oriented edges, found ${orientedEdges}`,
      )
    }

    const orientedCorners = countOriented(pattern, U_CORNER_SLOTS)
    const cornersAllOriented = orientedCorners === 4
    if (cornersAllOriented !== CORNERS_ALL_ORIENTED.includes(entry.id)) {
      problems.push(
        `OLL ${entry.id} (${entry.name}): ${orientedCorners} corners oriented, but only ` +
          `${CORNERS_ALL_ORIENTED.join(', ')} may have all four`,
      )
    }
    if (cornersAllOriented) {
      const flipped = U_EDGE_SLOTS.filter((slot) => pattern[slot] === 0)
      const shape = flipped.length === 4 ? 'all' : isOppositePair(flipped) ? 'opposite' : 'adjacent'
      if (shape !== CORNERS_ALL_ORIENTED_SHAPE[entry.id]) {
        problems.push(
          `OLL ${entry.id} (${entry.name}): expected ${CORNERS_ALL_ORIENTED_SHAPE[entry.id]} ` +
            `flipped edges, found ${shape}`,
        )
      }
    }

    const expectedCorners = OCLL_ORIENTED_CORNERS[entry.id]
    if (expectedCorners !== undefined && orientedCorners !== expectedCorners) {
      problems.push(
        `OLL ${entry.id} (${entry.name}): expected ${expectedCorners} oriented corners, found ${orientedCorners}`,
      )
    }

    bound.push({ ...entry, pattern: canonicalPattern(pattern) })
  }

  const byKey = new Map<string, BoundCase[]>()
  for (const c of bound) {
    const key = patternKey(c.pattern)
    byKey.set(key, [...(byKey.get(key) ?? []), c])
  }
  for (const [key, collisions] of byKey) {
    if (collisions.length > 1) {
      problems.push(
        `pattern ${key} is produced by ${collisions.map((c) => `OLL ${c.id} (${c.name})`).join(' and ')}`,
      )
    }
  }

  // The whole point of enumerating independently: the two sets must be equal.
  const enumerated = new Set(enumerateOllPatterns().map(patternKey))
  const derived = new Set(byKey.keys())
  for (const key of derived) {
    if (!enumerated.has(key)) problems.push(`derived pattern ${key} is not a valid OLL class`)
  }
  const missing = [...enumerated].filter((key) => !derived.has(key))
  if (missing.length > 0) {
    problems.push(`${missing.length} enumerated classes have no algorithm: ${missing.join(', ')}`)
  }

  if (problems.length > 0) fail(problems)
  return bound.sort((a, b) => a.id - b.id)
}

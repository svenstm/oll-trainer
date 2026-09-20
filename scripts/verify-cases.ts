/**
 * Binds the hand-entered algorithm tables to the combinatorial enumeration.
 *
 * Every check here exists to make a typo in `oll-algorithms.ts` fail loudly
 * instead of shipping a case that shows the wrong picture. Weakening any of
 * them to land data faster defeats the point of generating the data at all.
 *
 * `cube-academy-algorithms.ts` is bound the same way and held to the same
 * standard. It gets no numbers of its own — they are derived here — so the
 * second table adds no second place a case can be mis-numbered, which is the
 * objection `docs/plan-deviations.md` raised against having one at all.
 */

import { applyMoves, invertMoves, SOLVED, type Cube } from '../src/core/cube'
import {
  SLOT_FACELETS,
  canonicalPattern,
  enumerateOllPatterns,
  isWellFormedPattern,
  patternFromCube,
  patternKey,
  rotationBetween,
} from '../src/core/pattern'
import { normaliseAlg, turnSequence } from '../src/core/rotate'
import { SOURCES, type Alternative, type OllGroup, type Pattern } from '../src/core/types'
import { CUBE_ACADEMY_ALGORITHMS, type CubeAcademyEntry } from './cube-academy-algorithms'
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
  alternatives: Alternative[]
}

/**
 * Whether a sheet's algorithm is one this project already teaches.
 *
 * Two lines, no more. An exact match after normalising catches the half of
 * Cube Academy's sheet that agrees with ours down to the move. The rotations
 * catch the one that is our algorithm written from another angle — OLL 43,
 * where ours reads `F' U' L' U L F` and theirs reads `R' U' F' U F R`.
 *
 * It deliberately stops short of "has the same effect on the cube". Twelve
 * more entries would match that test, and they are not duplicates: OLL 34's
 * `f R f' U' r' U' R U M'` permutes the cube exactly as our eleven-move
 * algorithm does, in nine moves. Dropping it would throw away the best reason
 * to read another sheet in the first place.
 */
function isOurAlgorithm(ours: string, theirs: string): boolean {
  const mine = normaliseAlg(ours)
  const yours = normaliseAlg(theirs)
  for (let turns = 0; turns < 4; turns++) {
    if (turnSequence(mine, turns) === yours) return true
  }
  return false
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

    // Stored as derived, *not* canonicalised: the canonical rotation is an
    // arbitrary artefact of sorting keys, and for 42 of the 57 cases it is not
    // the angle the algorithm is written for — so drawing it would show a
    // picture the algorithm beside it does not solve.
    bound.push({ ...entry, pattern, alternatives: [] })
  }

  // Two cases are the same class when their patterns agree up to a rotation,
  // so the collision and enumeration checks compare canonical forms even
  // though what is stored is the derived orientation.
  const byKey = new Map<string, BoundCase[]>()
  for (const c of bound) {
    const key = patternKey(canonicalPattern(c.pattern))
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

  // Only once the canonical table is sound. An alternative is placed by
  // matching the class its own inverse produces, so every alternative for a
  // case whose canonical algorithm is wrong would report a second, derived
  // failure — noise on top of the one problem actually worth fixing.
  if (problems.length === 0) {
    bindAlternatives(bound, CUBE_ACADEMY_ALGORITHMS, 'cube-academy', problems)
  }

  if (problems.length > 0) fail(problems)
  return bound.sort((a, b) => a.id - b.id)
}

/**
 * Attaches one sheet's algorithms to the cases they solve.
 *
 * The sheet carries no OLL numbers — Cube Academy's does not, and no sheet has
 * to — so the number is derived here exactly as the canonical table's is:
 * invert the algorithm, read off the pattern, find the class. A transcription
 * error therefore cannot quietly land on the wrong case. It either matches no
 * class, or collides with one already claimed, and nothing is written.
 *
 * Absence is not an error. A sheet that agrees with us about a case leaves
 * that case with no alternative, which is the normal state for roughly half
 * of them.
 */
function bindAlternatives(
  bound: readonly BoundCase[],
  entries: readonly CubeAcademyEntry[],
  source: keyof typeof SOURCES,
  problems: string[],
): void {
  const byCanonicalKey = new Map(bound.map((c) => [patternKey(canonicalPattern(c.pattern)), c]))
  const claimed = new Map<number, string>()
  const label = SOURCES[source].name

  for (const entry of entries) {
    const where = `${label} ${entry.section} "${entry.alg}"`
    const alg = normaliseAlg(entry.alg)

    let cube: Cube
    try {
      cube = applyMoves(SOLVED, invertMoves(alg))
    } catch (error) {
      problems.push(`${where}: ${(error as Error).message}`)
      continue
    }

    const stray = UNTOUCHED_FACELETS.filter((i) => cube[i] !== SOLVED[i])
    if (stray.length > 0) {
      // Usually a net cube rotation the sheet left implicit, which a trailing
      // x/y/z in the table makes explicit. Occasionally a real typo.
      problems.push(`${where}: disturbs ${stray.length} facelets outside the last layer`)
      continue
    }

    const pattern = patternFromCube(cube)
    if (!isWellFormedPattern(pattern)) {
      problems.push(`${where}: pattern is not 9-of-21 oriented`)
      continue
    }

    const target = byCanonicalKey.get(patternKey(canonicalPattern(pattern)))
    if (!target) {
      problems.push(`${where}: solves no enumerated OLL class`)
      continue
    }

    const already = claimed.get(target.id)
    if (already !== undefined) {
      problems.push(`${where}: OLL ${target.id} is already taken by ${label} "${already}"`)
      continue
    }
    claimed.set(target.id, entry.alg)

    if (isOurAlgorithm(target.alg, alg)) continue

    // Non-null: `target` was found by this pattern's own canonical key, so the
    // two are rotations of each other by construction.
    const quarterTurns = rotationBetween(target.pattern, pattern)!
    target.alternatives.push({ alg, source, quarterTurns: quarterTurns as 0 | 1 | 2 | 3 })
  }

  // Guards the filter above rather than the data: if `isOurAlgorithm` ever
  // stops recognising one of ours, the reveal grows a second line saying the
  // same thing twice, which no other check here would notice.
  for (const c of bound) {
    for (const alternative of c.alternatives) {
      if (isOurAlgorithm(c.alg, alternative.alg)) {
        problems.push(
          `OLL ${c.id} (${c.name}): alternative "${alternative.alg}" is our own algorithm`,
        )
      }
    }
    const spellings = c.alternatives.map((a) => normaliseAlg(a.alg))
    if (new Set(spellings).size !== spellings.length) {
      problems.push(`OLL ${c.id} (${c.name}): two alternatives are the same algorithm`)
    }
  }
}

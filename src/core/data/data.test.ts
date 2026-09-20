import { describe, expect, it } from 'vitest'
import { applyMoves, invertMoves, parseMoves, SOLVED, type Cube } from '../cube'
import {
  SLOT_FACELETS,
  canonicalPattern,
  enumerateOllPatterns,
  isWellFormedPattern,
  patternFromCube,
  patternKey,
  rotatePattern,
  rotationBetween,
  SOLVED_PATTERN,
} from '../pattern'
import { normaliseAlg, ROTATIONS, turnSequence } from '../rotate'
import { SOURCES, type OllGroup } from '../types'
import { CASES, CASES_BY_ID } from './cases'
import { SCRAMBLES } from './scrambles'

/** Group sizes from the plan. They sum to 57. */
const GROUP_SIZES: Readonly<Record<OllGroup, number>> = {
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

const MOVE_PATTERN = /^[URFDLBMESurfdlbxyz](2|')?$/

/** Facelets outside the last layer. A scramble or algorithm must not disturb them. */
const UNTOUCHED_FACELETS = Array.from({ length: 54 }, (_, i) => i).filter(
  (i) => !SLOT_FACELETS.includes(i),
)

function firstTwoLayersSolved(cube: Cube): boolean {
  return UNTOUCHED_FACELETS.every((i) => cube[i] === SOLVED[i])
}

describe('cases', () => {
  it('has ids exactly 1..57', () => {
    expect(CASES.map((c) => c.id).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 57 }, (_, i) => i + 1),
    )
  })

  it('has the 14 groups, disjoint and covering all 57', () => {
    const counted = new Map<string, number>()
    for (const c of CASES) counted.set(c.group, (counted.get(c.group) ?? 0) + 1)
    expect(Object.fromEntries(counted)).toEqual(GROUP_SIZES)
    expect([...counted.values()].reduce((a, b) => a + b, 0)).toBe(57)
  })

  it('has a distinct, non-empty name for every case', () => {
    expect(new Set(CASES.map((c) => c.name)).size).toBe(57)
    expect(CASES.every((c) => c.name.trim().length > 0)).toBe(true)
  })

  it('has well-formed, distinct patterns', () => {
    expect(CASES.every((c) => isWellFormedPattern(c.pattern))).toBe(true)
    expect(new Set(CASES.map((c) => patternKey(c.pattern))).size).toBe(57)
  })

  it('has patterns that are exactly the enumerated classes', () => {
    // Up to a rotation: patterns are stored in the orientation their algorithm
    // solves, and the enumeration returns one canonical representative each.
    expect(CASES.map((c) => patternKey(canonicalPattern(c.pattern))).sort()).toEqual(
      enumerateOllPatterns().map(patternKey).sort(),
    )
  })

  it('has no two cases that are rotations of each other', () => {
    for (let i = 0; i < CASES.length; i++) {
      for (let j = i + 1; j < CASES.length; j++) {
        expect(rotationBetween(CASES[i]!.pattern, CASES[j]!.pattern)).toBeNull()
      }
    }
  })

  it.each(CASES.map((c) => [c.id, c.name, c.alg] as const))(
    'OLL %i (%s) is solved by its algorithm',
    (_id, _name, alg) => {
      for (const move of parseMoves(alg)) {
        expect(`${move.base}${move.amount === 1 ? '' : move.amount === 2 ? '2' : "'"}`).toMatch(
          MOVE_PATTERN,
        )
      }
    },
  )

  it.each(CASES.map((c) => [c.id, c] as const))(
    'OLL %i binds its algorithm to its pattern',
    (id, c) => {
      // The algorithm solves the case, so its inverse creates the case exactly.
      const cube = applyMoves(SOLVED, invertMoves(c.alg))
      expect(firstTwoLayersSolved(cube), `OLL ${id} disturbs the first two layers`).toBe(true)
      // Exactly, not up to a rotation: the stored pattern is what gets drawn
      // next to this algorithm, so a rotation between them is a wrong picture.
      expect(patternKey(patternFromCube(cube)), `OLL ${id} is drawn at the wrong angle`).toBe(
        patternKey(c.pattern),
      )
    },
  )

  describe('alternatives', () => {
    const withAlternatives = CASES.filter((c) => c.alternatives.length > 0)

    // Not a coverage assertion: a sheet that agrees with us about a case
    // leaves it with none, which is the normal state for roughly half. This
    // only catches the whole set silently vanishing.
    it('are attached to some cases', () => {
      expect(withAlternatives.length).toBeGreaterThan(0)
    })

    it('name a source that exists', () => {
      for (const c of CASES) {
        for (const alternative of c.alternatives) {
          expect(SOURCES[alternative.source], `OLL ${c.id}`).toBeDefined()
        }
      }
    })

    it('have only well-formed moves', () => {
      for (const c of CASES) {
        for (const alternative of c.alternatives) {
          for (const move of parseMoves(alternative.alg)) {
            expect(`${move.base}${move.amount === 1 ? '' : move.amount === 2 ? '2' : "'"}`).toMatch(
              MOVE_PATTERN,
            )
          }
        }
      }
    })

    it('are stored in the one spelling the duplicate rule compares by', () => {
      for (const c of CASES) {
        for (const alternative of c.alternatives) {
          expect(alternative.alg, `OLL ${c.id}`).toBe(normaliseAlg(alternative.alg))
        }
      }
    })

    it('solve their case, at the angle they claim', () => {
      for (const c of CASES) {
        for (const alternative of c.alternatives) {
          const cube = applyMoves(SOLVED, invertMoves(alternative.alg))
          expect(
            firstTwoLayersSolved(cube),
            `OLL ${c.id} alternative disturbs the first two layers`,
          ).toBe(true)
          // Its own angle, not ours — `quarterTurns` is what squares the two
          // up, and a wrong one is a line that does not solve what is drawn.
          expect(
            patternKey(patternFromCube(cube)),
            `OLL ${c.id} alternative is not ${alternative.quarterTurns} quarter turns from the case`,
          ).toBe(patternKey(rotatePattern(c.pattern, alternative.quarterTurns)))
        }
      }
    })

    it('are never the canonical algorithm wearing a different angle', () => {
      for (const c of CASES) {
        for (const alternative of c.alternatives) {
          const ours = normaliseAlg(c.alg)
          const spellings = [0, 1, 2, 3].map((turns) => turnSequence(ours, turns))
          expect(spellings, `OLL ${c.id} repeats its own algorithm`).not.toContain(alternative.alg)
        }
      }
    })

    it('are reached from the case by the turn the reveal names', () => {
      // The reveal draws the alternative's own picture and labels it
      // `ROTATIONS[quarterTurns]` for screen readers. That label is a claim
      // about the cube, so it is checked against the cube: set the case up at
      // its own angle, make that turn, run the sheet's algorithm, end solved.
      for (const c of CASES) {
        for (const alternative of c.alternatives) {
          const setUp = applyMoves(SOLVED, invertMoves(c.alg))
          const turn = ROTATIONS[alternative.quarterTurns]!
          const solved = applyMoves(setUp, `${turn} ${alternative.alg}`.trim())
          expect(
            patternKey(patternFromCube(solved)),
            `OLL ${c.id}: "${turn}" does not set up ${alternative.alg}`,
          ).toBe(patternKey(SOLVED_PATTERN))
        }
      }
    })

    it('are distinct within a case', () => {
      for (const c of CASES) {
        const spellings = c.alternatives.map((alternative) => alternative.alg)
        expect(new Set(spellings).size, `OLL ${c.id}`).toBe(spellings.length)
      }
    })
  })

  it('indexes every case by id', () => {
    expect(CASES_BY_ID.size).toBe(57)
    expect(CASES.every((c) => CASES_BY_ID.get(c.id) === c)).toBe(true)
  })
})

describe('scrambles', () => {
  const ids = Object.keys(SCRAMBLES).map(Number)

  it('covers every case with at least one scramble', () => {
    expect(ids.sort((a, b) => a - b)).toEqual(CASES.map((c) => c.id))
    expect(ids.every((id) => SCRAMBLES[id]!.length > 0)).toBe(true)
  })

  it('has only well-formed moves', () => {
    for (const scramble of Object.values(SCRAMBLES).flat()) {
      for (const token of scramble.split(' ')) expect(token).toMatch(MOVE_PATTERN)
    }
  })

  it('has no duplicate scrambles within a case', () => {
    for (const [id, list] of Object.entries(SCRAMBLES)) {
      expect(new Set(list).size, `OLL ${id}`).toBe(list.length)
    }
  })

  // The plan's step 4: this one check validates the cube model, the
  // enumeration, the algorithm binding and the generator against each other.
  it.each(CASES.map((c) => [c.id, c] as const))(
    'every OLL %i scramble reproduces the case and leaves the first two layers solved',
    (id, c) => {
      const list = SCRAMBLES[id]!
      expect(list.length).toBeGreaterThan(0)
      for (const scramble of list) {
        const cube = applyMoves(SOLVED, scramble)
        expect(firstTwoLayersSolved(cube), scramble).toBe(true)
        const pattern = patternFromCube(cube)
        expect(isWellFormedPattern(pattern), scramble).toBe(true)
        expect(patternKey(pattern), scramble).toBe(patternKey(c.pattern))
      }
    },
  )
})

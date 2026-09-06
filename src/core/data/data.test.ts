import { describe, expect, it } from 'vitest'
import { applyMoves, invertMoves, parseMoves, SOLVED, type Cube } from '../cube'
import {
  SLOT_FACELETS,
  canonicalPattern,
  enumerateOllPatterns,
  isWellFormedPattern,
  patternFromCube,
  patternKey,
  rotationBetween,
} from '../pattern'
import type { OllGroup } from '../types'
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

  it('has well-formed, canonical, distinct patterns', () => {
    expect(CASES.every((c) => isWellFormedPattern(c.pattern))).toBe(true)
    expect(
      CASES.every((c) => patternKey(canonicalPattern(c.pattern)) === patternKey(c.pattern)),
    ).toBe(true)
    expect(new Set(CASES.map((c) => patternKey(c.pattern))).size).toBe(57)
  })

  it('has patterns that are exactly the enumerated classes', () => {
    expect(CASES.map((c) => patternKey(c.pattern)).sort()).toEqual(
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
      expect(patternKey(canonicalPattern(patternFromCube(cube)))).toBe(patternKey(c.pattern))
    },
  )

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
        expect(patternKey(canonicalPattern(pattern)), scramble).toBe(patternKey(c.pattern))
      }
    },
  )
})

import { describe, expect, it } from 'vitest'
import { applyMoves, SOLVED } from './cube'
import {
  CORNER_TWISTS,
  EDGE_FLIPS,
  ORIENTED_SLOTS,
  SLOT_COUNT,
  SLOT_FACELETS,
  SOLVED_PATTERN,
  canonicalPattern,
  enumerateOllPatterns,
  isWellFormedPattern,
  patternFromCube,
  patternKey,
  patternsEqual,
  rotatePattern,
  rotationBetween,
} from './pattern'

describe('slot layout', () => {
  it('is 9 U facelets then 12 side facelets', () => {
    expect(SLOT_FACELETS).toHaveLength(SLOT_COUNT)
    expect(SLOT_FACELETS.slice(0, 9)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    expect(new Set(SLOT_FACELETS).size).toBe(SLOT_COUNT)
  })

  it('puts the side strips in B R F L order, drawn around the U face', () => {
    expect(SLOT_FACELETS.slice(9, 12)).toEqual([47, 46, 45])
    expect(SLOT_FACELETS.slice(12, 15)).toEqual([11, 10, 9])
    expect(SLOT_FACELETS.slice(15, 18)).toEqual([18, 19, 20])
    expect(SLOT_FACELETS.slice(18, 21)).toEqual([36, 37, 38])
  })
})

describe('patternFromCube', () => {
  it('reads the solved cube as every U slot oriented', () => {
    expect(patternKey(patternFromCube(SOLVED))).toBe(patternKey(SOLVED_PATTERN))
    expect(isWellFormedPattern(SOLVED_PATTERN)).toBe(true)
  })

  it('turns with U exactly as it turns with y, because both move the whole top layer', () => {
    // The 21 slots *are* the top layer, so U and y are indistinguishable here.
    // Only the case identity — the canonical form — is invariant.
    const sune = applyMoves(SOLVED, "R U R' U R U2 R'")
    const pattern = patternFromCube(sune)
    for (const [turns, quarters] of [
      ['U', 1],
      ['U2', 2],
      ["U'", 3],
    ] as const) {
      const turned = patternFromCube(applyMoves(sune, turns))
      expect(patternKey(turned)).toBe(patternKey(rotatePattern(pattern, quarters)))
      expect(patternKey(canonicalPattern(turned))).toBe(patternKey(canonicalPattern(pattern)))
    }
  })

  it('always has exactly 9 of 21 slots oriented', () => {
    for (const alg of [
      "R U R' U R U2 R'",
      "F R U R' U' F'",
      "r U R' U' r' F R F'",
      "M' U M U2 M' U M",
    ]) {
      expect(isWellFormedPattern(patternFromCube(applyMoves(SOLVED, alg)))).toBe(true)
    }
  })
})

describe('rotatePattern', () => {
  it('matches applying y to the cube itself', () => {
    const cube = applyMoves(SOLVED, "r U R' U' r' F R F'")
    expect(patternKey(rotatePattern(patternFromCube(cube)))).toBe(
      patternKey(patternFromCube(applyMoves(cube, 'y'))),
    )
  })

  it('has order 4 and leaves the solved pattern alone', () => {
    const pattern = patternFromCube(applyMoves(SOLVED, "R U R' U R U2 R'"))
    expect(patternsEqual(rotatePattern(pattern, 4), pattern)).toBe(true)
    expect(patternsEqual(rotatePattern(SOLVED_PATTERN), SOLVED_PATTERN)).toBe(true)
  })

  it('is invertible', () => {
    const pattern = patternFromCube(applyMoves(SOLVED, "F R U R' U' F'"))
    expect(patternsEqual(rotatePattern(rotatePattern(pattern, 3), 1), pattern)).toBe(true)
    expect(rotationBetween(pattern, rotatePattern(pattern, 3))).toBe(3)
  })

  it('reports no rotation between different cases', () => {
    const sune = patternFromCube(applyMoves(SOLVED, "R U R' U R U2 R'"))
    const antisune = patternFromCube(applyMoves(SOLVED, "R U2 R' U' R U' R'"))
    expect(rotationBetween(sune, antisune)).toBeNull()
  })
})

describe('last-layer pieces', () => {
  it('finds four corners and four edges', () => {
    expect(CORNER_TWISTS).toHaveLength(4)
    expect(EDGE_FLIPS).toHaveLength(4)
  })

  it('gives every piece distinct slots, covering all 20 non-centre slots', () => {
    const slots = [...CORNER_TWISTS.flat(), ...EDGE_FLIPS.flat()]
    expect(slots).toHaveLength(20)
    expect(new Set(slots).size).toBe(20)
    expect(slots).not.toContain(4)
  })

  it('orders each corner clockwise as seen from outside', () => {
    // A y rotation maps each corner's twist order onto the next corner's,
    // which only holds if all four were given the same handedness.
    for (const corner of CORNER_TWISTS) {
      const rotated = corner.map((slot) => rotatePattern(unit(slot)).indexOf(1))
      expect(CORNER_TWISTS.some((other) => other.join() === rotated.join())).toBe(true)
    }
  })
})

describe('enumerateOllPatterns', () => {
  const patterns = enumerateOllPatterns()

  it('produces exactly 57 classes', () => {
    expect(patterns).toHaveLength(57)
  })

  it('produces well-formed, distinct, canonical patterns', () => {
    expect(patterns.every(isWellFormedPattern)).toBe(true)
    expect(new Set(patterns.map(patternKey)).size).toBe(57)
    expect(patterns.every((p) => patternsEqual(p, canonicalPattern(p)))).toBe(true)
  })

  it('excludes the solved state', () => {
    expect(patterns.map(patternKey)).not.toContain(patternKey(SOLVED_PATTERN))
  })

  it('is closed under rotation: no two classes are rotations of each other', () => {
    for (let i = 0; i < patterns.length; i++) {
      for (let j = i + 1; j < patterns.length; j++) {
        expect(rotationBetween(patterns[i]!, patterns[j]!)).toBeNull()
      }
    }
  })

  it('is stable across runs', () => {
    expect(enumerateOllPatterns().map(patternKey)).toEqual(patterns.map(patternKey))
  })

  it('counts orbits by Burnside, not by dividing 216 by 4', () => {
    // 216 orientations, 2 fixed by a quarter turn and 12 by a half turn.
    expect((216 + 2 + 12 + 2) / 4).toBe(patterns.length + 1)
  })
})

/** A pattern-shaped vector with a single slot set, for tracing where slots move. */
function unit(slot: number) {
  return Array.from({ length: SLOT_COUNT }, (_, i) => (i === slot ? 1 : 0)) as (0 | 1)[]
}

describe('invariants stated in the plan', () => {
  it('every enumerated pattern has as many dark U slots as bright side slots', () => {
    for (const pattern of enumerateOllPatterns()) {
      const darkOnU = pattern.slice(0, 9).filter((slot) => slot === 0).length
      const brightOnSides = pattern.slice(9).filter((slot) => slot === 1).length
      expect(darkOnU).toBe(brightOnSides)
      expect(pattern.filter((slot) => slot === 1)).toHaveLength(ORIENTED_SLOTS)
    }
  })
})

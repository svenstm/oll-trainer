import { describe, expect, it } from 'vitest'
import { applyMoves, formatMoves, parseMoves, SOLVED } from './cube'
import {
  canonicalPattern,
  patternFromCube,
  patternKey,
  rotatePattern,
  rotationBetween,
} from './pattern'
import { CASES } from './data/cases'
import { SCRAMBLES } from './data/scrambles'
import { applyRotation, pickScramble, ROTATIONS, scramblesFor } from './scramble'
import type { Rotation } from './types'

const QUARTERS: Readonly<Record<Rotation, number>> = { '': 0, y: 1, y2: 2, "y'": 3 }

describe('applyRotation', () => {
  it('leaves a scramble alone when there is no rotation', () => {
    const scramble = SCRAMBLES[27]![0]!
    expect(applyRotation(scramble, '')).toBe(scramble)
  })

  it.each(ROTATIONS)('turns the case by %s without breaking the first two layers', (rotation) => {
    for (const c of CASES) {
      const scramble = SCRAMBLES[c.id]![0]!
      const turned = applyRotation(scramble, rotation)
      const before = patternFromCube(applyMoves(SOLVED, scramble))
      const after = patternFromCube(applyMoves(SOLVED, turned))
      expect(patternKey(after), `OLL ${c.id} ${rotation}`).toBe(
        patternKey(rotatePattern(before, QUARTERS[rotation])),
      )
      expect(patternKey(canonicalPattern(after))).toBe(patternKey(c.pattern))
    }
  })

  it('is token-based, so wide and slice moves stay wide and slice moves', () => {
    // A regex over R/F/L/B — what the old app used — would rewrite the `r`,
    // `f` and `l` here as if they were face turns.
    const mixed = "r U R' U' r' F R F' M2 f l' S E x y z"
    const turned = parseMoves(applyRotation(mixed, 'y'))
    const original = parseMoves(mixed)
    expect(turned).toHaveLength(original.length)
    const kind = (base: string) =>
      'MES'.includes(base) ? 'slice' : base === base.toLowerCase() ? 'wide' : 'face'
    expect(turned.map((m) => kind(m.base))).toEqual(original.map((m) => kind(m.base)))
    // Direction is not preserved — y' z y is x', for one — but a half turn
    // stays a half turn, because conjugation preserves a move's order.
    expect(turned.map((m) => m.amount === 2)).toEqual(original.map((m) => m.amount === 2))
  })

  it('turns a case written with wide moves, without breaking it', () => {
    const withWideMoves = "r U R' U' r' F R F'"
    const turned = applyRotation(withWideMoves, 'y')
    expect(patternKey(patternFromCube(applyMoves(SOLVED, turned)))).toBe(
      patternKey(rotatePattern(patternFromCube(applyMoves(SOLVED, withWideMoves)), 1)),
    )
  })

  it('maps the outer faces around the cube and leaves U and D alone', () => {
    expect(applyRotation('U D U2', 'y')).toBe('U D U2')
    // Four quarter turns of rewriting is the identity.
    const alg = "R U R' U' r' F R F' M E S x y z"
    let out = alg
    for (let i = 0; i < 4; i++) out = applyRotation(out, 'y')
    expect(out).toBe(formatMoves(parseMoves(alg)))
  })

  it('composes: y then y is y2', () => {
    const scramble = SCRAMBLES[13]![0]!
    expect(applyRotation(applyRotation(scramble, 'y'), 'y')).toBe(applyRotation(scramble, 'y2'))
  })
})

describe('scramblesFor', () => {
  it('returns each case its own scrambles, and nothing for an unknown id', () => {
    expect(scramblesFor(27)).toBe(SCRAMBLES[27])
    expect(scramblesFor(999)).toEqual([])
  })
})

describe('pickScramble', () => {
  it('produces a scramble for the case it was asked for', () => {
    for (const c of CASES) {
      const picked = pickScramble(c.id, () => 0.5)
      const pattern = patternFromCube(applyMoves(SOLVED, picked.scramble))
      expect(patternKey(canonicalPattern(pattern)), `OLL ${c.id}`).toBe(patternKey(c.pattern))
      expect(rotationBetween(c.pattern, pattern)).not.toBeNull()
    }
  })

  it('is deterministic given the random source', () => {
    const rng = () => 0.25
    expect(pickScramble(27, rng)).toEqual(pickScramble(27, rng))
  })

  it('reaches every rotation and more than one scramble', () => {
    const values = [0, 0.26, 0.51, 0.76, 0.99]
    let i = 0
    const rng = () => values[i++ % values.length]!
    const seen = new Set<string>()
    const rotations = new Set<Rotation>()
    for (let n = 0; n < 40; n++) {
      const picked = pickScramble(27, rng)
      seen.add(picked.scramble)
      rotations.add(picked.rotation)
    }
    expect(seen.size).toBeGreaterThan(1)
    expect(rotations.size).toBe(4)
  })

  it('refuses an unknown case rather than serving a wrong scramble', () => {
    expect(() => pickScramble(999)).toThrow(/No scrambles/)
  })
})

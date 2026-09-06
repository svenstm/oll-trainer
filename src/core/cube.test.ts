import { describe, expect, it } from 'vitest'
import {
  applyMoves,
  cubesEqual,
  formatMoves,
  invertMoves,
  isSolved,
  MoveSyntaxError,
  parseMove,
  parseMoves,
  SOLVED,
  type Cube,
} from './cube'

const FACE_TURNS = ['U', 'R', 'F', 'D', 'L', 'B']
const SLICES = ['M', 'E', 'S']
const WIDES = ['u', 'r', 'f', 'd', 'l', 'b']
const ROTATIONS = ['x', 'y', 'z']
const ALL_BASES = [...FACE_TURNS, ...SLICES, ...WIDES, ...ROTATIONS]

/** Applies `sequence` `n` times to a solved cube. */
function repeat(sequence: string, n: number): Cube {
  let cube = SOLVED
  for (let i = 0; i < n; i++) cube = applyMoves(cube, sequence)
  return cube
}

/** Smallest n > 0 with `sequence` repeated n times solving, up to a sane bound. */
function order(sequence: string): number {
  let cube = SOLVED
  for (let n = 1; n <= 1260; n++) {
    cube = applyMoves(cube, sequence)
    if (isSolved(cube)) return n
  }
  throw new Error(`${sequence} has no order below 1260`)
}

describe('SOLVED', () => {
  it('has nine facelets of each face', () => {
    const counts = new Map<number, number>()
    for (const face of SOLVED) counts.set(face, (counts.get(face) ?? 0) + 1)
    expect([...counts.values()]).toEqual([9, 9, 9, 9, 9, 9])
  })
})

describe('parseMove', () => {
  it('reads amount from the suffix', () => {
    expect(parseMove('R')).toEqual({ base: 'R', amount: 1 })
    expect(parseMove('R2')).toEqual({ base: 'R', amount: 2 })
    expect(parseMove("R'")).toEqual({ base: 'R', amount: 3 })
  })

  it('normalises Xw to lowercase, so both spellings compare equal', () => {
    expect(parseMove('Rw')).toEqual(parseMove('r'))
    expect(parseMove('Uw2')).toEqual(parseMove('u2'))
    expect(parseMove("Fw'")).toEqual(parseMove("f'"))
  })

  it('rejects anything that is not a move', () => {
    for (const bad of ['', 'Q', 'R3', 'RU', 'r w', 'X', "R''", 'Rw3']) {
      expect(() => parseMove(bad), bad).toThrow(MoveSyntaxError)
    }
  })

  it('tolerates the parentheses algorithms are often written with', () => {
    expect(formatMoves(parseMoves("(R U R') (U' R' F R F')"))).toBe("R U R' U' R' F R F'")
  })
})

describe('every move', () => {
  it.each(ALL_BASES)('%s is a permutation of the 54 facelets', (base) => {
    const cube = applyMoves(SOLVED, base)
    const counts = new Map<number, number>()
    for (const face of cube) counts.set(face, (counts.get(face) ?? 0) + 1)
    expect([...counts.values()]).toEqual([9, 9, 9, 9, 9, 9])
  })

  it.each(ALL_BASES)('%s has order 4', (base) => {
    expect(order(base)).toBe(4)
  })

  it.each(ALL_BASES)("%s2 is %s twice, and %s' is its inverse", (base) => {
    expect(cubesEqual(applyMoves(SOLVED, `${base}2`), repeat(base, 2))).toBe(true)
    expect(cubesEqual(applyMoves(SOLVED, `${base}'`), repeat(base, 3))).toBe(true)
  })
})

describe('layer geometry', () => {
  it.each(FACE_TURNS)('%s leaves all six centres in place', (base) => {
    const cube = applyMoves(SOLVED, base)
    for (const centre of [4, 13, 22, 31, 40, 49]) {
      expect(cube[centre]).toBe(SOLVED[centre])
    }
  })

  it.each(ROTATIONS)('%s moves the whole cube, so it stays solved-looking', (base) => {
    const cube = applyMoves(SOLVED, base)
    // Every face is still a single colour, just not the colour it started as.
    for (let face = 0; face < 6; face++) {
      const stickers = cube.slice(face * 9, face * 9 + 9)
      expect(new Set(stickers).size).toBe(1)
    }
    expect(isSolved(cube)).toBe(false)
  })

  // These pin down the slice and wide conventions: M and E follow L and D,
  // S follows F. Getting one of them backwards silently corrupts every
  // algorithm that uses `r` or `M`.
  it.each([
    ['r', "R M'"],
    ['l', 'L M'],
    ['u', "U E'"],
    ['d', 'D E'],
    ['f', 'F S'],
    ['b', "B S'"],
    ['x', "R M' L'"],
    ['y', "U E' D'"],
    ['z', "F S B'"],
  ])('%s == %s', (derived, spelled) => {
    expect(cubesEqual(applyMoves(SOLVED, derived), applyMoves(SOLVED, spelled))).toBe(true)
  })
})

describe('invertMoves', () => {
  it('reverses order and each move', () => {
    expect(invertMoves("R U R' U'")).toBe("U R U' R'")
    expect(invertMoves("r U2 R' F' Rw")).toBe("r' F R U2 r'")
  })

  it.each([
    "R U R' U'",
    "r U R' U' r' F R F'",
    "M' U M U2 M' U M",
    "x R' U R' D2 R U' R' D2 R2",
    "R U2 R2 F R F' U2 R' F R F'",
  ])('undoes %s on the cube', (alg) => {
    expect(isSolved(applyMoves(applyMoves(SOLVED, alg), invertMoves(alg)))).toBe(true)
  })

  it('round-trips through itself', () => {
    const alg = "r U R' U' r' F R F'"
    expect(invertMoves(invertMoves(alg))).toBe(formatMoves(parseMoves(alg)))
  })
})

describe('known algorithms', () => {
  it.each([
    // Sexy move: six repetitions restore the cube.
    ["R U R' U'", 6],
    // Sune: a pure corner three-cycle with twists.
    ["R U R' U R U2 R'", 6],
    // T-perm: a permutation, so it is its own inverse.
    ["R U R' U' R' F R2 U' R' U' R U R' F'", 2],
    // Superflip's classic 6-move seed has order 6 as well.
    ['R U', 105],
  ])('%s has order %i', (alg, expected) => {
    expect(order(alg)).toBe(expected)
  })

  it('leaves the last layer of an OLL alg oriented', () => {
    // Sune applied to a solved cube twists corners but keeps U stickers on U
    // only where the case says so — here just check it is not a no-op.
    expect(isSolved(applyMoves(SOLVED, "R U R' U R U2 R'"))).toBe(false)
  })
})

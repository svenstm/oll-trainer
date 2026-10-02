import { describe, expect, it } from 'vitest'

import { applyMoves, formatMove, parseMove, SOLVED } from './cube'
import {
  COLOURS,
  DEFAULT_GRIP,
  frontColours,
  gripRotation,
  isValidGrip,
  moveToGripFrame,
  parseFacelets,
  toGripFrame,
  type Grip,
} from './grip'

const ALL_GRIPS: Grip[] = COLOURS.flatMap((top) =>
  frontColours(top).map((front) => ({ top, front })),
)

describe('grips', () => {
  it('has the 24 ways to hold a cube', () => {
    expect(ALL_GRIPS).toHaveLength(24)
    expect(isValidGrip({ top: 'yellow', front: 'white' })).toBe(false)
    expect(isValidGrip({ top: 'green', front: 'green' })).toBe(false)
  })

  it('needs no rotation for white top, green front', () => {
    expect(gripRotation({ top: 'white', front: 'green' })).toBe('')
  })

  it('finds a rotation for every grip', () => {
    for (const grip of ALL_GRIPS) expect(() => gripRotation(grip)).not.toThrow()
  })
})

describe('toGripFrame', () => {
  it('leaves a solved cube solved, however it is held', () => {
    for (const grip of ALL_GRIPS) expect(toGripFrame(SOLVED, grip)).toEqual(SOLVED)
  })

  it('sees an R turn as an L turn with yellow on top and green in front', () => {
    const turned = applyMoves(SOLVED, 'R')
    expect(toGripFrame(turned, DEFAULT_GRIP)).toEqual(applyMoves(SOLVED, 'L'))
  })
})

describe('moveToGripFrame', () => {
  const asGrip = (move: string, grip: Grip) => formatMove(moveToGripFrame(parseMove(move), grip))

  it('is the identity for the cube frame itself', () => {
    for (const move of ['U', "R'", 'F2', 'D', 'L', "B'"]) {
      expect(asGrip(move, { top: 'white', front: 'green' })).toBe(move)
    }
  })

  it('mirrors U/D and R/L with yellow on top and green in front', () => {
    expect(asGrip('U', DEFAULT_GRIP)).toBe('D')
    expect(asGrip("R'", DEFAULT_GRIP)).toBe("L'")
    expect(asGrip('F', DEFAULT_GRIP)).toBe('F')
  })

  it('agrees with toGripFrame for every grip and move', () => {
    const start = applyMoves(SOLVED, "F R U' L2 B D'")
    for (const grip of ALL_GRIPS) {
      for (const move of ['U', "R'", 'F2', "D'", 'L', 'B2']) {
        const viaState = toGripFrame(applyMoves(start, move), grip)
        const viaMove = applyMoves(toGripFrame(start, grip), [
          moveToGripFrame(parseMove(move), grip),
        ])
        expect(viaMove).toEqual(viaState)
      }
    }
  })
})

describe('parseFacelets', () => {
  it('reads the solved string', () => {
    expect(parseFacelets('UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB')).toEqual(SOLVED)
  })

  // The worked example from gan-web-bluetooth's own documentation, which pins
  // its sticker order to ours.
  it('matches the library for F R', () => {
    expect(parseFacelets('UUFUUFLLFUUURRRRRRFFRFFDFFDRRBDDBDDBLLDLLDLLDLBBUBBUBB')).toEqual(
      applyMoves(SOLVED, 'F R'),
    )
  })

  it('rejects anything else', () => {
    expect(parseFacelets('UUU')).toBeNull()
    expect(parseFacelets('X'.repeat(54))).toBeNull()
  })
})

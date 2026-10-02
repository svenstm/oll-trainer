import { describe, expect, it } from 'vitest'

import { applyMove, formatMoves, parseMove, SOLVED, type Cube } from './cube'
import { advance, locate, START, trackScramble, type ScrambleProgress } from './scrambleProgress'

/** Feeds turns one at a time, as a smart cube reports them. */
function play(scramble: string, turns: string, from: Cube = SOLVED) {
  const track = trackScramble(scramble)
  let cube = from
  let progress: ScrambleProgress = START
  for (const token of turns.split(' ').filter(Boolean)) {
    const move = parseMove(token)
    cube = applyMove(cube, move)
    progress = advance(progress, track, cube, move)
  }
  return { ...progress, correction: formatMoves(progress.correction) }
}

describe('scramble progress', () => {
  it('counts the moves applied so far', () => {
    expect(play("R U R' F2", 'R U')).toEqual({ done: 2, half: false, correction: '' })
  })

  it('accepts a half turn as two quarter turns in either direction', () => {
    expect(play('R U2 F', 'R U')).toEqual({ done: 1, half: true, correction: '' })
    expect(play('R U2 F', 'R U U')).toEqual({ done: 2, half: false, correction: '' })
    expect(play('R U2 F', "R U' U'")).toEqual({ done: 2, half: false, correction: '' })
  })

  it('offers the stray turns undone, newest first', () => {
    expect(play("R U R'", 'R F D')).toEqual({ done: 1, half: false, correction: "D' F'" })
  })

  it('merges stray turns of the same face', () => {
    expect(play("R U R'", 'R F F')).toEqual({ done: 1, half: false, correction: 'F2' })
  })

  it('drops the correction once the cube is back on the scramble', () => {
    expect(play("R U R'", "R F F'")).toEqual({ done: 1, half: false, correction: '' })
    expect(play("R U R'", "R F F' U")).toEqual({ done: 2, half: false, correction: '' })
  })

  it('locates a cube seen with no history', () => {
    const track = trackScramble("R U R'")
    expect(locate(track, SOLVED)).toEqual(START)
    expect(locate(track, applyMove(SOLVED, parseMove('F')))).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'

import { applyMove, applyMoves, invertMoves, parseMoves, SOLVED, type Cube } from './cube'
import {
  attemptConfig,
  attemptDisplayMs,
  isF2lSolved,
  isInCase,
  isOllSolved,
  reduceAttempt,
  startAttempt,
  type CubeAttemptResult,
  type CubeAttemptState,
} from './cubeAttempt'
import { CASES_BY_ID } from './data/cases'
import { pickScramble } from './scramble'

const SUNE = CASES_BY_ID.get(27)!
const picked = pickScramble(27, () => 0, 'y')
const config = attemptConfig(picked.scramble, 15_000)

/** Plays turns one a second apart from `at`, collecting any result. */
function play(state: CubeAttemptState, cube: Cube, turns: string, at = 0) {
  let result: CubeAttemptResult | undefined
  for (const move of parseMoves(turns)) {
    cube = applyMove(cube, move)
    at += 1000
    const step = reduceAttempt(state, { type: 'turn', cube, move, at }, config)
    state = step.state
    result ??= step.result
  }
  return { state, cube, at, result }
}

describe('cube predicates', () => {
  it('knows F2L and OLL solved', () => {
    expect(isOllSolved(SOLVED)).toBe(true)
    expect(isOllSolved(applyMoves(SOLVED, 'U'))).toBe(true)
    expect(isOllSolved(applyMoves(SOLVED, invertMoves(SUNE.alg)))).toBe(false)
    expect(isF2lSolved(applyMoves(SOLVED, invertMoves(SUNE.alg)))).toBe(true)
    expect(isF2lSolved(applyMoves(SOLVED, 'R'))).toBe(false)
  })

  it('reaches the case only at the served angle', () => {
    const inCase = applyMoves(SOLVED, picked.scramble)
    expect(isInCase(inCase, config.target)).toBe(true)
    expect(isInCase(applyMoves(inCase, 'U'), config.target)).toBe(false)
  })
})

describe('a smart-cube attempt', () => {
  it('waits for a solved cube before following the scramble', () => {
    const scrambled = applyMoves(SOLVED, 'R')
    const start = startAttempt(scrambled, config)
    expect(start.phase).toBe('unsolved')
    expect(play(start, scrambled, "R'").state.phase).toBe('scrambling')
  })

  it('runs scramble → inspection → solve → result', () => {
    const scrambling = startAttempt(SOLVED, config)
    expect(scrambling.phase).toBe('scrambling')

    const reached = play(scrambling, SOLVED, picked.scramble)
    expect(reached.state).toEqual({ phase: 'inspecting', since: reached.at })

    expect(attemptDisplayMs(reached.state, reached.at + 4000, config)).toBe(11_000)

    // Two seconds of recognition, then a turn a second until OLL solved.
    const solved = play(
      reached.state,
      reached.cube,
      invertMoves(picked.scramble),
      reached.at + 1000,
    )
    expect(solved.state.phase).toBe('done')
    expect(solved.result).toMatchObject({ outcome: 'solved', recognitionMs: 2000 })
    const { solveMs } = solved.result as { solveMs: number }
    expect(solveMs).toBeGreaterThan(0)
    expect(solveMs % 1000).toBe(0)
  })

  it('times recognition up to the first turn, and the solve from it', () => {
    const reached = play(startAttempt(SOLVED, config), SOLVED, picked.scramble)
    const turned = play(reached.state, reached.cube, 'U', reached.at)
    expect(turned.state).toEqual({ phase: 'solving', recognitionMs: 1000, startedAt: turned.at })
    expect(attemptDisplayMs(turned.state, turned.at + 500, config)).toBe(1500)
  })

  it('treats a wrong route that still lands on the case as reaching it', () => {
    const viaDetour = `F F' ${picked.scramble}`
    expect(play(startAttempt(SOLVED, config), SOLVED, viaDetour).state.phase).toBe('inspecting')
  })

  it('makes running out of inspection a blank', () => {
    const reached = play(startAttempt(SOLVED, config), SOLVED, picked.scramble)
    const early = reduceAttempt(reached.state, { type: 'tick', at: reached.at + 14_999 }, config)
    expect(early.result).toBeUndefined()
    const late = reduceAttempt(reached.state, { type: 'tick', at: reached.at + 15_000 }, config)
    expect(late).toEqual({ state: { phase: 'done' }, result: { outcome: 'unknown' } })
  })

  it('abandons back to waiting, without a result', () => {
    const reached = play(startAttempt(SOLVED, config), SOLVED, picked.scramble)
    expect(reduceAttempt(reached.state, { type: 'abandon' }, config)).toEqual({
      state: { phase: 'unsolved' },
    })
  })
})

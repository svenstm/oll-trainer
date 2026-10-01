/**
 * One attempt with a smart cube, as a pure reducer — the counterpart of
 * `timer.ts` for when the cube, not a key, says what is happening.
 *
 *   unsolved   --OLL solved-------> scrambling   (from wherever the cube is)
 *   unsolved   --case reached-----> inspecting
 *   scrambling --case reached-----> inspecting
 *   inspecting --any turn---------> solving      (recognition time recorded)
 *   inspecting --15 s pass--------> done         (a blank)
 *   solving    --OLL solved-------> done         (the solve is recorded)
 *
 * A solve ends OLL solved, which is all a scramble needs to start from, so
 * the attempt after a solve begins scrambling at once.
 *   any        --abandon----------> unsolved
 *
 * Every cube state here is in the user's grip frame (see `grip.ts`), so `U`
 * is the top face and `SOLVED` is solved.
 */

import { applyMoves, D, SOLVED, type Cube, type Move } from './cube'
import { patternFromCube, patternsEqual, SOLVED_PATTERN } from './pattern'
import {
  advance,
  START,
  trackScramble,
  type ScrambleProgress,
  type ScrambleTrack,
} from './scrambleProgress'
import type { Pattern } from './types'

/** WCA's inspection allowance. */
export const INSPECTION_MS = 15_000

export type CubeAttemptState =
  | { phase: 'unsolved' }
  | { phase: 'scrambling'; track: ScrambleTrack; progress: ScrambleProgress }
  | { phase: 'inspecting'; since: number }
  | { phase: 'solving'; recognitionMs: number; startedAt: number }
  | { phase: 'done' }

export type CubeAttemptPhase = CubeAttemptState['phase']

/**
 * `turn` carries the state the move left the cube in. `at` is a
 * `performance.now()` reading, the clock smart-cube move timestamps use.
 */
export type CubeAttemptEvent =
  | { type: 'turn'; cube: Cube; move: Move; at: number }
  | { type: 'tick'; at: number }
  | { type: 'abandon' }

export type CubeAttemptResult =
  { outcome: 'solved'; recognitionMs: number; solveMs: number } | { outcome: 'unknown' }

export interface CubeAttemptConfig {
  scramble: string
  /** The served case at the served angle. */
  target: Pattern
  inspectionMs: number
}

export interface CubeAttemptTransition {
  state: CubeAttemptState
  result?: CubeAttemptResult
}

export function attemptConfig(scramble: string, inspectionMs = INSPECTION_MS): CubeAttemptConfig {
  return {
    scramble,
    target: patternFromCube(applyMoves(SOLVED, scramble)),
    inspectionMs,
  }
}

/** The bottom face, and the lower two rows of every side, match their centres. */
export function isF2lSolved(cube: Cube): boolean {
  for (let i = 0; i < 9; i++) if (cube[D * 9 + i] !== D) return false
  for (const face of [1, 2, 4, 5]) {
    for (let i = 3; i < 9; i++) if (cube[face * 9 + i] !== face) return false
  }
  return true
}

export function isOllSolved(cube: Cube): boolean {
  return isF2lSolved(cube) && patternsEqual(patternFromCube(cube), SOLVED_PATTERN)
}

/** Case reached: the served case, at the served angle, with any permutation. */
export function isInCase(cube: Cube, target: Pattern): boolean {
  return isF2lSolved(cube) && patternsEqual(patternFromCube(cube), target)
}

/**
 * Where a fresh attempt starts, given the cube as it is now. Only a turn can
 * reach the case — a cube already sitting in it has no moment to time
 * inspection from — so this never starts in `inspecting`.
 */
export function startAttempt(cube: Cube | null, config: CubeAttemptConfig): CubeAttemptState {
  return cube && isOllSolved(cube) ? scramblingFrom(cube, config) : { phase: 'unsolved' }
}

function scramblingFrom(cube: Cube, config: CubeAttemptConfig): CubeAttemptState {
  return { phase: 'scrambling', track: trackScramble(config.scramble, cube), progress: START }
}

export function reduceAttempt(
  state: CubeAttemptState,
  event: CubeAttemptEvent,
  config: CubeAttemptConfig,
): CubeAttemptTransition {
  if (event.type === 'abandon') {
    return { state: state.phase === 'done' ? state : { phase: 'unsolved' } }
  }

  if (event.type === 'tick') {
    if (state.phase === 'inspecting' && event.at - state.since >= config.inspectionMs) {
      // Fifteen seconds without recognising it is not knowing it.
      return { state: { phase: 'done' }, result: { outcome: 'unknown' } }
    }
    return { state }
  }

  const { cube, move, at } = event
  switch (state.phase) {
    case 'unsolved':
      if (isInCase(cube, config.target)) return { state: { phase: 'inspecting', since: at } }
      if (isOllSolved(cube)) return { state: scramblingFrom(cube, config) }
      return { state }

    case 'scrambling':
      // By whatever route: a wrong turn that still lands on the case counts.
      if (isInCase(cube, config.target)) return { state: { phase: 'inspecting', since: at } }
      {
        const progress = advance(state.progress, state.track, cube, move)
        // Strayed onto another OLL-solved state — an AUF, a PLL — which is as
        // good a start as the last one, so start again from there.
        if (progress.correction.length > 0 && isOllSolved(cube)) {
          return { state: scramblingFrom(cube, config) }
        }
        return { state: { ...state, progress } }
      }

    case 'inspecting':
      // The first turn ends inspection and starts the solve, as in WCA.
      return { state: { phase: 'solving', recognitionMs: at - state.since, startedAt: at } }

    case 'solving':
      if (isOllSolved(cube)) {
        return {
          state: { phase: 'done' },
          result: {
            outcome: 'solved',
            recognitionMs: state.recognitionMs,
            solveMs: Math.max(0, at - state.startedAt),
          },
        }
      }
      return { state }

    case 'done':
      return { state }
  }
}

/**
 * What the timer display should show, in milliseconds: the inspection left,
 * then the whole attempt so far — recognition included, so the number it
 * stops on is the one recorded.
 */
export function attemptDisplayMs(
  state: CubeAttemptState,
  now: number,
  config: CubeAttemptConfig,
): number {
  switch (state.phase) {
    case 'inspecting':
      return Math.max(0, config.inspectionMs - (now - state.since))
    case 'solving':
      return state.recognitionMs + Math.max(0, now - state.startedAt)
    default:
      return 0
  }
}

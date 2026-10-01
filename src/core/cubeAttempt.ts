/**
 * One attempt with a smart cube, as a pure reducer — the counterpart of
 * `timer.ts` for when the cube, not a key, says what is happening.
 *
 *   unsolved   --solved-----------> scrambling
 *   unsolved   --case reached-----> inspecting
 *   scrambling --case reached-----> inspecting
 *   inspecting --any turn---------> solving      (recognition time recorded)
 *   inspecting --15 s pass--------> done         (a blank)
 *   solving    --OLL solved-------> done         (the solve is recorded)
 *   any        --abandon----------> unsolved
 *
 * Every cube state here is in the user's grip frame (see `grip.ts`), so `U`
 * is the top face and `SOLVED` is solved.
 */

import { applyMoves, D, isSolved, SOLVED, type Cube, type Move } from './cube'
import { patternFromCube, patternsEqual, SOLVED_PATTERN } from './pattern'
import {
  advance,
  locate,
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
  | { phase: 'scrambling'; progress: ScrambleProgress }
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
  track: ScrambleTrack
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
    track: trackScramble(scramble),
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
  if (!cube) return { phase: 'unsolved' }
  const progress = locate(config.track, cube)
  return progress ? { phase: 'scrambling', progress } : { phase: 'unsolved' }
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
      if (isSolved(cube)) return { state: { phase: 'scrambling', progress: START } }
      return { state }

    case 'scrambling':
      // By whatever route: a wrong turn that still lands on the case counts.
      if (isInCase(cube, config.target)) return { state: { phase: 'inspecting', since: at } }
      return {
        state: { phase: 'scrambling', progress: advance(state.progress, config.track, cube, move) },
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

/** What the timer display should show, in milliseconds. */
export function attemptDisplayMs(
  state: CubeAttemptState,
  now: number,
  config: CubeAttemptConfig,
): number {
  switch (state.phase) {
    case 'inspecting':
      return Math.max(0, config.inspectionMs - (now - state.since))
    case 'solving':
      return Math.max(0, now - state.startedAt)
    default:
      return 0
  }
}

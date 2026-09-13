/** Practice modes. `learn` is the pace-scheduled one. */
export type Mode = 'train' | 'recap' | 'learn'

export const MODES = ['learn', 'train', 'recap'] as const satisfies readonly Mode[]

export function isMode(value: unknown): value is Mode {
  return typeof value === 'string' && (MODES as readonly string[]).includes(value)
}

/** U-face pre-rotation applied to a scramble so a case is drilled from all angles. */
export type Rotation = '' | 'y' | 'y2' | "y'"

/**
 * 21 slots: 9 U-face stickers (row-major), then 12 side stickers, 3 per side,
 * in B R F L order. 1 = shows the U colour (oriented), 0 = does not.
 * Exactly 9 of the 21 are oriented in every valid OLL state.
 */
export type Pattern = readonly (0 | 1)[]

/** The 14 shape groups the selection screen is organised by. */
export type OllGroup =
  | 'All Edges Oriented Correctly'
  | 'No Edges Flipped Correctly'
  | 'L-Shapes'
  | 'Lightning Bolts'
  | 'P-Shapes'
  | 'I-Shapes'
  | 'Fish-Shapes'
  | 'Knight Move Shapes'
  | 'Awkward Shapes'
  | 'T-Shapes'
  | 'Squares'
  | 'C-Shapes'
  | 'W-Shapes'
  | 'Corners Correct, Edges Flipped'

export interface OllCase {
  /** Standard community numbering, 1..57. */
  id: number
  name: string
  group: OllGroup
  pattern: Pattern
  /**
   * Canonical, ergonomic algorithm — what the app teaches.
   *
   * docs/PLAN.md §16 also wanted 2-3 generated alternatives "at no extra
   * cost", which turned out not to hold: the fast solver cannot express an
   * orientation-only goal, and the optimal one does not finish. Full-cube
   * solutions *are* valid OLL algorithms but run 12-18 moves, so they would be
   * worse than this one rather than an alternative to it.
   */
  alg: string
}

/**
 * How an attempt ended.
 *
 * `unknown` is "I don't know": the case was recognised as unfamiliar before the
 * timer was ever started, so there is no time to record. It is a categorical
 * failure of recall rather than a slow one, and the scheduler treats it as one
 * — see `buildModel`.
 */
export type Outcome = 'solved' | 'unknown'

export const OUTCOMES = ['solved', 'unknown'] as const satisfies readonly Outcome[]

interface AttemptBase {
  id: string
  caseId: number
  scramble: string
  rotation: Rotation
  /** Wall clock, epoch ms. */
  ts: number
  mode: Mode
}

export interface SolvedAttempt extends AttemptBase {
  outcome: 'solved'
  /** True elapsed milliseconds, full precision. Never re-parsed from the DOM. */
  ms: number
}

/**
 * Deliberately carries no `ms` at all, rather than a zero or a null.
 *
 * As a union, the compiler walks you to every site that reads a time and makes
 * each one decide. A sentinel would keep them all compiling while letting a
 * phantom `0` into the mean, the best, the sparkline and — worst — the
 * 20th-percentile execution floor that decides whether a case looks mastered.
 */
export interface UnknownAttempt extends AttemptBase {
  outcome: 'unknown'
}

export type Solve = SolvedAttempt | UnknownAttempt

export function isSolved(solve: Solve): solve is SolvedAttempt {
  return solve.outcome === 'solved'
}

/** Distributes over a union, unlike `Omit`, which would key over only the shared fields. */
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never

/**
 * A solve before the store gives it an id. Distributive, so the `solved`
 * variant keeps its `ms` — a plain `Omit<Solve, 'id'>` would silently drop it.
 */
export type NewSolve = WithoutId<Solve>

export type Theme = 'light' | 'dark' | 'system'

export interface Settings {
  theme: Theme
  timerSize: number
  scrambleSize: number
  /** Hold-to-ready duration in ms. 0 reproduces the old app's feel. */
  holdMs: number
  /** Trials that may pass before a case still being introduced is served. */
  introEvery: number
}

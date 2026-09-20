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

/**
 * Where a non-canonical algorithm came from.
 *
 * A table rather than a bare string so the URL lives in the data next to the
 * name that gets rendered, instead of only in a comment and the README — and
 * so a second sheet is a new key rather than a new field.
 */
export const SOURCES = {
  'cube-academy': {
    name: 'Cube Academy',
    url: 'https://www.cube.academy/oll-algs',
  },
} as const

export type SourceKey = keyof typeof SOURCES

/** A second algorithm for a case, from a named sheet. */
export interface Alternative {
  alg: string
  source: SourceKey
  /**
   * Quarter turns from the case's stored pattern to the pattern *this*
   * algorithm is written for.
   *
   * Sheets do not agree on which way up to hold a case, and 21 of Cube
   * Academy's differ from ours. Rewriting the algorithm into our angle would
   * turn an R/U algorithm into an L/U one and throw away the ergonomics that
   * made it worth having, so the offset is carried instead and turned into a
   * cube rotation by `solutionAsDrawn` — the one place that already composes
   * the angle a case was *served* at.
   *
   * Derived by the binder, never hand-entered.
   */
  quarterTurns: 0 | 1 | 2 | 3
}

export interface OllCase {
  /** Standard community numbering, 1..57. */
  id: number
  name: string
  group: OllGroup
  pattern: Pattern
  /** Canonical, ergonomic algorithm — what the app teaches. */
  alg: string
  /**
   * Other sheets' algorithms for this case, shown beside `alg` but never in
   * place of it: `alg` remains the one the scheduler measures.
   *
   * docs/PLAN.md §16 wanted 2-3 *generated* alternatives, which did not work
   * out — see docs/plan-deviations.md. These are transcribed instead, and a
   * case has one only when the sheet's algorithm actually differs from ours,
   * so an empty list is the normal state for 29 of the 57.
   */
  alternatives: readonly Alternative[]
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

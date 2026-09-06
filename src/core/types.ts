/** Practice modes. `learn` is the ARTS-scheduled one. */
export type Mode = 'train' | 'recap' | 'learn'

export const MODES = ['train', 'recap', 'learn'] as const satisfies readonly Mode[]

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
  /** Canonical, ergonomic algorithm — what the app teaches. */
  alg: string
  /** 2–3 shortest generated solutions. */
  alternatives: string[]
}

export interface Solve {
  id: string
  caseId: number
  /** True elapsed milliseconds, full precision. Never re-parsed from the DOM. */
  ms: number
  scramble: string
  rotation: Rotation
  /** Wall clock, epoch ms. */
  ts: number
  mode: Mode
}

export type Theme = 'light' | 'dark' | 'system'

export interface Settings {
  theme: Theme
  timerSize: number
  scrambleSize: number
  /** Hold-to-ready duration in ms. 0 reproduces the old app's feel. */
  holdMs: number
  /** ARTS activation threshold. */
  tau: number
}

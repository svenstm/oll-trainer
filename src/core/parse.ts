/**
 * Turning untrusted data into domain types.
 *
 * Both localStorage and an imported backup file are hand-editable and may have
 * been written by an older or newer build, so both need exactly the same
 * validation. Keeping it here means there is one definition of "a usable
 * solve" rather than two that can drift apart.
 */

import { CASES_BY_ID } from './data/cases'
import { ARTS_DEFAULTS } from './arts'
import {
  MODES,
  OUTCOMES,
  type Mode,
  type Outcome,
  type Rotation,
  type Settings,
  type Solve,
  type Theme,
} from './types'

const ROTATIONS: readonly Rotation[] = ['', 'y', 'y2', "y'"]
const THEMES: readonly Theme[] = ['light', 'dark', 'system']

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function asFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function asOneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback
}

export function clampNumber(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value
}

// --- solves ----------------------------------------------------------------

export function parseSolve(raw: unknown): Solve | null {
  if (!isRecord(raw)) return null
  const caseId = asFiniteNumber(raw.caseId, Number.NaN)
  const ts = asFiniteNumber(raw.ts, Number.NaN)
  // Without a real case and a timestamp, an attempt teaches the model nothing.
  if (!CASES_BY_ID.has(caseId) || !Number.isFinite(ts)) return null

  const base = {
    id: typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : `${caseId}-${ts}`,
    caseId,
    scramble: typeof raw.scramble === 'string' ? raw.scramble : '',
    rotation: asOneOf<Rotation>(raw.rotation, ROTATIONS, ''),
    ts,
    mode: asOneOf<Mode>(raw.mode, MODES, 'train'),
  }

  // Anything written before "I don't know" existed has no outcome, and every
  // attempt in it was timed — so `solved` is the only safe default.
  if (asOneOf<Outcome>(raw.outcome, OUTCOMES, 'solved') === 'unknown') {
    return { ...base, outcome: 'unknown' }
  }

  const ms = asFiniteNumber(raw.ms, Number.NaN)
  if (!Number.isFinite(ms)) return null
  return { ...base, outcome: 'solved', ms }
}

/** Oldest first, which is what the ARTS replay requires. */
export function parseSolves(raw: unknown): Solve[] | null {
  if (!Array.isArray(raw)) return null
  return raw
    .map(parseSolve)
    .filter((solve): solve is Solve => solve !== null)
    .sort((a, b) => a.ts - b.ts)
}

// --- selection -------------------------------------------------------------

/** Unknown ids are dropped, so stale or hand-edited data cannot break practice. */
export function parseSelection(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null
  return [...new Set(raw.filter((id): id is number => typeof id === 'number'))]
    .filter((id) => CASES_BY_ID.has(id))
    .sort((a, b) => a - b)
}

// --- settings --------------------------------------------------------------

/** Bounds for the sliders. Kept here so the parser and the UI cannot disagree. */
export const LIMITS = {
  timerSize: { min: 2, max: 10, step: 0.25 },
  scrambleSize: { min: 0.8, max: 2.5, step: 0.05 },
  holdMs: { min: 0, max: 1000, step: 50 },
} as const

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  timerSize: 5,
  scrambleSize: 1.25,
  holdMs: 300,
  tau: ARTS_DEFAULTS.tau,
}

export function parseSettings(raw: unknown): Settings | null {
  if (!isRecord(raw)) return null
  return {
    theme: asOneOf(raw.theme, THEMES, DEFAULT_SETTINGS.theme),
    timerSize: clampNumber(
      asFiniteNumber(raw.timerSize, DEFAULT_SETTINGS.timerSize),
      LIMITS.timerSize.min,
      LIMITS.timerSize.max,
    ),
    scrambleSize: clampNumber(
      asFiniteNumber(raw.scrambleSize, DEFAULT_SETTINGS.scrambleSize),
      LIMITS.scrambleSize.min,
      LIMITS.scrambleSize.max,
    ),
    holdMs: clampNumber(
      asFiniteNumber(raw.holdMs, DEFAULT_SETTINGS.holdMs),
      LIMITS.holdMs.min,
      LIMITS.holdMs.max,
    ),
    // Eager is the *lower* number, so the range runs the other way.
    tau: clampNumber(
      asFiniteNumber(raw.tau, DEFAULT_SETTINGS.tau),
      ARTS_DEFAULTS.tauEager,
      ARTS_DEFAULTS.tauGentle,
    ),
  }
}

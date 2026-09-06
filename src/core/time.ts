/** Formatting and the averages a cubing timer is expected to show. */

import type { Solve } from './types'

/**
 * `12.34`, or `1:02.34` past a minute. Two decimals because the timer measures
 * from `performance.now()` deltas; the old app could only ever show hundredths
 * because it re-parsed its own rendered text.
 */
export function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const hundredths = Math.floor(ms / 10)
  const seconds = Math.floor(hundredths / 100)
  const rest = String(hundredths % 100).padStart(2, '0')
  if (seconds < 60) return `${seconds}.${rest}`
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}.${rest}`
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function best(values: readonly number[]): number | null {
  return values.length === 0 ? null : Math.min(...values)
}

export function worst(values: readonly number[]): number | null {
  return values.length === 0 ? null : Math.max(...values)
}

/**
 * Average of `n`, WCA style: the most recent `n` solves with the single best
 * and single worst dropped. Null until there are `n` of them — a partial
 * average is not an average of n.
 */
export function ao(values: readonly number[], n: number): number | null {
  if (n < 3 || values.length < n) return null
  const window = values.slice(-n).sort((a, b) => a - b)
  return mean(window.slice(1, -1))
}

export interface Stats {
  count: number
  mean: number | null
  best: number | null
  worst: number | null
  ao5: number | null
  ao12: number | null
}

/** `solves` must be oldest-first, which is how the store keeps them. */
export function statsFor(solves: readonly Solve[]): Stats {
  const values = solves.map((solve) => solve.ms)
  return {
    count: values.length,
    mean: mean(values),
    best: best(values),
    worst: worst(values),
    ao5: ao(values, 5),
    ao12: ao(values, 12),
  }
}

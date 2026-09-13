/**
 * Pace-relative sequencing: which case to serve next.
 *
 * A case is scored by how it performs against your *other* cases, not against
 * a forgetting curve. The model this replaces gave every case an ACT-R
 * activation that decayed with elapsed time; measured against a real history
 * that turned the strength bar into a thirty-second recency countdown, and made
 * 49 minutes of uninterrupted practice decay a case as much as a night's sleep.
 * See docs/pace-design.md for the measurements, and docs/arts-recalibration.md
 * for the model that was abandoned.
 *
 * The premise here is that OLL execution is an overlearned motor sequence and
 * does not fade on any scale worth modelling. What varies is recognition, and
 * the evidence for that is already in the history: a case you have not really
 * learned is slower than your others, or wilder than your others, or both.
 *
 * So there is no elapsed-time term anywhere in this file. Nothing decays while
 * you are away, or while you sit and think. The only gradient that survives
 * once every case is at par is "least recently served", counted in trials.
 *
 * No model state is persisted. The whole model is a fold over the durable solve
 * history, so deleting one solve correctly un-learns it.
 */

import { CASES_BY_ID } from './data/cases'
import { parseMoves } from './cube'
import type { Rotation, Solve } from './types'

export interface PaceConfig {
  /** Attempts that make up a case's scoring window, newest last. */
  window: number
  /** Timed solves a case needs before it is scored at all. */
  minSolves: number
  /** Scored cases needed before par is drawn from your own results. */
  minEligible: number
  /** Percentile of per-case results that becomes par. */
  parPercentile: number
  /** Turns per second, before there is enough data to fit it. */
  defaultTps: number
  tpsMin: number
  tpsMax: number
  /** Worst-vs-median above this fails the consistency gate. */
  spreadGate: number
  /**
   * Score at or under which a case counts as mastered, and at which the bar
   * fills. It must sit *above* par: par is the 25th percentile of your own
   * cases, so a mastery test of `score <= 1` would be a rank, not an
   * achievement — only a quarter of your cases could ever hold it, however
   * good you got. This is a margin instead: "not meaningfully worse than my
   * better cases".
   */
  masteredAt: number
  /** Score at which the bar empties. */
  barCeiling: number
  /** Times outside this band never reach the model. */
  minMs: number
  maxMs: number
  /** Never let this many trials pass without introducing a case. 0 disables. */
  introEvery: number
  /** Slider ends. Eager introduces new cases more often, so it is the lower number. */
  introEager: number
  introGentle: number
  /** A case is held back for selectionSize/spacingDiv trials, capped. */
  spacingDiv: number
  spacingMax: number
}

export const PACE_DEFAULTS: PaceConfig = {
  window: 3,
  minSolves: 3,
  minEligible: 5,
  parPercentile: 25,
  defaultTps: 3.0,
  tpsMin: 1.0,
  tpsMax: 15.0,
  spreadGate: 1.5,
  masteredAt: 1.25,
  barCeiling: 3.0,
  minMs: 500,
  maxMs: 120000,
  introEvery: 6,
  introEager: 3,
  introGentle: 12,
  spacingDiv: 3,
  spacingMax: 5,
}

export const ROTATIONS: readonly Rotation[] = ['', 'y', 'y2', "y'"]

/** What the display and the scheduler both read a case as. */
export type CaseState = 'unseen' | 'introducing' | 'at-risk' | 'learning' | 'mastered'

export interface CaseStats {
  /** Timed solves inside the window, oldest first, in seconds. */
  window: readonly number[]
  /** Every timed solve this case has, in seconds. Gates `introducing`. */
  count: number
  /** A blank sits inside the window. */
  blanked: boolean
}

export interface PaceModel {
  stats: ReadonlyMap<number, CaseStats>
  /**
   * How long a case of a given length should take you, fitted from your own
   * best times: `intercept + slope * moves`, in seconds. Null when the fit was
   * not credible.
   *
   * The intercept is the point. A pure `moves / tps` model says a 7-move case
   * should take half as long as a 14-move one, but recognition costs the same
   * either way, so short algorithms come out looking permanently bad. A
   * simulated learner sitting within 13% of its true floor on every 7-move case
   * still read `learning` after 700 reps, and the scheduler ground them
   * forever. `arts.ts` avoided this by subtracting an execution floor before
   * fitting; this fits the floor instead.
   */
  fit: { intercept: number; slope: number } | null
  /** Your 25th-percentile performance against `fit`, dimensionless. */
  parRatio: number | null
  /** Par as a flat time, used when the fit was not credible. */
  parFlat: number | null
  /** Fitted turns per second — `1 / slope`, kept for display. */
  tps: number
  /** Every case id served, oldest first, unfiltered. Drives spacing and coverage. */
  served: readonly number[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value
}

function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * Linearly interpolated percentile of an ascending array.
 *
 * Interpolated rather than index-selected on purpose. Index-selecting makes par
 * *be* one case's median, so it jumps the moment one case overtakes another —
 * and par feeding back into every case's score is exactly the loop that could
 * oscillate. Interpolating lets par slide.
 */
function percentileOf(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]!
  const pos = (clamp(p, 0, 100) / 100) * (sorted.length - 1)
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return lo === hi ? sorted[lo]! : sorted[lo]! + (pos - lo) * (sorted[hi]! - sorted[lo]!)
}

function randomElement<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)]!
}

const moveCounts = new Map<number, number>()

/** Moves in a case's canonical algorithm, used as its execution-length proxy. */
export function algMoveCount(caseId: number): number {
  const cached = moveCounts.get(caseId)
  if (cached !== undefined) return cached
  const alg = CASES_BY_ID.get(caseId)?.alg
  // Roughly the median OLL, for a case that is somehow not in the data.
  const count = alg ? parseMoves(alg).length || 10 : 10
  moveCounts.set(caseId, count)
  return count
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

interface Attempt {
  caseId: number
  /** null for an "I don't know": nothing was timed. */
  seconds: number | null
}

/**
 * Replays the durable solve history into a model. `solves` must be oldest
 * first.
 *
 * There is deliberately no `now` parameter. The old model needed one and took
 * it from a non-reactive `Date.now()` inside a computed, so the strength bar
 * sat frozen until the next solve landed and then jumped. Nothing here depends
 * on the clock, so that whole class of bug is gone.
 */
export function buildModel(
  solves: readonly Solve[],
  config: PaceConfig = PACE_DEFAULTS,
): PaceModel {
  const served = solves.map((solve) => solve.caseId)

  // 1. Usable attempts. A time outside the band is someone walking away from
  //    the timer or mis-triggering it, and must not teach the model anything —
  //    though it still counts for spacing and coverage, hence `served` above.
  //
  //    A blank has no time to fall inside or outside that band, and must
  //    bypass it entirely: it is the single most informative thing the user can
  //    tell this scheduler.
  const attempts: Attempt[] = []
  for (const solve of solves) {
    if (solve.outcome === 'unknown') {
      attempts.push({ caseId: solve.caseId, seconds: null })
    } else if (solve.ms >= config.minMs && solve.ms <= config.maxMs) {
      attempts.push({ caseId: solve.caseId, seconds: solve.ms / 1000 })
    }
  }

  // 2. Per-case windows. The window is the last `window` *attempts*, blanks
  //    included — which is how a blank expires: three clean reps push it out.
  const byCase = new Map<number, Attempt[]>()
  for (const attempt of attempts) {
    const list = byCase.get(attempt.caseId)
    if (list) list.push(attempt)
    else byCase.set(attempt.caseId, [attempt])
  }

  const stats = new Map<number, CaseStats>()
  for (const [caseId, list] of byCase) {
    const recent = list.slice(-config.window)
    stats.set(caseId, {
      window: recent
        .filter((a): a is Attempt & { seconds: number } => a.seconds !== null)
        .map((a) => a.seconds),
      count: list.reduce((n, a) => (a.seconds === null ? n : n + 1), 0),
      blanked: recent.some((a) => a.seconds === null),
    })
  }

  // 3. Expected time by algorithm length, fitted Theil-Sen — the median of all
  //    pairwise slopes, plus the median residual as the intercept. Theil-Sen
  //    rather than least squares: a handful of cases you are badly stuck on are
  //    extreme outliers in this scatter and drag an ordinary regression well
  //    off course.
  //
  //    It is fitted on each case's *best* time rather than its recent median. A
  //    median carries however much recognition hesitation that case currently
  //    has, and cases sit at wildly different learning stages — a drilled
  //    13-move case beats a fresh 9-move one, so the pairwise slopes go
  //    negative and the median slope with them. Best times sit near the
  //    execution floor, which is where a length relationship is legible at all.
  let fit: { intercept: number; slope: number } | null = null
  const points: { x: number; y: number }[] = []
  for (const [caseId, list] of byCase) {
    const timed = list.filter((a) => a.seconds !== null).map((a) => a.seconds!)
    if (timed.length >= config.minSolves) {
      points.push({ x: algMoveCount(caseId), y: Math.min(...timed) })
    }
  }
  if (points.length >= 4) {
    const slopes: number[] = []
    for (let a = 0; a < points.length; a++) {
      for (let b = a + 1; b < points.length; b++) {
        if (points[a]!.x !== points[b]!.x) {
          slopes.push((points[a]!.y - points[b]!.y) / (points[a]!.x - points[b]!.x))
        }
      }
    }
    if (slopes.length >= 5) {
      const slope = medianOf(slopes)
      if (slope > 0) {
        // Negative intercepts are unphysical and would make short cases free.
        const intercept = Math.max(0, medianOf(points.map((p) => p.y - slope * p.x)))
        fit = { intercept, slope }
      }
    }
  }
  const tps = fit ? clamp(1 / fit.slope, config.tpsMin, config.tpsMax) : config.defaultTps

  // 4. Par, from your own results so that it is reachable by construction.
  //
  //    The p25 rather than the median matters: against a median par, half the
  //    selection sits above par by definition. `masteredAt` then carries the
  //    margin that makes mastery an achievement rather than a rank.
  const eligible = [...stats.entries()].filter(
    ([, stat]) => stat.count >= config.minSolves && stat.window.length > 0,
  )
  let parRatio: number | null = null
  let parFlat: number | null = null
  if (eligible.length >= config.minEligible) {
    if (fit) {
      // Normalise against expected time *before* taking the percentile, so
      // cases of different lengths are comparable going in.
      const ratios = eligible
        .map(([caseId, stat]) => medianOf(stat.window) / expected(fit!, caseId))
        .sort((a, b) => a - b)
      parRatio = percentileOf(ratios, config.parPercentile)
    } else {
      const medians = eligible.map(([, stat]) => medianOf(stat.window)).sort((a, b) => a - b)
      parFlat = percentileOf(medians, config.parPercentile)
    }
  }

  return { stats, fit, parRatio, parFlat, tps, served }
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** What the length model alone says this case costs, in seconds. */
function expected(fit: { intercept: number; slope: number }, caseId: number): number {
  return fit.intercept + fit.slope * algMoveCount(caseId)
}

/** The time this case should take you, in seconds. */
export function par(model: PaceModel, caseId: number, config: PaceConfig = PACE_DEFAULTS): number {
  if (model.fit !== null && model.parRatio !== null) {
    return model.parRatio * expected(model.fit, caseId)
  }
  if (model.parFlat !== null) return model.parFlat
  // Not enough of your own results yet: fall back to the move-count seed.
  return algMoveCount(caseId) / config.defaultTps
}

/** Window median over par. Lower is better; 1.0 is par. Null when unscored. */
export function pace(
  model: PaceModel,
  caseId: number,
  config: PaceConfig = PACE_DEFAULTS,
): number | null {
  const stat = model.stats.get(caseId)
  if (!stat || stat.count < config.minSolves || stat.window.length === 0) return null
  return medianOf(stat.window) / par(model, caseId, config)
}

/**
 * Worst-vs-median across the window. Null when unscored or single-sampled.
 *
 * Worst-vs-median rather than max/min: max/min flips on where the window
 * happens to fall rather than on how reliable you actually are. In the
 * reference history case 10 spreads 3.5x across all four of its solves but only
 * 1.6x across the last three, purely because its fast solve was its first.
 */
export function spread(
  model: PaceModel,
  caseId: number,
  config: PaceConfig = PACE_DEFAULTS,
): number | null {
  const stat = model.stats.get(caseId)
  if (!stat || stat.count < config.minSolves || stat.window.length < 2) return null
  return Math.max(...stat.window) / medianOf(stat.window)
}

/**
 * The one number that drives both the queue and the bar, so that what you see
 * and what gets served next cannot disagree. Higher is worse. Null when
 * unscored; Infinity for a case blanked inside its window.
 */
export function score(
  model: PaceModel,
  caseId: number,
  config: PaceConfig = PACE_DEFAULTS,
): number | null {
  const stat = model.stats.get(caseId)
  if (!stat || stat.count < config.minSolves || stat.window.length === 0) return null
  if (stat.blanked) return Infinity
  const p = pace(model, caseId, config)!
  const s = spread(model, caseId, config)
  return s === null ? p : p * Math.max(1, s / config.spreadGate)
}

export function state(
  model: PaceModel,
  caseId: number,
  config: PaceConfig = PACE_DEFAULTS,
): CaseState {
  const stat = model.stats.get(caseId)
  if (!stat) return 'unseen'
  if (stat.blanked) return 'at-risk'
  if (stat.count < config.minSolves || stat.window.length === 0) return 'introducing'
  const s = spread(model, caseId, config)
  if (s !== null && s > config.spreadGate) return 'at-risk'
  return score(model, caseId, config)! <= config.masteredAt ? 'mastered' : 'learning'
}

/**
 * Bar fill as 0..1, or null for a case with no score to show.
 *
 * Null rather than zero for `introducing`: a case you have met twice has not
 * been measured, which is a different statement from "measured, and bad".
 */
export function barValue(
  model: PaceModel,
  caseId: number,
  config: PaceConfig = PACE_DEFAULTS,
): number | null {
  const s = score(model, caseId, config)
  if (s === null) return null
  if (!Number.isFinite(s)) return 0
  return clamp((config.barCeiling - s) / (config.barCeiling - config.masteredAt), 0, 1)
}

// ---------------------------------------------------------------------------
// Choosing
// ---------------------------------------------------------------------------

/**
 * The cases served most recently, held back so one stubborn case cannot
 * monopolise the session.
 */
export function recentlyServed(
  model: PaceModel,
  selectionSize: number,
  config: PaceConfig = PACE_DEFAULTS,
): ReadonlySet<number> {
  let hold = Math.min(Math.floor(selectionSize / config.spacingDiv), config.spacingMax)
  const recent = new Set<number>()
  for (let i = model.served.length - 1; i >= 0 && hold > 0; i--) {
    const caseId = model.served[i]!
    if (!recent.has(caseId)) {
      recent.add(caseId)
      hold--
    }
  }
  return recent
}

/** A case that has not yet earned a score: never seen, or seen but unfinished. */
function isPending(model: PaceModel, caseId: number, config: PaceConfig): boolean {
  const stat = model.stats.get(caseId)
  return !stat || stat.count < config.minSolves || stat.window.length === 0
}

/**
 * True when no unfinished case has been advanced for too long.
 *
 * This counts *any* pending case, not just an unseen one. Measuring only first
 * sightings lets a case be met once and then abandoned: it is no longer unseen,
 * so it stops resetting the counter, and it has no score, so it never competes
 * in the main ordering either. In a 1200-trial simulation that starved 8 of 16
 * cases at one or two reps permanently while the rest took 150 each.
 */
export function introStarved(
  model: PaceModel,
  selection: readonly number[],
  config: PaceConfig = PACE_DEFAULTS,
): boolean {
  if (config.introEvery <= 0) return false
  const pending = new Set(selection.filter((caseId) => isPending(model, caseId, config)))
  if (pending.size === 0) return false
  for (let i = model.served.length - 1; i >= 0; i--) {
    if (pending.has(model.served[i]!)) return model.served.length - 1 - i >= config.introEvery
  }
  return true
}

/** Trials since a case was last served. Infinity for one never served. */
function trialsSinceServed(model: PaceModel, caseId: number): number {
  for (let i = model.served.length - 1; i >= 0; i--) {
    if (model.served[i] === caseId) return model.served.length - i
  }
  return Infinity
}

/**
 * The case to serve next, or null if nothing is selected.
 *
 * One ordering, not a stack of priority tiers. The model this replaces had
 * separate "rescue an at-risk case" and "serve the weakest case" branches which
 * collapsed into the same branch in practice — see docs/arts-recalibration.md.
 * Reliability is folded into `score` instead, so a case that is at par but
 * erratic rises above a steady case without overtaking one that is genuinely
 * slower.
 */
export function pickNext(
  model: PaceModel,
  selection: readonly number[],
  random: () => number = Math.random,
  config: PaceConfig = PACE_DEFAULTS,
): number | null {
  if (selection.length === 0) return null

  const held = recentlyServed(model, selection.length, config)
  const pending: number[] = []
  const pendingHeld: number[] = []
  let worst: number | null = null
  let worstScore = -Infinity
  let worstStaleness = -Infinity

  for (const caseId of selection) {
    const s = score(model, caseId, config)
    if (s === null) {
      ;(held.has(caseId) ? pendingHeld : pending).push(caseId)
      continue
    }
    if (held.has(caseId)) continue
    const staleness = trialsSinceServed(model, caseId)
    // Least recently served is the tiebreak, and the whole gradient once every
    // case is at par. It is the only thing here that stands in for decay, and
    // it is counted in trials rather than seconds so that sleeping costs
    // nothing.
    if (s > worstScore || (s === worstScore && staleness > worstStaleness)) {
      worstScore = s
      worstStaleness = staleness
      worst = caseId
    }
  }

  // Finish what you started: among unfinished cases the one closest to earning
  // a score goes first, so half-learned cases cannot pile up unmeasured.
  const nextPending = (): number => {
    let best = pending[0]!
    let bestCount = -1
    for (const caseId of pending) {
      const count = model.stats.get(caseId)?.count ?? 0
      if (count > bestCount) {
        bestCount = count
        best = caseId
      }
    }
    // Nothing started yet, so any of them is as good a place to begin.
    return bestCount <= 0 ? randomElement(pending, random) : best
  }

  if (pending.length > 0 && introStarved(model, selection, config)) return nextPending()
  if (pending.length > 0 && worstScore <= config.masteredAt) return nextPending()
  if (worst !== null) return worst
  if (pending.length > 0) return nextPending()
  if (pendingHeld.length > 0) return randomElement(pendingHeld, random)
  // Everything is held back, which only happens with a very small selection.
  return randomElement(selection, random)
}

/**
 * The angle this case has been shown from least often, so angle coverage stays
 * even without keeping per-angle statistics.
 */
export function pickRotation(
  caseId: number,
  solves: readonly Solve[],
  random: () => number = Math.random,
): Rotation {
  const tally = new Map<Rotation, number>(ROTATIONS.map((rotation) => [rotation, 0]))
  for (const solve of solves) {
    if (solve.caseId !== caseId) continue
    const seen = tally.get(solve.rotation)
    if (seen !== undefined) tally.set(solve.rotation, seen + 1)
  }
  const fewest = Math.min(...tally.values())
  return randomElement(
    ROTATIONS.filter((rotation) => tally.get(rotation) === fewest),
    random,
  )
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export interface LearnStatus {
  introduced: number
  total: number
  atRisk: number
}

/** Answers "why do I keep seeing the same cases". */
export function learnStatus(
  model: PaceModel,
  selection: readonly number[],
  config: PaceConfig = PACE_DEFAULTS,
): LearnStatus {
  let introduced = 0
  let atRisk = 0
  for (const caseId of selection) {
    if (state(model, caseId, config) === 'unseen') continue
    introduced++
    if (state(model, caseId, config) === 'at-risk') atRisk++
  }
  return { introduced, total: selection.length, atRisk }
}

// ---------------------------------------------------------------------------
// The intro knob
// ---------------------------------------------------------------------------

/** 0 is gentle (new cases arrive rarely), 100 is eager. */
export function sliderFromIntroEvery(
  introEvery: number,
  config: PaceConfig = PACE_DEFAULTS,
): number {
  const slider = Math.round(
    ((introEvery - config.introGentle) / (config.introEager - config.introGentle)) * 100,
  )
  // Rounding a tiny negative gives -0, which is not what an <input> wants.
  return clamp(slider === 0 ? 0 : slider, 0, 100)
}

export function introEveryFromSlider(value: number, config: PaceConfig = PACE_DEFAULTS): number {
  return Math.round(
    config.introGentle + (clamp(value, 0, 100) / 100) * (config.introEager - config.introGentle),
  )
}

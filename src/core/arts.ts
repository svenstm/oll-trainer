/**
 * Adaptive Response-Time-based Sequencing: which case to serve next.
 *
 * Every case carries an ACT-R style memory "activation" that decays with time
 * and is rebuilt by each encounter. The gap between how long a solve actually
 * took and how long the model predicted it would take nudges that case's
 * personal difficulty, alpha.
 *
 * Solve time is very nearly the only signal. The one exception is a blank —
 * "I don't know", pressed before the timer was started — which the timer cannot
 * express: worked out slowly it reads as known-but-slow, abandoned it teaches
 * nothing, and walked away from it falls outside the time band and is thrown
 * out. It is handled as a categorical failure rather than a slow solve; see the
 * `entry.ms === null` branch of the replay.
 *
 * No model state is persisted. The whole model is a fold over the durable
 * solve history, so deleting one solve correctly un-learns it. The replay must
 * run forward in order: each encounter's decay rate depends on the activation
 * at the moment that encounter happened.
 *
 * Ported from the original trainer's `arts.js`, with one substantive change:
 * see `compressGap`.
 */

import { parseMoves } from './cube'
import { CASES_BY_ID } from './data/cases'
import type { Rotation, Solve } from './types'

export interface ArtsConfig {
  /** Forgetting threshold. The one user-adjustable knob. */
  tau: number
  /** ACT-R decay scalar. */
  c: number
  /** Latency scale. The execution floor is removed first, so there is no intercept. */
  F: number
  /** Learning rate for alpha. */
  lr: number
  alphaInit: number
  /**
   * Alpha a blank ("I don't know") pulls a case up to, never down.
   *
   * A blank is not a noisy measurement, so it does not take an `lr`-sized step
   * — that step is sized for timing jitter. It is a categorical failure, and
   * lands the case most of the way to `alphaMax` in one go.
   */
  alphaBlank: number
  alphaMin: number
  alphaMax: number
  /** Decay bounds, purely to keep the exponentiation tame. */
  dMin: number
  dMax: number
  /** Turns per second, before there is enough data to fit it. */
  defaultTps: number
  tpsMin: number
  tpsMax: number
  /** How far a personal floor may sit below and above the move-count estimate. */
  floorLo: number
  floorHi: number
  /** Times outside this band never reach the model. */
  minMs: number
  maxMs: number
  /** Gaps up to here are real time; see `compressGap`. */
  sessionGapMs: number
  /** Compression scale for gaps past `sessionGapMs`. */
  gapKMs: number
  /** Never let this many trials pass without introducing a case. 0 disables. */
  introEvery: number
  /** A case is held back for selectionSize/spacingDiv trials, capped. */
  spacingDiv: number
  spacingMax: number
  /**
   * Activation above tau that reads as fully strong. Measured, not guessed:
   * across simulated multi-day timelines activation occupies about
   * [-1.25, +0.15], so the original span of 2.0 meant the bar could never fill
   * past 47%. See scripts/simulate-arts.ts --distribution.
   */
  strengthSpan: number
  /** Slider ends. A high tau counts more cases as at-risk. */
  tauGentle: number
  tauEager: number
  /**
   * Encounters kept per case. The history is durable and can grow without
   * bound, and activation is a sum over every encounter, so a replay is
   * quadratic in encounters per case. Older encounters contribute `dt^-d` for
   * a very large `dt`, which rounds away long before this many.
   */
  maxEncounters: number
}

export const ARTS_DEFAULTS: ArtsConfig = {
  tau: -0.8,
  c: 0.25,
  F: 0.9,
  lr: 0.05,
  alphaInit: 0.3,
  alphaBlank: 0.52,
  alphaMin: 0.05,
  alphaMax: 0.65,
  dMin: 0.05,
  dMax: 3.0,
  defaultTps: 3.0,
  tpsMin: 1.0,
  tpsMax: 15.0,
  floorLo: 0.6,
  floorHi: 1.5,
  minMs: 500,
  maxMs: 120000,
  sessionGapMs: 600_000,
  gapKMs: 600_000,
  introEvery: 6,
  spacingDiv: 3,
  spacingMax: 5,
  strengthSpan: 1.0,
  tauGentle: -0.4,
  tauEager: -1.4,
  maxEncounters: 250,
}

export const ROTATIONS: readonly Rotation[] = ['', 'y', 'y2', "y'"]

export interface Encounter {
  /** Position on the virtual timeline, in milliseconds. */
  vt: number
  /** Decay rate applied to this encounter from here on. */
  d: number
  /** True for an "I don't know". Read only by the display; see `blankedLast`. */
  blank: boolean
}

export interface ArtsModel {
  alpha: ReadonlyMap<number, number>
  encounters: ReadonlyMap<number, readonly Encounter[]>
  floors: ReadonlyMap<number, number>
  /** Timed solves per case. Blanks are not in here — they have no time. */
  counts: ReadonlyMap<number, number>
  /** Fitted turns per second. */
  tps: number
  /** Where "now" sits on the virtual timeline. */
  vtNow: number
  /** Every case id served, oldest first, unfiltered. Drives spacing and coverage. */
  served: readonly number[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value
}

/** Value at the given percentile of an ascending array. */
function percentileOf(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.floor((p / 100) * (sorted.length - 1))]!
}

function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
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

/**
 * Turns a real gap between solves into virtual time.
 *
 * The original clamped every gap to `min(3 x medianGap, 5 min)`, which was
 * fine while the history was session-scoped but annihilates overnight decay
 * once it is durable — every case would come back looking exactly as strong as
 * it was when you stopped. Instead, gaps within a sitting are real time and
 * longer ones grow logarithmically: an hour reads as ~1675s, a night as
 * ~2922s, a month as ~5623s. Long absences still decay, monotonically, without
 * flattening every case at once.
 */
export function compressGap(gapMs: number, config: ArtsConfig = ARTS_DEFAULTS): number {
  const gap = Math.max(0, gapMs)
  if (gap <= config.sessionGapMs) return gap
  return (
    config.sessionGapMs + config.gapKMs * Math.log(1 + (gap - config.sessionGapMs) / config.gapKMs)
  )
}

/**
 * Memory activation at a point on the virtual timeline: `ln SUM dt^-d`.
 * -Infinity for a case that has never been seen.
 */
export function activation(encounters: readonly Encounter[] | undefined, vt: number): number {
  if (!encounters || encounters.length === 0) return -Infinity
  let sum = 0
  for (const encounter of encounters) {
    // Nothing happens faster than one solve.
    const dt = Math.max(1, (vt - encounter.vt) / 1000)
    sum += Math.pow(dt, -encounter.d)
  }
  return sum > 0 ? Math.log(sum) : -Infinity
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

interface Entry {
  caseId: number
  /** null for an "I don't know": nothing was timed. */
  ms: number | null
  ts: number
  vt: number
}

/**
 * Replays the durable solve history into a model. `solves` must be oldest
 * first; `now` is wall-clock epoch milliseconds.
 */
export function buildModel(
  solves: readonly Solve[],
  now: number,
  config: ArtsConfig = ARTS_DEFAULTS,
): ArtsModel {
  const alpha = new Map<number, number>()
  const encounters = new Map<number, Encounter[]>()
  const floors = new Map<number, number>()
  const counts = new Map<number, number>()
  const served = solves.map((solve) => solve.caseId)

  // 1. Usable attempts. A time outside the band is someone walking away from
  //    the timer or mis-triggering it, and must not teach the model anything —
  //    though it still counts for spacing and coverage, hence `served` above.
  //
  //    A blank has no time to fall inside or outside that band, and must
  //    bypass it entirely: it is the single most informative thing the user can
  //    tell this scheduler, and dropping it here would silently discard it.
  const entries: Entry[] = []
  for (const solve of solves) {
    if (solve.outcome === 'unknown') {
      entries.push({ caseId: solve.caseId, ms: null, ts: solve.ts, vt: 0 })
    } else if (solve.ms >= config.minMs && solve.ms <= config.maxMs) {
      entries.push({ caseId: solve.caseId, ms: solve.ms, ts: solve.ts, vt: 0 })
    }
  }

  if (entries.length === 0) {
    return { alpha, encounters, floors, counts, tps: config.defaultTps, vtNow: 0, served }
  }

  // 2. Virtual timeline.
  let vt = 0
  for (let i = 0; i < entries.length; i++) {
    if (i > 0) vt += compressGap(entries[i]!.ts - entries[i - 1]!.ts, config)
    entries[i]!.vt = vt
  }
  const last = entries.at(-1)!
  const vtNow = last.vt + compressGap(now - last.ts, config)

  // 3. Execution floors, so "slow because the algorithm is long" stops looking
  //    like "slow because I forgot it".
  //    Blanks are excluded: a case's floor is the fastest it has been *solved*,
  //    and a failure has no time to contribute. They must also stay out of the
  //    turns-per-second fit and out of `counts`, both of which read this map.
  const byCase = new Map<number, number[]>()
  for (const entry of entries) {
    if (entry.ms === null) continue
    const list = byCase.get(entry.caseId)
    if (list) list.push(entry.ms)
    else byCase.set(entry.caseId, [entry.ms])
  }

  //    Turns per second is fitted Theil-Sen — the median of all pairwise
  //    slopes — rather than by least squares: a handful of cases you are badly
  //    stuck on are extreme outliers in this scatter and drag an ordinary
  //    regression well off course.
  let tps = config.defaultTps
  const points: { x: number; y: number }[] = []
  for (const [caseId, times] of byCase) {
    times.sort((a, b) => a - b)
    counts.set(caseId, times.length)
    if (times.length >= 3) {
      points.push({ x: algMoveCount(caseId), y: percentileOf(times, 20) / 1000 })
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
      const secondsPerMove = medianOf(slopes)
      if (secondsPerMove > 0) tps = clamp(1 / secondsPerMove, config.tpsMin, config.tpsMax)
    }
  }

  //    A case's own fast time is the better floor when it is credible, but it
  //    may only bend the move-count estimate, never replace it. A case you
  //    have never once solved fluently has a personal fast time that is mostly
  //    hesitation, and letting that become the floor would make the case look
  //    mastered forever.
  for (const [caseId, times] of byCase) {
    const estimate = (algMoveCount(caseId) / tps) * 1000
    floors.set(
      caseId,
      times.length >= 3
        ? clamp(percentileOf(times, 20), config.floorLo * estimate, config.floorHi * estimate)
        : estimate,
    )
  }

  // 4. Forward replay.
  for (const entry of entries) {
    const caseId = entry.caseId
    if (!alpha.has(caseId)) alpha.set(caseId, config.alphaInit)
    let list = encounters.get(caseId)
    if (!list) {
      list = []
      encounters.set(caseId, list)
    }
    const act = activation(list, entry.vt)
    let d: number

    if (entry.ms === null) {
      // A blank. Alpha jumps rather than stepping, and the encounter decays at
      // the maximum rate.
      //
      // It has to be an encounter at all, or the case would keep reading as
      // never introduced when in fact it has been met and failed. But an
      // ordinary encounter *raises* activation, which would make a case you
      // just blanked on look strong — so `dMax` collapses its contribution
      // within a second or two of virtual time, and the case sinks to the
      // bottom of the "lowest activation" ordering that `pickNext` serves from.
      alpha.set(
        caseId,
        clamp(Math.max(alpha.get(caseId)!, config.alphaBlank), config.alphaMin, config.alphaMax),
      )
      d = config.dMax
    } else {
      if (list.length > 0 && Number.isFinite(act)) {
        const predicted = config.F * Math.exp(-act)
        const floor = floors.get(caseId) ?? 0
        const recall = Math.max(0, entry.ms - floor) / 1000
        // Bounded log-ratio: one wild solve moves alpha by one step, no more.
        const ratio = clamp(Math.log(Math.max(recall, 0.05) / Math.max(predicted, 0.05)), -1, 1)
        alpha.set(
          caseId,
          clamp(alpha.get(caseId)! + config.lr * ratio, config.alphaMin, config.alphaMax),
        )
      }

      d = clamp(
        Number.isFinite(act) ? config.c * Math.exp(act) + alpha.get(caseId)! : alpha.get(caseId)!,
        config.dMin,
        config.dMax,
      )
    }

    list.push({ vt: entry.vt, d, blank: entry.ms === null })
    if (list.length > config.maxEncounters) list.shift()
  }

  return { alpha, encounters, floors, counts, tps, vtNow, served }
}

// ---------------------------------------------------------------------------
// Choosing
// ---------------------------------------------------------------------------

function randomElement<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)]!
}

/**
 * The cases served most recently, held back so one stubborn case cannot
 * monopolise the session. Without this, a case whose alpha has pinned at the
 * maximum sits permanently below tau, the at-risk set never empties, and the
 * scheduler never probes a case it believes is strong — so it grinds a handful
 * of hard cases while everything else quietly decays untested.
 */
export function recentlyServed(
  model: ArtsModel,
  selectionSize: number,
  config: ArtsConfig = ARTS_DEFAULTS,
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

/**
 * True when no new case has been introduced for too long. Pure threshold
 * gating stalls forever if even one case sits permanently below tau.
 */
export function introStarved(model: ArtsModel, config: ArtsConfig = ARTS_DEFAULTS): boolean {
  if (config.introEvery <= 0) return false
  const firstSeen = new Set<number>()
  let newest = -1
  model.served.forEach((caseId, i) => {
    if (!firstSeen.has(caseId)) {
      firstSeen.add(caseId)
      newest = i
    }
  })
  return model.served.length - newest > config.introEvery
}

/**
 * The case to serve next, or null if nothing is selected.
 *
 * tau decides only whether to rescue an old case or introduce a new one. Once
 * everything is introduced the choice is always "lowest activation", which is
 * an ordering and so does not depend on where tau happens to sit.
 */
export function pickNext(
  model: ArtsModel,
  selection: readonly number[],
  random: () => number = Math.random,
  config: ArtsConfig = ARTS_DEFAULTS,
): number | null {
  if (selection.length === 0) return null

  const held = recentlyServed(model, selection.length, config)
  let atRisk: number | null = null
  let atRiskAct = Infinity
  let weakest: number | null = null
  let weakestAct = Infinity
  const unseen: number[] = []
  const unseenHeld: number[] = []

  for (const caseId of selection) {
    const list = model.encounters.get(caseId)
    if (!list || list.length === 0) {
      ;(held.has(caseId) ? unseenHeld : unseen).push(caseId)
      continue
    }
    if (held.has(caseId)) continue
    const act = activation(list, model.vtNow)
    if (act < weakestAct) {
      weakestAct = act
      weakest = caseId
    }
    if (act <= config.tau && act < atRiskAct) {
      atRiskAct = act
      atRisk = caseId
    }
  }

  if (unseen.length > 0 && introStarved(model, config)) return randomElement(unseen, random)
  if (atRisk !== null) return atRisk
  if (unseen.length > 0) return randomElement(unseen, random)
  if (weakest !== null) return weakest
  if (unseenHeld.length > 0) return randomElement(unseenHeld, random)
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
// Display
// ---------------------------------------------------------------------------

/**
 * True when the last thing that happened to this case was a blank.
 *
 * `pickNext` needs no such special case: by the time it runs, real time has
 * passed and a `dMax` encounter has already decayed to nothing. The *display*
 * does. The model is rebuilt only when the solve history changes, so it stays
 * frozen at the instant the blank was recorded — where `dt` is still the
 * one-second floor and activation has not begun to fall. Without this, the case
 * you just failed would sit in the Cases tab reading almost fully strong, at
 * exactly the moment you are most likely to look at it.
 */
function blankedLast(list: readonly Encounter[] | undefined): boolean {
  return list?.at(-1)?.blank === true
}

/** Memory strength as 0..1, or null for a case never seen. */
export function strength(
  model: ArtsModel,
  caseId: number,
  config: ArtsConfig = ARTS_DEFAULTS,
): number | null {
  const list = model.encounters.get(caseId)
  if (!list || list.length === 0) return null
  if (blankedLast(list)) return 0
  const act = activation(list, model.vtNow)
  return clamp((act - config.tau) / config.strengthSpan, 0, 1)
}

export function isAtRisk(
  model: ArtsModel,
  caseId: number,
  config: ArtsConfig = ARTS_DEFAULTS,
): boolean {
  const list = model.encounters.get(caseId)
  if (!list || list.length === 0) return false
  if (blankedLast(list)) return true
  return activation(list, model.vtNow) <= config.tau
}

export interface LearnStatus {
  introduced: number
  total: number
  atRisk: number
}

/** Answers "why do I keep seeing the same cases". */
export function learnStatus(
  model: ArtsModel,
  selection: readonly number[],
  config: ArtsConfig = ARTS_DEFAULTS,
): LearnStatus {
  let introduced = 0
  let atRisk = 0
  for (const caseId of selection) {
    const list = model.encounters.get(caseId)
    if (!list || list.length === 0) continue
    introduced++
    if (blankedLast(list) || activation(list, model.vtNow) <= config.tau) atRisk++
  }
  return { introduced, total: selection.length, atRisk }
}

// ---------------------------------------------------------------------------
// The tau knob
// ---------------------------------------------------------------------------

/** 0 is gentle (fewer cases count as at risk), 100 is eager. */
export function sliderFromTau(tau: number, config: ArtsConfig = ARTS_DEFAULTS): number {
  const slider = Math.round(((tau - config.tauGentle) / (config.tauEager - config.tauGentle)) * 100)
  // Rounding a tiny negative gives -0, which is not what an <input> wants.
  return slider === 0 ? 0 : slider
}

export function tauFromSlider(value: number, config: ArtsConfig = ARTS_DEFAULTS): number {
  return config.tauGentle + (clamp(value, 0, 100) / 100) * (config.tauEager - config.tauGentle)
}

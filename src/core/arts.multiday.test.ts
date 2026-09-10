/**
 * The recalibration the plan asks for in §7: does the model still behave once
 * the history is durable and the learner goes away for a night, a weekend, or
 * a month?
 *
 * The simulated learner deliberately does not share the scheduler's forgetting
 * curve. If it did, these tests would only be showing that the model agrees
 * with itself.
 */

import { describe, expect, it } from 'vitest'
import {
  ARTS_DEFAULTS,
  activation,
  algMoveCount,
  buildModel,
  learnStatus,
  pickNext,
  pickRotation,
  strength,
  type ArtsModel,
} from './arts'
import type { Solve } from './types'

const DAY = 86_400_000
const T0 = Date.UTC(2026, 0, 1, 18, 0, 0)
const SELECTION = [1, 2, 3, 5, 7, 9, 13, 17, 21, 26, 27, 33, 41, 45, 49, 57]

function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Gets faster with practice, slower with time away. Independent of ARTS. */
function learner(random: () => number) {
  const familiarity = new Map<number, number>()
  const lastSeen = new Map<number, number>()
  return (caseId: number, ts: number): number => {
    const seen = lastSeen.get(caseId)
    let f = familiarity.get(caseId) ?? 0
    if (seen !== undefined) f *= Math.exp(-(ts - seen) / (4 * DAY))
    familiarity.set(caseId, f + 1)
    lastSeen.set(caseId, ts)
    const floor = (algMoveCount(caseId) / 4.5) * 1000
    return Math.round((floor + 6000 * Math.exp(-0.55 * f)) * (1 + (random() - 0.5) * 0.3))
  }
}

/** Runs `sessions` sittings, each preceded by a gap of `gapDays`. */
function run(sessions: readonly { gapDays: number; solves: number }[], seed = 5) {
  const random = seeded(seed)
  const solveTime = learner(random)
  const solves: Solve[] = []
  let ts = T0
  const openings: ArtsModel[] = []

  for (const session of sessions) {
    ts += session.gapDays * DAY
    openings.push(buildModel(solves, ts, ARTS_DEFAULTS))
    for (let i = 0; i < session.solves; i++) {
      const model = buildModel(solves, ts, ARTS_DEFAULTS)
      const caseId = pickNext(model, SELECTION, random)
      if (caseId === null) break
      const ms = solveTime(caseId, ts)
      solves.push({
        id: `s${solves.length}`,
        caseId,
        ms,
        scramble: '',
        rotation: pickRotation(caseId, solves, random),
        ts,
        mode: 'learn',
        outcome: 'solved',
      })
      ts += ms + 4000
    }
  }
  return { solves, openings, endedAt: ts }
}

const DAILY = [
  { gapDays: 0, solves: 40 },
  ...Array.from({ length: 7 }, () => ({ gapDays: 1, solves: 30 })),
]

describe('a week of daily practice', () => {
  const { solves, endedAt } = run(DAILY)
  const model = buildModel(solves, endedAt)

  it('introduces every selected case', () => {
    expect(learnStatus(model, SELECTION)).toMatchObject({
      introduced: SELECTION.length,
      total: SELECTION.length,
    })
  })

  it('spreads practice rather than grinding a few cases', () => {
    const counts = SELECTION.map((id) => model.counts.get(id) ?? 0)
    const share = solves.length / SELECTION.length
    // No case may run away with the session, and none may be abandoned.
    expect(Math.max(...counts)).toBeLessThan(share * 2.5)
    expect(Math.min(...counts)).toBeGreaterThan(share * 0.2)
  })

  it('covers all four angles for the cases it drilled most', () => {
    const busiest = [...SELECTION].sort(
      (a, b) => (model.counts.get(b) ?? 0) - (model.counts.get(a) ?? 0),
    )[0]!
    const angles = new Set(solves.filter((s) => s.caseId === busiest).map((s) => s.rotation))
    expect(angles.size).toBe(4)
  })

  it('serves the weakest eligible case, which is an ordering and so scale-free', () => {
    // The claim the plan rests the schedule on: whatever tau is, the case
    // served is the one with the lowest activation among those not held back.
    const served = pickNext(model, SELECTION, () => 0)!
    const eligible = SELECTION.filter((id) => (model.encounters.get(id)?.length ?? 0) > 0)
    const acts = new Map(
      eligible.map((id) => [id, activation(model.encounters.get(id), model.vtNow)]),
    )
    const lowest = Math.min(...acts.values())
    expect(acts.get(served)! - lowest).toBeLessThan(0.25)
  })
})

describe('coming back after a break', () => {
  const week = DAILY
  const base = run(week)
  const trained = base.solves
  const lastTs = trained.at(-1)!.ts

  const meanActivation = (afterMs: number) => {
    const model = buildModel(trained, lastTs + afterMs)
    const acts = SELECTION.map((id) => activation(model.encounters.get(id), model.vtNow)).filter(
      Number.isFinite,
    )
    return acts.reduce((a, b) => a + b, 0) / acts.length
  }

  it('decays monotonically with how long you were away', () => {
    const gaps = [0, 60_000, DAY, 3 * DAY, 30 * DAY, 365 * DAY]
    const means = gaps.map(meanActivation)
    for (let i = 1; i < means.length; i++) {
      expect(means[i]!, `after ${gaps[i]! / DAY} days`).toBeLessThan(means[i - 1]!)
    }
  })

  it('does not put the whole set at risk at once, which was the failure to avoid', () => {
    const model = buildModel(trained, lastTs + DAY)
    const { atRisk, total } = learnStatus(model, SELECTION)
    expect(atRisk).toBeLessThan(total)
  })

  const spreadAt = (solves: readonly Solve[], at: number) => {
    const model = buildModel(solves, at)
    const acts = SELECTION.map((id) => activation(model.encounters.get(id), model.vtNow)).filter(
      Number.isFinite,
    )
    return Math.max(...acts) - Math.min(...acts)
  }

  /**
   * Recorded, and the sharpest form of the risk §7 flags. A long absence adds
   * the *same* virtual time to every case, so the differences between them are
   * swamped and the ranking briefly goes flat — the first picks after a month
   * away are close to arbitrary. It is not a defect in the ranking so much as
   * an honest reading: after a month, everything really is equally rusty.
   */
  it('has a flat ranking in the moment you come back', () => {
    const fresh = spreadAt(trained, lastTs + 60_000)
    const stale = spreadAt(trained, lastTs + 30 * DAY)
    expect(stale).toBeLessThan(0.1)
    expect(fresh).toBeGreaterThan(stale * 3)
  })

  it('recovers its ranking within a handful of solves back', () => {
    // Slow times after the break push alpha up, and the ranking comes back
    // well before a session is over.
    const resumed = run([...week, { gapDays: 30, solves: 5 }])
    expect(spreadAt(resumed.solves, resumed.endedAt)).toBeGreaterThan(0.25)
  })

  /**
   * Recorded rather than aspirational. With the compression the plan
   * specifies, a month away costs about as much as two nights, so a
   * well-drilled set still reads as strong when you come back. The scheduler
   * catches up within a few solves, because the slow times push alpha up.
   * Tightening this is a change to §7's constants, not to the code.
   */
  it('makes a long absence cheap for a well-drilled case', () => {
    const night = meanActivation(DAY)
    const month = meanActivation(30 * DAY)
    expect(night - month).toBeLessThan(0.5)
  })
})

describe('the strength bar, after recalibration', () => {
  it('uses most of its range across a learner’s progress', () => {
    const early = run([{ gapDays: 0, solves: 20 }])
    const late = run(DAILY)
    const earlyModel = buildModel(early.solves, early.endedAt)
    const lateModel = buildModel(late.solves, late.endedAt)

    const values = [
      ...SELECTION.map((id) => strength(earlyModel, id)),
      ...SELECTION.map((id) => strength(lateModel, id)),
    ].filter((value): value is number => value !== null)

    expect(Math.min(...values)).toBeLessThan(0.25)
    // With the original span of 2.0 this could never pass: the bar topped out
    // just under half.
    expect(Math.max(...values)).toBeGreaterThan(0.8)
  })
})

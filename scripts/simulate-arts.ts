/**
 * Synthetic multi-day timelines, for the tau recalibration the plan calls for.
 *
 * The constants were fitted against a within-session timeline where gaps ran
 * 20s to 20 minutes. This asks what they do once the history is durable and
 * the learner goes away for a night, a weekend, or a month.
 *
 * Run: pnpm arts:simulate
 */

import {
  ARTS_DEFAULTS,
  activation,
  buildModel,
  compressGap,
  learnStatus,
  pickNext,
  pickRotation,
  type ArtsConfig,
} from '../src/core/arts'
import { CASES } from '../src/core/data/cases'
import { algMoveCount } from '../src/core/arts'
import type { Solve } from '../src/core/types'
import { mulberry32 } from './lib/random'

const DAY = 86_400_000
const SELECTION = CASES.map((c) => c.id)

/**
 * A learner whose time on a case falls as they see it and rises as they
 * forget. Deliberately independent of the scheduler's own model: if the two
 * shared a forgetting curve the simulation would only be telling us that the
 * model agrees with itself.
 */
class Learner {
  private familiarity = new Map<number, number>()
  private lastSeen = new Map<number, number>()
  constructor(
    private random: () => number,
    /** Days for familiarity to fall by 1/e. */
    private halfLifeDays = 4,
    private tps = 4.5,
  ) {}

  solve(caseId: number, ts: number): number {
    const seen = this.lastSeen.get(caseId)
    let f = this.familiarity.get(caseId) ?? 0
    if (seen !== undefined) f *= Math.exp(-(ts - seen) / (this.halfLifeDays * DAY))

    const floor = (algMoveCount(caseId) / this.tps) * 1000
    const hesitation = 6000 * Math.exp(-0.55 * f)
    const noise = 1 + (this.random() - 0.5) * 0.3

    this.familiarity.set(caseId, f + 1)
    this.lastSeen.set(caseId, ts)
    return Math.round((floor + hesitation) * noise)
  }
}

interface Session {
  /** Days since the previous session. */
  gapDays: number
  solves: number
}

function simulate(sessions: readonly Session[], config: ArtsConfig, seed: number) {
  const random = mulberry32(seed)
  const learner = new Learner(random)
  const solves: Solve[] = []
  let ts = Date.UTC(2026, 0, 1, 18, 0, 0)
  const report: string[] = []

  sessions.forEach((session, index) => {
    ts += session.gapDays * DAY
    // Measured at the start of the session, i.e. after the gap.
    const opening = buildModel(solves, ts, config)
    const status = learnStatus(opening, SELECTION, config)

    for (let i = 0; i < session.solves; i++) {
      const model = buildModel(solves, ts, config)
      const caseId = pickNext(model, SELECTION, random, config)
      if (caseId === null) break
      const rotation = pickRotation(caseId, solves, random)
      const ms = learner.solve(caseId, ts)
      solves.push({
        id: `s${solves.length}`,
        caseId,
        ms,
        scramble: '',
        rotation,
        ts,
        mode: 'learn',
      })
      ts += Math.round(ms + 3000 + random() * 4000)
    }

    const closing = buildModel(solves, ts, config)
    const acts = SELECTION.map((id) => activation(closing.encounters.get(id), closing.vtNow))
      .filter(Number.isFinite)
      .sort((a, b) => a - b)

    report.push(
      [
        `s${String(index + 1).padStart(2)}`,
        `+${String(session.gapDays).padStart(2)}d`,
        `open ${String(status.introduced).padStart(2)}/57 seen`,
        `${String(status.atRisk).padStart(2)} at-risk`,
        `close ${String(closing.encounters.size).padStart(2)} seen`,
        `act p10 ${(acts[Math.floor(acts.length * 0.1)] ?? NaN).toFixed(2)}`,
        `med ${(acts[Math.floor(acts.length * 0.5)] ?? NaN).toFixed(2)}`,
        `p90 ${(acts[Math.floor(acts.length * 0.9)] ?? NaN).toFixed(2)}`,
        `tps ${closing.tps.toFixed(1)}`,
      ].join('  '),
    )
  })

  return { solves, report }
}

/** Daily practice for two weeks, a weekend off, then a month away. */
const SCHEDULE: Session[] = [
  { gapDays: 0, solves: 60 },
  ...Array.from({ length: 13 }, () => ({ gapDays: 1, solves: 40 })),
  { gapDays: 3, solves: 40 },
  { gapDays: 1, solves: 40 },
  { gapDays: 30, solves: 40 },
  { gapDays: 1, solves: 40 },
]

const MINUTE = 60_000
const sweep = process.argv.includes('--sweep-k')

if (sweep) {
  // How much a long absence should cost. K is the only knob that decides
  // whether coming back after a month feels like coming back at all.
  for (const gapKMs of [10 * MINUTE, 30 * MINUTE, 60 * MINUTE, 120 * MINUTE, 240 * MINUTE]) {
    const config: ArtsConfig = { ...ARTS_DEFAULTS, gapKMs }
    const label = `K = ${gapKMs / MINUTE} min`
    const night = compressGap(8 * 3600_000, config) / 60
    const month = compressGap(30 * DAY, config) / 60
    console.log(
      `\n===== ${label}  (night ${night.toFixed(0)}min, month ${month.toFixed(0)}min) =====`,
    )
    for (const line of simulate(SCHEDULE, config, 7).report.slice(-6)) console.log(line)
  }
} else if (process.argv.includes('--distribution')) {
  // What range does activation actually occupy? The strength bar and the
  // at-risk readout are only informative if their scale matches this.
  const samples: number[] = []
  const byPhase = new Map<string, number[]>()
  for (const seed of [3, 7, 11, 17, 23]) {
    const { solves } = simulate(SCHEDULE, ARTS_DEFAULTS, seed)
    for (const cut of [120, 300, 500, solves.length]) {
      const slice = solves.slice(0, cut)
      const at = slice.at(-1)!.ts + 60_000
      const model = buildModel(slice, at, ARTS_DEFAULTS)
      const phase = cut === solves.length ? 'mature' : cut <= 120 ? 'early' : 'learning'
      for (const id of SELECTION) {
        const act = activation(model.encounters.get(id), model.vtNow)
        if (!Number.isFinite(act)) continue
        samples.push(act)
        byPhase.set(phase, [...(byPhase.get(phase) ?? []), act])
      }
    }
  }
  const pct = (values: number[], p: number) =>
    [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * p)]!.toFixed(2)
  console.log(`n = ${samples.length}`)
  for (const [phase, values] of byPhase) {
    console.log(
      `${phase.padEnd(9)} n=${String(values.length).padStart(4)}  ` +
        `min ${pct(values, 0)}  p05 ${pct(values, 0.05)}  p25 ${pct(values, 0.25)}  ` +
        `med ${pct(values, 0.5)}  p75 ${pct(values, 0.75)}  p95 ${pct(values, 0.95)}  max ${pct(values, 1)}`,
    )
  }
  console.log(
    `overall   p01 ${pct(samples, 0.01)}  p05 ${pct(samples, 0.05)}  ` +
      `med ${pct(samples, 0.5)}  p95 ${pct(samples, 0.95)}  p99 ${pct(samples, 0.99)}`,
  )
} else {
  for (const tau of [-0.4, -0.8, -1.4]) {
    console.log(`\n===== tau = ${tau} =====`)
    const { solves, report } = simulate(SCHEDULE, { ...ARTS_DEFAULTS, tau }, 7)
    for (const line of report) console.log(line)
    console.log(`total solves: ${solves.length}`)
  }
}

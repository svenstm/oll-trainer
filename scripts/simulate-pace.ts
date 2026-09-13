/**
 * Acceptance checks for the pace model, per docs/pace-design.md.
 *
 * The learner here never forgets — that is the premise the model is built on,
 * so the simulation must not smuggle a forgetting curve back in and let the
 * scheduler agree with itself. It starts slow on every case and improves
 * asymptotically toward a per-case floor, and it never gets worse.
 *
 * Three things are being asked:
 *
 *   1. Does par converge, or does it chase its own tail? Drilling slow cases
 *      raises them, which tightens par, which re-reddens everything.
 *   2. Does every case reach mastery and stay there? A percentile par can make
 *      mastery a rank rather than an achievement, in which case only the top
 *      quarter is ever green however good the learner gets.
 *   3. Does any case starve or grind? Both were real failures during design:
 *      8 of 16 cases frozen at one or two reps, and 800 reps sunk into a case
 *      already sitting at its floor.
 *
 * Run: pnpm pace:simulate
 */

import {
  PACE_DEFAULTS,
  algMoveCount,
  buildModel,
  par,
  pickNext,
  score,
  state,
  type CaseState,
  type PaceConfig,
} from '../src/core/pace'
import { CASES } from '../src/core/data/cases'
import type { Solve } from '../src/core/types'
import { mulberry32 } from './lib/random'

const TRIALS = Number(process.argv[2] ?? 5000)
const SELECTION = CASES.slice(0, 16).map((c) => c.id)

/**
 * Never forgets. Time on a case decays from a slow start toward a floor set by
 * algorithm length plus a fixed recognition cost, with per-case learning rates
 * so the scheduler has something real to prioritise between.
 */
class Learner {
  private reps = new Map<number, number>()
  constructor(
    private random: () => number,
    private selection: readonly number[],
  ) {}

  floor(caseId: number): number {
    return 0.22 * algMoveCount(caseId) + 0.6
  }

  private rate(caseId: number): number {
    return 4 + (this.selection.indexOf(caseId) % 5) * 3
  }

  repsOf(caseId: number): number {
    return this.reps.get(caseId) ?? 0
  }

  solve(caseId: number): number {
    const seen = this.repsOf(caseId)
    this.reps.set(caseId, seen + 1)
    const floor = this.floor(caseId)
    const base = floor + floor * 3.5 * Math.exp(-seen / this.rate(caseId))
    return base * (0.85 + this.random() * 0.4)
  }
}

function run(config: PaceConfig = PACE_DEFAULTS) {
  const random = mulberry32(12345)
  const learner = new Learner(random, SELECTION)
  const history: Solve[] = []
  const parTrace: number[] = []

  console.log('trial  mastered  learning  at-risk  introducing  unseen      par  median score')
  for (let trial = 1; trial <= TRIALS; trial++) {
    const model = buildModel(history, config)
    const caseId = pickNext(model, SELECTION, random, config)
    if (caseId === null) break
    history.push({
      id: `s${trial}`,
      caseId,
      scramble: '',
      rotation: '',
      ts: trial * 30_000,
      mode: 'learn',
      outcome: 'solved',
      ms: learner.solve(caseId) * 1000,
    })

    if (trial % 250 === 0 || trial === TRIALS) {
      const settled = buildModel(history, config)
      const tally: Record<CaseState, number> = {
        mastered: 0,
        learning: 0,
        'at-risk': 0,
        introducing: 0,
        unseen: 0,
      }
      const scores: number[] = []
      for (const id of SELECTION) {
        tally[state(settled, id, config)]++
        const value = score(settled, id, config)
        if (value !== null && Number.isFinite(value)) scores.push(value)
      }
      scores.sort((a, b) => a - b)
      const parNow = par(settled, SELECTION[0]!, config)
      parTrace.push(parNow)
      console.log(
        String(trial).padStart(5),
        String(tally.mastered).padStart(9),
        String(tally.learning).padStart(9),
        String(tally['at-risk']).padStart(8),
        String(tally.introducing).padStart(12),
        String(tally.unseen).padStart(7),
        parNow.toFixed(3).padStart(8),
        (scores[Math.floor(scores.length / 2)] ?? NaN).toFixed(2).padStart(13),
      )
    }
  }

  const final = buildModel(history, config)
  console.log('\ncase  moves  reps   floor  achieved  score  state')
  for (const id of SELECTION) {
    const stat = final.stats.get(id)
    const window = stat ? [...stat.window].sort((a, b) => a - b) : []
    const achieved = window[Math.floor(window.length / 2)] ?? NaN
    console.log(
      String(id).padStart(4),
      String(algMoveCount(id)).padStart(6),
      String(learner.repsOf(id)).padStart(5),
      learner.floor(id).toFixed(2).padStart(7),
      achieved.toFixed(2).padStart(9),
      (score(final, id, config) ?? NaN).toFixed(2).padStart(6),
      '  ' + state(final, id, config),
    )
  }

  // Check 1: par must settle. Compare the drift over the last quarter of the
  // run against the drift over the first — it should be far smaller.
  const quarter = Math.max(1, Math.floor(parTrace.length / 4))
  const early = parTrace.slice(0, quarter)
  const late = parTrace.slice(-quarter)
  const drift = (xs: number[]) => Math.max(...xs) / Math.min(...xs) - 1
  console.log(
    `\ncheck 1  par drift: ${(drift(early) * 100).toFixed(1)}% early -> ${(drift(late) * 100).toFixed(1)}% late`,
  )

  // Check 2: mastery must be reachable by more than the top quartile.
  const mastered = SELECTION.filter((id) => state(final, id, config) === 'mastered').length
  console.log(
    `check 2  mastered ${mastered}/${SELECTION.length}` +
      (mastered > SELECTION.length / 4 ? '' : '  <- rank ceiling, not an achievement'),
  )

  // Check 3: no case starved, none ground.
  const reps = SELECTION.map((id) => learner.repsOf(id))
  console.log(
    `check 3  reps ${Math.min(...reps)}..${Math.max(...reps)}` +
      (Math.min(...reps) < PACE_DEFAULTS.minSolves ? '  <- starved' : ''),
  )
}

run()

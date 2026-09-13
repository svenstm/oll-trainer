import { describe, expect, it } from 'vitest'
import {
  PACE_DEFAULTS,
  algMoveCount,
  barValue,
  buildModel,
  introEveryFromSlider,
  introStarved,
  learnStatus,
  pace,
  par,
  pickNext,
  pickRotation,
  recentlyServed,
  score,
  sliderFromIntroEvery,
  spread,
  state,
  type PaceConfig,
} from './pace'
import type { Rotation, Solve } from './types'

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const T0 = Date.UTC(2026, 0, 1, 12, 0, 0)

let ticker = 0
function at(step: number): number {
  return T0 + step * 30 * SECOND
}

function solve(caseId: number, ms: number, ts = at(ticker++), rotation: Rotation = ''): Solve {
  return {
    id: `${caseId}@${ts}`,
    caseId,
    ms,
    scramble: '',
    rotation,
    ts,
    mode: 'learn',
    outcome: 'solved',
  }
}

function blank(caseId: number, ts = at(ticker++), rotation: Rotation = ''): Solve {
  return {
    id: `${caseId}!${ts}`,
    caseId,
    scramble: '',
    rotation,
    ts,
    mode: 'learn',
    outcome: 'unknown',
  }
}

/** `count` solves of `caseId` at `ms`, in order. */
function repeated(caseId: number, count: number, ms: number): Solve[] {
  return Array.from({ length: count }, () => solve(caseId, ms))
}

function cycle(values: readonly number[]): () => number {
  let i = 0
  return () => values[i++ % values.length]!
}

describe('the window', () => {
  it('scores nothing until a case has three timed solves', () => {
    for (const count of [0, 1, 2]) {
      const model = buildModel(repeated(1, count, 3000))
      expect(pace(model, 1)).toBeNull()
      expect(score(model, 1)).toBeNull()
      expect(barValue(model, 1)).toBeNull()
    }
    const model = buildModel(repeated(1, 3, 3000))
    expect(pace(model, 1)).not.toBeNull()
  })

  it('shows no bar rather than an empty one for a case still being introduced', () => {
    const model = buildModel(repeated(1, 2, 3000))
    // Null and 0 render differently: "not measured" is not "measured, and bad".
    expect(barValue(model, 1)).toBeNull()
    expect(state(model, 1)).toBe('introducing')
    expect(state(model, 99)).toBe('unseen')
  })

  it('reads only the last three attempts', () => {
    const model = buildModel([...repeated(1, 3, 20000), ...repeated(1, 3, 2000)])
    // The three 20 s solves are out of the window entirely.
    expect(spread(model, 1)).toBeCloseTo(1, 5)
  })

  it('ignores times outside the band, for scoring but not for spacing', () => {
    const model = buildModel([solve(1, 200), solve(1, 3000), solve(1, 999999), solve(1, 3000)])
    expect(model.stats.get(1)!.count).toBe(2)
    expect(model.served).toHaveLength(4)
  })
})

describe('nothing decays', () => {
  it('scores a case identically however long ago it was solved', () => {
    const fresh = buildModel(repeated(1, 3, 3000))
    const stale = buildModel([
      solve(1, 3000, T0),
      solve(1, 3000, T0 + SECOND),
      solve(1, 3000, T0 + 2 * SECOND),
    ])
    // Same solves, one set a year older. The old model dropped this case from
    // 100% to at-risk within an hour; see docs/pace-design.md.
    expect(score(stale, 1)).toBe(score(fresh, 1))
  })

  it('takes no clock reading at all', () => {
    const a = buildModel([
      solve(1, 3000, T0),
      solve(1, 3000, T0 + DAY),
      solve(1, 3000, T0 + 400 * DAY),
    ])
    const b = buildModel([
      solve(1, 3000, T0),
      solve(1, 3000, T0 + SECOND),
      solve(1, 3000, T0 + 2 * SECOND),
    ])
    expect(score(a, 1)).toBe(score(b, 1))
  })
})

describe('par', () => {
  it('falls back to the move-count seed below the eligibility threshold', () => {
    const model = buildModel(repeated(1, 3, 3000))
    expect(model.parRatio).toBeNull()
    expect(par(model, 1)).toBeCloseTo(algMoveCount(1) / PACE_DEFAULTS.defaultTps, 5)
  })

  it('goes personal once enough cases are scored', () => {
    const history = [1, 2, 3, 4, 5, 6].flatMap((id) => repeated(id, 3, 4000))
    const model = buildModel(history)
    expect(model.parRatio !== null || model.parFlat !== null).toBe(true)
  })

  it('interpolates the percentile so it slides rather than jumps', () => {
    // All 11-move cases, so the length fit has no usable pairwise slopes and
    // par stays flat — which is the value being asserted on.
    const ids = [1, 9, 10, 11, 12, 13]
    const times = [2000, 3000, 4000, 5000, 6000, 7000]
    const model = buildModel(ids.flatMap((id, i) => repeated(id, 3, times[i]!)))
    expect(model.fit).toBeNull()
    // Index-selecting p25 of six values lands exactly on the second one, 3.
    // Interpolating lands a quarter of the way from the second to the third.
    expect(model.parFlat).toBeCloseTo(3.25, 5)
    expect(par(model, 1)).toBeCloseTo(3.25, 5)
  })

  it('fits an intercept, so a short algorithm is not structurally penalised', () => {
    // Times that are genuinely linear in move count with a large fixed cost.
    const ids = [1, 2, 3, 4, 5, 6, 7, 8]
    const history = ids.flatMap((id) => repeated(id, 3, (2 + 0.15 * algMoveCount(id)) * 1000))
    const model = buildModel(history)
    expect(model.fit).not.toBeNull()
    expect(model.fit!.intercept).toBeGreaterThan(0)
    // Every case is equally good relative to the length model, so every pace
    // should land in the same narrow band regardless of algorithm length.
    const paces = ids.map((id) => pace(model, id)!)
    expect(Math.max(...paces) / Math.min(...paces)).toBeLessThan(1.25)
  })
})

describe('consistency', () => {
  it('measures worst against median, not max against min', () => {
    const model = buildModel([solve(1, 2000), solve(1, 4000), solve(1, 4000)])
    // max/min would say 2.0; worst/median says 1.0.
    expect(spread(model, 1)).toBeCloseTo(1, 5)
  })

  it('sends an erratic case at-risk even when its pace is fine', () => {
    const steady = [2, 3, 4, 5, 6].flatMap((id) => repeated(id, 3, 4000))
    const model = buildModel([...steady, solve(1, 4000), solve(1, 16000), solve(1, 4000)])
    expect(pace(model, 1)).toBeLessThan(2)
    expect(spread(model, 1)).toBeGreaterThan(PACE_DEFAULTS.spreadGate)
    expect(state(model, 1)).toBe('at-risk')
  })

  it('penalises the score, so an erratic case rises in the queue', () => {
    const model = buildModel([solve(1, 4000), solve(1, 16000), solve(1, 4000)])
    expect(score(model, 1)!).toBeGreaterThan(pace(model, 1)!)
  })
})

describe('blanks', () => {
  it('pins the score to worst and shows an empty bar', () => {
    const model = buildModel([...repeated(1, 3, 3000), blank(1)])
    expect(score(model, 1)).toBe(Infinity)
    expect(barValue(model, 1)).toBe(0)
    expect(state(model, 1)).toBe('at-risk')
  })

  it('does not enter the spread — a blank has no time to contribute', () => {
    const withBlank = buildModel([solve(1, 3000), blank(1), solve(1, 3000), solve(1, 3000)])
    expect(spread(withBlank, 1)).toBeCloseTo(1, 5)
  })

  it('expires only when three clean solves push it out of the window', () => {
    const base = [...repeated(1, 3, 3000), blank(1)]
    expect(state(buildModel([...base, solve(1, 3000)]), 1)).toBe('at-risk')
    expect(state(buildModel([...base, ...repeated(1, 2, 3000)]), 1)).toBe('at-risk')
    expect(state(buildModel([...base, ...repeated(1, 3, 3000)]), 1)).not.toBe('at-risk')
  })
})

describe('the bar', () => {
  it('fills at mastery and empties at the ceiling', () => {
    const config: PaceConfig = { ...PACE_DEFAULTS, minEligible: 1 }
    const model = buildModel(repeated(1, 3, 3000), config)
    const full = { ...model, parRatio: null, parFlat: 3 }
    expect(barValue(full, 1, config)).toBe(1)
    const empty = { ...model, parRatio: null, parFlat: 3 / config.barCeiling }
    expect(barValue(empty, 1, config)).toBe(0)
  })

  it('never shows a full bar on a case that is at risk', () => {
    // At par on pace, but it blew up two solves ago.
    const steady = [2, 3, 4, 5, 6].flatMap((id) => repeated(id, 3, 4000))
    const model = buildModel([...steady, solve(1, 4000), solve(1, 20000), solve(1, 4000)])
    expect(state(model, 1)).toBe('at-risk')
    expect(barValue(model, 1)!).toBeLessThan(1)
  })
})

describe('pickNext', () => {
  it('returns null for an empty selection', () => {
    expect(pickNext(buildModel([]), [])).toBeNull()
  })

  it('serves the worst score', () => {
    const history = [
      ...repeated(1, 3, 2000),
      ...repeated(2, 3, 3000),
      ...repeated(3, 3, 12000),
      ...repeated(4, 3, 3000),
      ...repeated(5, 3, 3000),
    ]
    const config: PaceConfig = { ...PACE_DEFAULTS, spacingDiv: 100, introEvery: 0 }
    expect(pickNext(buildModel(history, config), [1, 2, 3, 4, 5], cycle([0]), config)).toBe(3)
  })

  it('finishes a half-introduced case rather than abandoning it', () => {
    // Case 6 has been met twice and has no score. It must not be left there:
    // a 1200-trial simulation starved 8 of 16 cases exactly this way.
    const history = [
      ...[1, 2, 3, 4, 5].flatMap((id) => repeated(id, 3, 3000)),
      ...repeated(6, 2, 3000),
      ...repeated(7, 1, 3000),
    ]
    const config: PaceConfig = { ...PACE_DEFAULTS, spacingDiv: 100 }
    const model = buildModel(history, config)
    expect(introStarved(model, [1, 2, 3, 4, 5, 6, 7], config)).toBe(false)
    // Nothing is badly off par, so the unfinished cases come first — and the
    // one closest to earning a score leads.
    expect(pickNext(model, [1, 2, 3, 4, 5, 6, 7], cycle([0]), config)).toBe(6)
  })

  it('holds back the most recently served cases', () => {
    const history = [1, 2, 3, 4, 5, 6].flatMap((id) => repeated(id, 3, 3000))
    const model = buildModel(history)
    const held = recentlyServed(model, 6)
    expect(held.has(6)).toBe(true)
    expect(held.size).toBe(2)
  })

  it('falls back to least recently served once everything is at par', () => {
    const ids = [1, 2, 3, 4, 5, 6, 7, 8]
    // Identical performance everywhere, so scores tie and only staleness sorts.
    const history = ids.flatMap((id) => repeated(id, 3, 3000))
    const config: PaceConfig = { ...PACE_DEFAULTS, spacingDiv: 100, introEvery: 0 }
    const model = buildModel(history, config)
    // Case 1 was served longest ago.
    expect(pickNext(model, ids, cycle([0]), config)).toBe(1)
  })

  it('introduces an unseen case when none is starving but nothing needs work', () => {
    const history = [1, 2, 3, 4, 5].flatMap((id) => repeated(id, 3, 3000))
    const config: PaceConfig = { ...PACE_DEFAULTS, spacingDiv: 100 }
    const model = buildModel(history, config)
    expect(pickNext(model, [1, 2, 3, 4, 5, 9], cycle([0]), config)).toBe(9)
  })
})

describe('introStarved', () => {
  it('counts any unfinished case, not only an unseen one', () => {
    const config: PaceConfig = { ...PACE_DEFAULTS, introEvery: 3 }
    // Case 9 was met once and then abandoned while 1 and 2 were established.
    const history = [solve(9, 3000), ...[1, 2].flatMap((id) => repeated(id, 3, 3000))]
    expect(introStarved(buildModel(history, config), [1, 2, 9], config)).toBe(true)
    // Serving it again resets the count, even though it is still unfinished.
    expect(introStarved(buildModel([...history, solve(9, 3000)], config), [1, 2, 9], config)).toBe(
      false,
    )
  })

  it('is false when there is nothing left to introduce', () => {
    const history = [1, 2].flatMap((id) => repeated(id, 3, 3000))
    expect(introStarved(buildModel(history), [1, 2])).toBe(false)
  })

  it('is disabled by a zero interval', () => {
    const config: PaceConfig = { ...PACE_DEFAULTS, introEvery: 0 }
    expect(introStarved(buildModel([], config), [1, 2], config)).toBe(false)
  })
})

describe('learnStatus', () => {
  it('counts what has been met and what is at risk', () => {
    const history = [...repeated(1, 3, 3000), ...repeated(2, 3, 3000), blank(2), solve(3, 3000)]
    const status = learnStatus(buildModel(history), [1, 2, 3, 4, 5])
    expect(status).toEqual({ introduced: 3, total: 5, atRisk: 1 })
  })
})

describe('pickRotation', () => {
  it('picks an angle this case has been shown from least', () => {
    const history = [
      solve(1, 3000, at(0), ''),
      solve(1, 3000, at(1), 'y'),
      solve(1, 3000, at(2), 'y2'),
    ]
    expect(pickRotation(1, history, cycle([0]))).toBe("y'")
  })
})

describe('the intro knob', () => {
  it('keeps a stored interval stable across a render round-trip', () => {
    // The slider has 101 positions over 10 representable intervals, so the
    // slider position cannot survive a round-trip — but the stored setting
    // must, or the control would drift every time the view re-rendered.
    for (let every = PACE_DEFAULTS.introEager; every <= PACE_DEFAULTS.introGentle; every++) {
      expect(introEveryFromSlider(sliderFromIntroEvery(every))).toBe(every)
    }
  })

  it('keeps the slider monotonic', () => {
    const intervals = [0, 20, 40, 60, 80, 100].map((v) => introEveryFromSlider(v))
    expect(intervals).toEqual([...intervals].sort((a, b) => b - a))
  })

  it('runs gentle to eager, with eager the smaller interval', () => {
    expect(introEveryFromSlider(0)).toBe(PACE_DEFAULTS.introGentle)
    expect(introEveryFromSlider(100)).toBe(PACE_DEFAULTS.introEager)
    expect(sliderFromIntroEvery(PACE_DEFAULTS.introGentle)).toBe(0)
    expect(sliderFromIntroEvery(PACE_DEFAULTS.introEager)).toBe(100)
  })
})

describe('the fold over history', () => {
  it('un-learns a solve when it is deleted', () => {
    const history = [...repeated(1, 3, 3000), solve(1, 20000)]
    const withIt = buildModel(history)
    const without = buildModel(history.slice(0, -1))
    expect(score(withIt, 1)).not.toBe(score(without, 1))
    // Rebuilding from the same trimmed history must land in exactly the same
    // place: the model is a fold, so deleting a solve un-learns it completely.
    expect(score(buildModel(history.slice(0, -1)), 1)).toBe(score(without, 1))
  })
})

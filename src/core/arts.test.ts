import { describe, expect, it } from 'vitest'
import {
  ARTS_DEFAULTS,
  activation,
  algMoveCount,
  buildModel,
  compressGap,
  introStarved,
  isAtRisk,
  learnStatus,
  pickNext,
  pickRotation,
  recentlyServed,
  sliderFromTau,
  strength,
  tauFromSlider,
  type ArtsConfig,
} from './arts'
import type { Rotation, Solve } from './types'

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const T0 = Date.UTC(2026, 0, 1, 12, 0, 0)

function solve(caseId: number, ms: number, ts: number, rotation: Rotation = ''): Solve {
  return { id: `${caseId}@${ts}`, caseId, ms, scramble: '', rotation, ts, mode: 'learn' }
}

/** A history of `count` solves of `caseId`, `gap` apart, ending `before` now. */
function repeated(caseId: number, count: number, ms: number, gap: number, start = T0): Solve[] {
  return Array.from({ length: count }, (_, i) => solve(caseId, ms, start + i * gap))
}

/** Deterministic stand-in for Math.random. */
function cycle(values: readonly number[]): () => number {
  let i = 0
  return () => values[i++ % values.length]!
}

describe('compressGap', () => {
  it('is real time within a sitting', () => {
    for (const gap of [0, SECOND, MINUTE, 5 * MINUTE, 10 * MINUTE]) {
      expect(compressGap(gap)).toBe(gap)
    }
  })

  it('is continuous where compression starts', () => {
    const boundary = ARTS_DEFAULTS.sessionGapMs
    expect(compressGap(boundary)).toBe(boundary)
    // A millisecond past the boundary must cost about a millisecond, not jump.
    expect(compressGap(boundary + 1) - boundary).toBeLessThan(1.001)
    expect(compressGap(boundary + 1) - boundary).toBeGreaterThan(0.999)
  })

  it('matches the values the plan specifies, to the second', () => {
    expect(compressGap(HOUR) / SECOND).toBeCloseTo(1675.1, 1)
    expect(compressGap(8 * HOUR) / SECOND).toBeCloseTo(2922.7, 1)
    expect(compressGap(30 * DAY) / SECOND).toBeCloseTo(5622.6, 1)
  })

  it('is strictly monotonic, so a longer absence never decays less', () => {
    let previous = -1
    for (const gap of [
      0,
      1,
      MINUTE,
      9 * MINUTE,
      10 * MINUTE,
      11 * MINUTE,
      HOUR,
      DAY,
      30 * DAY,
      365 * DAY,
    ]) {
      const value = compressGap(gap)
      expect(value, `gap ${gap}`).toBeGreaterThan(previous)
      previous = value
    }
  })

  it('never invents time, and treats a backwards clock as no gap', () => {
    for (const gap of [MINUTE, HOUR, DAY, 365 * DAY]) {
      expect(compressGap(gap)).toBeLessThanOrEqual(gap)
    }
    expect(compressGap(-5000)).toBe(0)
  })
})

describe('activation', () => {
  const enc = (vt: number, d = 0.3) => ({ vt, d })

  it('is -Infinity for a case never seen', () => {
    expect(activation(undefined, 1000)).toBe(-Infinity)
    expect(activation([], 1000)).toBe(-Infinity)
  })

  it('falls as time passes', () => {
    const encounters = [enc(0)]
    expect(activation(encounters, 10 * SECOND)).toBeGreaterThan(activation(encounters, 60 * SECOND))
    expect(activation(encounters, 60 * SECOND)).toBeGreaterThan(activation(encounters, HOUR))
  })

  it('rises with more encounters', () => {
    const one = activation([enc(0)], HOUR)
    const many = activation([enc(0), enc(MINUTE), enc(2 * MINUTE)], HOUR)
    expect(many).toBeGreaterThan(one)
  })

  it('floors the elapsed time at one solve, so a fresh encounter is finite', () => {
    expect(activation([enc(0)], 0)).toBe(0)
    expect(activation([enc(0)], -5000)).toBe(0)
  })

  it('decays faster for a larger d', () => {
    expect(activation([enc(0, 0.6)], HOUR)).toBeLessThan(activation([enc(0, 0.2)], HOUR))
  })
})

describe('buildModel', () => {
  it('is empty for no history', () => {
    const model = buildModel([], T0)
    expect(model.encounters.size).toBe(0)
    expect(model.tps).toBe(ARTS_DEFAULTS.defaultTps)
    expect(model.vtNow).toBe(0)
  })

  it('ignores times outside the usable band, but still counts them as served', () => {
    const history = [
      solve(27, 200, T0), // mis-trigger
      solve(27, 5000, T0 + MINUTE),
      solve(21, 300_000, T0 + 2 * MINUTE), // walked away
    ]
    const model = buildModel(history, T0 + 3 * MINUTE)
    expect(model.encounters.get(27)).toHaveLength(1)
    expect(model.encounters.has(21)).toBe(false)
    expect(model.served).toEqual([27, 27, 21])
  })

  it('keeps alpha inside its bounds however extreme the times', () => {
    const slow = buildModel(repeated(27, 40, 100_000, 20 * SECOND), T0 + HOUR)
    const fast = buildModel(repeated(27, 40, 600, 20 * SECOND), T0 + HOUR)
    expect(slow.alpha.get(27)).toBe(ARTS_DEFAULTS.alphaMax)
    expect(fast.alpha.get(27)).toBe(ARTS_DEFAULTS.alphaMin)
    for (const model of [slow, fast]) {
      for (const value of model.alpha.values()) {
        expect(value).toBeGreaterThanOrEqual(ARTS_DEFAULTS.alphaMin)
        expect(value).toBeLessThanOrEqual(ARTS_DEFAULTS.alphaMax)
      }
    }
  })

  it('raises alpha for a case solved slower than predicted and lowers it for faster', () => {
    const slow = buildModel(repeated(27, 6, 30_000, 30 * SECOND), T0 + HOUR)
    const fast = buildModel(repeated(27, 6, 900, 30 * SECOND), T0 + HOUR)
    expect(slow.alpha.get(27)!).toBeGreaterThan(ARTS_DEFAULTS.alphaInit)
    expect(fast.alpha.get(27)!).toBeLessThan(ARTS_DEFAULTS.alphaInit)
  })

  it('leaves alpha at its initial value after a single solve', () => {
    const model = buildModel([solve(27, 4000, T0)], T0 + MINUTE)
    expect(model.alpha.get(27)).toBe(ARTS_DEFAULTS.alphaInit)
  })

  it('fits turns per second within bounds', () => {
    const history: Solve[] = []
    let ts = T0
    // Six cases, each solved five times at roughly four turns per second.
    for (const id of [1, 7, 21, 27, 33, 45]) {
      for (let i = 0; i < 5; i++) {
        history.push(solve(id, Math.round((algMoveCount(id) / 4) * 1000) + i * 200, ts))
        ts += 30 * SECOND
      }
    }
    const model = buildModel(history, ts)
    expect(model.tps).toBeGreaterThanOrEqual(ARTS_DEFAULTS.tpsMin)
    expect(model.tps).toBeLessThanOrEqual(ARTS_DEFAULTS.tpsMax)
    expect(model.tps).toBeGreaterThan(2)
    expect(model.tps).toBeLessThan(8)
  })

  it('bounds the replay cost of a long history', () => {
    const config: ArtsConfig = { ...ARTS_DEFAULTS, maxEncounters: 50 }
    const model = buildModel(repeated(27, 400, 4000, 20 * SECOND), T0 + DAY, config)
    expect(model.encounters.get(27)).toHaveLength(50)
    expect(model.counts.get(27)).toBe(400)
    // The oldest encounters are the ones dropped.
    const kept = model.encounters.get(27)!
    expect(kept[0]!.vt).toBeGreaterThan(0)
  })

  it('walks the virtual timeline forward, compressing only the long gaps', () => {
    const history = [solve(27, 4000, T0), solve(21, 4000, T0 + MINUTE), solve(27, 4000, T0 + DAY)]
    const model = buildModel(history, T0 + DAY + MINUTE)
    const [first, second] = [model.encounters.get(27)![0]!, model.encounters.get(27)![1]!]
    expect(first.vt).toBe(0)
    expect(second.vt).toBe(MINUTE + compressGap(DAY - MINUTE))
    expect(model.vtNow).toBe(second.vt + MINUTE)
  })
})

describe('pickNext', () => {
  const rng = cycle([0.1, 0.4, 0.7, 0.9])

  it('has nothing to serve with an empty selection', () => {
    expect(pickNext(buildModel([], T0), [], rng)).toBeNull()
  })

  it('introduces an unseen case when nothing is at risk', () => {
    const history = repeated(27, 12, 2000, 20 * SECOND)
    const model = buildModel(history, T0 + 12 * 20 * SECOND)
    expect(pickNext(model, [27, 21, 33], rng)).not.toBe(27)
  })

  it('serves the weakest case once everything has been introduced', () => {
    // 21 was last seen long ago; 27 and 33 are fresh.
    const history: Solve[] = [
      ...repeated(21, 2, 4000, 20 * SECOND, T0),
      ...repeated(27, 8, 4000, 20 * SECOND, T0 + HOUR),
      ...repeated(33, 8, 4000, 20 * SECOND, T0 + 2 * HOUR),
    ]
    const now = T0 + 3 * HOUR
    const model = buildModel(history, now)
    const acts = [21, 27, 33].map((id) => activation(model.encounters.get(id), model.vtNow))
    expect(Math.min(...acts)).toBe(acts[0])
    expect(pickNext(model, [21, 27, 33], rng)).toBe(21)
  })

  it('holds back the cases served most recently', () => {
    const selection = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    const history = selection.flatMap((id, i) => repeated(id, 3, 4000, 20 * SECOND, T0 + i * HOUR))
    const model = buildModel(history, T0 + 10 * HOUR)
    const held = recentlyServed(model, selection.length)
    // floor(9 / 3) = 3 most recently served cases are held back.
    expect(held).toEqual(new Set([9, 8, 7]))
    expect(held.has(pickNext(model, selection, rng)!)).toBe(false)
  })

  it('caps the hold, so a large selection does not freeze most of itself', () => {
    const model = buildModel(repeated(1, 1, 4000, SECOND), T0)
    expect(recentlyServed(model, 57).size).toBeLessThanOrEqual(ARTS_DEFAULTS.spacingMax)
  })

  it('forces an introduction when coverage has starved', () => {
    // 27 alone, drilled far more than introEvery times: 21 has never appeared.
    const history = repeated(27, 30, 900, 20 * SECOND)
    const model = buildModel(history, T0 + 30 * 20 * SECOND)
    expect(introStarved(model)).toBe(true)
    expect(pickNext(model, [27, 21], rng)).toBe(21)
  })

  it('is not starved while new cases keep appearing', () => {
    const history = [1, 2, 3, 4].flatMap((id, i) => repeated(id, 1, 4000, SECOND, T0 + i * MINUTE))
    expect(introStarved(buildModel(history, T0 + 5 * MINUTE))).toBe(false)
  })

  it('serves something even when the whole selection is held back', () => {
    const selection = [27, 21]
    const history = [
      ...repeated(27, 3, 4000, 20 * SECOND),
      ...repeated(21, 3, 4000, 20 * SECOND, T0 + HOUR),
    ]
    const model = buildModel(history, T0 + 2 * HOUR)
    expect(selection).toContain(pickNext(model, selection, rng))
  })

  it('rescues an at-risk case ahead of introducing a new one', () => {
    // 27 seen twice, long ago, so it sits below tau; 21 has never been seen.
    const history = repeated(27, 2, 4000, 20 * SECOND)
    const model = buildModel(history, T0 + 30 * DAY)
    expect(isAtRisk(model, 27)).toBe(true)
    expect(pickNext(model, [27, 21], rng)).toBe(27)
  })
})

describe('pickRotation', () => {
  it('picks an unused angle over a used one', () => {
    const history = [solve(27, 4000, T0, ''), solve(27, 4000, T0 + MINUTE, 'y')]
    const picked = pickRotation(27, history, cycle([0]))
    expect(['y2', "y'"]).toContain(picked)
  })

  it('ignores other cases', () => {
    const history = [solve(21, 4000, T0, 'y2')]
    const seen = new Set<Rotation>()
    for (let i = 0; i < 8; i++) seen.add(pickRotation(27, history, cycle([i / 8])))
    expect(seen.size).toBe(4)
  })

  it('evens out coverage over a run', () => {
    const history: Solve[] = []
    const rng = cycle([0.05, 0.55, 0.3, 0.85])
    for (let i = 0; i < 40; i++) {
      history.push(solve(27, 4000, T0 + i * MINUTE, pickRotation(27, history, rng)))
    }
    const tally = new Map<Rotation, number>()
    for (const s of history) tally.set(s.rotation, (tally.get(s.rotation) ?? 0) + 1)
    expect(tally.size).toBe(4)
    expect(Math.max(...tally.values()) - Math.min(...tally.values())).toBeLessThanOrEqual(1)
  })
})

describe('display', () => {
  it('has no strength for a case never seen', () => {
    expect(strength(buildModel([], T0), 27)).toBeNull()
    expect(isAtRisk(buildModel([], T0), 27)).toBe(false)
  })

  it('uses the full width of the bar over the activations that occur', () => {
    const fresh = buildModel(repeated(27, 12, 2000, 20 * SECOND), T0 + 12 * 20 * SECOND)
    const stale = buildModel(repeated(27, 2, 4000, 20 * SECOND), T0 + 30 * DAY)
    expect(strength(fresh, 27)!).toBeGreaterThan(0.75)
    expect(strength(stale, 27)!).toBe(0)
  })

  it('counts what has been introduced and what is at risk', () => {
    // buildModel takes the history oldest-first, so 21's lone old solve leads.
    const history = [
      ...repeated(21, 1, 4000, 20 * SECOND, T0 - 30 * DAY),
      ...repeated(27, 10, 2000, 20 * SECOND),
    ]
    const status = learnStatus(buildModel(history, T0 + 10 * 20 * SECOND), [27, 21, 33])
    expect(status).toEqual({ introduced: 2, total: 3, atRisk: 1 })
  })
})

describe('the tau knob', () => {
  it('round-trips through the slider', () => {
    for (const value of [0, 25, 50, 75, 100]) {
      expect(sliderFromTau(tauFromSlider(value))).toBe(value)
    }
  })

  it('runs from gentle to eager and clamps outside', () => {
    expect(tauFromSlider(0)).toBe(ARTS_DEFAULTS.tauGentle)
    expect(tauFromSlider(100)).toBe(ARTS_DEFAULTS.tauEager)
    expect(tauFromSlider(-50)).toBe(ARTS_DEFAULTS.tauGentle)
    expect(tauFromSlider(500)).toBe(ARTS_DEFAULTS.tauEager)
  })

  it('makes a higher tau count more cases as at risk', () => {
    const model = buildModel(repeated(27, 6, 4000, 20 * SECOND), T0 + 2 * HOUR)
    expect(isAtRisk(model, 27, { ...ARTS_DEFAULTS, tau: 0 })).toBe(true)
    expect(isAtRisk(model, 27, { ...ARTS_DEFAULTS, tau: -5 })).toBe(false)
  })
})

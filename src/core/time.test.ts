import { describe, expect, it } from 'vitest'
import { ao, best, formatMs, mean, statsFor, worst } from './time'
import type { Solve } from './types'

describe('formatMs', () => {
  it.each([
    [0, '0.00'],
    [7, '0.00'],
    [1234, '1.23'],
    [1239, '1.23'],
    [12345, '12.34'],
    [59999, '59.99'],
    [60000, '1:00.00'],
    [62340, '1:02.34'],
    [3599990, '59:59.99'],
    [3600000, '60:00.00'],
  ])('formats %i as %s', (ms, expected) => {
    expect(formatMs(ms)).toBe(expected)
  })

  it('truncates rather than rounds, so a time never reads faster than it was', () => {
    expect(formatMs(1239)).toBe('1.23')
  })

  it('shows a dash for values that are not a time', () => {
    expect(formatMs(-1)).toBe('—')
    expect(formatMs(Number.NaN)).toBe('—')
    expect(formatMs(Number.POSITIVE_INFINITY)).toBe('—')
  })
})

describe('mean, best and worst', () => {
  it('are null with nothing to average', () => {
    expect(mean([])).toBeNull()
    expect(best([])).toBeNull()
    expect(worst([])).toBeNull()
  })

  it('work over one value', () => {
    expect(mean([1500])).toBe(1500)
    expect(best([1500])).toBe(1500)
    expect(worst([1500])).toBe(1500)
  })

  it('averages, without integer surprises', () => {
    expect(mean([1000, 2000, 2001])).toBeCloseTo(1667, 0)
  })
})

describe('ao', () => {
  it('is null until there are n solves', () => {
    expect(ao([1, 2, 3, 4], 5)).toBeNull()
    expect(ao([], 5)).toBeNull()
    expect(ao(Array(11).fill(1000), 12)).toBeNull()
  })

  it('drops the single best and single worst', () => {
    // 1 and 100 are dropped; 2, 3, 4 remain.
    expect(ao([1, 2, 3, 4, 100], 5)).toBe(3)
  })

  it('uses only the most recent n', () => {
    expect(ao([99999, 1, 2, 3, 4, 100], 5)).toBe(3)
  })

  it('drops only one of a repeated extreme', () => {
    // Two 1s: only one is trimmed, so the other still counts.
    expect(ao([1, 1, 3, 5, 5], 5)).toBe(3)
  })

  it('refuses windows too small to trim', () => {
    expect(ao([1, 2], 2)).toBeNull()
    expect(ao([1, 2, 3], 3)).toBe(2)
  })
})

describe('statsFor', () => {
  const solve = (ms: number, i: number): Solve => ({
    id: `s${i}`,
    caseId: 27,
    ms,
    scramble: 'R U',
    rotation: '',
    ts: 1000 + i,
    mode: 'train',
    outcome: 'solved',
  })

  it('is empty for no solves', () => {
    expect(statsFor([])).toEqual({
      count: 0,
      blanks: 0,
      mean: null,
      best: null,
      worst: null,
      ao5: null,
      ao12: null,
    })
  })

  it('summarises a session', () => {
    const solves = [3000, 1000, 2000, 5000, 4000].map(solve)
    const stats = statsFor(solves)
    expect(stats.count).toBe(5)
    expect(stats.best).toBe(1000)
    expect(stats.worst).toBe(5000)
    expect(stats.mean).toBe(3000)
    expect(stats.ao5).toBe(3000)
    expect(stats.ao12).toBeNull()
  })
})

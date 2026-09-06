import { describe, expect, it } from 'vitest'
import { elapsedMs, IDLE, isArmed, reduce, type TimerConfig, type TimerState } from './timer'

const HOLD: TimerConfig = { holdMs: 300 }
const INSTANT: TimerConfig = { holdMs: 0 }

/** Drives the reducer through a script of [event, now] pairs. */
function run(
  script: readonly (readonly ['down' | 'up' | 'tick' | 'cancel', number])[],
  config: TimerConfig = HOLD,
  from: TimerState = IDLE,
) {
  let state = from
  const results: number[] = []
  for (const [type, now] of script) {
    const step = reduce(state, { type }, now, config)
    state = step.state
    if (step.result) results.push(step.result.ms)
  }
  return { state, results }
}

describe('the happy path', () => {
  it('holds, arms, runs and stops', () => {
    const { state, results } = run([
      ['down', 0],
      ['tick', 100],
      ['tick', 300],
      ['up', 310],
      ['tick', 5000],
      ['down', 8310],
      ['up', 8400],
    ])
    expect(results).toEqual([8000])
    expect(state).toEqual(IDLE)
  })

  it('reports the phase along the way', () => {
    let state = IDLE
    const phases: string[] = [state.phase]
    for (const [type, now] of [
      ['down', 0],
      ['tick', 299],
      ['tick', 300],
      ['up', 310],
      ['down', 1310],
      ['up', 1320],
    ] as const) {
      state = reduce(state, { type }, now, HOLD).state
      phases.push(state.phase)
    }
    expect(phases).toEqual(['idle', 'holding', 'holding', 'ready', 'running', 'stopped', 'idle'])
  })
})

describe('holding', () => {
  it('arms only once holdMs has passed', () => {
    expect(
      run([
        ['down', 0],
        ['tick', 299],
      ]).state.phase,
    ).toBe('holding')
    expect(
      run([
        ['down', 0],
        ['tick', 300],
      ]).state.phase,
    ).toBe('ready')
  })

  it('treats an early release as a false start, not a solve', () => {
    const { state, results } = run([
      ['down', 0],
      ['tick', 100],
      ['up', 150],
    ])
    expect(state).toEqual(IDLE)
    expect(results).toEqual([])
  })

  it('arms immediately when holdMs is 0, reproducing the old feel', () => {
    const { state } = run([['down', 0]], INSTANT)
    expect(isArmed(state)).toBe(true)
  })

  it('does not start on the press that armed it', () => {
    // Only the *release* starts the timer, so pressing longer is harmless.
    const { state } = run(
      [
        ['down', 0],
        ['tick', 5000],
      ],
      HOLD,
    )
    expect(state.phase).toBe('ready')
  })
})

describe('running', () => {
  it('stops on any key down, not only the one that started it', () => {
    const { results } = run([
      ['down', 0],
      ['tick', 300],
      ['up', 300],
      ['down', 4200],
    ])
    expect(results).toEqual([3900])
  })

  it('ignores releases while running, so the starting key can be let go', () => {
    const { state } = run([
      ['down', 0],
      ['tick', 300],
      ['up', 300],
      ['up', 500],
      ['tick', 900],
    ])
    expect(state.phase).toBe('running')
  })

  it('produces the solve exactly once', () => {
    const { results } = run([
      ['down', 0],
      ['tick', 300],
      ['up', 300],
      ['down', 2300],
      ['down', 2400],
      ['tick', 2500],
    ])
    expect(results).toEqual([2000])
  })

  it('never reports a negative time, even if the clock goes backwards', () => {
    const { results } = run([
      ['down', 0],
      ['tick', 300],
      ['up', 300],
      ['down', 200],
    ])
    expect(results).toEqual([0])
  })
})

describe('stopped', () => {
  it('waits for the release before going idle, so one press cannot re-arm', () => {
    const stopped: TimerState = { phase: 'stopped', ms: 1234 }
    expect(reduce(stopped, { type: 'down' }, 0, HOLD).state).toBe(stopped)
    expect(reduce(stopped, { type: 'tick' }, 0, HOLD).state).toBe(stopped)
    expect(reduce(stopped, { type: 'up' }, 0, HOLD).state).toEqual(IDLE)
  })

  it('keeps the recorded time until it is cleared', () => {
    expect(elapsedMs({ phase: 'stopped', ms: 1234 }, 999999)).toBe(1234)
  })
})

describe('cancel', () => {
  it.each([
    ['idle', IDLE],
    ['holding', { phase: 'holding', heldSince: 0 } as TimerState],
    ['ready', { phase: 'ready' } as TimerState],
    ['running', { phase: 'running', startedAt: 0 } as TimerState],
    ['stopped', { phase: 'stopped', ms: 5 } as TimerState],
  ])('returns to idle from %s without recording anything', (_name, state) => {
    const step = reduce(state, { type: 'cancel' }, 1000, HOLD)
    expect(step.state).toEqual(IDLE)
    expect(step.result).toBeUndefined()
  })
})

describe('elapsedMs', () => {
  it('counts up while running and is zero otherwise', () => {
    expect(elapsedMs({ phase: 'running', startedAt: 1000 }, 4000)).toBe(3000)
    expect(elapsedMs(IDLE, 4000)).toBe(0)
    expect(elapsedMs({ phase: 'ready' }, 4000)).toBe(0)
    expect(elapsedMs({ phase: 'holding', heldSince: 0 }, 4000)).toBe(0)
  })
})

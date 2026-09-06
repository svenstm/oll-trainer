/**
 * The timer as a pure reducer, so every transition is testable with no DOM and
 * no clock. The old app drove a `setInterval(…, 10)` off `Date.getTime()` and
 * recovered the result by re-parsing `timer.innerHTML`; here the elapsed time
 * is a `performance.now()` delta and the display is only a render of it.
 *
 *   idle    --down--> holding --holdMs--> ready
 *                        \-- up --------> idle
 *   ready   --up----> running
 *   running --down--> stopped   (the solve is recorded here)
 *   stopped --up----> idle
 */

export type TimerPhase = 'idle' | 'holding' | 'ready' | 'running' | 'stopped'

export type TimerState =
  | { phase: 'idle' }
  | { phase: 'holding'; heldSince: number }
  | { phase: 'ready' }
  | { phase: 'running'; startedAt: number }
  | { phase: 'stopped'; ms: number }

/**
 * `down` is space or touchstart, `up` is their release, `tick` is the frame
 * loop. `cancel` is Escape, which abandons a hold or a running solve.
 */
export type TimerEvent = { type: 'down' } | { type: 'up' } | { type: 'tick' } | { type: 'cancel' }

export interface TimerConfig {
  /** How long `down` must be held before the timer arms. 0 arms immediately. */
  holdMs: number
}

export const IDLE: TimerState = { phase: 'idle' }

/**
 * A solve to record, produced exactly once, on the transition into `stopped`.
 * The caller writes it to the store; the reducer stays pure.
 */
export interface TimerResult {
  ms: number
}

export interface TimerTransition {
  state: TimerState
  result?: TimerResult
}

export function reduce(
  state: TimerState,
  event: TimerEvent,
  now: number,
  config: TimerConfig,
): TimerTransition {
  if (event.type === 'cancel') {
    // Escape abandons whatever is in flight without recording anything.
    return { state: IDLE }
  }

  switch (state.phase) {
    case 'idle':
      if (event.type === 'down') {
        return {
          state: config.holdMs <= 0 ? { phase: 'ready' } : { phase: 'holding', heldSince: now },
        }
      }
      return { state }

    case 'holding':
      // Releasing before the hold completes is a false start, not a solve.
      if (event.type === 'up') return { state: IDLE }
      if (event.type === 'tick' && now - state.heldSince >= config.holdMs) {
        return { state: { phase: 'ready' } }
      }
      return { state }

    case 'ready':
      if (event.type === 'up') return { state: { phase: 'running', startedAt: now } }
      return { state }

    case 'running':
      if (event.type === 'down') {
        const ms = Math.max(0, now - state.startedAt)
        return { state: { phase: 'stopped', ms }, result: { ms } }
      }
      return { state }

    case 'stopped':
      // The key that stopped the timer must be released before the next solve,
      // otherwise one long press would stop and immediately re-arm.
      if (event.type === 'up') return { state: IDLE }
      return { state }
  }
}

/** What the display should show, in milliseconds. */
export function elapsedMs(state: TimerState, now: number): number {
  switch (state.phase) {
    case 'running':
      return Math.max(0, now - state.startedAt)
    case 'stopped':
      return state.ms
    default:
      return 0
  }
}

/** True once the hold has completed and releasing will start the timer. */
export function isArmed(state: TimerState): boolean {
  return state.phase === 'ready'
}

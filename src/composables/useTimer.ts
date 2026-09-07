/**
 * Wires the pure timer reducer to the browser: a frame loop for the display
 * and the hold threshold, keyboard for desktop, touch for phones.
 *
 * All the state transitions live in `src/core/timer.ts` and are tested with no
 * DOM at all. This file only decides which browser event is which reducer
 * event, which is exactly where the old app's timer bugs lived.
 */

import {
  computed,
  onBeforeUnmount,
  onMounted,
  readonly,
  ref,
  shallowRef,
  unref,
  type Ref,
} from 'vue'
import { elapsedMs, IDLE, reduce, type TimerEvent, type TimerState } from '@/core/timer'

export interface UseTimerOptions {
  holdMs: Ref<number> | number
  /** Called once per solve, on the transition into `stopped`. */
  onSolve: (ms: number) => void
  /** Keys pressed while the timer is not running, for the view's own shortcuts. */
  onShortcut?: (event: KeyboardEvent) => void
}

/**
 * Anything the user is meant to be able to operate directly.
 *
 * Space activates a focused button and a tap presses it, so neither may also
 * drive the timer — otherwise every control in the view stops working, and
 * dragging a settings slider arms a solve.
 */
const INTERACTIVE = 'button, a[href], input, select, textarea, label, summary, [role="tab"]'

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target instanceof HTMLElement && target.isContentEditable) return true
  return target.closest(INTERACTIVE) !== null
}

export function useTimer(options: UseTimerOptions) {
  const state = shallowRef<TimerState>(IDLE)
  const displayMs = ref(0)
  let frame = 0

  const now = () => performance.now()
  const config = () => ({ holdMs: unref(options.holdMs) })

  /**
   * The display does not simply track the reducer: going idle after a solve
   * must *keep* the time on screen, or your result vanishes the instant you
   * lift the key. It clears when the next attempt starts, or when one is
   * abandoned.
   */
  function updateDisplay(next: TimerState, at: number, event: TimerEvent['type']): void {
    if (next.phase === 'holding' || next.phase === 'ready') displayMs.value = 0
    else if (next.phase === 'idle') {
      if (event === 'cancel') displayMs.value = 0
    } else displayMs.value = elapsedMs(next, at)
  }

  function dispatch(type: TimerEvent['type']): void {
    const at = now()
    const step = reduce(state.value, { type }, at, config())
    state.value = step.state
    updateDisplay(step.state, at, type)
    if (step.result) options.onSolve(step.result.ms)
    if (step.state.phase === 'holding' || step.state.phase === 'running') startLoop()
  }

  function startLoop(): void {
    if (frame !== 0) return
    const step = () => {
      const at = now()
      const next = reduce(state.value, { type: 'tick' }, at, config())
      state.value = next.state
      updateDisplay(next.state, at, 'tick')
      if (next.state.phase === 'holding' || next.state.phase === 'running') {
        frame = requestAnimationFrame(step)
      } else {
        frame = 0
      }
    }
    frame = requestAnimationFrame(step)
  }

  function stopLoop(): void {
    if (frame !== 0) cancelAnimationFrame(frame)
    frame = 0
  }

  function onKeyDown(event: KeyboardEvent): void {
    // Holding a key repeats; only the first press is a press.
    if (event.repeat) return

    if (state.value.phase === 'running') {
      // Any key stops the timer, including the shortcut keys. This one ignores
      // the focused element: during a solve, stopping comes first.
      event.preventDefault()
      dispatch('down')
      return
    }

    if (isInteractiveTarget(event.target)) return
    if (event.key === 'Escape') {
      dispatch('cancel')
      options.onShortcut?.(event)
      return
    }
    if (event.key === ' ') {
      // Otherwise space scrolls the page out from under the timer.
      event.preventDefault()
      dispatch('down')
      return
    }
    options.onShortcut?.(event)
  }

  function onKeyUp(event: KeyboardEvent): void {
    // A release after a stop always re-arms, whatever has focus, so the key
    // that stopped the timer cannot leave it stuck in `stopped`.
    if (state.value.phase === 'stopped') {
      dispatch('up')
      return
    }
    if (isInteractiveTarget(event.target)) return
    if (event.key === ' ') dispatch('up')
  }

  function onTouchStart(event: TouchEvent): void {
    if (isInteractiveTarget(event.target)) return
    // Stops the tap becoming a synthesised click on whatever is underneath.
    if (event.cancelable) event.preventDefault()
    dispatch('down')
  }

  function onTouchEnd(event: TouchEvent): void {
    if (state.value.phase !== 'stopped' && isInteractiveTarget(event.target)) return
    if (event.cancelable) event.preventDefault()
    dispatch('up')
  }

  function reset(): void {
    stopLoop()
    state.value = IDLE
    displayMs.value = 0
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    stopLoop()
  })

  return {
    state: readonly(state),
    phase: computed(() => state.value.phase),
    displayMs: readonly(displayMs),
    /** True once the hold has completed and releasing will start the timer. */
    armed: computed(() => state.value.phase === 'ready'),
    running: computed(() => state.value.phase === 'running'),
    touchHandlers: { touchstart: onTouchStart, touchend: onTouchEnd, touchcancel: onTouchEnd },
    reset,
  }
}

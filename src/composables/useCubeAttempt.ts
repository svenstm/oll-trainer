/**
 * Wires the pure attempt reducer to the smart-cube store, the way `useTimer`
 * wires `timer.ts` to the keyboard: cube signals and a frame loop in,
 * results out. Every transition lives in `src/core/cubeAttempt.ts`.
 */

import { computed, onBeforeUnmount, readonly, ref, shallowRef, watch, type Ref } from 'vue'

import {
  attemptConfig,
  attemptDisplayMs,
  reduceAttempt,
  startAttempt,
  type CubeAttemptConfig,
  type CubeAttemptEvent,
  type CubeAttemptResult,
  type CubeAttemptState,
} from '@/core/cubeAttempt'
import { useCubeStore, type CubeSignal } from '@/stores/cube'
import { useSettingsStore } from '@/stores/settings'

export interface UseCubeAttemptOptions {
  /** The scramble being served, or null when there is none. */
  scramble: Ref<string | null>
  /**
   * False parks the attempt — while studying, nothing on the cube is timed.
   * Turning it back on starts afresh from wherever the cube now is.
   */
  enabled: Ref<boolean>
  onResult: (result: CubeAttemptResult) => void
}

export function useCubeAttempt(options: UseCubeAttemptOptions) {
  const cube = useCubeStore()
  const settings = useSettingsStore()

  const state = shallowRef<CubeAttemptState | null>(null)
  const displayMs = ref(0)
  let config: CubeAttemptConfig | null = null
  let frame = 0

  const now = () => Math.floor(performance.now())
  const active = () => cube.connected && options.enabled.value && options.scramble.value !== null

  /**
   * Like the keyboard timer, the last result stays on screen while the next
   * attempt is set up, and only clears once inspection starts.
   */
  function restart(): void {
    stopLoop()
    if (state.value?.phase !== 'done') displayMs.value = 0
    if (!active()) {
      state.value = null
      config = null
      return
    }
    config = attemptConfig(options.scramble.value!)
    state.value = startAttempt(cube.cube, config)
  }

  function dispatch(event: CubeAttemptEvent): void {
    if (!state.value || !config) return
    const step = reduceAttempt(state.value, event, config)
    state.value = step.state
    const timing = step.state.phase === 'inspecting' || step.state.phase === 'solving'
    if (timing && event.type !== 'abandon') {
      displayMs.value = attemptDisplayMs(step.state, event.at, config)
    }
    if (step.result) {
      // Kept on screen as the result, as the keyboard timer does.
      if (step.result.outcome === 'solved') {
        displayMs.value = step.result.recognitionMs + step.result.solveMs
      }
      stopLoop()
      options.onResult(step.result)
      return
    }
    if (timing) startLoop()
  }

  function startLoop(): void {
    if (frame !== 0) return
    const step = () => {
      frame = 0
      dispatch({ type: 'tick', at: now() })
      const phase = state.value?.phase
      if (phase === 'inspecting' || phase === 'solving') frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
  }

  function stopLoop(): void {
    if (frame !== 0) cancelAnimationFrame(frame)
    frame = 0
  }

  function onSignal(signal: CubeSignal): void {
    if (!state.value) return
    if (signal.type === 'turn') {
      dispatch(signal)
      return
    }
    // A resync replaces the state wholesale. Before the case is reached that
    // just means "look again"; once inspection or a solve is under way it
    // cannot be squared with the turns that led there, so the attempt is lost.
    const phase = state.value.phase
    if (phase === 'unsolved' || phase === 'scrambling' || phase === 'done') {
      state.value = startAttempt(signal.cube, config!)
    } else {
      abandon()
    }
  }

  /** Escape: drops the attempt in flight. Nothing is recorded. */
  function abandon(): void {
    stopLoop()
    displayMs.value = 0
    dispatch({ type: 'abandon' })
  }

  const unlisten = cube.listen(onSignal)
  watch(
    [options.scramble, options.enabled, () => cube.connected, () => settings.settings.grip],
    restart,
    { immediate: true },
  )

  onBeforeUnmount(() => {
    unlisten()
    stopLoop()
  })

  return {
    state: readonly(state),
    phase: computed(() => state.value?.phase ?? null),
    progress: computed(() => (state.value?.phase === 'scrambling' ? state.value.progress : null)),
    displayMs: readonly(displayMs),
    abandon,
  }
}

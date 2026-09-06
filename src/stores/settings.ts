import { computed } from 'vue'
import { defineStore } from 'pinia'

import { ARTS_DEFAULTS } from '@/core/arts'
import type { Settings, Theme } from '@/core/types'
import { asFiniteNumber, asOneOf, clampNumber, isRecord, persistedRef } from './persist'

const THEMES: readonly Theme[] = ['light', 'dark', 'system']

/** Bounds for the sliders. Kept here so the parser and the UI cannot disagree. */
export const LIMITS = {
  timerSize: { min: 2, max: 10, step: 0.25 },
  scrambleSize: { min: 0.8, max: 2.5, step: 0.05 },
  holdMs: { min: 0, max: 1000, step: 50 },
} as const

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  timerSize: 5,
  scrambleSize: 1.25,
  holdMs: 300,
  tau: ARTS_DEFAULTS.tau,
}

function parseSettings(raw: unknown): Settings | null {
  if (!isRecord(raw)) return null
  return {
    theme: asOneOf(raw.theme, THEMES, DEFAULT_SETTINGS.theme),
    timerSize: clampNumber(
      asFiniteNumber(raw.timerSize, DEFAULT_SETTINGS.timerSize),
      LIMITS.timerSize.min,
      LIMITS.timerSize.max,
    ),
    scrambleSize: clampNumber(
      asFiniteNumber(raw.scrambleSize, DEFAULT_SETTINGS.scrambleSize),
      LIMITS.scrambleSize.min,
      LIMITS.scrambleSize.max,
    ),
    holdMs: clampNumber(
      asFiniteNumber(raw.holdMs, DEFAULT_SETTINGS.holdMs),
      LIMITS.holdMs.min,
      LIMITS.holdMs.max,
    ),
    // Eager is the *lower* number, so the range runs the other way.
    tau: clampNumber(
      asFiniteNumber(raw.tau, DEFAULT_SETTINGS.tau),
      ARTS_DEFAULTS.tauEager,
      ARTS_DEFAULTS.tauGentle,
    ),
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = persistedRef<Settings>('settings', DEFAULT_SETTINGS, parseSettings)

  /** Replaces the object rather than mutating it, so the shallow watch fires. */
  function update(patch: Partial<Settings>): void {
    settings.value = parseSettings({ ...settings.value, ...patch }) ?? DEFAULT_SETTINGS
  }

  function reset(): void {
    settings.value = { ...DEFAULT_SETTINGS }
  }

  const artsConfig = computed(() => ({ ...ARTS_DEFAULTS, tau: settings.value.tau }))

  return {
    settings,
    theme: computed(() => settings.value.theme),
    timerSize: computed(() => settings.value.timerSize),
    scrambleSize: computed(() => settings.value.scrambleSize),
    holdMs: computed(() => settings.value.holdMs),
    tau: computed(() => settings.value.tau),
    artsConfig,
    update,
    reset,
  }
})

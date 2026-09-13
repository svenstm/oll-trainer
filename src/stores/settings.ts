import { computed } from 'vue'
import { defineStore } from 'pinia'

import { PACE_DEFAULTS } from '@/core/pace'
import { DEFAULT_SETTINGS, LIMITS, parseSettings } from '@/core/parse'
import type { Settings } from '@/core/types'
import { persistedRef } from './persist'

export { DEFAULT_SETTINGS, LIMITS }

export const useSettingsStore = defineStore('settings', () => {
  const settings = persistedRef<Settings>('settings', DEFAULT_SETTINGS, parseSettings)

  /** Replaces the object rather than mutating it, so the shallow watch fires. */
  function update(patch: Partial<Settings>): void {
    settings.value = parseSettings({ ...settings.value, ...patch }) ?? DEFAULT_SETTINGS
  }

  function reset(): void {
    settings.value = { ...DEFAULT_SETTINGS }
  }

  const paceConfig = computed(() => ({ ...PACE_DEFAULTS, introEvery: settings.value.introEvery }))

  return {
    settings,
    theme: computed(() => settings.value.theme),
    timerSize: computed(() => settings.value.timerSize),
    scrambleSize: computed(() => settings.value.scrambleSize),
    holdMs: computed(() => settings.value.holdMs),
    introEvery: computed(() => settings.value.introEvery),
    paceConfig,
    update,
    reset,
  }
})

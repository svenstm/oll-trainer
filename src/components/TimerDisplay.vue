<script setup lang="ts">
import { computed } from 'vue'
import { formatMs } from '@/core/time'
import type { TimerPhase } from '@/core/timer'

const props = defineProps<{
  ms: number
  /** `inspecting` is a smart cube's countdown; `ms` is then the time left. */
  phase: TimerPhase | 'inspecting'
  /** Font size in rem, from settings. */
  size: number
}>()

const colour = computed(() => {
  switch (props.phase) {
    case 'ready':
      return 'text-ready'
    case 'holding':
      return 'text-muted'
    case 'inspecting':
      return 'text-accent'
    default:
      return 'text-fg'
  }
})

/** Inspection counts down in whole seconds, the way a WCA display does. */
const text = computed(() =>
  props.phase === 'inspecting' ? String(Math.ceil(props.ms / 1000)) : formatMs(props.ms),
)
</script>

<template>
  <p
    class="font-mono leading-none tabular-nums select-none"
    :class="colour"
    :style="{ fontSize: `${size}rem` }"
    :data-phase="phase"
    data-testid="timer"
    aria-live="polite"
  >
    {{ text }}
  </p>
</template>

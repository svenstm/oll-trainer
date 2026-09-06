<script setup lang="ts">
import { computed } from 'vue'
import { formatMs } from '@/core/time'
import type { TimerPhase } from '@/core/timer'

const props = defineProps<{
  ms: number
  phase: TimerPhase
  /** Font size in rem, from settings. */
  size: number
}>()

const colour = computed(() => {
  switch (props.phase) {
    case 'ready':
      return 'text-ready'
    case 'holding':
      return 'text-muted'
    default:
      return 'text-fg'
  }
})
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
    {{ formatMs(ms) }}
  </p>
</template>

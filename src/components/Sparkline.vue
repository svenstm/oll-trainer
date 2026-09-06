<script setup lang="ts">
import { computed } from 'vue'
import { formatMs } from '@/core/time'

const props = withDefaults(
  defineProps<{
    /** Times in chronological order. */
    values: readonly number[]
    width?: number
    height?: number
  }>(),
  { width: 72, height: 20 },
)

const PAD = 2

/**
 * Hand-rolled rather than pulled from a chart library: this draws one polyline
 * and one dot, and a charting dependency would be larger than the whole app.
 *
 * Faster times sit lower, so a run of improvement reads as a line trending
 * downwards.
 */
const geometry = computed(() => {
  const values = props.values
  if (values.length === 0) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  const usableHeight = props.height - PAD * 2
  const step = values.length > 1 ? (props.width - PAD * 2) / (values.length - 1) : 0

  const points = values.map((value, index) => {
    // With every time identical there is no range to scale against, so the
    // line sits in the middle rather than dividing by zero.
    const fraction = span === 0 ? 0.5 : (value - min) / span
    return {
      x: values.length === 1 ? props.width / 2 : PAD + index * step,
      y: props.height - PAD - fraction * usableHeight,
    }
  })

  return {
    path: points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
    last: points.at(-1)!,
    label: `${values.length} solves, best ${formatMs(min)}, worst ${formatMs(max)}`,
  }
})
</script>

<template>
  <svg
    v-if="geometry"
    :viewBox="`0 0 ${width} ${height}`"
    :width="width"
    :height="height"
    class="overflow-visible align-middle"
    role="img"
    :aria-label="geometry.label"
  >
    <title>{{ geometry.label }}</title>
    <polyline
      v-if="values.length > 1"
      :points="geometry.path"
      fill="none"
      stroke="currentColor"
      stroke-width="1.25"
      stroke-linecap="round"
      stroke-linejoin="round"
      vector-effect="non-scaling-stroke"
    />
    <circle :cx="geometry.last.x" :cy="geometry.last.y" r="1.75" fill="currentColor" />
  </svg>
</template>

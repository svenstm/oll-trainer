<script setup lang="ts">
defineProps<{
  /** 0..1, or null for a case that has never been served. */
  value: number | null
  atRisk?: boolean
}>()
</script>

<template>
  <span
    v-if="value !== null"
    class="inline-flex h-1.5 w-16 overflow-hidden rounded-full bg-border align-middle"
    role="meter"
    :aria-valuenow="Math.round(value * 100)"
    aria-valuemin="0"
    aria-valuemax="100"
    :title="`memory strength ${Math.round(value * 100)}%${atRisk ? ', at risk' : ''}`"
  >
    <span
      class="h-full rounded-full transition-[width] duration-300"
      :class="atRisk ? 'bg-danger' : 'bg-ready'"
      :style="{ width: `${Math.round(value * 100)}%` }"
    />
  </span>
</template>

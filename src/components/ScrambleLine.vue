<script setup lang="ts">
defineProps<{
  scramble: string
  /** Font size in rem, from settings. */
  size: number
}>()
</script>

<template>
  <p
    class="font-mono leading-snug tracking-wide text-balance select-none"
    :style="{ fontSize: `${size}rem` }"
    data-testid="scramble"
  >
    {{ scramble }}
  </p>
</template>

<script setup lang="ts">
import type { Mode } from '@/core/types'

defineProps<{ mode: Mode }>()
</script>

<template>
  <main class="mx-auto max-w-5xl p-6">
    <h1 class="text-2xl font-semibold">Practice — {{ mode }}</h1>
    <p class="mt-2 text-muted">The timer lands in phase 3.</p>
  </main>
</template>

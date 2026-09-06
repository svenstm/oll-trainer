<script setup lang="ts">
import OllFace from './OllFace.vue'
import { formatMs } from '@/core/time'
import type { OllCase, Rotation } from '@/core/types'

defineProps<{
  ollCase: OllCase
  ms: number
  rotation: Rotation
}>()
</script>

<template>
  <section
    class="flex items-center gap-4 rounded-xl border border-border bg-surface p-4"
    data-testid="case-reveal"
    aria-live="polite"
  >
    <div class="w-20 shrink-0 sm:w-24">
      <OllFace :pattern="ollCase.pattern" :label="`OLL ${ollCase.id}, ${ollCase.name}`" />
    </div>

    <div class="min-w-0 flex-1">
      <p class="flex flex-wrap items-baseline gap-x-2">
        <span class="text-lg font-semibold">OLL {{ ollCase.id }}</span>
        <span class="text-lg">{{ ollCase.name }}</span>
        <span class="font-mono text-lg tabular-nums text-accent">{{ formatMs(ms) }}</span>
      </p>
      <p class="text-sm text-muted">
        {{ ollCase.group }}
        <template v-if="rotation"> · shown from {{ rotation }}</template>
      </p>

      <p class="mt-2 overflow-x-auto font-mono text-sm">{{ ollCase.alg }}</p>
      <!-- Empty until alternative algorithms are generated; see docs/PLAN.md §12. -->
      <ul v-if="ollCase.alternatives.length > 0" class="mt-1 space-y-0.5">
        <li
          v-for="alternative in ollCase.alternatives"
          :key="alternative"
          class="overflow-x-auto font-mono text-sm text-muted"
        >
          {{ alternative }}
        </li>
      </ul>
    </div>
  </section>
</template>

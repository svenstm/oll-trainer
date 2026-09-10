<script setup lang="ts">
import { computed } from 'vue'

import OllFace from './OllFace.vue'
import { solutionAsDrawn } from '@/core/scramble'
import { formatMs } from '@/core/time'
import type { OllCase, Pattern } from '@/core/types'

const props = defineProps<{
  ollCase: OllCase
  /** null for an "I don't know": there is no time, because nothing was timed. */
  ms: number | null
  /**
   * The orientation actually just solved — a scramble serves a case at any of
   * four angles, and drawing the stored picture instead would show a case the
   * solver did not face.
   */
  pattern: Pattern
}>()

/**
 * The algorithm, and the rotation that has to come first for it to apply at
 * the angle drawn beside it. Without that rotation the two halves of this
 * panel disagree, and in study mode the user runs the algorithm against a cube
 * it does not solve.
 */
const solution = computed(() => solutionAsDrawn(props.ollCase, props.pattern))
</script>

<template>
  <section
    class="flex items-center gap-4 rounded-tile border border-border bg-surface p-4"
    data-testid="case-reveal"
    aria-live="polite"
  >
    <div class="w-20 shrink-0 sm:w-24">
      <OllFace :pattern="pattern" :label="`OLL ${ollCase.id}, ${ollCase.name}`" />
    </div>

    <div class="min-w-0 flex-1">
      <p class="flex flex-wrap items-baseline gap-x-2">
        <span class="text-lg font-semibold">OLL {{ ollCase.id }}</span>
        <span class="text-lg">{{ ollCase.name }}</span>
        <span v-if="ms === null" class="text-lg font-medium text-danger" data-testid="didnt-know">
          Didn't know
        </span>
        <span v-else class="font-mono text-lg tabular-nums text-accent">{{ formatMs(ms) }}</span>
      </p>
      <p class="text-sm text-muted">{{ ollCase.group }}</p>

      <p class="mt-2 font-mono text-sm" data-testid="solution">
        <!-- The space is inside the expression: the compiler trims a trailing
             one out of the template, and the line has to stay a sequence of
             moves that can be read straight off the screen. -->
        <span v-if="solution.hold" class="text-muted" data-testid="hold">{{
          solution.hold + ' '
        }}</span
        >{{ solution.alg }}
      </p>
    </div>
  </section>
</template>

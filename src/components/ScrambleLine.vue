<script setup lang="ts">
import { computed } from 'vue'

import { tokenize } from '@/core/cube'

const props = defineProps<{
  scramble: string
  /** Font size in rem, from settings. */
  size: number
  /**
   * How far a smart cube has got through it. Without it the line is plain
   * text, as it always was.
   */
  progress?: { done: number; half: boolean } | null
  /** Turns that put the cube back on the scramble, when it has strayed. */
  correction?: string
}>()

const tokens = computed(() =>
  tokenize(props.scramble).map((token, index) => {
    const done = props.progress?.done ?? 0
    return {
      token,
      state: !props.progress
        ? 'plain'
        : index < done
          ? 'done'
          : index === done && props.progress.half
            ? 'half'
            : 'todo',
    }
  }),
)
</script>

<template>
  <div class="select-none">
    <p
      class="font-mono leading-snug tracking-wide text-balance"
      :style="{ fontSize: `${size}rem` }"
      data-testid="scramble"
    >
      <template v-for="(item, index) in tokens" :key="index">
        <span
          :class="{
            'text-muted opacity-50': item.state === 'done',
            'text-accent': item.state === 'half',
          }"
          :data-state="item.state"
          >{{ item.token }}</span
        >{{ index < tokens.length - 1 ? ' ' : '' }}
      </template>
    </p>
    <p
      v-if="correction"
      class="mt-2 font-mono text-danger"
      :style="{ fontSize: `${size * 0.85}rem` }"
      data-testid="scramble-correction"
    >
      <span class="font-sans text-sm">Undo first:</span> {{ correction }}
    </p>
  </div>
</template>

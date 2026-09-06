<script setup lang="ts">
import { computed } from 'vue'
import type { Pattern } from '@/core/types'

const props = defineProps<{
  pattern: Pattern
  /** Read out by screen readers, e.g. "OLL 27, Sune". */
  label?: string
}>()

/**
 * The 21 slots laid out as the standard OLL diagram: a 3x3 U face with the
 * top row of each side face as a tab outside it. Slot order is fixed by
 * `src/core/pattern.ts` — U row-major, then B, R, F, L — and the geometry
 * below just places each slot where that layout says it belongs.
 */
const CELL = 18
const STEP = 21
const FACE = 20
const TAB = 8
const TAB_GAP = 3

interface Sticker {
  slot: number
  x: number
  y: number
  width: number
  height: number
  onFace: boolean
}

const stickers = computed<Sticker[]>(() => {
  const out: Sticker[] = []
  for (let slot = 0; slot < 9; slot++) {
    out.push({
      slot,
      x: FACE + (slot % 3) * STEP,
      y: FACE + Math.floor(slot / 3) * STEP,
      width: CELL,
      height: CELL,
      onFace: true,
    })
  }
  const near = FACE - TAB_GAP - TAB
  const far = FACE + 3 * STEP - TAB_GAP
  for (let k = 0; k < 3; k++) {
    const along = FACE + k * STEP
    // B above the top row, R beside the right column, F below, L beside the left.
    out.push({ slot: 9 + k, x: along, y: near, width: CELL, height: TAB, onFace: false })
    out.push({ slot: 12 + k, x: far, y: along, width: TAB, height: CELL, onFace: false })
    out.push({ slot: 15 + k, x: along, y: far, width: CELL, height: TAB, onFace: false })
    out.push({ slot: 18 + k, x: near, y: along, width: TAB, height: CELL, onFace: false })
  }
  return out
})

const isOriented = (slot: number) => props.pattern[slot] === 1
</script>

<template>
  <svg
    viewBox="0 0 100 100"
    class="oll-face block h-full w-full"
    :role="label ? 'img' : 'presentation'"
    :aria-label="label"
  >
    <template v-for="sticker in stickers" :key="sticker.slot">
      <!--
        On the U face every slot is drawn, dark when it is not oriented. Around
        it only the oriented stickers are drawn, which is what gives each case
        its shape.
      -->
      <rect
        v-if="sticker.onFace || isOriented(sticker.slot)"
        :x="sticker.x"
        :y="sticker.y"
        :width="sticker.width"
        :height="sticker.height"
        :rx="sticker.onFace ? 2.5 : 1.5"
        :fill="
          isOriented(sticker.slot)
            ? sticker.onFace
              ? 'var(--sticker-up)'
              : 'var(--sticker-side)'
            : 'var(--sticker-none)'
        "
        :data-slot="sticker.slot"
        :data-oriented="isOriented(sticker.slot) ? 'true' : 'false'"
      />
    </template>
  </svg>
</template>

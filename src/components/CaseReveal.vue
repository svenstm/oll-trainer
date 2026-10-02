<script setup lang="ts">
import { computed } from 'vue'

import OllFace from './OllFace.vue'
import { rotatePattern } from '@/core/pattern'
import { ROTATIONS } from '@/core/scramble'
import { formatMs } from '@/core/time'
import { SOURCES, type OllCase, type Pattern, type SourceKey } from '@/core/types'

const props = defineProps<{
  ollCase: OllCase
  /** null for an "I don't know": there is no time, because nothing was timed. */
  ms: number | null
}>()

interface Alternative {
  alg: string
  source: SourceKey
  /**
   * The case as this algorithm expects to find it, or null when that is the
   * picture already on the left.
   */
  pattern: Pattern | null
  /** Named only for screen readers; sighted users get the picture. */
  turn: string
}

/**
 * Other sheets' algorithms, each with the picture it solves.
 *
 * Sheets do not agree on which way up to hold a case, and 21 of the 28
 * algorithms here are written for a different angle than ours. That used to
 * be a `y` in front of the algorithm; it is a second picture instead, because
 * what the turn is *for* is getting the cube to look like something, and a
 * picture says that directly.
 *
 * `quarterTurns` is the offset from this case's own angle, so
 * `ROTATIONS[quarterTurns]` is the turn that gets you there — an identity the
 * component tests check against the cube model rather than assert by algebra.
 */
const alternatives = computed<Alternative[]>(() =>
  props.ollCase.alternatives.map((alternative) => ({
    alg: alternative.alg,
    source: alternative.source,
    pattern:
      alternative.quarterTurns === 0
        ? null
        : rotatePattern(props.ollCase.pattern, alternative.quarterTurns),
    turn: ROTATIONS[alternative.quarterTurns] ?? '',
  })),
)
</script>

<template>
  <section
    class="rounded-tile border border-border bg-surface p-4"
    data-testid="case-reveal"
    aria-live="polite"
  >
    <p class="flex flex-wrap items-baseline gap-x-2">
      <span class="text-lg font-semibold">OLL {{ ollCase.id }}</span>
      <span class="text-lg">{{ ollCase.name }}</span>
      <span v-if="ms === null" class="text-lg font-medium text-danger" data-testid="didnt-know">
        Didn't know
      </span>
      <span v-else class="font-mono text-lg tabular-nums text-accent">{{ formatMs(ms) }}</span>
    </p>
    <p class="text-sm text-muted">{{ ollCase.group }}</p>

    <!--
      A row per algorithm, each against the picture it solves, and every row
      opening with a face column of the same width so the algorithms line up
      down the panel. Order is not what ties a picture to an algorithm here —
      being on the same row is.
    -->
    <div class="mt-3 flex items-center gap-4">
      <div class="w-20 shrink-0 sm:w-24">
        <!--
          The angle the canonical algorithm is written for, which is the angle
          the case is stored at. Not the angle it was just served from: an
          algorithm printed beside a picture it does not solve is the one
          thing this panel must never do, and a `y` in front of it asked the
          reader to do the rotation in their head instead.
        -->
        <OllFace
          :pattern="ollCase.pattern"
          :label="`OLL ${ollCase.id}, ${ollCase.name}`"
          data-testid="case-face"
        />
      </div>
      <p class="min-w-0 flex-1 font-mono text-sm" data-testid="solution">{{ ollCase.alg }}</p>
    </div>

    <div
      v-for="alternative in alternatives"
      :key="alternative.source"
      class="mt-3 flex items-center gap-4"
      data-testid="alternative"
    >
      <!--
        The column is kept even when there is no face to put in it, because
        what makes this readable is the algorithms starting at the same place.
        Seven of the 28 sheets' algorithms are written for our angle already
        and get no picture — repeating the one above would say "turn to this"
        where there is nothing to turn. With no face to hold it open the row
        collapses to the height of its text, so the empty column costs width
        and not height.
      -->
      <div class="w-20 shrink-0 sm:w-24">
        <OllFace
          v-if="alternative.pattern"
          :pattern="alternative.pattern"
          :label="`Hold the cube turned ${alternative.turn}`"
          data-testid="alternative-face"
        />
      </div>
      <!--
        Named after the algorithm, not before it, so the algorithms align —
        and muted, so it reads as someone else's answer rather than a second
        thing to learn: the row above is the one the scheduler measures. A
        name and no link — the original plan kept other people's sites out of this app,
        and a link inside the panel would be a navigation control in the one
        place the user is mid-solve. The URL is in SOURCES and the README.
      -->
      <p class="min-w-0 flex-1 text-sm text-muted">
        <span class="font-mono" data-testid="alternative-alg">{{ alternative.alg }}</span>
        <span class="ml-2 text-xs whitespace-nowrap" data-testid="alternative-source">{{
          SOURCES[alternative.source].name
        }}</span>
      </p>
    </div>
  </section>
</template>

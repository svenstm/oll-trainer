<script setup lang="ts">
import { RouterLink } from 'vue-router'

import OllFace from '@/components/OllFace.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import { CASES_BY_ID } from '@/core/data/cases'
import { GROUPED_CASES } from '@/core/groups'
import { MODES, type Mode } from '@/core/types'

/** OLL 27. The case the site is named after, so it is the one on the door. */
const SUNE = CASES_BY_ID.get(27)!

const MODE_BLURB: Record<Mode, string> = {
  train: 'Random cases from your selection.',
  recap: 'Every selected case, in turn.',
  learn: 'Adaptive: whatever you are closest to forgetting.',
}

/**
 * One face per shape group, derived rather than hand-picked, so this cannot
 * drift out of step with the case data.
 */
const GROUND = GROUPED_CASES.map((group) => ({
  name: group.name,
  count: group.cases.length,
  face: group.cases[0]!,
}))
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 py-6 sm:px-6">
    <header class="flex items-center justify-between gap-4">
      <span class="text-sm font-semibold tracking-[0.2em] uppercase">Sunetzu</span>
      <ThemeToggle />
    </header>

    <main>
      <!-- Hero -->
      <section class="pt-10 pb-12 sm:pt-16 sm:pb-16">
        <div class="flex flex-col items-start gap-8 sm:flex-row sm:items-center sm:gap-12">
          <!--
            The mark: Sune, boxed like a seal. The name is a Sune / Sun Tzu
            pun, so the case the pun rests on is the logo.
          -->
          <div
            class="w-28 shrink-0 rounded-tile border-2 border-accent bg-surface p-3 shadow-sm sm:w-36"
            aria-hidden="true"
          >
            <OllFace :pattern="SUNE.pattern" />
          </div>

          <div>
            <h1 class="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              The Art of the Last Layer
            </h1>
            <p class="mt-3 text-lg text-muted">57 cases. Know them all.</p>

            <div class="mt-7 flex flex-wrap items-center gap-3">
              <RouterLink
                :to="{ name: 'selection' }"
                class="rounded-lg bg-accent px-5 py-2.5 font-medium text-bg transition-opacity hover:opacity-90"
                data-testid="landing-cta"
              >
                Begin training
              </RouterLink>
              <span class="text-sm text-muted">Free, offline, no account.</span>
            </div>
          </div>
        </div>

        <p class="mt-12 border-l-2 border-border pl-4 text-lg text-muted italic">
          Know the case before you turn.
        </p>
      </section>

      <!-- What it is -->
      <section class="border-t border-border py-10">
        <h2 class="text-xl font-semibold tracking-tight">What you are learning</h2>
        <div class="mt-4 max-w-2xl space-y-3 text-muted">
          <p>
            <strong class="text-fg">Orientation of the Last Layer</strong> is the step where the top
            face becomes a single colour. Once the first two layers are done, there are exactly 57
            ways the last layer can be left oriented, and one algorithm for each.
          </p>
          <p>
            The turning is the easy part. Recognising which of the 57 is in front of you — before
            your hands stop moving — is the skill, and it is the only thing this app trains.
          </p>
        </div>
      </section>

      <!-- Modes -->
      <section class="border-t border-border py-10">
        <h2 class="text-xl font-semibold tracking-tight">Laying Plans</h2>
        <p class="mt-2 max-w-2xl text-muted">
          Choose your ground: one shape group, the handful you keep fumbling, or all 57. Then pick
          how you want to be tested.
        </p>

        <dl class="mt-6 grid gap-3 sm:grid-cols-3">
          <div v-for="mode in MODES" :key="mode" class="rounded-tile border border-border p-4">
            <dt class="font-medium capitalize">{{ mode }}</dt>
            <dd class="mt-0.5 text-sm text-muted">{{ MODE_BLURB[mode] }}</dd>
          </div>
        </dl>
      </section>

      <!-- Learn mode -->
      <section class="border-t border-border py-10">
        <h2 class="text-xl font-semibold tracking-tight">Weak Points and Strong</h2>
        <div class="mt-4 max-w-2xl space-y-3 text-muted">
          <p>
            Learn mode keeps a durable history of every solve and serves you the cases you are
            slowest and least certain on. It is not a fixed rotation — it decays with real time, so
            the schedule survives clearing your session and days away from the app.
          </p>
          <p>Your weak points are remembered, even when you would rather they were not.</p>
        </div>
        <p class="mt-6 border-l-2 border-border pl-4 text-muted italic">
          Supreme excellence is solving without thought.
        </p>
      </section>

      <!-- The 57, as terrain -->
      <section class="border-t border-border py-10">
        <h2 class="text-xl font-semibold tracking-tight">Know the Ground</h2>
        <p class="mt-2 max-w-2xl text-muted">
          The 57 fall into fourteen shapes. Learn to name the shape and you have already done most
          of the recognising.
        </p>

        <ul class="mt-6 grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-7">
          <li v-for="group in GROUND" :key="group.name" class="text-center">
            <div class="rounded-tile border border-border bg-surface p-2">
              <OllFace :pattern="group.face.pattern" :label="`${group.name}, for example`" />
            </div>
            <p class="mt-1.5 text-[0.7rem] leading-tight text-muted">
              {{ group.name }}
              <span class="tabular-nums opacity-70">({{ group.count }})</span>
            </p>
          </li>
        </ul>

        <p class="mt-8 border-l-2 border-border pl-4 text-muted italic">
          He who recognises the fish need not count the stickers.
        </p>
      </section>

      <!-- Practicalities -->
      <section class="border-t border-border py-10">
        <h2 class="text-xl font-semibold tracking-tight">Victory Complete</h2>
        <p class="mt-2 max-w-2xl text-muted">
          All 57, recognised on sight. That is the whole of it — there is nothing to unlock and
          nothing to buy.
        </p>

        <dl class="mt-6 grid gap-x-8 gap-y-4 text-sm sm:grid-cols-3">
          <div>
            <dt class="font-medium">Works offline</dt>
            <dd class="mt-0.5 text-muted">
              Install it and it runs with no network at all — on a train, at a competition.
            </dd>
          </div>
          <div>
            <dt class="font-medium">No account, no server</dt>
            <dd class="mt-0.5 text-muted">
              Your solves are stored in this browser and sent nowhere.
            </dd>
          </div>
          <div>
            <dt class="font-medium">Yours to take</dt>
            <dd class="mt-0.5 text-muted">
              Export your history to move it to another device, or to keep a copy.
            </dd>
          </div>
        </dl>

        <RouterLink
          :to="{ name: 'selection' }"
          class="mt-8 inline-block rounded-lg bg-accent px-5 py-2.5 font-medium text-bg transition-opacity hover:opacity-90"
        >
          Begin training
        </RouterLink>
      </section>
    </main>

    <footer class="border-t border-border py-8 text-sm text-muted">
      <p>
        The original OLL trainer, and the idea this rebuilds, are the work of
        <a
          class="underline decoration-border underline-offset-2 hover:decoration-fg"
          href="https://github.com/Roman-/oll_trainer"
          rel="noopener noreferrer"
          target="_blank"
          >Roman Strakhov</a
        >. This is an independent rewrite; none of its code, scramble data or images are used here.
      </p>
      <p class="mt-2">
        Open source, MIT licensed —
        <a
          class="underline decoration-border underline-offset-2 hover:decoration-fg"
          href="https://github.com/svenstm/oll-trainer"
          rel="noopener noreferrer"
          target="_blank"
          >svenstm/oll-trainer</a
        >.
      </p>
    </footer>
  </div>
</template>

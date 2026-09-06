<script setup lang="ts">
import { RouterLink } from 'vue-router'
import BackupControls from '@/components/BackupControls.vue'
import OllFace from '@/components/OllFace.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import { GROUPED_CASES } from '@/core/groups'
import { MODES, type Mode } from '@/core/types'
import { useSelectionStore } from '@/stores/selection'

const selection = useSelectionStore()

const MODE_BLURB: Record<Mode, string> = {
  train: 'Random cases from your selection.',
  recap: 'Every selected case, in turn.',
  learn: 'Adaptive: whatever you are closest to forgetting.',
}
</script>

<template>
  <main class="mx-auto max-w-5xl px-4 py-6 sm:px-6">
    <header class="flex items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold">OLL Trainer</h1>
      <ThemeToggle />
    </header>

    <div class="mt-4 flex flex-wrap items-center gap-2">
      <p class="mr-auto text-sm text-muted" data-testid="selection-count">
        <strong class="text-fg">{{ selection.count }}</strong> of {{ selection.total }} selected
      </p>
      <button
        type="button"
        class="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface"
        data-testid="select-all"
        @click="selection.selectAll()"
      >
        Select all
      </button>
      <button
        type="button"
        class="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface"
        data-testid="select-none"
        @click="selection.selectNone()"
      >
        Select none
      </button>
    </div>

    <nav class="mt-4 grid gap-2 sm:grid-cols-3" aria-label="Practice modes">
      <RouterLink
        v-for="mode in MODES"
        :key="mode"
        :to="{ name: 'practice', params: { mode } }"
        class="rounded-xl border border-border bg-surface p-3 transition-colors hover:border-accent aria-disabled:pointer-events-none aria-disabled:opacity-40"
        :aria-disabled="selection.isEmpty"
        :tabindex="selection.isEmpty ? -1 : undefined"
        :data-testid="`mode-${mode}`"
      >
        <span class="font-medium capitalize">{{ mode }}</span>
        <span class="mt-0.5 block text-sm text-muted">{{ MODE_BLURB[mode] }}</span>
      </RouterLink>
    </nav>
    <p v-if="selection.isEmpty" class="mt-2 text-sm text-danger" data-testid="empty-warning">
      Select at least one case to start practising.
    </p>

    <section v-for="group in GROUPED_CASES" :key="group.name" class="mt-6">
      <button
        type="button"
        class="flex w-full items-baseline gap-2 border-b border-border pb-1 text-left"
        :data-testid="`group-${group.name}`"
        :aria-pressed="selection.groupState(group.name) === 'all'"
        @click="selection.toggleGroup(group.name)"
      >
        <span class="font-medium">{{ group.name }}</span>
        <span class="text-sm text-muted">
          {{ group.cases.filter((c) => selection.has(c.id)).length }}/{{ group.cases.length }}
        </span>
        <span class="ml-auto text-xs text-muted">
          {{ selection.groupState(group.name) === 'all' ? 'Deselect group' : 'Select group' }}
        </span>
      </button>

      <ul class="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        <li v-for="ollCase in group.cases" :key="ollCase.id">
          <button
            type="button"
            class="w-full rounded-xl border-2 p-1.5 transition-colors"
            :class="
              selection.has(ollCase.id)
                ? 'border-accent bg-surface'
                : 'border-transparent bg-surface/40 opacity-50 hover:opacity-80'
            "
            :aria-pressed="selection.has(ollCase.id)"
            :data-testid="`case-${ollCase.id}`"
            @click="selection.toggle(ollCase.id)"
          >
            <OllFace :pattern="ollCase.pattern" :label="`OLL ${ollCase.id}, ${ollCase.name}`" />
            <span class="mt-1 block truncate text-xs text-muted">
              {{ ollCase.id }} · {{ ollCase.name }}
            </span>
          </button>
        </li>
      </ul>
    </section>
    <footer class="mt-10 border-t border-border pt-4">
      <h2 class="text-sm font-medium">Your data</h2>
      <p class="mt-1 mb-2 text-sm text-muted">
        Everything is stored in this browser only. Export it to move to another device, or to keep a
        copy — clearing your browser data would otherwise lose your history for good.
      </p>
      <BackupControls />
    </footer>
  </main>
</template>

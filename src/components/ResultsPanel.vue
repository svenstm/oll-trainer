<script setup lang="ts">
import { computed, ref } from 'vue'
import OllFace from './OllFace.vue'
import StrengthBar from './StrengthBar.vue'
import { CASES_BY_ID } from '@/core/data/cases'
import { formatMs, mean, statsFor } from '@/core/time'
import { isAtRisk, strength, type ArtsConfig, type ArtsModel } from '@/core/arts'
import type { Mode, Solve } from '@/core/types'

const props = defineProps<{
  /** Solves since the session marker, oldest first. */
  sessionSolves: readonly Solve[]
  /** The whole durable history, oldest first. The Cases tab reads this one. */
  allSolves: readonly Solve[]
  mode: Mode
  artsModel?: ArtsModel | null
  artsConfig?: ArtsConfig
}>()

const emit = defineEmits<{ delete: [id: string] }>()

type Tab = 'session' | 'cases'
const tab = ref<Tab>('session')

const stats = computed(() => statsFor(props.sessionSolves))
/** Newest first: the solve you just did is the one you want to see. */
const recent = computed(() => [...props.sessionSolves].reverse())

interface CaseRow {
  id: number
  name: string
  count: number
  mean: number | null
  best: number | null
}

/**
 * Per case over the durable history, not the session — this is the view that
 * answers "how am I doing on this case", which outlives one sitting.
 */
const caseRows = computed<CaseRow[]>(() => {
  const byCase = new Map<number, number[]>()
  for (const solve of props.allSolves) {
    const list = byCase.get(solve.caseId)
    if (list) list.push(solve.ms)
    else byCase.set(solve.caseId, [solve.ms])
  }
  return [...byCase.entries()]
    .map(([id, times]) => ({
      id,
      name: CASES_BY_ID.get(id)?.name ?? `OLL ${id}`,
      count: times.length,
      mean: mean(times),
      best: times.length > 0 ? Math.min(...times) : null,
    }))
    .sort((a, b) => (b.mean ?? 0) - (a.mean ?? 0))
})

const SUMMARY = [
  ['solves', (s: ReturnType<typeof statsFor>) => String(s.count)],
  ['mean', (s: ReturnType<typeof statsFor>) => (s.mean === null ? '—' : formatMs(s.mean))],
  ['best', (s: ReturnType<typeof statsFor>) => (s.best === null ? '—' : formatMs(s.best))],
  ['worst', (s: ReturnType<typeof statsFor>) => (s.worst === null ? '—' : formatMs(s.worst))],
  ['ao5', (s: ReturnType<typeof statsFor>) => (s.ao5 === null ? '—' : formatMs(s.ao5))],
  ['ao12', (s: ReturnType<typeof statsFor>) => (s.ao12 === null ? '—' : formatMs(s.ao12))],
] as const
</script>

<template>
  <section class="rounded-xl border border-border bg-surface">
    <div class="flex gap-1 border-b border-border p-1" role="tablist">
      <button
        v-for="name in ['session', 'cases'] as const"
        :key="name"
        type="button"
        role="tab"
        :aria-selected="tab === name"
        :data-testid="`tab-${name}`"
        class="flex-1 rounded-lg px-3 py-1.5 text-sm capitalize"
        :class="tab === name ? 'bg-bg font-medium' : 'text-muted hover:text-fg'"
        @click="tab = name"
      >
        {{ name }}
      </button>
    </div>

    <div v-if="tab === 'session'" role="tabpanel" data-testid="panel-session">
      <dl class="grid grid-cols-3 gap-px border-b border-border bg-border sm:grid-cols-6">
        <div v-for="[label, value] in SUMMARY" :key="label" class="bg-surface px-3 py-2">
          <dt class="text-xs text-muted">{{ label }}</dt>
          <dd class="font-mono text-sm tabular-nums">{{ value(stats) }}</dd>
        </div>
      </dl>

      <p v-if="recent.length === 0" class="p-4 text-sm text-muted">
        Nothing solved this session yet.
      </p>
      <ol v-else class="max-h-72 overflow-y-auto">
        <li
          v-for="(solve, index) in recent"
          :key="solve.id"
          class="group flex items-center gap-3 px-3 py-1.5 text-sm odd:bg-bg/40"
        >
          <span class="w-6 text-right text-xs text-muted tabular-nums">
            {{ recent.length - index }}
          </span>
          <span class="font-mono tabular-nums">{{ formatMs(solve.ms) }}</span>
          <span class="min-w-0 flex-1 truncate text-muted">
            OLL {{ solve.caseId }} · {{ CASES_BY_ID.get(solve.caseId)?.name }}
          </span>
          <button
            type="button"
            class="rounded px-1.5 text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-danger"
            :aria-label="`Delete solve ${formatMs(solve.ms)}`"
            :data-testid="`delete-${solve.id}`"
            @click="emit('delete', solve.id)"
          >
            ×
          </button>
        </li>
      </ol>
    </div>

    <div v-else role="tabpanel" data-testid="panel-cases">
      <p v-if="caseRows.length === 0" class="p-4 text-sm text-muted">No cases solved yet.</p>
      <table v-else class="w-full text-sm">
        <caption class="px-3 pt-2 text-left text-xs text-muted">
          All time, slowest first
        </caption>
        <tbody>
          <tr v-for="row in caseRows" :key="row.id" class="odd:bg-bg/40">
            <td class="w-9 py-1.5 pl-3">
              <div class="w-7">
                <OllFace :pattern="CASES_BY_ID.get(row.id)!.pattern" />
              </div>
            </td>
            <td class="py-1.5 pr-2">
              <span class="text-muted">OLL {{ row.id }}</span>
              <span class="ml-1.5">{{ row.name }}</span>
            </td>
            <td class="py-1.5 pr-2 text-right tabular-nums text-muted">{{ row.count }}x</td>
            <td class="py-1.5 pr-2 text-right font-mono tabular-nums">
              {{ row.mean === null ? '—' : formatMs(row.mean) }}
            </td>
            <td v-if="mode === 'learn'" class="py-1.5 pr-3 text-right">
              <StrengthBar
                v-if="artsModel"
                :value="strength(artsModel, row.id, artsConfig)"
                :at-risk="isAtRisk(artsModel, row.id, artsConfig)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

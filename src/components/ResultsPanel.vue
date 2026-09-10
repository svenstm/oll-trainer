<script setup lang="ts">
import { computed, ref } from 'vue'
import OllFace from './OllFace.vue'
import Sparkline from './Sparkline.vue'
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
  /** Timed solves. */
  count: number
  /** Attempts that ended in "I don't know". */
  blanks: number
  mean: number | null
  best: number | null
  /** Chronological, for the sparkline. */
  times: number[]
}

/**
 * Per case over the durable history, not the session — this is the view that
 * answers "how am I doing on this case", which outlives one sitting.
 */
const caseRows = computed<CaseRow[]>(() => {
  const byCase = new Map<number, { times: number[]; blanks: number }>()
  for (const solve of props.allSolves) {
    let row = byCase.get(solve.caseId)
    if (!row) {
      row = { times: [], blanks: 0 }
      byCase.set(solve.caseId, row)
    }
    // A blank is counted but has no time, so it stays out of the mean, the best
    // and the sparkline — every one of which would otherwise read a failure as
    // an improvement.
    if (solve.outcome === 'unknown') row.blanks++
    else row.times.push(solve.ms)
  }
  return [...byCase.entries()]
    .map(([id, { times, blanks }]) => ({
      id,
      name: CASES_BY_ID.get(id)?.name ?? `OLL ${id}`,
      count: times.length,
      blanks,
      mean: mean(times),
      best: times.length > 0 ? Math.min(...times) : null,
      times,
    }))
    .sort((a, b) => {
      // A case you have blanked on and never once solved belongs above the
      // merely slow ones, not below them with a mean of nothing.
      if ((a.mean === null) !== (b.mean === null)) return a.mean === null ? -1 : 1
      return (b.mean ?? 0) - (a.mean ?? 0)
    })
})

/** What the delete button should call this row, blank or not. */
function attemptLabel(solve: Solve): string {
  return solve.outcome === 'unknown' ? 'the blank' : `solve ${formatMs(solve.ms)}`
}

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
  <section class="rounded-tile border border-border bg-surface">
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
          <!--
            Only the solves tile carries a second line, so the 3-then-6 column
            grid keeps its shape rather than growing a ragged seventh cell.
          -->
          <dd
            v-if="label === 'solves' && stats.blanks > 0"
            class="text-xs text-danger"
            data-testid="blank-count"
          >
            {{ stats.blanks }} blanked
          </dd>
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
          <span
            v-if="solve.outcome === 'unknown'"
            class="font-mono text-danger"
            data-testid="blank-time"
          >
            <span aria-hidden="true">&mdash;</span>
            <span class="sr-only">Didn't know</span>
          </span>
          <span v-else class="font-mono tabular-nums">{{ formatMs(solve.ms) }}</span>
          <span class="min-w-0 flex-1 truncate text-muted">
            OLL {{ solve.caseId }} · {{ CASES_BY_ID.get(solve.caseId)?.name }}
          </span>
          <button
            type="button"
            class="rounded px-1.5 text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-danger"
            :aria-label="`Delete ${attemptLabel(solve)} for OLL ${solve.caseId}`"
            :data-testid="`delete-${solve.id}`"
            @click="emit('delete', solve.id)"
          >
            ×
          </button>
        </li>
      </ol>
    </div>

    <div v-else role="tabpanel" class="max-h-96 overflow-y-auto" data-testid="panel-cases">
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
            <td class="py-1.5 pr-2 text-right tabular-nums text-muted">
              {{ row.count }}x<span
                v-if="row.blanks > 0"
                class="ml-1 text-danger"
                title="Times you did not know this case"
                :data-testid="`blanks-${row.id}`"
                >{{ `· ${row.blanks}?` }}</span
              >
            </td>
            <td class="py-1.5 pr-2 text-right font-mono tabular-nums">
              {{ row.mean === null ? '—' : formatMs(row.mean) }}
            </td>
            <td class="py-1.5 pr-2 text-right text-muted">
              <Sparkline :values="row.times" />
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

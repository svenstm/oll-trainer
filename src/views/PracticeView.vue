<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'

import BackupControls from '@/components/BackupControls.vue'
import CaseReveal from '@/components/CaseReveal.vue'
import ResultsPanel from '@/components/ResultsPanel.vue'
import ScrambleLine from '@/components/ScrambleLine.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import TimerDisplay from '@/components/TimerDisplay.vue'
import UndoToast from '@/components/UndoToast.vue'
import { useTimer } from '@/composables/useTimer'
import { buildModel, learnStatus, pickNext, pickRotation } from '@/core/arts'
import { applyMoves, SOLVED } from '@/core/cube'
import { CASES_BY_ID } from '@/core/data/cases'
import { patternFromCube } from '@/core/pattern'
import { pickScramble, type PickedScramble } from '@/core/scramble'
import { formatMs } from '@/core/time'
import { LIMITS, useSettingsStore } from '@/stores/settings'
import { useSelectionStore } from '@/stores/selection'
import { useSolvesStore } from '@/stores/solves'
import type { Mode, Pattern, Solve } from '@/core/types'

const props = defineProps<{ mode: Mode }>()

const router = useRouter()
const settings = useSettingsStore()
const selection = useSelectionStore()
const solves = useSolvesStore()

const current = ref<PickedScramble | null>(null)
const revealed = ref<{ caseId: number; ms: number; pattern: Pattern } | null>(null)
const showSettings = ref(false)
/** Where recap has got to. Deliberately not persisted; a session starts fresh. */
let recapIndex = -1

/**
 * The ARTS model is a fold over the whole durable history, so it is rebuilt
 * whenever that history changes rather than on every render.
 */
const artsModel = computed(() =>
  props.mode === 'learn' ? buildModel(solves.solves, Date.now(), settings.artsConfig) : null,
)

const status = computed(() =>
  artsModel.value ? learnStatus(artsModel.value, selection.ids, settings.artsConfig) : null,
)

const revealedCase = computed(() =>
  revealed.value ? (CASES_BY_ID.get(revealed.value.caseId) ?? null) : null,
)

function chooseCase(): number | null {
  const ids = selection.ids
  if (ids.length === 0) return null
  if (props.mode === 'recap') {
    recapIndex = (recapIndex + 1) % ids.length
    return ids[recapIndex] ?? null
  }
  if (props.mode === 'learn') {
    const model = buildModel(solves.solves, Date.now(), settings.artsConfig)
    return pickNext(model, ids, Math.random, settings.artsConfig)
  }
  return ids[Math.floor(Math.random() * ids.length)] ?? null
}

function drawNext(): void {
  const caseId = chooseCase()
  if (caseId === null) {
    current.value = null
    return
  }
  // Learn mode chooses the angle too, so recognition coverage stays even.
  const rotation =
    props.mode === 'learn' ? pickRotation(caseId, solves.solves, Math.random) : undefined
  current.value = pickScramble(caseId, Math.random, rotation)
}

function onSolve(ms: number): void {
  const picked = current.value
  if (!picked) return
  solves.record({
    caseId: picked.caseId,
    ms,
    scramble: picked.scramble,
    rotation: picked.rotation,
    ts: Date.now(),
    mode: props.mode,
  })
  revealed.value = {
    caseId: picked.caseId,
    ms,
    pattern: patternFromCube(applyMoves(SOLVED, picked.scramble)),
  }
  drawNext()
}

/**
 * Deleting is undoable rather than confirmed: a dialog on every delete would
 * be in the way, and a mis-hit Delete during a session is easy to do.
 */
const undoable = ref<Solve | null>(null)
const undoText = computed(() =>
  undoable.value ? `Deleted ${formatMs(undoable.value.ms)} — OLL ${undoable.value.caseId}` : null,
)
let undoTimer: ReturnType<typeof setTimeout> | undefined

function offerUndo(solve: Solve | null): void {
  if (!solve) return
  undoable.value = solve
  clearTimeout(undoTimer)
  undoTimer = setTimeout(() => (undoable.value = null), 8000)
}

function undoDelete(): void {
  if (undoable.value) solves.insert(undoable.value)
  undoable.value = null
  clearTimeout(undoTimer)
}

onBeforeUnmount(() => clearTimeout(undoTimer))

function onShortcut(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    showSettings.value = false
    revealed.value = null
    return
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    if (event.shiftKey) {
      solves.clearSession()
      return
    }
    const removed = solves.removeLast()
    if (removed) {
      revealed.value = null
      offerUndo(removed)
    }
    return
  }
  // Drop the case that was just revealed out of the selection, without
  // leaving the timer.
  if (event.key.toLowerCase() === 'u' && revealed.value) {
    selection.toggle(revealed.value.caseId)
    revealed.value = null
    if (selection.isEmpty) router.push({ name: 'selection' })
    else drawNext()
  }
}

// Destructured, because refs nested inside an object are not unwrapped in the
// template the way top-level setup bindings are.
const { phase, displayMs, armed, touchHandlers } = useTimer({
  holdMs: computed(() => settings.holdMs),
  onSolve,
  onShortcut,
})

/**
 * Two clicks rather than a `confirm()` dialog, which the plan rules out. The
 * armed state falls away as soon as the settings panel closes.
 */
const resetArmed = ref(false)
function resetProgress(): void {
  if (!resetArmed.value) {
    resetArmed.value = true
    return
  }
  solves.resetProgress()
  resetArmed.value = false
}
watch(showSettings, () => (resetArmed.value = false))

onMounted(() => {
  solves.ensureSession()
  drawNext()
})

// Leaving with nothing selected would leave the timer with nothing to serve.
watch(
  () => selection.isEmpty,
  (empty) => {
    if (empty) router.push({ name: 'selection' })
  },
)
</script>

<template>
  <main
    class="mx-auto flex min-h-full max-w-5xl flex-col gap-5 px-4 py-4 sm:px-6"
    v-on="touchHandlers"
  >
    <header class="flex flex-wrap items-center gap-3">
      <RouterLink
        :to="{ name: 'selection' }"
        class="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface"
        data-testid="back"
      >
        ← Cases
      </RouterLink>
      <h1 class="text-sm font-medium capitalize">{{ mode }}</h1>
      <p v-if="status" class="text-sm text-muted" data-testid="learn-status">
        {{ status.introduced }} / {{ status.total }} introduced
        <template v-if="status.atRisk > 0"> · {{ status.atRisk }} at risk</template>
        <template v-else-if="status.introduced === status.total"> · all strong</template>
      </p>
      <div class="ml-auto flex items-center gap-2">
        <button
          type="button"
          class="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface"
          :aria-expanded="showSettings"
          data-testid="settings-toggle"
          @click="showSettings = !showSettings"
        >
          Settings
        </button>
        <ThemeToggle />
      </div>
    </header>

    <section
      v-if="showSettings"
      class="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2"
      data-testid="settings"
    >
      <label class="text-sm">
        Timer size
        <input
          type="range"
          class="mt-1 w-full"
          :min="LIMITS.timerSize.min"
          :max="LIMITS.timerSize.max"
          :step="LIMITS.timerSize.step"
          :value="settings.timerSize"
          @input="settings.update({ timerSize: Number(($event.target as HTMLInputElement).value) })"
        />
      </label>
      <label class="text-sm">
        Scramble size
        <input
          type="range"
          class="mt-1 w-full"
          :min="LIMITS.scrambleSize.min"
          :max="LIMITS.scrambleSize.max"
          :step="LIMITS.scrambleSize.step"
          :value="settings.scrambleSize"
          @input="
            settings.update({ scrambleSize: Number(($event.target as HTMLInputElement).value) })
          "
        />
      </label>
      <label class="text-sm">
        Hold before start — {{ settings.holdMs }}ms
        <input
          type="range"
          class="mt-1 w-full"
          :min="LIMITS.holdMs.min"
          :max="LIMITS.holdMs.max"
          :step="LIMITS.holdMs.step"
          :value="settings.holdMs"
          @input="settings.update({ holdMs: Number(($event.target as HTMLInputElement).value) })"
        />
      </label>
      <label v-if="mode === 'learn'" class="text-sm">
        Introduce new cases: gentle ↔ eager
        <input
          type="range"
          class="mt-1 w-full"
          min="0"
          max="100"
          step="1"
          :value="Math.round(((settings.tau - -0.4) / (-1.4 - -0.4)) * 100)"
          data-testid="tau"
          @input="
            settings.update({
              tau: -0.4 + (Number(($event.target as HTMLInputElement).value) / 100) * (-1.4 - -0.4),
            })
          "
        />
      </label>
      <div class="sm:col-span-2">
        <BackupControls />
      </div>
      <div class="flex flex-wrap gap-2 sm:col-span-2">
        <button
          type="button"
          class="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface"
          data-testid="clear-session"
          @click="solves.clearSession()"
        >
          Clear session
        </button>
        <!-- Deliberately separated from Clear session: this one is the one
             that throws the learn-mode memory model away. -->
        <button
          type="button"
          class="ml-auto rounded-lg border border-danger px-3 py-1.5 text-sm text-danger hover:bg-danger/10"
          :disabled="solves.count === 0"
          data-testid="reset-progress"
          @click="resetProgress()"
        >
          {{ resetArmed ? `Really delete all ${solves.count} solves?` : 'Reset all progress' }}
        </button>
      </div>
    </section>

    <ScrambleLine
      v-if="current"
      :scramble="current.scramble"
      :size="settings.scrambleSize"
      class="text-center"
    />

    <div class="flex flex-col items-center justify-center gap-2 py-6">
      <TimerDisplay :ms="displayMs" :phase="phase" :size="settings.timerSize" />
      <p class="h-5 text-sm text-muted">
        <template v-if="phase === 'idle'">
          Hold space (or touch) to get ready, release to start.
        </template>
        <template v-else-if="phase === 'holding'">Keep holding…</template>
        <template v-else-if="armed">Release to start.</template>
      </p>
    </div>

    <CaseReveal
      v-if="revealed && revealedCase"
      :oll-case="revealedCase"
      :ms="revealed.ms"
      :pattern="revealed.pattern"
    />

    <ResultsPanel
      :session-solves="solves.sessionSolves"
      :all-solves="solves.solves"
      :mode="mode"
      :arts-model="artsModel"
      :arts-config="settings.artsConfig"
      @delete="offerUndo(solves.remove($event))"
    />

    <UndoToast :text="undoText" @undo="undoDelete()" @dismiss="undoable = null" />
  </main>
</template>

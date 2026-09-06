<script setup lang="ts">
import { ref } from 'vue'
import {
  BackupError,
  backupFilename,
  countNewSolves,
  createBackup,
  mergeSolves,
  parseBackup,
  serialiseBackup,
} from '@/core/backup'
import { useSelectionStore } from '@/stores/selection'
import { useSettingsStore } from '@/stores/settings'
import { useSolvesStore } from '@/stores/solves'

const solves = useSolvesStore()
const selection = useSelectionStore()
const settings = useSettingsStore()

const fileInput = ref<HTMLInputElement | null>(null)
const message = ref<{ kind: 'ok' | 'error'; text: string } | null>(null)

function exportBackup(): void {
  const backup = createBackup(
    { solves: solves.solves, selection: selection.ids, settings: settings.settings },
    Date.now(),
  )
  const url = URL.createObjectURL(new Blob([serialiseBackup(backup)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = backupFilename(new Date())
  link.click()
  URL.revokeObjectURL(url)
  message.value = {
    kind: 'ok',
    text: `Saved ${backup.solves.length} solve${backup.solves.length === 1 ? '' : 's'}.`,
  }
}

async function importBackup(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // Cleared straight away, so picking the same file twice still fires a change.
  input.value = ''
  if (!file) return

  try {
    const backup = parseBackup(await file.text())
    const added = countNewSolves(solves.solves, backup.solves)
    solves.replaceAll(mergeSolves(solves.solves, backup.solves))
    if (backup.selection.length > 0) selection.set(backup.selection)
    settings.update(backup.settings)
    message.value = {
      kind: 'ok',
      text:
        added === 0
          ? 'Already up to date — nothing new in that backup.'
          : `Added ${added} solve${added === 1 ? '' : 's'}.`,
    }
  } catch (error) {
    message.value = {
      kind: 'error',
      text: error instanceof BackupError ? error.message : 'That file could not be read.',
    }
  }
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <button
      type="button"
      class="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface"
      data-testid="export-backup"
      @click="exportBackup()"
    >
      Export data
    </button>
    <button
      type="button"
      class="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface"
      data-testid="import-backup"
      @click="fileInput?.click()"
    >
      Import data
    </button>
    <input
      ref="fileInput"
      type="file"
      accept="application/json,.json"
      class="sr-only"
      data-testid="import-file"
      @change="importBackup($event)"
    />
    <p
      v-if="message"
      class="text-sm"
      :class="message.kind === 'error' ? 'text-danger' : 'text-muted'"
      role="status"
      data-testid="backup-message"
    >
      {{ message.text }}
    </p>
  </div>
</template>

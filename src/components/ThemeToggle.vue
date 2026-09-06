<script setup lang="ts">
import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import type { Theme } from '@/core/types'

const settings = useSettingsStore()

const ORDER: readonly Theme[] = ['system', 'light', 'dark']
const LABELS: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' }
const ICONS: Record<Theme, string> = { system: '◐', light: '☀', dark: '☾' }

const next = computed(() => ORDER[(ORDER.indexOf(settings.theme) + 1) % ORDER.length]!)
</script>

<template>
  <button
    type="button"
    class="rounded-lg border border-border px-2.5 py-1.5 text-sm hover:bg-surface"
    :title="`Theme: ${LABELS[settings.theme]}. Switch to ${LABELS[next]}.`"
    :aria-label="`Theme: ${LABELS[settings.theme]}. Switch to ${LABELS[next]}.`"
    data-testid="theme-toggle"
    @click="settings.update({ theme: next })"
  >
    <span aria-hidden="true">{{ ICONS[settings.theme] }}</span>
    <span class="ml-1.5 hidden sm:inline">{{ LABELS[settings.theme] }}</span>
  </button>
</template>

<script setup lang="ts">
import { watchEffect } from 'vue'
import { RouterView } from 'vue-router'
import { useSettingsStore } from '@/stores/settings'

const settings = useSettingsStore()

/**
 * "system" means *no* attribute, so the media query in main.css decides. The
 * inline script in index.html does the same thing before first paint.
 */
watchEffect(() => {
  const root = document.documentElement
  if (settings.theme === 'system') delete root.dataset.theme
  else root.dataset.theme = settings.theme
})
</script>

<template>
  <RouterView />
</template>

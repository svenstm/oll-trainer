<script setup lang="ts">
defineProps<{ text: string | null }>()
const emit = defineEmits<{ undo: []; dismiss: [] }>()
</script>

<template>
  <Transition
    enter-active-class="transition duration-150 ease-out"
    enter-from-class="translate-y-3 opacity-0"
    leave-active-class="transition duration-150 ease-in"
    leave-to-class="translate-y-3 opacity-0"
  >
    <div
      v-if="text"
      class="fixed inset-x-0 bottom-4 z-50 mx-auto flex w-fit items-center gap-3 rounded-full border border-border bg-surface px-4 py-2 shadow-lg"
      role="status"
      data-testid="undo-toast"
    >
      <span class="text-sm">{{ text }}</span>
      <button
        type="button"
        class="rounded-full px-2 py-0.5 text-sm font-medium text-accent hover:underline"
        data-testid="undo"
        @click="emit('undo')"
      >
        Undo
      </button>
      <button
        type="button"
        class="rounded-full px-1 text-muted hover:text-fg"
        aria-label="Dismiss"
        data-testid="dismiss-toast"
        @click="emit('dismiss')"
      >
        ×
      </button>
    </div>
  </Transition>
</template>

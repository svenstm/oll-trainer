<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { COLOURS, frontColours, type Colour } from '@/core/grip'
import { normaliseMac, useCubeStore } from '@/stores/cube'
import { useSettingsStore } from '@/stores/settings'

const cube = useCubeStore()
const settings = useSettingsStore()

const grip = computed(() => settings.settings.grip)
const fronts = computed(() => frontColours(grip.value.top))

function setTop(top: Colour): void {
  // Keep the front colour if it still fits, otherwise take the first that does.
  const options = frontColours(top)
  const front = options.includes(grip.value.front) ? grip.value.front : options[0]!
  settings.update({ grip: { top, front } })
}

function setFront(front: Colour): void {
  settings.update({ grip: { top: grip.value.top, front } })
}

const macInput = ref('')
const macValid = computed(() => normaliseMac(macInput.value) !== null)
watch(
  () => cube.macRequest,
  () => (macInput.value = ''),
)

const label = (colour: Colour) => colour[0]!.toUpperCase() + colour.slice(1)
</script>

<template>
  <section
    class="grid gap-3 rounded-tile border border-border bg-surface p-4 text-sm"
    data-testid="cube-panel"
  >
    <p v-if="cube.status === 'unsupported'" data-testid="cube-unsupported">
      Smart cubes connect over Web Bluetooth, which this browser does not have. Use Chrome on
      Android or on a computer — it is not available on iPhone or iPad.
    </p>

    <template v-else>
      <!-- The library asks for this only once it has failed to read it itself. -->
      <form
        v-if="cube.macRequest"
        class="grid gap-2"
        data-testid="cube-mac"
        @submit.prevent="cube.provideMac(macInput)"
      >
        <p>
          The browser could not read the address of <strong>{{ cube.macRequest.deviceName }}</strong
          >, which the cube needs to talk to the app. It only has to be entered once.
        </p>
        <ul class="list-disc pl-5 text-muted">
          <li>
            On Android or Windows, open <code>chrome://bluetooth-internals/#devices</code> in Chrome
            and start a scan: it is in the Address column next to the cube's name.
          </li>
          <li>On a Mac, hold Option and click the Bluetooth icon in the menu bar.</li>
          <li>On any phone, the free nRF Connect app lists it under the cube's name.</li>
        </ul>
        <label>
          MAC address
          <input
            v-model="macInput"
            class="mt-1 block w-full rounded-lg border border-border bg-bg px-3 py-1.5 font-mono"
            placeholder="AA:BB:CC:DD:EE:FF"
            autocomplete="off"
            spellcheck="false"
            data-testid="cube-mac-input"
          />
        </label>
        <div class="flex gap-2">
          <button
            type="submit"
            class="rounded-lg border border-accent bg-accent/10 px-3 py-1.5 text-accent hover:bg-accent/20 disabled:opacity-50"
            :disabled="!macValid"
          >
            Connect
          </button>
          <button
            type="button"
            class="rounded-lg border border-border px-3 py-1.5 hover:bg-bg"
            @click="cube.provideMac(null)"
          >
            Cancel
          </button>
        </div>
      </form>

      <div v-else class="flex flex-wrap items-center gap-2">
        <template v-if="cube.connected">
          <p class="mr-auto" data-testid="cube-status">
            {{ cube.deviceName }}
            <span v-if="cube.battery !== null" class="text-muted">· {{ cube.battery }}%</span>
          </p>
          <button
            type="button"
            class="rounded-lg border border-border px-3 py-1.5 hover:bg-bg"
            title="Tell the cube it is solved, if what it reports has drifted from what it shows"
            data-testid="cube-mark-solved"
            @click="cube.markSolved()"
          >
            Mark solved
          </button>
          <button
            type="button"
            class="rounded-lg border border-border px-3 py-1.5 hover:bg-bg"
            data-testid="cube-disconnect"
            @click="cube.disconnect()"
          >
            Disconnect
          </button>
        </template>
        <template v-else>
          <p class="mr-auto text-muted">
            Connect a GAN smart cube, and it starts and stops the timer itself.
          </p>
          <button
            type="button"
            class="rounded-lg border border-accent bg-accent/10 px-3 py-1.5 text-accent hover:bg-accent/20 disabled:opacity-50"
            :disabled="cube.status === 'connecting'"
            data-testid="cube-connect"
            @click="cube.connect()"
          >
            {{ cube.status === 'connecting' ? 'Connecting…' : 'Connect cube' }}
          </button>
        </template>
      </div>
      <p v-if="cube.error" class="text-danger" data-testid="cube-error">
        Could not connect: {{ cube.error }}
      </p>

      <fieldset class="flex flex-wrap items-center gap-3">
        <legend class="mb-1">How you hold it</legend>
        <label>
          Top
          <select
            class="ml-1 rounded-lg border border-border bg-bg px-2 py-1"
            :value="grip.top"
            data-testid="grip-top"
            @change="setTop(($event.target as HTMLSelectElement).value as Colour)"
          >
            <option v-for="colour in COLOURS" :key="colour" :value="colour">
              {{ label(colour) }}
            </option>
          </select>
        </label>
        <label>
          Front
          <select
            class="ml-1 rounded-lg border border-border bg-bg px-2 py-1"
            :value="grip.front"
            data-testid="grip-front"
            @change="setFront(($event.target as HTMLSelectElement).value as Colour)"
          >
            <option v-for="colour in fronts" :key="colour" :value="colour">
              {{ label(colour) }}
            </option>
          </select>
        </label>
      </fieldset>
    </template>
  </section>
</template>

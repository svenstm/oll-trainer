import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { GanCubeConnection, GanCubeEvent } from 'gan-web-bluetooth'

import { applyMove, parseMove, SOLVED, type Cube, type Move } from '@/core/cube'
import { moveToGripFrame, parseFacelets, toGripFrame } from '@/core/grip'
import { isRecord, persistedRef } from './persist'
import { useSettingsStore } from './settings'

export type CubeStatus = 'unsupported' | 'disconnected' | 'connecting' | 'connected'

/**
 * What a listener hears. A `turn` is one move, already in the user's grip
 * frame. A `resync` is the whole state replaced — on connecting, on marking
 * solved — with no move to explain it.
 */
export type CubeSignal =
  { type: 'turn'; cube: Cube; move: Move; at: number } | { type: 'resync'; cube: Cube }

const MAC = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/

export function normaliseMac(raw: string): string | null {
  const mac = raw.trim().toUpperCase().replace(/-/g, ':')
  return MAC.test(mac) ? mac : null
}

/** Device name → MAC. Per device, so a second cube is not handed the first one's key. */
function parseMacs(raw: unknown): Record<string, string> | null {
  if (!isRecord(raw)) return null
  const out: Record<string, string> = {}
  for (const [name, mac] of Object.entries(raw)) {
    const valid = typeof mac === 'string' ? normaliseMac(mac) : null
    if (valid) out[name] = valid
  }
  return out
}

export const isBluetoothSupported = (): boolean =>
  typeof navigator !== 'undefined' && 'bluetooth' in navigator

/**
 * The smart-cube connection. A store rather than a composable so it outlives
 * the practice view: switching mode remounts the view, and reconnecting means
 * another trip through the browser's device picker.
 */
export const useCubeStore = defineStore('cube', () => {
  const settings = useSettingsStore()

  const status = ref<CubeStatus>(isBluetoothSupported() ? 'disconnected' : 'unsupported')
  const deviceName = ref<string | null>(null)
  const battery = ref<number | null>(null)
  const error = ref<string | null>(null)
  /** In the cube's own frame, so changing grip needs no reconnect. */
  const raw = shallowRef<Cube | null>(null)

  const cube = computed(() => (raw.value ? toGripFrame(raw.value, settings.settings.grip) : null))
  const connected = computed(() => status.value === 'connected')

  const macs = persistedRef<Record<string, string>>('cubeMacs', {}, parseMacs)
  /** Set while the library is waiting for the user to type a MAC. */
  const macRequest = ref<{ deviceName: string } | null>(null)
  let answerMac: ((mac: string | null) => void) | null = null
  let lastDeviceName: string | null = null

  let connection: GanCubeConnection | null = null
  let unsubscribe: (() => void) | null = null
  const listeners = new Set<(signal: CubeSignal) => void>()

  function emit(signal: CubeSignal): void {
    for (const listener of listeners) listener(signal)
  }

  function listen(listener: (signal: CubeSignal) => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  function askForMac(name: string): Promise<string | null> {
    macRequest.value = { deviceName: name }
    return new Promise((resolve) => (answerMac = resolve))
  }

  /** The answer to `macRequest`; null cancels the connection. */
  function provideMac(mac: string | null): void {
    macRequest.value = null
    answerMac?.(mac === null ? null : normaliseMac(mac))
    answerMac = null
  }

  function onEvent(event: GanCubeEvent): void {
    switch (event.type) {
      case 'FACELETS': {
        const parsed = parseFacelets(event.facelets)
        // The cube sends its state on request, and also whenever it thinks the
        // two of us disagree. Only a change is worth telling anyone about.
        if (parsed && (!raw.value || parsed.join('') !== raw.value.join(''))) {
          raw.value = parsed
          emit({ type: 'resync', cube: cube.value! })
        }
        break
      }
      case 'MOVE': {
        // Until the first state arrives there is nothing to apply a move to.
        if (!raw.value) break
        const move = parseMove(event.move)
        raw.value = applyMove(raw.value, move)
        emit({
          type: 'turn',
          cube: cube.value!,
          move: moveToGripFrame(move, settings.settings.grip),
          // Null for a move recovered after a missed packet: it happened, but
          // nobody knows exactly when, so now is the least wrong answer.
          at: event.localTimestamp ?? Math.floor(performance.now()),
        })
        break
      }
      case 'BATTERY':
        battery.value = event.batteryLevel
        break
      case 'DISCONNECT':
        cleanUp()
        break
    }
  }

  function cleanUp(): void {
    unsubscribe?.()
    unsubscribe = null
    connection = null
    raw.value = null
    battery.value = null
    if (status.value !== 'unsupported') status.value = 'disconnected'
  }

  async function connect(): Promise<void> {
    if (status.value !== 'disconnected') return
    status.value = 'connecting'
    error.value = null
    try {
      // Loaded on demand: most visits never connect a cube, and the
      // encryption it needs is most of its weight.
      const { connectGanCube } = await import('gan-web-bluetooth')
      const conn = await connectGanCube(async (device, isFallbackCall) => {
        lastDeviceName = device.name ?? null
        const saved = lastDeviceName ? macs.value[lastDeviceName] : undefined
        if (saved) return saved
        // First call: let the library try reading it from the advertisement.
        if (!isFallbackCall) return null
        return askForMac(lastDeviceName ?? 'your cube')
      })
      connection = conn
      deviceName.value = conn.deviceName
      macs.value = { ...macs.value, [conn.deviceName]: conn.deviceMAC }
      const subscription = conn.events$.subscribe(onEvent)
      unsubscribe = () => subscription.unsubscribe()
      status.value = 'connected'
      await conn.sendCubeCommand({ type: 'REQUEST_FACELETS' })
      await conn.sendCubeCommand({ type: 'REQUEST_BATTERY' })
    } catch (caught) {
      cleanUp()
      // Closing the browser's device picker is a choice, not a failure.
      if (caught instanceof DOMException && caught.name === 'NotFoundError') return
      // A remembered MAC that no longer works would fail the same way forever.
      if (lastDeviceName && macs.value[lastDeviceName]) {
        const { [lastDeviceName]: _forgotten, ...rest } = macs.value
        macs.value = rest
      }
      error.value = caught instanceof Error ? caught.message : String(caught)
    } finally {
      macRequest.value = null
    }
  }

  async function disconnect(): Promise<void> {
    const conn = connection
    cleanUp()
    await conn?.disconnect()
  }

  /** Tells the cube its current state is solved, for when its tracking has drifted. */
  async function markSolved(): Promise<void> {
    if (!connection) return
    await connection.sendCubeCommand({ type: 'REQUEST_RESET' })
    raw.value = SOLVED
    emit({ type: 'resync', cube: cube.value! })
  }

  return {
    status,
    connected,
    deviceName,
    battery,
    error,
    cube,
    macRequest,
    connect,
    disconnect,
    markSolved,
    provideMac,
    listen,
  }
})

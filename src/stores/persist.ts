/**
 * localStorage, defensively.
 *
 * Everything in storage is untrusted: it can be hand-edited, it survives across
 * releases, and it is absent entirely in private-mode Safari and in tests. Each
 * store supplies a parser, and anything that fails to parse is replaced by the
 * default rather than crashing the app on load.
 */

import { ref, watch, type Ref } from 'vue'

const NAMESPACE = 'ollTrainer.v1'

/** Bumping this rejects data written by a *newer* build. There is no v0 to migrate. */
export const SCHEMA_VERSION = 1

export function storageKey(name: string): string {
  return `${NAMESPACE}.${name}`
}

let cached: Storage | null | undefined

/**
 * Safari in private mode exposes `localStorage` but throws on write, so a
 * probe is the only reliable test.
 */
function storage(): Storage | null {
  if (cached !== undefined) return cached
  try {
    const candidate = globalThis.localStorage
    const probe = storageKey('probe')
    candidate.setItem(probe, '1')
    candidate.removeItem(probe)
    cached = candidate
  } catch {
    cached = null
  }
  return cached
}

/** Forgets the cached probe. Only for tests, which swap the backing store. */
export function resetStorageCache(): void {
  cached = undefined
}

function storedSchemaVersion(): number {
  const raw = storage()?.getItem(storageKey('schema'))
  const version = raw === null || raw === undefined ? SCHEMA_VERSION : Number(raw)
  return Number.isFinite(version) ? version : SCHEMA_VERSION
}

export function readStored<T>(name: string, parse: (raw: unknown) => T | null, fallback: T): T {
  const store = storage()
  if (!store) return fallback
  // Data from a future schema may have a shape this build misreads.
  if (storedSchemaVersion() > SCHEMA_VERSION) return fallback
  const raw = store.getItem(storageKey(name))
  if (raw === null) return fallback
  try {
    return parse(JSON.parse(raw)) ?? fallback
  } catch {
    return fallback
  }
}

export function writeStored(name: string, value: unknown): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(storageKey('schema'), String(SCHEMA_VERSION))
    store.setItem(storageKey(name), JSON.stringify(value))
  } catch {
    // Quota exceeded, or storage disabled between the probe and now. Losing a
    // write is survivable; taking the app down with it is not.
  }
}

export function clearStored(name: string): void {
  try {
    storage()?.removeItem(storageKey(name))
  } catch {
    /* see writeStored */
  }
}

/**
 * A ref hydrated from storage and written back whenever it is replaced.
 *
 * The watcher is deliberately not deep: stores replace arrays and objects
 * rather than mutating them, so a shallow watch is both correct and O(1) to
 * trigger even when the solve history is long.
 */
export function persistedRef<T>(
  name: string,
  fallback: T,
  parse: (raw: unknown) => T | null,
): Ref<T> {
  const state = ref(readStored(name, parse, fallback)) as Ref<T>
  // Synchronous, so a reload immediately after a solve cannot lose it.
  watch(state, (value) => writeStored(name, value), { flush: 'sync' })
  return state
}

// Re-exported so stores have one import for "read untrusted data".
export { asFiniteNumber, asOneOf, clampNumber, isRecord } from '@/core/parse'

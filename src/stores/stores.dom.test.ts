import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { CASES } from '@/core/data/cases'
import { ARTS_DEFAULTS } from '@/core/arts'
import type { Solve } from '@/core/types'
import { resetStorageCache, storageKey, SCHEMA_VERSION } from './persist'
import { DEFAULT_SETTINGS, useSettingsStore } from './settings'
import { useSelectionStore } from './selection'
import { useSolvesStore } from './solves'

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0)

function solve(caseId: number, ts: number, ms = 3000): Omit<Solve, 'id'> {
  return { caseId, ms, scramble: 'R U', rotation: '', ts, mode: 'train' }
}

/** A fresh Pinia and an empty localStorage. */
function fresh() {
  localStorage.clear()
  resetStorageCache()
  setActivePinia(createPinia())
}

/** A fresh Pinia over whatever is already in storage, as a page reload would be. */
function reload() {
  resetStorageCache()
  setActivePinia(createPinia())
}

beforeEach(fresh)

describe('persistence', () => {
  it('round-trips settings through storage', () => {
    useSettingsStore().update({ theme: 'dark', holdMs: 0 })
    reload()
    expect(localStorage.getItem(storageKey('schema'))).toBe(String(SCHEMA_VERSION))
    const settings = useSettingsStore()
    expect(settings.theme).toBe('dark')
    expect(settings.holdMs).toBe(0)
  })

  it('round-trips the selection', () => {
    useSelectionStore().set([27, 21, 1])
    reload()
    expect(useSelectionStore().ids).toEqual([1, 21, 27])
  })

  it('round-trips solves and the session marker', () => {
    const store = useSolvesStore()
    store.record(solve(27, T0))
    store.clearSession(T0 + 1000)
    store.record(solve(21, T0 + 2000))
    reload()
    const reloaded = useSolvesStore()
    expect(reloaded.solves).toHaveLength(2)
    expect(reloaded.sessionSolves.map((s) => s.caseId)).toEqual([21])
  })

  it('falls back to defaults on corrupt data rather than crashing', () => {
    localStorage.setItem(storageKey('settings'), 'not json')
    localStorage.setItem(storageKey('selection'), '{"nope":true}')
    localStorage.setItem(storageKey('solves'), '"a string"')
    reload()
    expect(useSettingsStore().settings).toEqual(DEFAULT_SETTINGS)
    expect(useSelectionStore().count).toBe(CASES.length)
    expect(useSolvesStore().solves).toEqual([])
  })

  it('drops individual solves that are not usable, keeping the rest', () => {
    localStorage.setItem(
      storageKey('solves'),
      JSON.stringify([
        { caseId: 27, ms: 3000, ts: T0, id: 'a', scramble: 'R', rotation: '', mode: 'train' },
        { caseId: 999, ms: 3000, ts: T0 + 1 }, // no such case
        { caseId: 21, ms: 'fast', ts: T0 + 2 }, // not a time
        { caseId: 21, ms: 1000, ts: T0 + 3 }, // missing fields, but recoverable
      ]),
    )
    reload()
    const solves = useSolvesStore().solves
    expect(solves.map((s) => s.caseId)).toEqual([27, 21])
    expect(solves[1]!.mode).toBe('train')
    expect(solves[1]!.id).toBe(`21-${T0 + 3}`)
  })

  it('ignores data written by a newer schema', () => {
    useSettingsStore().update({ theme: 'dark' })
    localStorage.setItem(storageKey('schema'), String(SCHEMA_VERSION + 1))
    reload()
    expect(useSettingsStore().theme).toBe(DEFAULT_SETTINGS.theme)
  })

  it('sorts a history that reaches it out of order', () => {
    localStorage.setItem(
      storageKey('solves'),
      JSON.stringify([
        { caseId: 27, ms: 3000, ts: T0 + 5000 },
        { caseId: 21, ms: 3000, ts: T0 },
      ]),
    )
    reload()
    expect(useSolvesStore().solves.map((s) => s.caseId)).toEqual([21, 27])
  })
})

describe('settings', () => {
  it('clamps values outside the sliders', () => {
    const settings = useSettingsStore()
    settings.update({ timerSize: 999, holdMs: -50, scrambleSize: 0 })
    expect(settings.timerSize).toBe(10)
    expect(settings.holdMs).toBe(0)
    expect(settings.scrambleSize).toBe(0.8)
  })

  it('keeps tau between eager and gentle', () => {
    const settings = useSettingsStore()
    settings.update({ tau: 5 })
    expect(settings.tau).toBe(ARTS_DEFAULTS.tauGentle)
    settings.update({ tau: -99 })
    expect(settings.tau).toBe(ARTS_DEFAULTS.tauEager)
  })

  it('feeds tau into the ARTS config it hands out', () => {
    const settings = useSettingsStore()
    settings.update({ tau: -1.0 })
    expect(settings.artsConfig.tau).toBe(-1.0)
    expect(settings.artsConfig.c).toBe(ARTS_DEFAULTS.c)
  })

  it('resets to defaults', () => {
    const settings = useSettingsStore()
    settings.update({ theme: 'light', timerSize: 9 })
    settings.reset()
    expect(settings.settings).toEqual(DEFAULT_SETTINGS)
  })
})

describe('selection', () => {
  it('starts with everything selected', () => {
    const selection = useSelectionStore()
    expect(selection.count).toBe(57)
    expect(selection.isEmpty).toBe(false)
  })

  it('toggles one case', () => {
    const selection = useSelectionStore()
    selection.toggle(27)
    expect(selection.has(27)).toBe(false)
    selection.toggle(27)
    expect(selection.has(27)).toBe(true)
  })

  it('reports and toggles a whole group', () => {
    const selection = useSelectionStore()
    expect(selection.groupState('T-Shapes')).toBe('all')
    selection.toggleGroup('T-Shapes')
    expect(selection.groupState('T-Shapes')).toBe('none')
    expect(selection.has(33)).toBe(false)
    expect(selection.has(45)).toBe(false)
    selection.toggle(33)
    expect(selection.groupState('T-Shapes')).toBe('some')
    selection.toggleGroup('T-Shapes')
    expect(selection.groupState('T-Shapes')).toBe('all')
  })

  it('selects all and none', () => {
    const selection = useSelectionStore()
    selection.selectNone()
    expect(selection.isEmpty).toBe(true)
    selection.selectAll()
    expect(selection.count).toBe(57)
  })

  it('refuses ids that are not cases', () => {
    const selection = useSelectionStore()
    selection.set([27, 999, -1, 58])
    expect(selection.ids).toEqual([27])
  })
})

describe('solves', () => {
  it('records in timestamp order and hands back the stored solve', () => {
    const store = useSolvesStore()
    const first = store.record(solve(27, T0))
    store.record(solve(21, T0 + 1000))
    expect(first.id).toBeTruthy()
    expect(store.solves.map((s) => s.caseId)).toEqual([27, 21])
    expect(store.lastSolve!.caseId).toBe(21)
  })

  it('gives every solve a distinct id, even within the same millisecond', () => {
    const store = useSolvesStore()
    const ids = Array.from({ length: 5 }, () => store.record(solve(27, T0)).id)
    expect(new Set(ids).size).toBe(5)
  })

  it('keeps the session as a view of the durable history', () => {
    const store = useSolvesStore()
    store.record(solve(27, T0))
    store.record(solve(27, T0 + 1000))
    store.clearSession(T0 + 2000)
    store.record(solve(21, T0 + 3000))

    // Clearing the session must not destroy the memory model.
    expect(store.solves).toHaveLength(3)
    expect(store.sessionSolves).toHaveLength(1)
    expect(store.byCase.get(27)).toHaveLength(2)
  })

  it('clears a session that ends in the very millisecond it is cleared', () => {
    const store = useSolvesStore()
    store.record(solve(27, T0))
    store.clearSession(T0)
    expect(store.solves).toHaveLength(1)
    expect(store.sessionSolves).toHaveLength(0)
  })

  it('resets progress destructively, unlike clearing the session', () => {
    const store = useSolvesStore()
    store.record(solve(27, T0))
    store.resetProgress(T0 + 1000)
    expect(store.solves).toEqual([])
    expect(store.sessionSolves).toEqual([])
  })

  it('removes a solve and can restore it in place', () => {
    const store = useSolvesStore()
    store.record(solve(27, T0))
    const middle = store.record(solve(21, T0 + 1000))
    store.record(solve(33, T0 + 2000))

    const removed = store.remove(middle.id)
    expect(removed).toEqual(middle)
    expect(store.solves.map((s) => s.caseId)).toEqual([27, 33])

    store.insert(removed!)
    expect(store.solves.map((s) => s.caseId)).toEqual([27, 21, 33])
  })

  it('removes the last solve, and copes when there is none', () => {
    const store = useSolvesStore()
    expect(store.removeLast()).toBeNull()
    store.record(solve(27, T0))
    expect(store.removeLast()!.caseId).toBe(27)
    expect(store.solves).toEqual([])
  })

  it('returns null when asked to remove something that is not there', () => {
    expect(useSolvesStore().remove('nope')).toBeNull()
  })

  it('starts a session at the first solve rather than at zero', () => {
    const store = useSolvesStore()
    store.record(solve(27, T0))
    store.ensureSession(T0 + 5000)
    expect(store.sessionStartedAt).toBe(T0)
    expect(store.sessionSolves).toHaveLength(1)
  })

  it('leaves an existing session marker alone', () => {
    const store = useSolvesStore()
    store.clearSession(T0)
    store.ensureSession(T0 + 9999)
    expect(store.sessionStartedAt).toBe(T0)
  })
})

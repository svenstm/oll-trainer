import { computed } from 'vue'
import { defineStore } from 'pinia'

import { CASES } from '@/core/data/cases'
import { GROUPED_CASES } from '@/core/groups'
import { parseSelection } from '@/core/parse'
import type { OllGroup } from '@/core/types'
import { persistedRef } from './persist'

const ALL_IDS = CASES.map((c) => c.id)

export const useSelectionStore = defineStore('selection', () => {
  // A new visitor gets everything selected, so the app is usable immediately
  // rather than opening onto a wall of empty checkboxes.
  const ids = persistedRef<number[]>('selection', [...ALL_IDS], parseSelection)

  const selected = computed(() => new Set(ids.value))
  const count = computed(() => ids.value.length)
  const isEmpty = computed(() => ids.value.length === 0)

  function has(id: number): boolean {
    return selected.value.has(id)
  }

  function set(next: Iterable<number>): void {
    ids.value = parseSelection([...next]) ?? []
  }

  function toggle(id: number): void {
    const next = new Set(ids.value)
    if (!next.delete(id)) next.add(id)
    set(next)
  }

  function setGroup(group: OllGroup, on: boolean): void {
    const inGroup = GROUPED_CASES.find((g) => g.name === group)?.cases ?? []
    const next = new Set(ids.value)
    for (const c of inGroup) {
      if (on) next.add(c.id)
      else next.delete(c.id)
    }
    set(next)
  }

  function groupState(group: OllGroup): 'all' | 'some' | 'none' {
    const inGroup = GROUPED_CASES.find((g) => g.name === group)?.cases ?? []
    const chosen = inGroup.filter((c) => selected.value.has(c.id)).length
    if (chosen === 0) return 'none'
    return chosen === inGroup.length ? 'all' : 'some'
  }

  function toggleGroup(group: OllGroup): void {
    setGroup(group, groupState(group) !== 'all')
  }

  const selectAll = () => set(ALL_IDS)
  const selectNone = () => set([])

  return {
    ids,
    selected,
    count,
    isEmpty,
    total: ALL_IDS.length,
    has,
    set,
    toggle,
    setGroup,
    groupState,
    toggleGroup,
    selectAll,
    selectNone,
  }
})

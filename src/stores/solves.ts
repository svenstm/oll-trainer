import { computed } from 'vue'
import { defineStore } from 'pinia'

import { parseSolves } from '@/core/parse'
import type { Solve } from '@/core/types'
import { asFiniteNumber, isRecord, persistedRef, writeStored } from './persist'

function parseSession(raw: unknown): { startedAt: number } | null {
  if (!isRecord(raw)) return null
  const startedAt = asFiniteNumber(raw.startedAt, Number.NaN)
  return Number.isFinite(startedAt) ? { startedAt } : null
}

/** Index of the first solve at or after `ts`, by binary search. */
function lowerBound(solves: readonly Solve[], ts: number): number {
  let lo = 0
  let hi = solves.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (solves[mid]!.ts < ts) lo = mid + 1
    else hi = mid
  }
  return lo
}

let counter = 0

export function newSolveId(ts: number): string {
  counter += 1
  return `${ts.toString(36)}-${counter.toString(36)}`
}

export const useSolvesStore = defineStore('solves', () => {
  /**
   * The durable history. This *is* the ARTS memory model, so it outlives the
   * session: clearing the session only moves a marker, and only resetting
   * progress throws any of it away.
   */
  const solves = persistedRef<Solve[]>('solves', [], parseSolves)
  const session = persistedRef<{ startedAt: number }>('session', { startedAt: 0 }, parseSession)

  const sessionStartedAt = computed(() => session.value.startedAt)

  /** The session is a view of the durable history, not a separate list. */
  const sessionSolves = computed(() =>
    solves.value.slice(lowerBound(solves.value, sessionStartedAt.value)),
  )

  const byCase = computed(() => {
    const map = new Map<number, Solve[]>()
    for (const solve of solves.value) {
      const list = map.get(solve.caseId)
      if (list) list.push(solve)
      else map.set(solve.caseId, [solve])
    }
    return map
  })

  const lastSolve = computed(() => solves.value.at(-1) ?? null)

  /**
   * Inserts in timestamp order. Appending is the normal case; the search only
   * costs anything when restoring a deleted solve from the middle.
   */
  function insert(solve: Solve): void {
    const next = [...solves.value]
    const at = lowerBound(next, solve.ts)
    next.splice(at, 0, solve)
    solves.value = next
  }

  /** Replaces the whole history, for importing a backup. */
  function replaceAll(next: readonly Solve[]): void {
    solves.value = [...next].sort((a, b) => a.ts - b.ts)
  }

  function record(input: Omit<Solve, 'id'>): Solve {
    const solve: Solve = { ...input, id: newSolveId(input.ts) }
    insert(solve)
    return solve
  }

  /** Returns the removed solve so the caller can offer an undo. */
  function remove(id: string): Solve | null {
    const found = solves.value.find((solve) => solve.id === id)
    if (!found) return null
    solves.value = solves.value.filter((solve) => solve.id !== id)
    return found
  }

  function removeLast(): Solve | null {
    const last = solves.value.at(-1)
    return last ? remove(last.id) : null
  }

  /**
   * Non-destructive: the history stays, only the window moves.
   *
   * The window is inclusive of its start, so a solve recorded in the same
   * millisecond as the clear would otherwise survive it — which on a fast
   * machine is exactly what happens when you clear right after a solve.
   */
  function clearSession(now = Date.now()): void {
    const last = solves.value.at(-1)?.ts ?? 0
    session.value = { startedAt: Math.max(now, last + 1) }
  }

  /** Destructive. Throws the memory model away, so the UI must confirm first. */
  function resetProgress(now = Date.now()): void {
    solves.value = []
    session.value = { startedAt: now }
  }

  /** Starts a session at first run, so a fresh visit is not looking at nothing. */
  function ensureSession(now = Date.now()): void {
    if (session.value.startedAt === 0) {
      session.value = { startedAt: solves.value[0]?.ts ?? now }
      writeStored('session', session.value)
    }
  }

  return {
    solves,
    session,
    sessionStartedAt,
    sessionSolves,
    byCase,
    lastSolve,
    count: computed(() => solves.value.length),
    insert,
    replaceAll,
    record,
    remove,
    removeLast,
    clearSession,
    resetProgress,
    ensureSession,
  }
})

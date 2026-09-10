/**
 * Export and import of the whole local state.
 *
 * There is no account and no sync, and the solve history *is* the learn-mode
 * memory model — it cannot be reconstructed from anything else. A cleared
 * browser profile or a new laptop would otherwise lose it permanently, so this
 * is the only way that history can leave the origin it was recorded on.
 */

import { isRecord, parseSelection, parseSettings, parseSolves } from './parse'
import type { Settings, Solve } from './types'

export const BACKUP_APP = 'oll-trainer'
/**
 * 2 added `outcome` to a solve. A v1 file has none, and every attempt in it was
 * timed, so reading one is lossless. Writing v2 matters the other way round: an
 * older build reads the version, refuses the file, and says so — rather than
 * quietly taking every blank in it for an ordinary solve and poisoning its own
 * execution floors with phantom times.
 */
export const BACKUP_VERSION = 2

export interface Backup {
  app: typeof BACKUP_APP
  version: number
  exportedAt: number
  solves: Solve[]
  selection: number[]
  settings: Settings
}

export interface BackupInput {
  solves: readonly Solve[]
  selection: readonly number[]
  settings: Settings
}

export function createBackup(input: BackupInput, now: number): Backup {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: now,
    solves: [...input.solves],
    selection: [...input.selection],
    settings: { ...input.settings },
  }
}

export class BackupError extends Error {}

/**
 * Reads a backup file. Throws with something a person can act on rather than
 * returning null, because every failure here is one a user needs explaining:
 * they picked the wrong file, or the file is damaged.
 */
export function parseBackup(raw: unknown): Backup {
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      throw new BackupError('That file is not valid JSON.')
    }
  }
  if (!isRecord(raw)) throw new BackupError('That file does not look like a backup.')
  if (raw.app !== BACKUP_APP) {
    throw new BackupError('That backup was not made by OLL Trainer.')
  }
  const version = typeof raw.version === 'number' ? raw.version : 0
  if (version > BACKUP_VERSION) {
    throw new BackupError('That backup was made by a newer version of the app.')
  }

  const solves = parseSolves(raw.solves)
  if (solves === null) throw new BackupError('That backup has no solve history in it.')

  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: typeof raw.exportedAt === 'number' ? raw.exportedAt : 0,
    solves,
    selection: parseSelection(raw.selection) ?? [],
    settings: parseSettings(raw.settings) ?? parseSettings({})!,
  }
}

/**
 * Union by solve id, oldest first.
 *
 * Merging rather than replacing is what makes importing safe: restoring onto
 * an empty profile is the same as replacing, importing the same file twice
 * changes nothing, and moving between two devices keeps both histories.
 */
export function mergeSolves(existing: readonly Solve[], incoming: readonly Solve[]): Solve[] {
  const byId = new Map(existing.map((solve) => [solve.id, solve]))
  let added = 0
  for (const solve of incoming) {
    if (byId.has(solve.id)) continue
    byId.set(solve.id, solve)
    added++
  }
  if (added === 0) return [...existing]
  return [...byId.values()].sort((a, b) => a.ts - b.ts)
}

export function countNewSolves(existing: readonly Solve[], incoming: readonly Solve[]): number {
  const ids = new Set(existing.map((solve) => solve.id))
  return incoming.filter((solve) => !ids.has(solve.id)).length
}

/** `oll-trainer-2026-09-06.json` — sorts chronologically in a downloads folder. */
export function backupFilename(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `oll-trainer-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`
}

export function serialiseBackup(backup: Backup): string {
  return JSON.stringify(backup, null, 2)
}

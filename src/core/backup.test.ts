import { describe, expect, it } from 'vitest'
import {
  BACKUP_APP,
  BACKUP_VERSION,
  BackupError,
  backupFilename,
  countNewSolves,
  createBackup,
  mergeSolves,
  parseBackup,
  serialiseBackup,
} from './backup'
import { DEFAULT_SETTINGS } from './parse'
import type { Solve } from './types'

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0)

function solve(id: string, caseId: number, ts: number): Solve {
  return { id, caseId, ms: 3000, scramble: 'R U', rotation: '', ts, mode: 'train' }
}

const input = {
  solves: [solve('a', 27, T0), solve('b', 21, T0 + 1000)],
  selection: [21, 27],
  settings: { ...DEFAULT_SETTINGS, theme: 'dark' as const, holdMs: 0 },
}

describe('createBackup', () => {
  it('captures everything that cannot be reconstructed', () => {
    const backup = createBackup(input, T0)
    expect(backup).toEqual({
      app: BACKUP_APP,
      version: BACKUP_VERSION,
      exportedAt: T0,
      solves: input.solves,
      selection: input.selection,
      settings: input.settings,
    })
  })

  it('copies, so later changes do not mutate a backup already taken', () => {
    const solves = [...input.solves]
    const backup = createBackup({ ...input, solves }, T0)
    solves.push(solve('c', 33, T0 + 2000))
    expect(backup.solves).toHaveLength(2)
  })
})

describe('parseBackup', () => {
  it('round-trips through JSON', () => {
    const backup = createBackup(input, T0)
    expect(parseBackup(serialiseBackup(backup))).toEqual(backup)
  })

  it('accepts an already-parsed object', () => {
    const backup = createBackup(input, T0)
    expect(parseBackup(JSON.parse(serialiseBackup(backup)))).toEqual(backup)
  })

  it.each([
    ['not json at all', 'is not valid JSON'],
    ['[]', 'does not look like a backup'],
    ['{"app":"something-else"}', 'not made by OLL Trainer'],
    [`{"app":"${BACKUP_APP}","version":99}`, 'newer version'],
    [`{"app":"${BACKUP_APP}","version":1}`, 'no solve history'],
  ])('explains what is wrong with %s', (raw, message) => {
    expect(() => parseBackup(raw)).toThrow(BackupError)
    expect(() => parseBackup(raw)).toThrow(new RegExp(message))
  })

  it('drops unusable solves rather than rejecting the whole file', () => {
    const backup = parseBackup(
      JSON.stringify({
        app: BACKUP_APP,
        version: 1,
        solves: [solve('a', 27, T0), { caseId: 999, ms: 1, ts: 2 }, { nonsense: true }],
      }),
    )
    expect(backup.solves.map((s) => s.id)).toEqual(['a'])
  })

  it('falls back to defaults for a missing selection or settings', () => {
    const backup = parseBackup(
      JSON.stringify({ app: BACKUP_APP, version: 1, solves: [solve('a', 27, T0)] }),
    )
    expect(backup.selection).toEqual([])
    expect(backup.settings).toEqual(DEFAULT_SETTINGS)
  })

  it('accepts a backup from an older version', () => {
    const backup = parseBackup(
      JSON.stringify({ app: BACKUP_APP, version: 0, solves: [solve('a', 27, T0)] }),
    )
    expect(backup.solves).toHaveLength(1)
  })
})

describe('mergeSolves', () => {
  const existing = [solve('a', 27, T0), solve('c', 33, T0 + 4000)]

  it('restores onto an empty history, which is the whole point', () => {
    expect(mergeSolves([], input.solves)).toEqual(input.solves)
  })

  it('keeps both sides, oldest first', () => {
    const merged = mergeSolves(existing, [solve('b', 21, T0 + 2000)])
    expect(merged.map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('is idempotent, so importing the same file twice changes nothing', () => {
    const once = mergeSolves(existing, input.solves)
    expect(mergeSolves(once, input.solves)).toEqual(once)
  })

  it('never overwrites a solve already held under the same id', () => {
    const changed = { ...solve('a', 27, T0), ms: 99999 }
    expect(mergeSolves(existing, [changed])[0]!.ms).toBe(3000)
  })

  it('leaves the existing history untouched when there is nothing new', () => {
    expect(mergeSolves(existing, [solve('a', 27, T0)])).toEqual(existing)
  })

  it('counts what an import would actually add', () => {
    expect(countNewSolves(existing, input.solves)).toBe(1)
    expect(countNewSolves(existing, existing)).toBe(0)
    expect(countNewSolves([], input.solves)).toBe(2)
  })
})

describe('backupFilename', () => {
  it('sorts chronologically in a downloads folder', () => {
    expect(backupFilename(new Date(2026, 8, 6))).toBe('oll-trainer-2026-09-06.json')
    expect(backupFilename(new Date(2026, 11, 31))).toBe('oll-trainer-2026-12-31.json')
  })
})

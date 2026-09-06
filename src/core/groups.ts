/**
 * The 14 shape groups, in the order the selection screen shows them: roughly
 * easiest first. The all-edges-oriented cases are the ones most people learn
 * first, and the dot cases are the ones most people leave until last.
 */

import { CASES } from './data/cases'
import type { OllCase, OllGroup } from './types'

export const GROUPS: readonly OllGroup[] = [
  'All Edges Oriented Correctly',
  'T-Shapes',
  'Squares',
  'C-Shapes',
  'W-Shapes',
  'Corners Correct, Edges Flipped',
  'P-Shapes',
  'I-Shapes',
  'Fish-Shapes',
  'Knight Move Shapes',
  'Awkward Shapes',
  'L-Shapes',
  'Lightning Bolts',
  'No Edges Flipped Correctly',
]

export interface CaseGroup {
  name: OllGroup
  cases: readonly OllCase[]
}

/** Cases bucketed by group, groups in display order, cases by id within each. */
export const GROUPED_CASES: readonly CaseGroup[] = GROUPS.map((name) => ({
  name,
  cases: CASES.filter((c) => c.group === name).sort((a, b) => a.id - b.id),
}))

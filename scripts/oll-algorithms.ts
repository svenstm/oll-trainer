/**
 * The 57 canonical OLL algorithms, hand-entered.
 *
 * This table is the one place a human typo can enter the data pipeline, and it
 * is the *definition* of the standard numbering for this project: enumeration
 * yields 57 orientation classes but not the community's numbers, so each case
 * is bound to its number by inverting the algorithm below and reading off the
 * pattern it produces. `verify.ts` checks every entry against the independent
 * combinatorial enumeration and fails loudly rather than shipping a wrong case.
 *
 * Names follow the commonly circulated community names; sources differ on a
 * few, and nothing in the app depends on them.
 */

import type { OllGroup } from '../src/core/types.ts'

export interface AlgorithmEntry {
  id: number
  name: string
  group: OllGroup
  alg: string
}

export const OLL_ALGORITHMS: readonly AlgorithmEntry[] = [
  // Dot cases — no edges flipped correctly.
  {
    id: 1,
    name: 'Runway',
    group: 'No Edges Flipped Correctly',
    alg: "R U2 R2 F R F' U2 R' F R F'",
  },
  {
    id: 2,
    name: 'Zamboni',
    group: 'No Edges Flipped Correctly',
    alg: "F R U R' U' F' f R U R' U' f'",
  },
  {
    id: 3,
    name: 'Anti-Kite',
    group: 'No Edges Flipped Correctly',
    alg: "f R U R' U' f' U' F R U R' U' F'",
  },
  {
    id: 4,
    name: 'Kite',
    group: 'No Edges Flipped Correctly',
    alg: "f R U R' U' f' U F R U R' U' F'",
  },
  {
    id: 17,
    name: 'Slash',
    group: 'No Edges Flipped Correctly',
    alg: "R U R' U R' F R F' U2 R' F R F'",
  },
  {
    id: 18,
    name: 'Crown',
    group: 'No Edges Flipped Correctly',
    alg: "r U R' U R U2 r2 U' R U' R' U2 r",
  },
  {
    id: 19,
    name: 'Bunny',
    group: 'No Edges Flipped Correctly',
    alg: "r' R U R U R' U' M' R' F R F'",
  },
  {
    id: 20,
    name: 'Checkers',
    group: 'No Edges Flipped Correctly',
    alg: "r U R' U' M2 U R U' R' U' M'",
  },

  // Squares.
  { id: 5, name: 'Anti-Squeegee', group: 'Squares', alg: "r' U2 R U R' U r" },
  { id: 6, name: 'Squeegee', group: 'Squares', alg: "r U2 R' U' R U' r'" },

  // Lightning bolts.
  { id: 7, name: 'Lightning', group: 'Lightning Bolts', alg: "r U R' U R U2 r'" },
  { id: 8, name: 'Reverse Lightning', group: 'Lightning Bolts', alg: "r' U' R U' R' U2 r" },
  { id: 11, name: 'Downstairs', group: 'Lightning Bolts', alg: "r U R' U R' F R F' R U2 r'" },
  { id: 12, name: 'Upstairs', group: 'Lightning Bolts', alg: "M' R' U' R U' R' U2 R U' R r'" },
  { id: 39, name: 'Big Lightning', group: 'Lightning Bolts', alg: "L F' L' U' L U F U' L'" },
  { id: 40, name: 'Anti-Big-Lightning', group: 'Lightning Bolts', alg: "R' F R U R' U' F' U R" },

  // Fish shapes.
  { id: 9, name: 'Kicking', group: 'Fish-Shapes', alg: "R U R' U' R' F R2 U R' U' F'" },
  { id: 10, name: 'Anti-Kicking', group: 'Fish-Shapes', alg: "R U R' U R' F R F' R U2 R'" },
  { id: 35, name: 'Fish Salad', group: 'Fish-Shapes', alg: "R U2 R2 F R F' R U2 R'" },
  { id: 37, name: 'Mounted Fish', group: 'Fish-Shapes', alg: "F R' F' R U R U' R'" },

  // Knight move shapes.
  { id: 13, name: 'Gun', group: 'Knight Move Shapes', alg: "F U R U' R2 F' R U R U' R'" },
  { id: 14, name: 'Anti-Gun', group: 'Knight Move Shapes', alg: "R' F R U R' F' R F U' F'" },
  { id: 15, name: 'Squeaky Wheel', group: 'Knight Move Shapes', alg: "l' U' l L' U' L U l' U l" },
  {
    id: 16,
    name: 'Anti-Squeaky Wheel',
    group: 'Knight Move Shapes',
    alg: "r U r' R U R' U' r U' r'",
  },

  // All edges oriented correctly — the seven OCLL cases.
  {
    id: 21,
    name: 'Double Sune',
    group: 'All Edges Oriented Correctly',
    alg: "R U2 R' U' R U R' U' R U' R'",
  },
  { id: 22, name: 'Bruno', group: 'All Edges Oriented Correctly', alg: "R U2 R2 U' R2 U' R2 U2 R" },
  {
    id: 23,
    name: 'Headlights',
    group: 'All Edges Oriented Correctly',
    alg: "R2 D R' U2 R D' R' U2 R'",
  },
  { id: 24, name: 'Chameleon', group: 'All Edges Oriented Correctly', alg: "r U R' U' r' F R F'" },
  { id: 25, name: 'Bowtie', group: 'All Edges Oriented Correctly', alg: "F' r U R' U' r' F R" },
  { id: 26, name: 'Anti-Sune', group: 'All Edges Oriented Correctly', alg: "R U2 R' U' R U' R'" },
  { id: 27, name: 'Sune', group: 'All Edges Oriented Correctly', alg: "R U R' U R U2 R'" },

  // Corners correct, edges flipped.
  {
    id: 28,
    name: 'Stealth',
    group: 'Corners Correct, Edges Flipped',
    alg: "r U R' U' M U R U' R'",
  },
  { id: 57, name: 'Mummy', group: 'Corners Correct, Edges Flipped', alg: "R U R' U' M' U R U' r'" },

  // Awkward shapes.
  {
    id: 29,
    name: 'Spotted Chameleon',
    group: 'Awkward Shapes',
    alg: "R U R' U' R U' R' F' U' F R U R'",
  },
  {
    id: 30,
    name: 'Anti-Spotted Chameleon',
    group: 'Awkward Shapes',
    alg: "F R' F R2 U' R' U' R U R' F2",
  },
  { id: 41, name: 'Awkward Fish', group: 'Awkward Shapes', alg: "R U R' U R U2 R' F R U R' U' F'" },
  {
    id: 42,
    name: 'Anti-Awkward Fish',
    group: 'Awkward Shapes',
    alg: "R' U' R U' R' U2 R F R U R' U' F'",
  },

  // P shapes.
  { id: 31, name: 'Couch', group: 'P-Shapes', alg: "R' U' F U R U' R' F' R" },
  { id: 32, name: 'Anti-Couch', group: 'P-Shapes', alg: "L U F' U' L' U L F L'" },
  { id: 43, name: 'Anti-P', group: 'P-Shapes', alg: "F' U' L' U L F" },
  { id: 44, name: 'P', group: 'P-Shapes', alg: "F U R U' R' F'" },

  // T shapes.
  { id: 33, name: 'Key', group: 'T-Shapes', alg: "R U R' U' R' F R F'" },
  { id: 45, name: 'T', group: 'T-Shapes', alg: "F R U R' U' F'" },

  // C shapes.
  { id: 34, name: 'City', group: 'C-Shapes', alg: "R U R2 U' R' F R U R U' F'" },
  { id: 46, name: "Seein' Headlights", group: 'C-Shapes', alg: "R' U' R' F R F' U R" },

  // W shapes.
  { id: 36, name: 'Wario', group: 'W-Shapes', alg: "L' U' L U' L' U L U L F' L' F" },
  { id: 38, name: 'Mario', group: 'W-Shapes', alg: "R U R' U R U' R' U' R' F R F'" },

  // L shapes.
  { id: 47, name: 'Right Front Squeezy', group: 'L-Shapes', alg: "F' L' U' L U L' U' L U F" },
  { id: 48, name: 'Right Back Squeezy', group: 'L-Shapes', alg: "F R U R' U' R U R' U' F'" },
  { id: 49, name: 'Left Front Squeezy', group: 'L-Shapes', alg: "r U' r2 U r2 U r2 U' r" },
  { id: 50, name: 'Left Back Squeezy', group: 'L-Shapes', alg: "r' U r2 U' r2 U' r2 U r'" },
  { id: 53, name: 'Frying Pan', group: 'L-Shapes', alg: "l' U2 L U L' U' L U L' U l" },
  { id: 54, name: 'Anti-Frying Pan', group: 'L-Shapes', alg: "r U2 R' U' R U R' U' R U' r'" },

  // I shapes.
  { id: 51, name: 'Bottlecap', group: 'I-Shapes', alg: "f R U R' U' R U R' U' f'" },
  { id: 52, name: 'Rice Cooker', group: 'I-Shapes', alg: "R U R' U R U' B U' B' R'" },
  { id: 55, name: 'Highway', group: 'I-Shapes', alg: "R U2 R2 U' R U' R' U2 F R F'" },
  { id: 56, name: 'Streetlights', group: 'I-Shapes', alg: "r U r' U R U' R' U R U' R' r U' r'" },
]

/**
 * Cube Academy's 57 OLL algorithms, transcribed from
 * <https://www.cube.academy/oll-algs>.
 *
 * Deliberately *not* keyed by OLL number: the page carries none, grouping its
 * cases by its own shape names and pictures instead. Hand-assigning numbers
 * here would add a second place a human could mis-number a case, which is the
 * objection `docs/plan-deviations.md` raised against a second table at all.
 * Instead `verify-cases.ts` derives each number the same way the canonical
 * table's numbers are checked — by inverting the algorithm and reading off the
 * pattern it produces — so a transcription error cannot name the wrong case.
 * It either fails to match an enumerated class, or collides with one already
 * taken, and `pnpm data:cases` refuses to write.
 *
 * The page's own order and section headings are kept so that re-checking this
 * table against the page stays a diff. The finger-trick parentheses and the
 * typographic apostrophes it uses are normalised away by the binder, not here,
 * for the same reason: what is written down should be what the page shows.
 *
 * Roughly half of these are the algorithm this project already teaches. They
 * are transcribed anyway and dropped by the binder's duplicate rule, so the
 * table stays a faithful copy of the source rather than a filtered one.
 */

export interface CubeAcademyEntry {
  /** The page's own grouping. Provenance only — nothing is derived from it. */
  section: string
  alg: string
}

export const CUBE_ACADEMY_ALGORITHMS: readonly CubeAcademyEntry[] = [
  { section: 'Solved Cross', alg: "R U R' U (R U2 R')" },
  { section: 'Solved Cross', alg: "(R U2 R') U' R U' R'" },
  { section: 'Solved Cross', alg: "R U R' U (R U' R' U) R U2 R'" },
  { section: 'Solved Cross', alg: "R U2 (R2 U') (R2 U') R2 U2 R" },
  { section: 'Solved Cross', alg: "(R U R) D (R' U' R) D' R2" },
  { section: 'Solved Cross', alg: "R2 D' (R U' R') D (R U R)" },
  { section: 'Solved Cross', alg: "R2 D (R' U2 R) D' (R' U2 R')" },

  { section: 'T Shapes', alg: "F (R U R' U') F'" },
  { section: 'T Shapes', alg: "(R U R' U') (R' F R F')" },

  { section: 'Block Shapes', alg: "(r U2 R') U' R U' r'" },
  { section: 'Block Shapes', alg: "(r' U2 R) U R' U r" },

  { section: 'Edges Only', alg: "(r U R' U') M (U R U' R')" },
  { section: 'Edges Only', alg: "(R U R' U') M' (U R U' r')" },

  { section: 'Lightning Shapes', alg: "r U R' U (R U2 r')" },
  { section: 'Lightning Shapes', alg: "R' F' (r U' r') F2 R" },
  { section: 'Lightning Shapes', alg: "r' (R2 U R' U R U2 R') U M'" },
  { section: 'Lightning Shapes', alg: "r (R2 U' R U' R' U2 R) U' M" },
  { section: 'Lightning Shapes', alg: "(f R' F' R) (U R U' R') S'" },
  { section: 'Lightning Shapes', alg: "f' (r U r' U') (r' F r S)" },

  { section: 'P Shapes', alg: "F (U R U' R') F'" },
  { section: 'P Shapes', alg: "R' (U' F' U F) R" },
  { section: 'P Shapes', alg: "R' U' F (U R U' R') F' R" },
  { section: 'P Shapes', alg: "S (R U R' U') (R' F R f')" },

  { section: 'C Shapes', alg: "R' U' (R' F R F') U R" },
  { section: 'C Shapes', alg: "f R f' U' r' U' R U M'" },

  { section: 'Fish Shapes', alg: "(F R' F' R) (U R U' R')" },
  { section: 'Fish Shapes', alg: "R U2 R2’ (F R F' R) U2 R'" },
  { section: 'Fish Shapes', alg: "(R U R' U') R' F (R2 U R' U') F'" },
  { section: 'Fish Shapes', alg: "R U R' U (R' F R F') R U2 R'" },

  { section: 'W Shapes', alg: "(R U R' U) R U' R' U' (R' F R F')" },
  { section: 'W Shapes', alg: "(L' U' L U') L' U L U (r U’ r’ F)" },

  { section: 'Hook Shapes', alg: "F (R U R' U') (R U R' U') F'" },
  { section: 'Hook Shapes', alg: "(F R' F' R) U2 (R U' R' U) R U2 R'" },
  { section: 'Hook Shapes', alg: "r U R' U (R U' R' U) R U2 r'" },
  { section: 'Hook Shapes', alg: "r' U' R U' (R' U R U') R' U2 r" },
  { section: 'Hook Shapes', alg: "r U' (r2’ U) (r2 U) r2’ U' r" },
  { section: 'Hook Shapes', alg: "r' U (r2 U') (r2’ U') r2 U r'" },

  { section: 'Line Shapes', alg: "F (U R U' R') (U R U' R') F'" },
  { section: 'Line Shapes', alg: "R' (F' U' F U') R U R' U R" },
  { section: 'Line Shapes', alg: "r U r' (U R U' R') (U R U' R') r U' r'" },
  { section: 'Line Shapes', alg: "R' F (R U R U') R2 F' R2 U' R' U (R U R')" },

  { section: 'L Shapes', alg: "r U r' (R U R' U') r U' r'" },
  { section: 'L Shapes', alg: "R' F' R (L' U' L U) R' F R" },
  { section: 'L Shapes', alg: "(F U R U') R2 F' R (U R U' R')" },
  { section: 'L Shapes', alg: "R' F (R U R') F' R (F U' F')" },

  { section: 'Awkward Shapes', alg: "r2 D' (r U r') D r2 U' (r' U' r)" },
  { section: 'Awkward Shapes', alg: "F U (R U2 R' U') (R U2 R' U') F'" },
  { section: 'Awkward Shapes', alg: "(R U R' U R U2 R') F (R U R' U') F'" },
  // The page writes this one as `R' U' F2 u' (R U R') D R2 B`, which is a
  // quarter turn short of finishing: `u'` and `D` leave the whole cube turned,
  // so it disturbs 24 facelets outside the last layer and fails the binder's
  // first-two-layers check. The trailing `y` is the only edit made to any
  // entry in this table, and it changes nothing a solver does with their
  // hands — it just says out loud where the cube ended up.
  { section: 'Awkward Shapes', alg: "R' U' F2 u' (R U R') D R2 B y" },

  { section: 'Dot Cases', alg: "R U2 (R2 F R F') U2 (R' F R F')" },
  { section: 'Dot Cases', alg: "f (U R U' R') S' (U R U' R') F'" },
  { section: 'Dot Cases', alg: "(F R' F' R) U S' (R U' R') S" },
  { section: 'Dot Cases', alg: "S' (R U R') S U' (R' F R F')" },
  { section: 'Dot Cases', alg: "(r U R' U R U2 r’) (r’ U' R U' R' U2 r)" },
  { section: 'Dot Cases', alg: "(R' F2 R2 U2 R') F’ (R U2 R2 F2 R)" },
  { section: 'Dot Cases', alg: "S R' U' (R U) (R U) R U' R' S'" },
  { section: 'Dot Cases', alg: "(R' F2 R2 U2 R') F (R U2 R2 F2 R)" },
]

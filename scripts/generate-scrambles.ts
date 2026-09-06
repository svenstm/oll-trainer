/**
 * Generates the committed scramble corpus.
 *
 * A scramble for case C is any sequence that turns a solved cube into a state
 * whose first two layers are solved and whose last layer is oriented like C.
 * Those states are exactly {case state} x {last-layer permutation}, so this
 * builds many of them by applying permutation-only algorithms to the case
 * state, asks `cubing` for a solution to each, and inverts it.
 *
 * `cubing` is MPL-2.0 OR GPL-3.0-or-later. It is a dev dependency used to
 * produce data that is committed; it is never bundled into the app.
 *
 * Run: pnpm data:scrambles
 */

import { writeFileSync } from 'node:fs'
import { Alg } from 'cubing/alg'
import { cube3x3x3 } from 'cubing/puzzles'
import { experimentalSolve3x3x3IgnoringCenters } from 'cubing/search'

import { applyMoves, invertMoves, parseMoves, SOLVED, type Cube } from '../src/core/cube'
import {
  SLOT_FACELETS,
  canonicalPattern,
  patternFromCube,
  patternKey,
  isWellFormedPattern,
} from '../src/core/pattern'
import { bindCases } from './verify-cases'
import { mulberry32, pick } from './lib/random'

/** Candidates generated per case, before keeping the best few. */
const CANDIDATES_PER_CASE = 180
const SCRAMBLES_PER_CASE = 20
const SEED = 0x0110

/**
 * Last-layer permutation algorithms. Every one leaves orientation untouched,
 * which the script asserts before using them, so composing them with a case
 * state can only ever move within that case.
 *
 * None contains a cube rotation: a net rotation would silently reframe the
 * case and produce scrambles for a different one.
 */
const PERMUTATIONS: readonly string[] = [
  'U',
  'U2',
  "U'",
  "R U R' U' R' F R2 U' R' U' R U R' F'", // T
  "M2 U M U2 M' U M2", // Ua
  "M2 U' M U2 M' U' M2", // Ub
  'M2 U M2 U2 M2 U M2', // H
  "R U R' F' R U R' U' R' F R2 U' R' U'", // Jb
  "F R U' R' U' R U R' F' R U R' U' R' F R F'", // Y
]

const UNTOUCHED_FACELETS = Array.from({ length: 54 }, (_, i) => i).filter(
  (i) => !SLOT_FACELETS.includes(i),
)

function firstTwoLayersSolved(cube: Cube): boolean {
  return UNTOUCHED_FACELETS.every((i) => cube[i] === SOLVED[i])
}

/** Rejects a permutation algorithm that turns or rotates anything it should not. */
function assertPermutationOnly(alg: string): void {
  const cube = applyMoves(SOLVED, alg)
  const solvedPattern = patternKey(patternFromCube(SOLVED))
  if (!firstTwoLayersSolved(cube) || patternKey(patternFromCube(cube)) !== solvedPattern) {
    throw new Error(`permutation algorithm changes orientation or breaks F2L: ${alg}`)
  }
}

/** Prefer short scrambles, then ones that avoid the slower back and down faces. */
function awkwardness(scramble: string): number {
  const moves = parseMoves(scramble)
  const awkward = moves.filter((m) => m.base === 'B' || m.base === 'D' || m.base === 'L').length
  return moves.length * 4 + awkward
}

async function main() {
  for (const alg of PERMUTATIONS) assertPermutationOnly(alg)

  const cases = bindCases()
  const kpuzzle = await cube3x3x3.kpuzzle()
  const random = mulberry32(SEED)
  const result = new Map<number, string[]>()

  const started = Date.now()
  for (const ollCase of cases) {
    const expected = patternKey(ollCase.pattern)
    // The pattern the algorithm's inverse produces, before canonicalising.
    const exact = patternKey(patternFromCube(applyMoves(SOLVED, invertMoves(ollCase.alg))))
    const scrambles = new Map<string, number>()

    for (let i = 0; i < CANDIDATES_PER_CASE; i++) {
      const word = Array.from({ length: 1 + Math.floor(random() * 3) }, () =>
        pick(random, PERMUTATIONS),
      ).join(' ')
      // Permutation FIRST. Composing (pi_g, 0) with (pi_a, o_a) leaves the
      // orientation vector exactly o_a, so every seed is the same case with a
      // different last-layer permutation. The other order rearranges the
      // per-slot orientations and lands in a *different* case.
      const seedAlg = `${word} ${invertMoves(ollCase.alg)}`

      const seeded = applyMoves(SOLVED, seedAlg)
      if (!firstTwoLayersSolved(seeded) || patternKey(patternFromCube(seeded)) !== exact) {
        throw new Error(`OLL ${ollCase.id}: seed left the case (${seedAlg})`)
      }

      const solution = await experimentalSolve3x3x3IgnoringCenters(
        kpuzzle.defaultPattern().applyAlg(new Alg(seedAlg)),
      )
      const scramble = invertMoves(solution.toString())
      if (scramble.length === 0) continue

      const scrambled = applyMoves(SOLVED, scramble)
      const pattern = patternFromCube(scrambled)
      if (
        !firstTwoLayersSolved(scrambled) ||
        !isWellFormedPattern(pattern) ||
        patternKey(canonicalPattern(pattern)) !== expected
      ) {
        throw new Error(
          `OLL ${ollCase.id}: generated scramble does not reproduce the case: ${scramble}`,
        )
      }
      scrambles.set(scramble, awkwardness(scramble))
    }

    const best = [...scrambles.entries()]
      .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, SCRAMBLES_PER_CASE)
      .map(([scramble]) => scramble)

    if (best.length < SCRAMBLES_PER_CASE) {
      throw new Error(`OLL ${ollCase.id}: only ${best.length} distinct scrambles`)
    }
    result.set(ollCase.id, best)
    process.stdout.write(
      `OLL ${String(ollCase.id).padStart(2)}: ${best.length} scrambles, ` +
        `${parseMoves(best[0]!).length}-${parseMoves(best.at(-1)!).length} moves\n`,
    )
  }

  writeFileSync('src/core/data/scrambles.ts', render(result), 'utf8')
  console.log(
    `\nWrote src/core/data/scrambles.ts in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  )
}

function render(scrambles: ReadonlyMap<number, readonly string[]>): string {
  const entries = [...scrambles.entries()]
    .sort((a, b) => a[0] - b[0])
    // JSON.stringify, because every prime mark in a scramble is an apostrophe.
    .map(
      ([id, list]) =>
        `  ${id}: [\n${list.map((s) => `    ${JSON.stringify(s)},`).join('\n')}\n  ],`,
    )
    .join('\n')
  return `// GENERATED by scripts/generate-scrambles.ts — do not edit by hand.
// Every scramble is verified to reproduce its case; see src/core/data/data.test.ts.

/** Scrambles per OLL case id. Each turns a solved cube into that case. */
export const SCRAMBLES: Readonly<Record<number, readonly string[]>> = {
${entries}
}
`
}

await main()

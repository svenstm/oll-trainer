import { applyMoves, invertMoves, SOLVED } from '../src/core/cube'
import { patternFromCube } from '../src/core/pattern'
import { OLL_ALGORITHMS } from './oll-algorithms'

/**
 * Draws a pattern the way <OllFace> will: U face boxed, side strips outside it.
 *
 * This shows each *algorithm's* own orientation, which is often a rotation of
 * the canonical pattern committed to src/core/data/cases.ts. That is the point
 * — it is a second, independent view of the same data.
 */
function draw(p: readonly number[]): string[] {
  const c = (v: number | undefined) => (v === 1 ? '#' : '.')
  return [
    `  ${c(p[9])}${c(p[10])}${c(p[11])}  `,
    ` ${c(p[20])}${c(p[0])}${c(p[1])}${c(p[2])}${c(p[12])} `,
    ` ${c(p[19])}${c(p[3])}${c(p[4])}${c(p[5])}${c(p[13])} `,
    ` ${c(p[18])}${c(p[6])}${c(p[7])}${c(p[8])}${c(p[14])} `,
    `  ${c(p[15])}${c(p[16])}${c(p[17])}  `,
  ]
}

const order = [...OLL_ALGORITHMS].sort((a, b) => a.id - b.id)
for (let row = 0; row < order.length; row += 6) {
  const chunk = order.slice(row, row + 6)
  const drawings = chunk.map((e) => draw(patternFromCube(applyMoves(SOLVED, invertMoves(e.alg)))))
  console.log(chunk.map((e) => `OLL ${String(e.id).padEnd(3)}`.padEnd(9)).join(' '))
  for (let line = 0; line < 5; line++) {
    console.log(drawings.map((d) => d[line]!.padEnd(9)).join(' '))
  }
  console.log(chunk.map((e) => e.name.slice(0, 8).padEnd(9)).join(' '))
  console.log()
}

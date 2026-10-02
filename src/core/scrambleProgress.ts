/**
 * Following a scramble as it is applied to a tracked cube.
 *
 * Progress is read off the cube's *state*, not matched move by move, so it
 * cannot lose its place: whatever the user did, if the cube is where some
 * prefix of the scramble leaves it, that is how far they have got. A half
 * turn may be done as two quarters either way, so the state between them
 * counts too.
 *
 * Off the path, the turns that bring it back are just the user's stray turns
 * undone, newest first — no solver needed, and the list stays short because
 * consecutive turns of one face merge.
 */

import { applyMove, invertMove, parseMoves, SOLVED, type Cube, type Move } from './cube'

interface Place {
  /** Scramble moves fully applied. */
  done: number
  /** True between the two quarter turns of the next move, a half turn. */
  half: boolean
}

export interface ScrambleTrack {
  moves: readonly Move[]
  /** Cube state key → where in the scramble that state is. */
  places: ReadonlyMap<string, Place>
}

export interface ScrambleProgress extends Place {
  /** Turns that return the cube to the scramble, in order. Empty when on it. */
  correction: readonly Move[]
}

const stateKey = (cube: Cube) => cube.join('')

/**
 * Every state the scramble passes through, applied to `from`. That need not
 * be solved: any cube with F2L solved and the last layer oriented works,
 * since a scramble's effect on F2L and on orientation does not depend on how
 * the last layer is permuted. That is where every solve ends, so the next
 * scramble can start straight away.
 */
export function trackScramble(scramble: string, from: Cube = SOLVED): ScrambleTrack {
  const moves = parseMoves(scramble)
  const places = new Map<string, Place>()
  const remember = (cube: Cube, place: Place) => {
    const key = stateKey(cube)
    // The first visit wins, so a state the scramble passes through twice
    // reports the earlier, more cautious place.
    if (!places.has(key)) places.set(key, place)
  }

  let cube = from
  remember(cube, { done: 0, half: false })
  moves.forEach((move, index) => {
    if (move.amount === 2) {
      remember(applyMove(cube, { base: move.base, amount: 1 }), { done: index, half: true })
      remember(applyMove(cube, { base: move.base, amount: 3 }), { done: index, half: true })
    }
    cube = applyMove(cube, move)
    remember(cube, { done: index + 1, half: false })
  })
  return { moves, places }
}

export const START: ScrambleProgress = { done: 0, half: false, correction: [] }

/** Prepends `move` to `moves`, merging it into the first if it turns the same face. */
function pushFront(move: Move, moves: readonly Move[]): Move[] {
  const [first, ...rest] = moves
  if (!first || first.base !== move.base) return [move, ...moves]
  const amount = (move.amount + first.amount) % 4
  return amount === 0 ? rest : [{ base: move.base, amount: amount as 1 | 2 | 3 }, ...rest]
}

/** Where the scramble stands after `move` left the cube in state `cube`. */
export function advance(
  progress: ScrambleProgress,
  track: ScrambleTrack,
  cube: Cube,
  move: Move,
): ScrambleProgress {
  const place = track.places.get(stateKey(cube))
  if (place) return { ...place, correction: [] }
  return {
    done: progress.done,
    half: progress.half,
    correction: pushFront(invertMove(move), progress.correction),
  }
}

/**
 * Where the scramble stands for a cube seen with no move to explain it — on
 * connecting, or when a new scramble is served. Off the path there is no
 * history to undo, so there is no correction to offer either.
 */
export function locate(track: ScrambleTrack, cube: Cube): ScrambleProgress | null {
  const place = track.places.get(stateKey(cube))
  return place ? { ...place, correction: [] } : null
}

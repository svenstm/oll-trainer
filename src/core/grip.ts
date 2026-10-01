/**
 * Turning what a smart cube reports into the frame the user trains in.
 *
 * A smart cube tracks its state against its own centres: white is always U,
 * green always F, whichever way up it is held. Scrambles and angles are
 * written for the user's grip — usually yellow on top — so every state and
 * every move is re-expressed in that frame before anything else sees it.
 *
 * Both conversions are derived from the cube model rather than tabulated, the
 * same way `rotate.ts` derives its conjugation table.
 */

import {
  applyMove,
  applyMoves,
  cubesEqual,
  FACES,
  formatMove,
  parseMove,
  SOLVED,
  type Cube,
  type Move,
} from './cube'

export const COLOURS = ['white', 'yellow', 'green', 'blue', 'red', 'orange'] as const
export type Colour = (typeof COLOURS)[number]

export interface Grip {
  top: Colour
  front: Colour
}

export const DEFAULT_GRIP: Grip = { top: 'yellow', front: 'green' }

/** Where each colour's centre sits in the cube's own frame (the WCA scheme). */
const HOME: Readonly<Record<Colour, number>> = {
  white: 0,
  red: 1,
  green: 2,
  yellow: 3,
  orange: 4,
  blue: 5,
}

/** Face index of the centre sticker of each face, in `Cube` layout. */
const CENTRES = FACES.map((_, face) => face * 9 + 4)

const OPPOSITE: Readonly<Record<Colour, Colour>> = {
  white: 'yellow',
  yellow: 'white',
  green: 'blue',
  blue: 'green',
  red: 'orange',
  orange: 'red',
}

export function isValidGrip(grip: Grip): boolean {
  return grip.top !== grip.front && OPPOSITE[grip.top] !== grip.front
}

/** The colours that can face the user with `top` on top. */
export function frontColours(top: Colour): Colour[] {
  return COLOURS.filter((colour) => isValidGrip({ top, front: colour }))
}

const ORIENTATIONS = ['', 'x', 'x2', "x'", 'z', "z'"].flatMap((tilt) =>
  ['', 'y', 'y2', "y'"].map((spin) => `${tilt} ${spin}`.trim()),
)

const rotationCache = new Map<string, string>()

/** The whole-cube rotation that brings the grip's colours to U and F. */
export function gripRotation(grip: Grip): string {
  const cacheKey = `${grip.top}/${grip.front}`
  const cached = rotationCache.get(cacheKey)
  if (cached !== undefined) return cached
  if (!isValidGrip(grip)) throw new Error(`Not a grip: ${cacheKey}`)

  const rotation = ORIENTATIONS.find((candidate) => {
    const turned = candidate === '' ? SOLVED : applyMoves(SOLVED, candidate)
    return turned[CENTRES[0]!] === HOME[grip.top] && turned[CENTRES[2]!] === HOME[grip.front]
  })!
  rotationCache.set(cacheKey, rotation)
  return rotation
}

/**
 * The cube as the user sees it: turned to the grip, then relabelled so each
 * sticker names the face whose centre it matches. After that, `SOLVED` means
 * solved and `U` means "the colour on top", whatever that colour is.
 */
export function toGripFrame(cube: Cube, grip: Grip): Cube {
  const rotation = gripRotation(grip)
  const turned = rotation === '' ? cube : applyMoves(cube, rotation)
  const faceOf = new Map(CENTRES.map((centre, face) => [turned[centre]!, face]))
  return turned.map((sticker) => faceOf.get(sticker)!)
}

/** An arbitrary state with no symmetry, so only one move can explain a difference. */
const PROBE = applyMoves(SOLVED, "R U2 F' L D2 B R' U F2")
const FACE_MOVES = FACES.flatMap((face) => ['', '2', "'"].map((suffix) => parseMove(face + suffix)))

const moveCache = new Map<string, Move>()

/** A move the cube reports, as the move the user made in their grip. */
export function moveToGripFrame(move: Move, grip: Grip): Move {
  const cacheKey = `${grip.top}/${grip.front}/${formatMove(move)}`
  const cached = moveCache.get(cacheKey)
  if (cached) return cached

  const after = toGripFrame(applyMove(PROBE, move), grip)
  const before = toGripFrame(PROBE, grip)
  const match = FACE_MOVES.find((candidate) => cubesEqual(applyMove(before, candidate), after))
  if (!match) throw new Error(`No face move matches ${formatMove(move)}`)
  moveCache.set(cacheKey, match)
  return match
}

/**
 * Reads a facelet string in the Kociemba layout smart cubes report
 * (`UUUUUUUUURRR…`, URFDLB, each face row-major in the standard net) — the
 * same layout `Cube` uses, so this is only a change of alphabet.
 */
export function parseFacelets(facelets: string): Cube | null {
  if (facelets.length !== 54) return null
  const cube = [...facelets].map((letter) => FACES.indexOf(letter as (typeof FACES)[number]))
  return cube.every((face) => face >= 0) ? cube : null
}

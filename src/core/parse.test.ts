import { describe, expect, it } from 'vitest'

import { DEFAULT_GRIP } from './grip'
import { DEFAULT_SETTINGS, parseSettings, parseSolve } from './parse'

const BASE = { id: 'a', caseId: 27, scramble: 'R U', rotation: '', ts: 1, mode: 'train' }

describe('parseSolve, smart-cube fields', () => {
  it('reads an older solve with neither field, and adds neither', () => {
    const solve = parseSolve({ ...BASE, outcome: 'solved', ms: 1500 })
    expect(solve).not.toHaveProperty('input')
    expect(solve).not.toHaveProperty('recognitionMs')
  })

  it('keeps the input and the recognition time', () => {
    expect(
      parseSolve({ ...BASE, outcome: 'solved', ms: 1500, input: 'cube', recognitionMs: 600 }),
    ).toMatchObject({ input: 'cube', ms: 1500, recognitionMs: 600 })
    expect(parseSolve({ ...BASE, outcome: 'unknown', input: 'cube' })).toMatchObject({
      outcome: 'unknown',
      input: 'cube',
    })
  })

  it('drops an unknown input and an impossible recognition time', () => {
    const solve = parseSolve({
      ...BASE,
      outcome: 'solved',
      ms: 1500,
      input: 'telepathy',
      recognitionMs: 2000,
    })
    expect(solve).not.toHaveProperty('input')
    expect(solve).not.toHaveProperty('recognitionMs')
  })
})

describe('parseSettings, grip', () => {
  it('defaults to yellow on top, green in front', () => {
    expect(parseSettings({})?.grip).toEqual(DEFAULT_GRIP)
    expect(DEFAULT_SETTINGS.grip).toEqual({ top: 'yellow', front: 'green' })
  })

  it('keeps a valid grip and replaces an impossible one', () => {
    expect(parseSettings({ grip: { top: 'white', front: 'red' } })?.grip).toEqual({
      top: 'white',
      front: 'red',
    })
    expect(parseSettings({ grip: { top: 'white', front: 'yellow' } })?.grip).toEqual(DEFAULT_GRIP)
  })
})

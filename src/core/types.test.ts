import { describe, expect, it } from 'vitest'
import { MODES, isMode } from './types'

describe('isMode', () => {
  it('accepts every declared mode', () => {
    expect(MODES.every(isMode)).toBe(true)
  })

  it('rejects anything else', () => {
    // Route params arrive as strings or arrays of strings, hence the odd cases.
    expect([0, 'Train', '', undefined, ['learn']].some(isMode)).toBe(false)
  })
})

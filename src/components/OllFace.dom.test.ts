import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import OllFace from './OllFace.vue'
import { CASES_BY_ID } from '@/core/data/cases'
import { SOLVED_PATTERN } from '@/core/pattern'

/** Every rect the component drew, by slot. */
function slots(wrapper: ReturnType<typeof mount>) {
  return new Map(
    wrapper
      .findAll('rect')
      .map((rect) => [
        Number(rect.attributes('data-slot')),
        rect.attributes('data-oriented') === 'true',
      ]),
  )
}

describe('OllFace', () => {
  it('always draws the nine U-face stickers', () => {
    const drawn = slots(mount(OllFace, { props: { pattern: CASES_BY_ID.get(27)!.pattern } }))
    for (let slot = 0; slot < 9; slot++) expect(drawn.has(slot), `slot ${slot}`).toBe(true)
  })

  it('draws a side sticker only where the case shows one', () => {
    for (const id of [1, 20, 27, 45, 57]) {
      const pattern = CASES_BY_ID.get(id)!.pattern
      const drawn = slots(mount(OllFace, { props: { pattern } }))
      for (let slot = 9; slot < 21; slot++) {
        expect(drawn.has(slot), `OLL ${id} slot ${slot}`).toBe(pattern[slot] === 1)
      }
    }
  })

  it('draws the solved pattern as nine bright stickers and no tabs', () => {
    const drawn = slots(mount(OllFace, { props: { pattern: SOLVED_PATTERN } }))
    expect(drawn.size).toBe(9)
    expect([...drawn.values()].every(Boolean)).toBe(true)
  })

  it('is labelled for screen readers only when given a label', () => {
    const pattern = CASES_BY_ID.get(27)!.pattern
    const labelled = mount(OllFace, { props: { pattern, label: 'OLL 27, Sune' } })
    expect(labelled.attributes('role')).toBe('img')
    expect(labelled.attributes('aria-label')).toBe('OLL 27, Sune')
    expect(mount(OllFace, { props: { pattern } }).attributes('role')).toBe('presentation')
  })
})

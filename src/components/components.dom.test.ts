import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import Sparkline from './Sparkline.vue'
import UndoToast from './UndoToast.vue'

describe('Sparkline', () => {
  it('draws nothing at all with no times', () => {
    expect(
      mount(Sparkline, { props: { values: [] } })
        .find('svg')
        .exists(),
    ).toBe(false)
  })

  it('draws only a dot for a single time', () => {
    const wrapper = mount(Sparkline, { props: { values: [3000] } })
    expect(wrapper.find('polyline').exists()).toBe(false)
    expect(wrapper.find('circle').exists()).toBe(true)
  })

  it('puts faster times lower, so improvement trends downwards', () => {
    const wrapper = mount(Sparkline, { props: { values: [5000, 3000], width: 100, height: 20 } })
    const [first, second] = wrapper
      .get('polyline')
      .attributes('points')!
      .split(' ')
      .map((pair) => Number(pair.split(',')[1]))
    expect(second).toBeGreaterThan(first!)
  })

  it('sits in the middle when every time is identical, rather than dividing by zero', () => {
    const points = mount(Sparkline, { props: { values: [3000, 3000, 3000], height: 20 } })
      .get('polyline')
      .attributes('points')!
      .split(' ')
      .map((pair) => Number(pair.split(',')[1]))
    expect(points.every((y) => y === points[0])).toBe(true)
    expect(points[0]).toBeCloseTo(10, 0)
    expect(points.every(Number.isFinite)).toBe(true)
  })

  it('stays inside its box', () => {
    const wrapper = mount(Sparkline, {
      props: { values: [1000, 9000, 4000, 2000], width: 72, height: 20 },
    })
    for (const pair of wrapper.get('polyline').attributes('points')!.split(' ')) {
      const [x, y] = pair.split(',').map(Number)
      expect(x!).toBeGreaterThanOrEqual(0)
      expect(x!).toBeLessThanOrEqual(72)
      expect(y!).toBeGreaterThanOrEqual(0)
      expect(y!).toBeLessThanOrEqual(20)
    }
  })

  it('describes itself for screen readers', () => {
    const wrapper = mount(Sparkline, { props: { values: [1000, 9000] } })
    expect(wrapper.get('svg').attributes('aria-label')).toBe('2 solves, best 1.00, worst 9.00')
  })
})

describe('UndoToast', () => {
  it('stays hidden with nothing to undo', () => {
    expect(
      mount(UndoToast, { props: { text: null } })
        .find('[data-testid="undo-toast"]')
        .exists(),
    ).toBe(false)
  })

  it('asks rather than acting', async () => {
    const wrapper = mount(UndoToast, { props: { text: 'Deleted 3.00' } })
    expect(wrapper.get('[data-testid="undo-toast"]').text()).toContain('Deleted 3.00')
    await wrapper.get('[data-testid="undo"]').trigger('click')
    expect(wrapper.emitted('undo')).toHaveLength(1)
    await wrapper.get('[data-testid="dismiss-toast"]').trigger('click')
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })
})

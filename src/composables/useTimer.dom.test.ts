import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useTimer } from './useTimer'

const key = (type: 'keydown' | 'keyup', init: KeyboardEventInit) =>
  window.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init }))

/** Mounts a component that does nothing but run the composable. */
function harness(holdMs = 0) {
  const solves: number[] = []
  const shortcuts: string[] = []
  const hold = ref(holdMs)
  const enabled = ref(true)
  let api: ReturnType<typeof useTimer>

  const wrapper = mount(
    defineComponent({
      setup() {
        api = useTimer({
          holdMs: hold,
          enabled,
          onSolve: (ms) => solves.push(ms),
          onShortcut: (event) => shortcuts.push(event.key),
        })
        // Bound the way PracticeView binds them, so a dispatched touch event
        // travels the real path: up to the surface, with the control as target.
        return () =>
          h(
            'section',
            {
              'data-testid': 'surface',
              onTouchstart: api.touchHandlers.touchstart,
              onTouchend: api.touchHandlers.touchend,
            },
            [
              h('input'),
              h('button', { 'data-testid': 'btn' }, 'press me'),
              h('a', { href: '#x', 'data-testid': 'link' }, 'go'),
              h('span', { 'data-testid': 'plain' }, 'not interactive'),
              api.phase.value,
            ],
          )
      },
    }),
    { attachTo: document.body },
  )

  return { wrapper, solves, shortcuts, hold, enabled, key, api: () => api }
}

describe('useTimer keyboard wiring', () => {
  it('runs a solve: space down, space up, any key down', () => {
    const { key, solves, api } = harness(0)
    key('keydown', { key: ' ' })
    expect(api().phase.value).toBe('ready')
    key('keyup', { key: ' ' })
    expect(api().phase.value).toBe('running')
    key('keydown', { key: 'a' })
    expect(api().phase.value).toBe('stopped')
    expect(solves).toHaveLength(1)
    key('keyup', { key: 'a' })
    expect(api().phase.value).toBe('idle')
  })

  it('leaves the time on screen after the stop key is released', () => {
    const { key, api } = harness(0)
    key('keydown', { key: ' ' })
    key('keyup', { key: ' ' })
    key('keydown', { key: 'a' })
    const stopped = api().displayMs.value
    key('keyup', { key: 'a' })
    expect(api().phase.value).toBe('idle')
    expect(api().displayMs.value).toBe(stopped)
  })

  it('clears the time when the next attempt begins', () => {
    const { key, api } = harness(0)
    key('keydown', { key: ' ' })
    key('keyup', { key: ' ' })
    key('keydown', { key: 'a' })
    key('keyup', { key: 'a' })
    key('keydown', { key: ' ' })
    expect(api().displayMs.value).toBe(0)
  })

  it('clears the time on Escape once the solve is over', () => {
    const { key, api } = harness(0)
    key('keydown', { key: ' ' })
    key('keyup', { key: ' ' })
    key('keydown', { key: 'a' })
    key('keyup', { key: 'a' })
    expect(api().displayMs.value).toBeGreaterThan(0)
    key('keydown', { key: 'Escape' })
    expect(api().displayMs.value).toBe(0)
  })

  it('treats Escape while running as any other key: it stops and records', () => {
    const { key, solves, api } = harness(0)
    key('keydown', { key: ' ' })
    key('keyup', { key: ' ' })
    key('keydown', { key: 'Escape' })
    expect(api().phase.value).toBe('stopped')
    expect(solves).toHaveLength(1)
  })

  it('ignores key repeat, so holding space does not re-trigger', () => {
    const { key, api } = harness(0)
    key('keydown', { key: ' ' })
    key('keydown', { key: ' ', repeat: true })
    expect(api().phase.value).toBe('ready')
  })

  it('waits for the hold before arming', () => {
    const { key, api } = harness(5000)
    key('keydown', { key: ' ' })
    expect(api().phase.value).toBe('holding')
    key('keyup', { key: ' ' })
    expect(api().phase.value).toBe('idle')
  })

  it('sends other keys to the view as shortcuts while not running', () => {
    const { key, shortcuts } = harness(0)
    key('keydown', { key: 'Delete' })
    key('keydown', { key: 'u' })
    expect(shortcuts).toEqual(['Delete', 'u'])
  })

  it('stops the timer on a shortcut key rather than acting on it', () => {
    const { key, shortcuts, solves } = harness(0)
    key('keydown', { key: ' ' })
    key('keyup', { key: ' ' })
    key('keydown', { key: 'Delete' })
    expect(solves).toHaveLength(1)
    // Delete must not also have deleted a solve on the way past.
    expect(shortcuts).toEqual([])
  })

  it('cancels a hold on Escape without recording a solve', () => {
    const { key, solves, shortcuts, api } = harness(5000)
    key('keydown', { key: ' ' })
    key('keydown', { key: 'Escape' })
    expect(api().phase.value).toBe('idle')
    expect(solves).toEqual([])
    expect(shortcuts).toEqual(['Escape'])
  })

  // Regression: the touch handlers were on <main>, which covers the whole
  // screen, so every tap in the practice view armed the timer and had its
  // click prevented. No control in the view worked on a phone.
  describe('taps and keys aimed at a control', () => {
    it.each(['btn', 'link', 'input'])('leave the timer alone for %s', (which) => {
      const { wrapper, api, solves } = harness(0)
      const target =
        which === 'input'
          ? wrapper.find('input').element
          : wrapper.get(`[data-testid="${which}"]`).element

      // Dispatched *on* the control, so it bubbles to the surface with the
      // control as target — exactly what happens when a thumb lands on it.
      const tap = new TouchEvent('touchstart', { cancelable: true, bubbles: true })
      target.dispatchEvent(tap)
      target.dispatchEvent(
        new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }),
      )

      expect(api().phase.value).toBe('idle')
      expect(solves).toEqual([])
      // And the tap is not swallowed, so the control still activates.
      expect(tap.defaultPrevented).toBe(false)
    })

    it('still arms from a tap on the surface itself', () => {
      const { wrapper, api } = harness(0)
      wrapper
        .get('[data-testid="plain"]')
        .element.dispatchEvent(new TouchEvent('touchstart', { cancelable: true, bubbles: true }))
      expect(api().phase.value).toBe('ready')
    })

    it('does not let space on a focused button arm instead of pressing it', () => {
      const { wrapper, api } = harness(0)
      const button = wrapper.get('[data-testid="btn"]').element as HTMLButtonElement
      button.focus()
      const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
      button.dispatchEvent(event)
      expect(api().phase.value).toBe('idle')
      // Not prevented, so the browser's own activation still happens.
      expect(event.defaultPrevented).toBe(false)
    })

    it('still stops a running timer, whatever has focus', () => {
      const { wrapper, api, solves } = harness(0)
      key('keydown', { key: ' ' })
      key('keyup', { key: ' ' })
      const button = wrapper.get('[data-testid="btn"]').element
      button.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      )
      expect(solves).toHaveLength(1)
      expect(api().phase.value).toBe('stopped')
    })

    it('releases out of stopped even with a control focused', () => {
      const { wrapper, api } = harness(0)
      key('keydown', { key: ' ' })
      key('keyup', { key: ' ' })
      key('keydown', { key: 'a' })
      const button = wrapper.get('[data-testid="btn"]').element
      button.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }))
      expect(api().phase.value).toBe('idle')
    })
  })

  it('does nothing while the user is typing in a field', () => {
    const { wrapper, solves, api } = harness(0)
    const input = wrapper.find('input').element
    input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    expect(api().phase.value).toBe('idle')
    expect(solves).toEqual([])
  })

  it('prevents space from scrolling the page', () => {
    harness(0)
    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('starts and stops on touch, as taps rather than keys', () => {
    const { api, solves } = harness(0)
    const handlers = api().touchHandlers
    const touch = () => new TouchEvent('touchstart', { cancelable: true })
    handlers.touchstart(touch())
    expect(api().phase.value).toBe('ready')
    handlers.touchend(new TouchEvent('touchend', { cancelable: true }))
    expect(api().phase.value).toBe('running')
    handlers.touchstart(touch())
    expect(solves).toHaveLength(1)
  })

  it('unhooks its listeners when the view goes away', () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    harness(0).wrapper.unmount()
    expect(remove).toHaveBeenCalledWith('keydown', expect.any(Function))
    expect(remove).toHaveBeenCalledWith('keyup', expect.any(Function))
    remove.mockRestore()
  })
})

describe('switched off', () => {
  it('cannot be started by key or by tap', async () => {
    const { wrapper, solves, enabled } = harness()
    enabled.value = false
    key('keydown', { key: ' ' })
    key('keyup', { key: ' ' })
    key('keydown', { key: 'a' })
    expect(solves).toEqual([])

    const surface = wrapper.get('[data-testid="surface"]')
    await surface.trigger('touchstart')
    await surface.trigger('touchend')
    expect(solves).toEqual([])
    expect(wrapper.text()).toContain('idle')
  })

  it('hands space to the view instead, still swallowing the page scroll', () => {
    const { shortcuts, enabled } = harness()
    enabled.value = false
    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    window.dispatchEvent(event)
    expect(shortcuts).toEqual([' '])
    expect(event.defaultPrevented).toBe(true)
  })

  it('gives the timer straight back when switched on again', () => {
    const { solves, enabled } = harness()
    enabled.value = false
    key('keydown', { key: ' ' })
    key('keyup', { key: ' ' })
    enabled.value = true
    key('keydown', { key: ' ' })
    key('keyup', { key: ' ' })
    key('keydown', { key: 'a' })
    expect(solves).toHaveLength(1)
  })
})

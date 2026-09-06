import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { nextTick } from 'vue'

import PracticeView from './PracticeView.vue'
import SelectionView from './SelectionView.vue'
import ResultsPanel from '@/components/ResultsPanel.vue'
import { GROUPED_CASES } from '@/core/groups'
import { resetStorageCache } from '@/stores/persist'
import { useSelectionStore } from '@/stores/selection'
import { useSettingsStore } from '@/stores/settings'
import { useSolvesStore } from '@/stores/solves'
import { isMode, type Mode, type Solve } from '@/core/types'

let pinia: Pinia
let router: Router

// Each view attaches window listeners, so leaving mounted views behind would
// let one test's timer respond to the next test's keystrokes.
enableAutoUnmount(afterEach)

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'selection', component: SelectionView },
      {
        path: '/practice/:mode',
        name: 'practice',
        component: PracticeView,
        props: true,
        beforeEnter: (to) => {
          if (!isMode(to.params.mode)) return { name: 'selection' }
          return useSelectionStore().isEmpty ? { name: 'selection' } : true
        },
      },
      { path: '/:pathMatch(.*)*', redirect: { name: 'selection' } },
    ],
  })
}

beforeEach(async () => {
  localStorage.clear()
  resetStorageCache()
  pinia = createPinia()
  setActivePinia(pinia)
  router = makeRouter()
  await router.push('/')
  await router.isReady()
})

function options() {
  return { global: { plugins: [pinia, router] }, attachTo: document.body }
}

async function mountSelection() {
  const wrapper = mount(SelectionView, options())
  await nextTick()
  return wrapper
}

async function mountPractice(mode: Mode) {
  const wrapper = mount(PracticeView, { props: { mode }, ...options() })
  // onMounted draws the first scramble; the render that shows it is a tick later.
  await nextTick()
  return wrapper
}

const key = (type: 'keydown' | 'keyup', init: KeyboardEventInit) =>
  window.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init }))

/** Drives one complete solve through the practice view's keyboard wiring. */
async function doSolve() {
  key('keydown', { key: ' ' })
  key('keyup', { key: ' ' })
  key('keydown', { key: 'a' })
  key('keyup', { key: 'a' })
  await nextTick()
}

describe('SelectionView', () => {
  it('starts with every case selected', async () => {
    const wrapper = await mountSelection()
    expect(wrapper.get('[data-testid="selection-count"]').text()).toContain('57 of 57')
  })

  it('toggles a single case', async () => {
    const wrapper = await mountSelection()
    const tile = wrapper.get('[data-testid="case-27"]')
    expect(tile.attributes('aria-pressed')).toBe('true')
    await tile.trigger('click')
    expect(tile.attributes('aria-pressed')).toBe('false')
    expect(useSelectionStore().has(27)).toBe(false)
    expect(wrapper.get('[data-testid="selection-count"]').text()).toContain('56 of 57')
  })

  it('toggles a whole group from its header', async () => {
    const wrapper = await mountSelection()
    const group = GROUPED_CASES.find((g) => g.name === 'T-Shapes')!
    await wrapper.get('[data-testid="group-T-Shapes"]').trigger('click')
    for (const c of group.cases) expect(useSelectionStore().has(c.id), `OLL ${c.id}`).toBe(false)
    await wrapper.get('[data-testid="group-T-Shapes"]').trigger('click')
    for (const c of group.cases) expect(useSelectionStore().has(c.id), `OLL ${c.id}`).toBe(true)
  })

  it('selects all and none', async () => {
    const wrapper = await mountSelection()
    await wrapper.get('[data-testid="select-none"]').trigger('click')
    expect(useSelectionStore().count).toBe(0)
    expect(wrapper.find('[data-testid="empty-warning"]').exists()).toBe(true)
    await wrapper.get('[data-testid="select-all"]').trigger('click')
    expect(useSelectionStore().count).toBe(57)
    expect(wrapper.find('[data-testid="empty-warning"]').exists()).toBe(false)
  })

  it('shows every case exactly once, across the fourteen groups', async () => {
    const wrapper = await mountSelection()
    expect(wrapper.findAll('[data-testid^="case-"]')).toHaveLength(57)
    expect(wrapper.findAll('[data-testid^="group-"]')).toHaveLength(14)
  })
})

describe('the route guard', () => {
  it('lets practice through when something is selected', async () => {
    await router.push({ name: 'practice', params: { mode: 'train' } })
    expect(router.currentRoute.value.name).toBe('practice')
  })

  it('sends an empty selection back to the case list', async () => {
    useSelectionStore().selectNone()
    await router.push({ name: 'practice', params: { mode: 'learn' } })
    expect(router.currentRoute.value.name).toBe('selection')
  })

  it('rejects a mode that is not a mode', async () => {
    await router.push('/practice/nonsense')
    expect(router.currentRoute.value.name).toBe('selection')
  })

  it.each(['train', 'recap', 'learn'] as Mode[])('accepts %s', async (mode) => {
    await router.push({ name: 'practice', params: { mode } })
    expect(router.currentRoute.value.name).toBe('practice')
  })
})

describe('PracticeView', () => {
  beforeEach(() => {
    useSelectionStore().set([27, 21, 33])
    // The default 300ms hold would need real time to elapse before the timer
    // arms; the hold itself is covered in useTimer.dom.test.ts.
    useSettingsStore().update({ holdMs: 0 })
  })

  it('shows a scramble as soon as it opens', async () => {
    const wrapper = await mountPractice('train')
    expect(wrapper.get('[data-testid="scramble"]').text().length).toBeGreaterThan(0)
  })

  it('records a solve and reveals the case that was solved', async () => {
    const wrapper = await mountPractice('train')
    const scramble = wrapper.get('[data-testid="scramble"]').text()
    await doSolve()

    const solves = useSolvesStore()
    expect(solves.count).toBe(1)
    expect(solves.lastSolve!.mode).toBe('train')
    expect(solves.lastSolve!.scramble).toBe(scramble)
    expect([27, 21, 33]).toContain(solves.lastSolve!.caseId)

    const reveal = wrapper.get('[data-testid="case-reveal"]')
    expect(reveal.text()).toContain(`OLL ${solves.lastSolve!.caseId}`)
  })

  it('draws a new scramble after each solve', async () => {
    const wrapper = await mountPractice('recap')
    const seen = new Set<string>()
    for (let i = 0; i < 4; i++) {
      seen.add(wrapper.get('[data-testid="scramble"]').text())
      await doSolve()
    }
    expect(seen.size).toBeGreaterThan(1)
    expect(useSolvesStore().count).toBe(4)
  })

  it('walks recap through the selection in turn', async () => {
    const wrapper = await mountPractice('recap')
    for (let i = 0; i < 3; i++) await doSolve()
    expect(new Set(useSolvesStore().solves.map((s) => s.caseId))).toEqual(new Set([27, 21, 33]))
    expect(wrapper.exists()).toBe(true)
  })

  it('deletes the last solve on Delete', async () => {
    await mountPractice('train')
    await doSolve()
    await doSolve()
    expect(useSolvesStore().count).toBe(2)
    key('keydown', { key: 'Delete' })
    await nextTick()
    expect(useSolvesStore().count).toBe(1)
  })

  it('clears the session on Shift+Delete without losing the history', async () => {
    await mountPractice('train')
    await doSolve()
    key('keydown', { key: 'Delete', shiftKey: true })
    await nextTick()
    const solves = useSolvesStore()
    expect(solves.count).toBe(1)
    expect(solves.sessionSolves).toHaveLength(0)
  })

  it('unselects the revealed case on U, and moves on', async () => {
    const wrapper = await mountPractice('train')
    await doSolve()
    const solved = useSolvesStore().lastSolve!.caseId
    key('keydown', { key: 'u' })
    await nextTick()
    expect(useSelectionStore().has(solved)).toBe(false)
    expect(wrapper.find('[data-testid="case-reveal"]').exists()).toBe(false)
  })

  it('leaves practice when the selection empties', async () => {
    await mountPractice('train')
    useSelectionStore().selectNone()
    await nextTick()
    await router.isReady()
    expect(router.currentRoute.value.name).toBe('selection')
  })

  it('shows the learn status line only in learn mode', async () => {
    const train = await mountPractice('train')
    expect(train.find('[data-testid="learn-status"]').exists()).toBe(false)
    train.unmount()

    const learn = await mountPractice('learn')
    expect(learn.get('[data-testid="learn-status"]').text()).toContain('/ 3 introduced')
  })

  it('needs two clicks to reset progress, and no dialog', async () => {
    const wrapper = await mountPractice('train')
    await doSolve()
    await wrapper.get('[data-testid="settings-toggle"]').trigger('click')
    const reset = wrapper.get('[data-testid="reset-progress"]')
    await reset.trigger('click')
    expect(useSolvesStore().count).toBe(1)
    expect(reset.text()).toContain('Really delete')
    await reset.trigger('click')
    expect(useSolvesStore().count).toBe(0)
  })

  it('disarms the reset when the settings panel closes', async () => {
    const wrapper = await mountPractice('train')
    await doSolve()
    await wrapper.get('[data-testid="settings-toggle"]').trigger('click')
    await wrapper.get('[data-testid="reset-progress"]').trigger('click')
    await wrapper.get('[data-testid="settings-toggle"]').trigger('click')
    await wrapper.get('[data-testid="settings-toggle"]').trigger('click')
    expect(wrapper.get('[data-testid="reset-progress"]').text()).toBe('Reset all progress')
  })
})

describe('ResultsPanel', () => {
  const solve = (id: string, caseId: number, ms: number): Solve => ({
    id,
    caseId,
    ms,
    scramble: 'R U',
    rotation: '',
    ts: 1000,
    mode: 'train',
  })

  const solves = [solve('a', 27, 3000), solve('b', 21, 5000), solve('c', 27, 1000)]

  it('opens on the session tab and summarises it', () => {
    const wrapper = mount(ResultsPanel, {
      props: { sessionSolves: solves, allSolves: solves, mode: 'train' },
    })
    expect(wrapper.find('[data-testid="panel-session"]').exists()).toBe(true)
    const text = wrapper.get('[data-testid="panel-session"]').text()
    expect(text).toContain('3')
    expect(text).toContain('1.00')
    expect(text).toContain('5.00')
  })

  it('lists the session newest first', () => {
    const wrapper = mount(ResultsPanel, {
      props: { sessionSolves: solves, allSolves: solves, mode: 'train' },
    })
    const rows = wrapper.findAll('[data-testid="panel-session"] li')
    expect(rows[0]!.text()).toContain('1.00')
    expect(rows[2]!.text()).toContain('3.00')
  })

  it('switches to the cases tab and groups by case', async () => {
    const wrapper = mount(ResultsPanel, {
      props: { sessionSolves: solves, allSolves: solves, mode: 'train' },
    })
    await wrapper.get('[data-testid="tab-cases"]').trigger('click')
    expect(wrapper.find('[data-testid="panel-session"]').exists()).toBe(false)
    const rows = wrapper.findAll('[data-testid="panel-cases"] tbody tr')
    expect(rows).toHaveLength(2)
    // Slowest first: OLL 21 at 5.00 beats OLL 27's mean of 2.00.
    expect(rows[0]!.text()).toContain('OLL 21')
    expect(rows[1]!.text()).toContain('2x')
  })

  it('asks to delete a solve rather than deleting it itself', async () => {
    const wrapper = mount(ResultsPanel, {
      props: { sessionSolves: solves, allSolves: solves, mode: 'train' },
    })
    await wrapper.get('[data-testid="delete-b"]').trigger('click')
    expect(wrapper.emitted('delete')).toEqual([['b']])
  })

  it('says so when there is nothing to show', () => {
    const wrapper = mount(ResultsPanel, {
      props: { sessionSolves: [], allSolves: [], mode: 'train' },
    })
    expect(wrapper.text()).toContain('Nothing solved this session yet')
  })
})

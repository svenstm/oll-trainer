import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter, type RouteRecordRaw, type Router } from 'vue-router'
import { nextTick } from 'vue'

import LandingView from './LandingView.vue'
import PracticeView from './PracticeView.vue'
import SelectionView from './SelectionView.vue'
import OllFace from '@/components/OllFace.vue'
import ResultsPanel from '@/components/ResultsPanel.vue'
import { applyMoves, SOLVED } from '@/core/cube'
import { CASES_BY_ID } from '@/core/data/cases'
import { GROUPED_CASES } from '@/core/groups'
import { canonicalPattern, patternFromCube, patternKey, SOLVED_PATTERN } from '@/core/pattern'
import { routes } from '@/router/routes'
import { resetStorageCache } from '@/stores/persist'
import { useSelectionStore } from '@/stores/selection'
import { useSettingsStore } from '@/stores/settings'
import { useSolvesStore } from '@/stores/solves'
import type { Mode, Solve } from '@/core/types'

let pinia: Pinia
let router: Router

// Each view attaches window listeners, so leaving mounted views behind would
// let one test's timer respond to the next test's keystrokes.
enableAutoUnmount(afterEach)

/**
 * The app's real route table, under a memory history. Restating the routes
 * here would let these tests pass while the paths the app actually ships are
 * wrong — which is exactly what moving the trainer to /oll-trainer risked.
 */
function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: routes as RouteRecordRaw[],
  })
}

beforeEach(async () => {
  localStorage.clear()
  resetStorageCache()
  pinia = createPinia()
  setActivePinia(pinia)
  router = makeRouter()
  await router.push('/oll-trainer')
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

async function mountLanding() {
  const wrapper = mount(LandingView, options())
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

describe('LandingView', () => {
  it('leads with the tagline', async () => {
    const wrapper = await mountLanding()
    expect(wrapper.get('h1').text()).toBe('The Art of the Last Layer')
  })

  it('shows one face per shape group, so the grid cannot silently empty', async () => {
    const wrapper = await mountLanding()
    expect(wrapper.findAllComponents(OllFace)).toHaveLength(GROUPED_CASES.length + 1) // + the Sune mark
  })

  it('points its call to action at the trainer', async () => {
    const wrapper = await mountLanding()
    const href = wrapper.get('[data-testid="landing-cta"]').attributes('href')
    expect(href).toBe('/oll-trainer')
  })
})

describe('where the pages live', () => {
  it('puts the landing page on the domain root', async () => {
    await router.push('/')
    expect(router.currentRoute.value.name).toBe('landing')
  })

  it('puts the trainer under /oll-trainer', async () => {
    await router.push('/oll-trainer')
    expect(router.currentRoute.value.name).toBe('selection')
  })

  /**
   * The build emits `dist/oll-trainer/index.html` so Pages serves the trainer
   * with a real 200, and Pages redirects a directory to add its trailing
   * slash. That only works if these paths resolve too.
   */
  it.each(['/oll-trainer/', '/oll-trainer/practice/train/'])(
    'tolerates the trailing slash Pages adds: %s',
    async (path) => {
      await router.push(path)
      expect(router.currentRoute.value.name).not.toBe('landing')
    },
  )

  it('sends an unknown path to the landing page', async () => {
    await router.push('/no-such-page')
    expect(router.currentRoute.value.name).toBe('landing')
  })

  it('offers a way back to the landing page from the trainer', async () => {
    const wrapper = await mountSelection()
    expect(wrapper.get('[data-testid="home-link"]').attributes('href')).toBe('/')
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
    await router.push('/oll-trainer/practice/nonsense')
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
    outcome: 'solved',
    mode: 'train',
  })

  const blank = (id: string, caseId: number): Solve => ({
    id,
    caseId,
    scramble: 'R U',
    rotation: '',
    ts: 1000,
    outcome: 'unknown',
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

  it('keeps a blank out of every time statistic, and counts it separately', () => {
    const withBlank = [...solves, blank('d', 27)]
    const wrapper = mount(ResultsPanel, {
      props: { sessionSolves: withBlank, allSolves: withBlank, mode: 'train' },
    })
    // The solves tile still says 3: a blank is not a solve.
    expect(wrapper.get('[data-testid="blank-count"]').text()).toContain('1 blanked')
    const summary = wrapper.get('[data-testid="panel-session"] dl').text()
    // The mean is unchanged at 3.00 — a zero folded in would have halved it.
    expect(summary).toContain('3.00')
    expect(summary).toContain('1.00')
  })

  it('shows a blank in the list with no time, and names it for a screen reader', () => {
    const withBlank = [blank('d', 27), ...solves]
    const wrapper = mount(ResultsPanel, {
      props: { sessionSolves: withBlank, allSolves: withBlank, mode: 'train' },
    })
    const rows = wrapper.findAll('[data-testid="panel-session"] li')
    // Newest first, and the blank is the oldest here.
    expect(rows.at(-1)!.find('[data-testid="blank-time"]').exists()).toBe(true)
    expect(rows.at(-1)!.text()).toContain("Didn't know")
    expect(wrapper.get('[data-testid="delete-d"]').attributes('aria-label')).toBe(
      'Delete the blank for OLL 27',
    )
  })

  it('tallies blanks per case without disturbing the mean or the count', async () => {
    const withBlank = [...solves, blank('d', 27), blank('e', 27)]
    const wrapper = mount(ResultsPanel, {
      props: { sessionSolves: withBlank, allSolves: withBlank, mode: 'train' },
    })
    await wrapper.get('[data-testid="tab-cases"]').trigger('click')
    expect(wrapper.get('[data-testid="blanks-27"]').text()).toContain('2')
    const row = wrapper.findAll('[data-testid="panel-cases"] tbody tr').at(-1)!
    expect(row.text()).toContain('2x')
    expect(row.text()).toContain('2.00')
  })

  it('puts a case you have only ever blanked on above the merely slow ones', async () => {
    const withBlank = [...solves, blank('d', 33)]
    const wrapper = mount(ResultsPanel, {
      props: { sessionSolves: withBlank, allSolves: withBlank, mode: 'train' },
    })
    await wrapper.get('[data-testid="tab-cases"]').trigger('click')
    const rows = wrapper.findAll('[data-testid="panel-cases"] tbody tr')
    expect(rows[0]!.text()).toContain('OLL 33')
  })

  it('says so when there is nothing to show', () => {
    const wrapper = mount(ResultsPanel, {
      props: { sessionSolves: [], allSolves: [], mode: 'train' },
    })
    expect(wrapper.text()).toContain('Nothing solved this session yet')
  })
})

describe('backup', () => {
  it('offers export and import on the case list', async () => {
    const wrapper = await mountSelection()
    expect(wrapper.find('[data-testid="export-backup"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="import-backup"]').exists()).toBe(true)
  })

  it('merges an imported history into what is already there', async () => {
    useSelectionStore().set([27, 21, 33])
    useSettingsStore().update({ holdMs: 0 })
    const wrapper = await mountPractice('train')
    await doSolve()
    const mine = useSolvesStore().solves[0]!

    const backup = JSON.stringify({
      app: 'oll-trainer',
      version: 1,
      solves: [
        { id: 'theirs', caseId: 45, ms: 2500, ts: mine.ts - 60_000, mode: 'learn', rotation: 'y' },
      ],
      selection: [45],
    })

    await wrapper.get('[data-testid="settings-toggle"]').trigger('click')
    const input = wrapper.get('[data-testid="import-file"]')
    Object.defineProperty(input.element, 'files', {
      value: [new File([backup], 'backup.json', { type: 'application/json' })],
      configurable: true,
    })
    await input.trigger('change')
    await nextTick()

    const solves = useSolvesStore()
    expect(solves.count).toBe(2)
    // Oldest first, and my own solve survived the import.
    expect(solves.solves.map((s) => s.id)).toEqual(['theirs', mine.id])
    expect(wrapper.get('[data-testid="backup-message"]').text()).toContain('Added 1 solve')
    expect(useSelectionStore().ids).toEqual([45])
  })

  it('says what is wrong with a file that is not a backup', async () => {
    useSelectionStore().set([27])
    const wrapper = await mountSelection()
    const input = wrapper.get('[data-testid="import-file"]')
    Object.defineProperty(input.element, 'files', {
      value: [new File(['{"app":"something-else"}'], 'x.json', { type: 'application/json' })],
      configurable: true,
    })
    await input.trigger('change')
    await nextTick()
    const message = wrapper.get('[data-testid="backup-message"]')
    expect(message.text()).toContain('not made by OLL Trainer')
    expect(message.classes()).toContain('text-danger')
  })
})

describe('undoing a delete', () => {
  beforeEach(() => {
    useSelectionStore().set([27, 21, 33])
    useSettingsStore().update({ holdMs: 0 })
  })

  it('offers an undo after Delete, and restores the solve in place', async () => {
    const wrapper = await mountPractice('train')
    await doSolve()
    await doSolve()
    const [first, second] = useSolvesStore().solves

    key('keydown', { key: 'Delete' })
    await nextTick()
    expect(useSolvesStore().count).toBe(1)
    expect(wrapper.get('[data-testid="undo-toast"]').text()).toContain('Deleted')

    await wrapper.get('[data-testid="undo"]').trigger('click')
    expect(useSolvesStore().solves.map((s) => s.id)).toEqual([first!.id, second!.id])
    expect(wrapper.find('[data-testid="undo-toast"]').exists()).toBe(false)
  })

  it('offers an undo when a solve is deleted from the results list', async () => {
    const wrapper = await mountPractice('train')
    await doSolve()
    const solve = useSolvesStore().solves[0]!
    await wrapper.get(`[data-testid="delete-${solve.id}"]`).trigger('click')
    expect(useSolvesStore().count).toBe(0)
    await wrapper.get('[data-testid="undo"]').trigger('click')
    expect(useSolvesStore().count).toBe(1)
  })

  it('can be dismissed without undoing', async () => {
    const wrapper = await mountPractice('train')
    await doSolve()
    key('keydown', { key: 'Delete' })
    await nextTick()
    await wrapper.get('[data-testid="dismiss-toast"]').trigger('click')
    expect(wrapper.find('[data-testid="undo-toast"]').exists()).toBe(false)
    expect(useSolvesStore().count).toBe(0)
  })

  it('does not offer an undo for clearing the session, which loses nothing', async () => {
    const wrapper = await mountPractice('train')
    await doSolve()
    key('keydown', { key: 'Delete', shiftKey: true })
    await nextTick()
    expect(wrapper.find('[data-testid="undo-toast"]').exists()).toBe(false)
  })
})

describe('the case reveal', () => {
  beforeEach(() => {
    useSelectionStore().set([27])
    useSettingsStore().update({ holdMs: 0 })
  })

  it('draws the orientation that was actually served, not the canonical one', async () => {
    const wrapper = await mountPractice('train')
    const scramble = wrapper.get('[data-testid="scramble"]').text()
    await doSolve()

    const served = patternFromCube(applyMoves(SOLVED, scramble))
    const drawn = wrapper
      .findAll('[data-testid="case-reveal"] rect')
      .map((rect) => [Number(rect.attributes('data-slot')), rect.attributes('data-oriented')])
    for (const [slot, oriented] of drawn) {
      expect(oriented, `slot ${slot}`).toBe(served[slot as number] === 1 ? 'true' : 'false')
    }
    // And it really is the same case, just turned.
    expect(patternKey(canonicalPattern(served))).toBe(
      patternKey(canonicalPattern(CASES_BY_ID.get(27)!.pattern)),
    )
  })

  it('shows a solution that solves the cube that was served', async () => {
    const wrapper = await mountPractice('train')
    // Several solves, because the angle is picked at random and the algorithm
    // as written only solves one of the four.
    for (let i = 0; i < 8; i++) {
      const scramble = wrapper.get('[data-testid="scramble"]').text()
      await doSolve()
      const solution = wrapper.get('[data-testid="solution"]').text()
      const solved = applyMoves(applyMoves(SOLVED, scramble), solution)
      expect(patternKey(patternFromCube(solved)), `${scramble} then ${solution}`).toBe(
        patternKey(SOLVED_PATTERN),
      )
    }
  })
})

describe("I don't know", () => {
  beforeEach(() => {
    useSelectionStore().set([27, 21, 33, 45])
    useSettingsStore().update({ holdMs: 0 })
  })

  /** Which case a scramble on screen actually sets up. */
  function caseIdOf(scramble: string): number {
    const wanted = patternKey(canonicalPattern(patternFromCube(applyMoves(SOLVED, scramble))))
    for (const ollCase of CASES_BY_ID.values()) {
      if (patternKey(canonicalPattern(ollCase.pattern)) === wanted) return ollCase.id
    }
    throw new Error(`no case sets up ${scramble}`)
  }

  it('records a blank with no time and shows the solution', async () => {
    const wrapper = await mountPractice('learn')
    const caseId = caseIdOf(wrapper.get('[data-testid="scramble"]').text())

    await wrapper.get('[data-testid="dont-know"]').trigger('click')

    const recorded = useSolvesStore().solves
    expect(recorded).toHaveLength(1)
    expect(recorded[0]).toMatchObject({ caseId, outcome: 'unknown' })
    expect('ms' in recorded[0]!).toBe(false)

    const reveal = wrapper.get('[data-testid="case-reveal"]')
    expect(reveal.text()).toContain("Didn't know")
    expect(reveal.text()).toContain(CASES_BY_ID.get(caseId)!.alg)
  })

  it('is reachable from the keyboard', async () => {
    const wrapper = await mountPractice('learn')
    key('keydown', { key: 'i' })
    await nextTick()
    expect(useSolvesStore().count).toBe(1)
    expect(wrapper.find('[data-testid="study-controls"]').exists()).toBe(true)
  })

  it('leaves the setup exactly where it was, so the algorithm can be repeated', async () => {
    const wrapper = await mountPractice('learn')
    const scramble = wrapper.get('[data-testid="scramble"]').text()
    await wrapper.get('[data-testid="dont-know"]').trigger('click')
    expect(wrapper.get('[data-testid="scramble"]').text()).toBe(scramble)
  })

  it('takes the timer away entirely rather than leaving a dead one on screen', async () => {
    const wrapper = await mountPractice('learn')
    expect(wrapper.find('[data-testid="timer"]').exists()).toBe(true)
    await wrapper.get('[data-testid="dont-know"]').trigger('click')
    expect(wrapper.find('[data-testid="timer"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="dont-know"]').exists()).toBe(false)
  })

  it('cannot be timed while the solution is on screen', async () => {
    const wrapper = await mountPractice('learn')
    await wrapper.get('[data-testid="dont-know"]').trigger('click')

    // A tap on the surface would normally arm it; here there is nothing to arm.
    const surface = wrapper.get('[data-testid="timer-surface"]')
    await surface.trigger('touchstart')
    await surface.trigger('touchend')
    expect(wrapper.find('[data-testid="timer"]').exists()).toBe(false)
    expect(useSolvesStore().count).toBe(1)
  })

  it('moves on only when asked, and space is what asks', async () => {
    const wrapper = await mountPractice('learn')
    await wrapper.get('[data-testid="dont-know"]').trigger('click')

    key('keydown', { key: ' ' })
    key('keyup', { key: ' ' })
    await nextTick()

    // Space moved on rather than starting a solve.
    expect(useSolvesStore().count).toBe(1)
    expect(wrapper.find('[data-testid="study-controls"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="timer"]').exists()).toBe(true)
  })

  it('hands the timer back once study is over', async () => {
    const wrapper = await mountPractice('learn')
    await wrapper.get('[data-testid="dont-know"]').trigger('click')
    await wrapper.get('[data-testid="next-case"]').trigger('click')
    await doSolve()
    const recorded = useSolvesStore().solves
    expect(recorded.map((attempt) => attempt.outcome)).toEqual(['unknown', 'solved'])
  })

  it('serves the same case again, solution hidden, for an honest measurement', async () => {
    const wrapper = await mountPractice('learn')
    const caseId = caseIdOf(wrapper.get('[data-testid="scramble"]').text())
    await wrapper.get('[data-testid="dont-know"]').trigger('click')
    await wrapper.get('[data-testid="try-timed"]').trigger('click')

    expect(wrapper.find('[data-testid="case-reveal"]').exists()).toBe(false)
    expect(caseIdOf(wrapper.get('[data-testid="scramble"]').text())).toBe(caseId)

    await doSolve()
    const recorded = useSolvesStore().solves
    expect(recorded).toHaveLength(2)
    expect(recorded[1]).toMatchObject({ caseId, outcome: 'solved' })
  })

  it('leaves study on Escape, keeping the setup that is already on the cube', async () => {
    const wrapper = await mountPractice('learn')
    const scramble = wrapper.get('[data-testid="scramble"]').text()
    await wrapper.get('[data-testid="dont-know"]').trigger('click')

    key('keydown', { key: 'Escape' })
    await nextTick()
    expect(wrapper.find('[data-testid="study-controls"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="scramble"]').text()).toBe(scramble)
  })

  it('does nothing once a solve is already in flight', async () => {
    const wrapper = await mountPractice('learn')
    key('keydown', { key: ' ' })
    await nextTick()
    expect(wrapper.get('[data-testid="timer"]').attributes('data-phase')).toBe('ready')

    key('keydown', { key: 'i' })
    await nextTick()
    expect(useSolvesStore().count).toBe(0)
    expect(wrapper.find('[data-testid="study-controls"]').exists()).toBe(false)
  })

  it('does not keep filling a phone with a surface that catches nothing', async () => {
    const wrapper = await mountPractice('learn')
    const surface = wrapper.get('[data-testid="timer-surface"]')
    expect(surface.classes()).toContain('grow')
    await wrapper.get('[data-testid="dont-know"]').trigger('click')
    // Otherwise the solution — the only thing that matters here — is pushed
    // below the fold by an inert touch target.
    expect(surface.classes()).not.toContain('grow')
    expect(surface.classes()).not.toContain('touch-none')
  })

  it('offers an undo when the blank itself is deleted', async () => {
    const wrapper = await mountPractice('learn')
    await wrapper.get('[data-testid="dont-know"]').trigger('click')
    key('keydown', { key: 'Delete' })
    await nextTick()
    expect(useSolvesStore().count).toBe(0)
    expect(wrapper.get('[data-testid="undo-toast"]').text()).toContain("I don't know")
  })

  it('is available in every mode', async () => {
    for (const mode of ['train', 'recap', 'learn'] as const) {
      const wrapper = await mountPractice(mode)
      expect(wrapper.find('[data-testid="dont-know"]').exists(), mode).toBe(true)
      wrapper.unmount()
    }
  })
})

describe('touch does not swallow the interface', () => {
  beforeEach(() => {
    useSelectionStore().set([27, 21])
    useSettingsStore().update({ holdMs: 0 })
  })

  it('keeps the touch surface off the header and the results', async () => {
    const wrapper = await mountPractice('train')
    const surface = wrapper.get('[data-testid="timer-surface"]')
    // The controls must not live inside the element that handles the gesture.
    for (const testid of ['back', 'settings-toggle', 'theme-toggle', 'tab-cases']) {
      expect(surface.find(`[data-testid="${testid}"]`).exists(), testid).toBe(false)
      expect(wrapper.find(`[data-testid="${testid}"]`).exists(), testid).toBe(true)
    }
  })

  it('still lets every control be used after a solve', async () => {
    const wrapper = await mountPractice('train')
    await doSolve()

    // Regression: with the handlers on <main> these taps were all prevented.
    await wrapper.get('[data-testid="tab-cases"]').trigger('click')
    expect(wrapper.find('[data-testid="panel-cases"]').exists()).toBe(true)

    await wrapper.get('[data-testid="settings-toggle"]').trigger('click')
    expect(wrapper.find('[data-testid="settings"]').exists()).toBe(true)

    await wrapper.get('[data-testid="clear-session"]').trigger('click')
    expect(useSolvesStore().sessionSolves).toHaveLength(0)
    expect(useSolvesStore().count).toBe(1)
  })

  it('arms from a tap on the timer surface', async () => {
    const wrapper = await mountPractice('train')
    const surface = wrapper.get('[data-testid="timer-surface"]')
    await surface.trigger('touchstart')
    expect(wrapper.get('[data-testid="timer"]').attributes('data-phase')).toBe('ready')
    await surface.trigger('touchend')
    expect(wrapper.get('[data-testid="timer"]').attributes('data-phase')).toBe('running')
    await surface.trigger('touchstart')
    expect(useSolvesStore().count).toBe(1)
  })

  it('does not arm when a control inside the app is tapped', async () => {
    const wrapper = await mountPractice('train')
    await wrapper.get('[data-testid="settings-toggle"]').trigger('touchstart')
    expect(wrapper.get('[data-testid="timer"]').attributes('data-phase')).toBe('idle')
  })
})

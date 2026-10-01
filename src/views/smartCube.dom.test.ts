/**
 * The smart-cube flow end to end, through the real store, composable and
 * view, with only the Bluetooth library swapped for a scripted cube.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router'
import { nextTick } from 'vue'
import { Subject } from 'rxjs'
import type { GanCubeEvent } from 'gan-web-bluetooth'

import PracticeView from './PracticeView.vue'
import { FACES, formatMove, invertMoves, parseMove, parseMoves, type Move } from '@/core/cube'
import { DEFAULT_GRIP, moveToGripFrame, type Grip } from '@/core/grip'
import { routes } from '@/router/routes'
import { resetStorageCache } from '@/stores/persist'
import { useSelectionStore } from '@/stores/selection'
import { useSettingsStore } from '@/stores/settings'
import { useSolvesStore } from '@/stores/solves'

const events = new Subject<GanCubeEvent>()
const sent: string[] = []

vi.mock('gan-web-bluetooth', () => ({
  connectGanCube: async () => ({
    deviceName: 'GANi4-TEST',
    deviceMAC: 'AA:BB:CC:DD:EE:FF',
    events$: events,
    sendCubeCommand: async (command: { type: string }) => {
      sent.push(command.type)
    },
    disconnect: async () => {},
  }),
}))

const SOLVED_FACELETS = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB'
/** The grip that needs no translation, so scripted moves read as written. */
const IDENTITY: Grip = { top: 'white', front: 'green' }

let pinia: Pinia
let clock = 0

enableAutoUnmount(afterEach)

beforeEach(async () => {
  localStorage.clear()
  resetStorageCache()
  sent.length = 0
  clock = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  // One fixed scramble: a random one can begin with exactly the turn a test
  // uses to knock the cube off solved, and then that turn is progress.
  vi.spyOn(Math, 'random').mockReturnValue(0)
  Object.defineProperty(navigator, 'bluetooth', { value: {}, configurable: true })
  pinia = createPinia()
  setActivePinia(pinia)
  useSelectionStore().set([27])
})

afterEach(() => {
  vi.restoreAllMocks()
  // @ts-expect-error -- removing the stub again
  delete navigator.bluetooth
})

async function mountPractice() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: routes as RouteRecordRaw[],
  })
  await router.push('/oll-trainer')
  await router.isReady()
  const wrapper = mount(PracticeView, {
    props: { mode: 'train' },
    global: { plugins: [pinia, router] },
    attachTo: document.body,
  })
  await nextTick()
  return wrapper
}

async function connect(wrapper: VueWrapper, facelets = SOLVED_FACELETS) {
  await wrapper.get('[data-testid="cube-toggle"]').trigger('click')
  await wrapper.get('[data-testid="cube-connect"]').trigger('click')
  await flushPromises()
  events.next({
    type: 'FACELETS',
    serial: 0,
    facelets,
    state: { CP: [], CO: [], EP: [], EO: [] },
    timestamp: clock,
  })
  await nextTick()
}

/** The cube-frame move a user in `grip` makes to turn `move` as they see it. */
function inCubeFrame(move: Move, grip: Grip): Move {
  const candidates = FACES.flatMap((face) => ['', '2', "'"].map((s) => parseMove(face + s)))
  return candidates.find((c) => formatMove(moveToGripFrame(c, grip)) === formatMove(move))!
}

/** Turns the cube, one move every `gap` ms, as the user sees the moves. */
async function turn(sequence: string, grip: Grip = IDENTITY, gap = 500) {
  for (const move of parseMoves(sequence)) {
    // A half turn arrives from a real cube as two quarter turns.
    const quarters =
      move.amount === 2
        ? [
            { base: move.base, amount: 1 as const },
            { base: move.base, amount: 1 as const },
          ]
        : [move]
    for (const quarter of quarters) {
      clock += gap
      events.next({
        type: 'MOVE',
        serial: 0,
        face: 0,
        direction: 0,
        move: formatMove(inCubeFrame(quarter, grip)),
        localTimestamp: clock,
        cubeTimestamp: null,
        timestamp: clock,
      })
    }
  }
  await nextTick()
}

const scrambleOf = (wrapper: VueWrapper) => wrapper.get('[data-testid="scramble"]').text()
const timer = (wrapper: VueWrapper) => wrapper.get('[data-testid="timer"]')

describe('connecting a smart cube', () => {
  it('says plainly when the browser cannot do it', async () => {
    // @ts-expect-error -- no Web Bluetooth, as on an iPhone
    delete navigator.bluetooth
    const wrapper = await mountPractice()
    await wrapper.get('[data-testid="cube-toggle"]').trigger('click')
    expect(wrapper.get('[data-testid="cube-unsupported"]').text()).toContain(
      'not available on iPhone',
    )
  })

  it('asks the cube for its state, and hands the timer to it', async () => {
    useSettingsStore().update({ grip: IDENTITY })
    const wrapper = await mountPractice()
    await connect(wrapper)
    expect(sent).toContain('REQUEST_FACELETS')
    expect(wrapper.get('[data-testid="cube-status"]').text()).toContain('GANi4-TEST')
    // Space no longer arms anything: the cube is the timer now.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))
    await nextTick()
    expect(timer(wrapper).attributes('data-phase')).toBe('idle')
  })
})

describe('an attempt with a smart cube', () => {
  beforeEach(() => useSettingsStore().update({ grip: IDENTITY }))

  it('waits for an OLL-solved cube before the scramble', async () => {
    const wrapper = await mountPractice()
    // Connected with an R turn on it.
    await connect(wrapper, 'UUFUUFUUFRRRRRRRRRFFDFFDFFDDDBDDBDDBLLLLLLLLLUBBUBBUBB')
    expect(wrapper.text()).toContain('Solve the cube')
    await turn("R'")
    expect(wrapper.text()).toContain('Apply the scramble')
  })

  it('follows the scramble, and says how to undo a wrong turn', async () => {
    const wrapper = await mountPractice()
    await connect(wrapper)
    const [first] = parseMoves(scrambleOf(wrapper))
    await turn(formatMove(first!))
    expect(wrapper.findAll('[data-state="done"]')).toHaveLength(1)

    // A turn of a face the next move does not touch, so it cannot be progress.
    const stray = first!.base === 'F' || first!.base === 'B' ? 'U' : 'F'
    await turn(stray)
    expect(wrapper.get('[data-testid="scramble-correction"]').text()).toContain(invertMoves(stray))
    await turn(invertMoves(stray))
    expect(wrapper.find('[data-testid="scramble-correction"]').exists()).toBe(false)
  })

  it('inspects on case reached, then records recognition and solve', async () => {
    const wrapper = await mountPractice()
    await connect(wrapper)
    const scramble = scrambleOf(wrapper)
    await turn(scramble)

    expect(timer(wrapper).attributes('data-phase')).toBe('inspecting')
    expect(timer(wrapper).text()).toBe('15')

    // 2 s of recognition, then undo the scramble a turn every 250 ms.
    clock += 1750
    await turn(invertMoves(scramble), IDENTITY, 250)

    const [solve] = useSolvesStore().solves
    expect(solve).toMatchObject({ outcome: 'solved', input: 'cube', recognitionMs: 2000 })
    expect(solve!.outcome === 'solved' && solve!.ms).toBeGreaterThan(2000)
    expect(wrapper.get('[data-testid="split"]').text()).toContain('recognition')
    // Recorded as the whole attempt, and the timer stops on that number.
    expect(wrapper.text()).toContain(`${((solve as { ms: number }).ms / 1000).toFixed(2)}`)
  })

  it('keeps one frame loop through inspection, and still hears the first turn', async () => {
    // Frames run by hand, so a loop that multiplies itself shows up as a queue.
    let queue: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      queue.push(callback)
      return queue.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})

    const wrapper = await mountPractice()
    await connect(wrapper)
    await turn(scrambleOf(wrapper))
    for (let i = 0; i < 10; i++) {
      expect(queue).toHaveLength(1)
      const frames = queue
      queue = []
      clock += 16
      for (const callback of frames) callback(clock)
    }

    await turn('U')
    expect(timer(wrapper).attributes('data-phase')).toBe('running')
  })

  it('keeps the result on screen and serves the next scramble straight away', async () => {
    const wrapper = await mountPractice()
    await connect(wrapper)
    const scramble = scrambleOf(wrapper)
    await turn(scramble)
    await turn(invertMoves(scramble))
    const shown = timer(wrapper).text()

    expect(useSolvesStore().count).toBe(1)
    expect(wrapper.text()).not.toContain('Solve the cube')
    expect(wrapper.text()).toContain('Apply the scramble')
    expect(timer(wrapper).text()).toBe(shown)
    expect(wrapper.find('[data-testid="split"]').exists()).toBe(true)

    // And the next one runs from here, without the cube being solved first.
    await turn('U')
    await turn(scrambleOf(wrapper))
    expect(timer(wrapper).attributes('data-phase')).toBe('inspecting')
  })

  it('makes running out of inspection a blank', async () => {
    const wrapper = await mountPractice()
    await connect(wrapper)
    await turn(scrambleOf(wrapper))
    clock += 15_001
    await new Promise((resolve) => setTimeout(resolve, 50))
    await nextTick()
    expect(useSolvesStore().solves[0]).toMatchObject({ outcome: 'unknown', input: 'cube' })
    expect(wrapper.find('[data-testid="study-controls"]').exists()).toBe(true)
  })

  it('takes I don’t know during inspection, but not mid-solve', async () => {
    const wrapper = await mountPractice()
    await connect(wrapper)
    await turn(scrambleOf(wrapper))
    expect(wrapper.find('[data-testid="dont-know"]').exists()).toBe(true)
    await turn('U')
    expect(wrapper.find('[data-testid="dont-know"]').exists()).toBe(false)
  })

  it('abandons on Escape and records nothing', async () => {
    const wrapper = await mountPractice()
    await connect(wrapper)
    await turn(scrambleOf(wrapper))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(timer(wrapper).attributes('data-phase')).toBe('idle')
    expect(useSolvesStore().count).toBe(0)
  })

  it('reads the cube in the user’s grip', async () => {
    useSettingsStore().update({ grip: DEFAULT_GRIP })
    const wrapper = await mountPractice()
    await connect(wrapper)
    await turn(scrambleOf(wrapper), DEFAULT_GRIP)
    expect(timer(wrapper).attributes('data-phase')).toBe('inspecting')
  })
})

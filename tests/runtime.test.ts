// @vitest-environment jsdom
import { describe, expect, test } from 'vitest'

import { RECOVERY_KEY } from '@/game/browser-save'
import { SAVE_KEY } from '@/game/save'
import { GameSim } from '@/game/sim'
import { createFreshGame } from '@/game/state'
import {
  createGameRuntime,
  type GameRuntimeDeps,
  type GameView,
  type TankPresenter,
} from '@/game/runtime'

/** In-memory Storage fake; can be told to throw like a full/blocked store. */
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => void data.delete(key),
    setItem: (key: string, value: string) => void data.set(key, value),
  } satisfies Storage
}

type Harness = {
  deps: GameRuntimeDeps
  storage: Storage
  presenter: TankPresenter & { draws: number; transientResets: number }
  /** Advance the fake clocks and fire the pending animation frame once. */
  tick(ms: number): void
  setVisible(visible: boolean): void
}

const WALL_START_MS = 1_700_000_000_000

function harness(initialStorage: Record<string, string> = {}): Harness {
  const storage = fakeStorage(initialStorage)
  let nowMs = WALL_START_MS
  let monotonicMs = 10_000
  let visible = true
  let pending: ((nowMs: number) => void) | undefined
  const presenter = {
    draws: 0,
    transientResets: 0,
    draw() {
      this.draws += 1
    },
    notifyFeed() {},
    notifySiphon() {},
    resetTransient() {
      this.transientResets += 1
    },
    dispose() {},
  }
  return {
    storage,
    presenter,
    deps: {
      storage,
      now: () => nowMs,
      monotonicNow: () => monotonicMs,
      visible: () => visible,
      frames: {
        request: (callback) => {
          pending = callback
          return 1
        },
        cancel: () => {
          pending = undefined
        },
      },
      createPresenter: () => presenter,
    },
    tick(ms: number) {
      nowMs += ms
      monotonicMs += ms
      const frame = pending
      pending = undefined
      frame?.(monotonicMs)
    },
    setVisible(next: boolean) {
      visible = next
    },
  }
}

function lastView(views: GameView[]): GameView {
  expect(views.length).toBeGreaterThan(0)
  return views[views.length - 1]
}

const canvas = () => document.createElement('canvas')

describe('game runtime', () => {
  test('starts a fresh tank when storage is empty and publishes a view', () => {
    const h = harness()
    const runtime = createGameRuntime(h.deps)
    const views: GameView[] = []
    runtime.subscribe((view) => views.push(view))
    runtime.start(canvas())
    h.tick(16)

    const view = lastView(views)
    expect(view.hud.fishCount).toBe(1)
    expect(view.hud.gameOver).toBe(false)
    expect(h.presenter.draws).toBeGreaterThan(0)
    runtime.stop()
  })

  test('resumes a saved tank and surfaces the away summary after a long gap', () => {
    const state = createFreshGame(7)
    const sim = new GameSim(state)
    state.coins = 555
    // Saved two hours before "now" in the resuming harness.
    const h = harness({
      [SAVE_KEY]: JSON.stringify(sim.toSave(WALL_START_MS - 2 * 3600 * 1000)),
    })
    const runtime = createGameRuntime(h.deps)
    const views: GameView[] = []
    runtime.subscribe((view) => views.push(view))
    runtime.start(canvas())
    h.tick(16)

    const view = lastView(views)
    expect(view.hud.coins).toBeGreaterThanOrEqual(555)
    expect(view.awaySummary).not.toBeNull()
    expect(view.awaySummary!.awaySeconds).toBeCloseTo(2 * 3600, 0)

    runtime.dismissAwaySummary()
    expect(lastView(views).awaySummary).toBeNull()
    runtime.stop()
  })

  test('an unreadable save starts fresh, warns, and preserves the raw payload', () => {
    const h = harness({ [SAVE_KEY]: '{"version":1,"coins":"woe"}' })
    const runtime = createGameRuntime(h.deps)
    const views: GameView[] = []
    runtime.subscribe((view) => views.push(view))
    runtime.start(canvas())
    h.tick(16)

    const view = lastView(views)
    expect(view.hud.fishCount).toBe(1)
    expect(view.toasts.some((toast) => toast.tone === 'warning')).toBe(true)
    expect(h.storage.getItem(RECOVERY_KEY)).toContain('woe')
    runtime.stop()
  })

  test('frames advance the sim on the fixed tick and autosave on cadence', () => {
    const h = harness()
    const runtime = createGameRuntime(h.deps)
    runtime.subscribe(() => {})
    runtime.start(canvas())
    h.tick(16)
    expect(h.storage.getItem(SAVE_KEY)).toBeNull()

    for (let i = 0; i < 40; i += 1) h.tick(500) // 20 s of frames
    const raw = h.storage.getItem(SAVE_KEY)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw!).time).toBeGreaterThan(15)
    runtime.stop()
  })

  test('pausing freezes time, blocks intents, and cancels the held gesture', () => {
    const h = harness()
    const runtime = createGameRuntime(h.deps)
    const views: GameView[] = []
    runtime.subscribe((view) => views.push(view))
    runtime.start(canvas())
    h.tick(16)

    runtime.pointerDown({ x: 600, y: 100 }) // starts a held gesture
    runtime.pause()
    const timeAtPause = JSON.parse(h.storage.getItem(SAVE_KEY)!).time

    for (let i = 0; i < 10; i += 1) h.tick(500) // 5 s of paused frames
    runtime.buy('fish') // blocked while paused
    runtime.pointerDown({ x: 300, y: 100 }) // blocked while paused
    runtime.resume()
    for (let i = 0; i < 4; i += 1) h.tick(500) // held gesture must not resurrect

    runtime.pause() // saves again at the new sim time
    const timeAfter = JSON.parse(h.storage.getItem(SAVE_KEY)!).time
    expect(timeAfter - timeAtPause).toBeCloseTo(2, 1) // only the resumed 2 s advanced
    runtime.stop()
  })

  test('holding a feed gesture sprinkles pellets on the frame-driven cadence', () => {
    const h = harness()
    const runtime = createGameRuntime(h.deps)
    const views: GameView[] = []
    runtime.subscribe((view) => views.push(view))
    runtime.start(canvas())
    h.tick(16)

    const coinsBefore = lastView(views).hud.coins
    runtime.pointerDown({ x: 1000, y: 300 }) // immediate pellet (over water)
    for (let i = 0; i < 6; i += 1) h.tick(300) // > sprinkle interval each frame
    runtime.pointerUp()
    h.tick(300)

    const coinsAfter = lastView(views).hud.coins
    // 1 immediate + 6 pulses = 7 pellets at ◉1 each (income accrual rounds down).
    expect(coinsBefore - coinsAfter).toBeGreaterThanOrEqual(6)
    runtime.stop()
  })

  test('a quick tap on a fish selects it instead of feeding it', () => {
    const h = harness()
    const runtime = createGameRuntime(h.deps)
    const views: GameView[] = []
    runtime.subscribe((view) => views.push(view))
    runtime.start(canvas())
    for (let i = 0; i < 4; i += 1) h.tick(500)
    // Pausing saves at exactly the live state, so the saved fish position is
    // exactly where the pointer will land.
    runtime.pause()
    runtime.resume()
    const saved = JSON.parse(h.storage.getItem(SAVE_KEY)!)
    const fish = saved.entities.find((entity: { fish?: unknown }) => entity.fish)
    const coinsBefore = lastView(views).hud.coins

    runtime.pointerDown({ x: fish.position.x, y: fish.position.y })
    h.tick(50) // released well inside the tap window
    runtime.pointerUp()

    const view = lastView(views)
    expect(view.hud.selectedFish?.id).toBe(fish.id)
    expect(view.hud.coins).toBe(coinsBefore) // no pellet was paid for

    runtime.selectFish(undefined)
    expect(lastView(views).hud.selectedFish).toBeUndefined()
    runtime.stop()
  })

  test('replacing the session resets tool, selection, toasts, and renderer residue', () => {
    const h = harness()
    const runtime = createGameRuntime(h.deps)
    const views: GameView[] = []
    runtime.subscribe((view) => views.push(view))
    runtime.start(canvas())
    h.tick(16)

    const dirtyState = createFreshGame(11)
    const dirty = new GameSim(dirtyState)
    dirtyState.ownsSiphon = true
    runtime.replace(dirty)
    runtime.setTool('siphon')
    runtime.selectFish(lastView(views).hud.residents[0].id)
    expect(lastView(views).tool).toBe('siphon')

    const resetsBefore = h.presenter.transientResets
    runtime.newGame() // fresh tank owns no siphon
    const view = lastView(views)
    expect(view.tool).toBe('feed')
    expect(view.hud.selectedFish).toBeUndefined()
    expect(view.toasts).toHaveLength(0)
    expect(h.presenter.transientResets).toBe(resetsBefore + 1)
    // The replacement saved the new session, not the old one.
    expect(JSON.parse(h.storage.getItem(SAVE_KEY)!).ownsSiphon).toBe(false)
    runtime.stop()
  })

  test('stop saves the tank and halts the frame loop', () => {
    const h = harness()
    const runtime = createGameRuntime(h.deps)
    runtime.subscribe(() => {})
    runtime.start(canvas())
    h.tick(16)
    runtime.stop()

    expect(h.storage.getItem(SAVE_KEY)).not.toBeNull()
    const draws = h.presenter.draws
    h.tick(500)
    expect(h.presenter.draws).toBe(draws)
  })
})

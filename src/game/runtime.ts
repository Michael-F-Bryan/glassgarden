import { loadFromStorage, RECOVERY_KEY, saveToStorage } from './browser-save'
import {
  createGlassgardenDevTools,
  normaliseDevSpeed,
  type GlassgardenDevTools,
} from './devtools'
import { buildHudSnapshot, EMPTY_HUD, type HudSnapshot, type WaterTier } from './hud'
import type { GameEvent, OfflineSummary, Vec2 } from './model'
import { createCanvasPresenter } from './render'
import { hydrate, serialize } from './save'
import { GameSim } from './sim'
import type { GameState } from './state'

export type Tool = 'feed' | 'siphon'

export type ToastTone = 'development' | 'info' | 'warning'

export type ToastView = {
  key: number
  tone: ToastTone
  message: string
}

/** Everything the page renders, published to subscribers on a fixed cadence
 * from the frame loop and immediately after any player intent. */
export type GameView = {
  hud: HudSnapshot
  /** The visible stack: priority-sorted (warnings first), newest first
   * within a tone, capped at three. */
  toasts: ToastView[]
  awaySummary: OfflineSummary | null
  tool: Tool
  paused: boolean
}

export const EMPTY_VIEW: GameView = {
  hud: EMPTY_HUD,
  toasts: [],
  awaySummary: null,
  tool: 'feed',
  paused: false,
}

/** What the runtime needs from the canvas: drawing and cosmetic reset. The
 * production implementation (render.ts) owns the 2d context, DPR, and window
 * resize; tests use a recording fake. */
export type TankPresenter = {
  draw(state: GameState, options: { realTime: number; selectedFishId?: number; hoverFishId?: number }): void
  /** Cosmetic confirmations that a feed/siphon action landed. */
  notifyFeed(x: number): void
  notifySiphon(x: number, y: number): void
  resetTransient(): void
  dispose(): void
}

/** The genuine browser boundaries, injected so the runtime is unit-testable
 * with an in-memory storage, a hand-cranked frame driver, and a fake clock. */
export type GameRuntimeDeps = {
  storage: Storage
  /** Wall clock in ms (Date.now): save timestamps and away-time gaps. */
  now(): number
  /** Monotonic clock in ms (performance.now): gesture and toast timing. */
  monotonicNow(): number
  visible(): boolean
  frames: {
    request(callback: (nowMs: number) => void): number
    cancel(handle: number): void
  }
  createPresenter(canvas: HTMLCanvasElement): TankPresenter
}

export type Unsubscribe = () => void

export type GameRuntime = {
  start(canvas: HTMLCanvasElement): void
  stop(): void
  pause(): void
  resume(): void
  /** Atomic session replacement; also behind newGame() and the devtools. */
  replace(next: GameSim): void
  newGame(): void
  setTool(tool: Tool): void
  buy(itemId: 'siphon' | 'feeder' | 'fish' | 'starterFish'): void
  selectFish(fishId: number | undefined): void
  pointerDown(point: Vec2): void
  /** Returns whether a fish is under the pointer, for cursor styling. */
  pointerMove(point: Vec2): 'fish' | 'none'
  pointerUp(): void
  dismissToast(key: number): void
  dismissAwaySummary(): void
  subscribe(listener: (view: GameView) => void): Unsubscribe
}

const TOAST_LIFETIME_MS: Record<ToastTone, number> = {
  development: 10_000,
  warning: 7_000,
  info: 5_500,
}

const TOAST_PRIORITY: Record<ToastTone, number> = { warning: 0, development: 1, info: 2 }

/** Held-tool gestures. Feed: a quick tap keeps its old meanings (inspect a
 * fish, drop one pellet), while holding rains pellets at the pointer; a
 * gesture that starts over a fish delays its first pellet one interval, so
 * tapping a fish still reads as inspection rather than feeding it in the
 * face. Siphon: hold and sweep like a real gravel vac — it pulls debris and
 * pollution continuously under the pointer as it moves. Repetition is driven
 * by the frame loop, so there is no timer that could outlive the session. */
const TAP_MAX_MS = 260
const SPRINKLE_INTERVAL_MS = 280
const SIPHON_INTERVAL_MS = 220
const SIPHON_SWEEP_DISTANCE = 55

type Gesture = {
  tool: Tool
  startedAtMs: number
  startedOverFishId?: number
  pelletsDropped: number
  point: Vec2
  lastSiphonPoint: Vec2
  nextPulseAtMs: number
}

type Toast = ToastView & { expiresAt: number }

/** Boot-time notices queued for the first frame's event delivery. Module
 * scope, not runtime scope: in dev, React strict mode stops and restarts the
 * runtime after the first start has already consumed an invalid save and
 * autosaved a fresh valid one, so a runtime-local queue would silently drop
 * the recovery warning the player most needs to see. */
const pendingBootEvents: GameEvent[] = []

export function createGameRuntime(deps: GameRuntimeDeps): GameRuntime {
  let sim: GameSim | null = null
  let presenter: TankPresenter | null = null
  let devTools: GlassgardenDevTools | undefined
  let frameHandle: number | undefined
  let lastFrameMs: number | undefined
  let hudAccumulator = 1 // publish on the first frame
  let saveAccumulator = 0
  let speed = 1

  let paused = false
  let tool: Tool = 'feed'
  let selectedFishId: number | undefined
  let hoverFishId: number | undefined
  let gesture: Gesture | null = null
  let affordWarnAtMs = 0

  let toasts: Toast[] = []
  let toastKey = 0
  let awaySummary: OfflineSummary | null = null
  let waterTier: WaterTier = 'clear'

  const listeners = new Set<(view: GameView) => void>()

  const buildView = (): GameView => {
    const hud = sim ? buildHudSnapshot(sim, selectedFishId, waterTier) : EMPTY_HUD
    waterTier = hud.waterQuality
    const visibleToasts = [...toasts]
      .sort((a, b) => TOAST_PRIORITY[a.tone] - TOAST_PRIORITY[b.tone] || b.key - a.key)
      .slice(0, 3)
      .map(({ key, tone, message }) => ({ key, tone, message }))
    return { hud, toasts: visibleToasts, awaySummary, tool, paused }
  }

  const publish = () => {
    const now = deps.monotonicNow()
    toasts = toasts.filter((toast) => toast.expiresAt > now)
    const view = buildView()
    for (const listener of listeners) listener(view)
  }

  const pushToast = (tone: ToastTone, message: string) => {
    const now = deps.monotonicNow()
    const existing = toasts.find((toast) => toast.message === message && toast.tone === tone)
    if (existing) {
      existing.expiresAt = now + TOAST_LIFETIME_MS[tone]
      return
    }
    toastKey += 1
    toasts.push({ key: toastKey, tone, message, expiresAt: now + TOAST_LIFETIME_MS[tone] })
    toasts = toasts.slice(-12)
  }

  const projectEvents = (events: GameEvent[]) => {
    for (const event of events) {
      if (event.type === 'awaySummary') awaySummary = event.summary
      if (event.type === 'toast') pushToast(event.tone, event.message)
    }
  }

  const save = () => {
    if (!sim) return
    // Quota or privacy-mode failure: the game stays playable, unsaved.
    if (!saveToStorage(deps.storage, serialize(sim.state, deps.now()))) {
      console.warn('Glassgarden: could not save')
    }
  }

  const cancelGesture = (): Gesture | null => {
    const ended = gesture
    gesture = null
    return ended
  }

  const tryDropPellet = (x: number): boolean => {
    if (!sim || paused) return false
    if (sim.dropFood(x)) {
      presenter?.notifyFeed(x)
      return true
    }
    if (!sim.state.gameOver && deps.monotonicNow() - affordWarnAtMs > 5000) {
      affordWarnAtMs = deps.monotonicNow()
      pushToast('warning', 'Not enough coins for food — they trickle in as your fish grow.')
    }
    return false
  }

  const siphonSweep = (active: Gesture) => {
    if (!sim || paused) return
    sim.siphonAt(active.point.x, active.point.y)
    presenter?.notifySiphon(active.point.x, active.point.y)
    active.lastSiphonPoint = { ...active.point }
  }

  const pulseGesture = (nowMs: number) => {
    if (!gesture || nowMs < gesture.nextPulseAtMs) return
    if (gesture.tool === 'siphon') {
      siphonSweep(gesture)
      gesture.nextPulseAtMs = nowMs + SIPHON_INTERVAL_MS
    } else {
      if (tryDropPellet(gesture.point.x)) gesture.pelletsDropped += 1
      gesture.nextPulseAtMs = nowMs + SPRINKLE_INTERVAL_MS
    }
  }

  /** Atomic session replacement: everything the old session owned — the
   * active gesture, tool, hover/selection, throttles, transient notices,
   * renderer residue — is invalidated before the new sim is installed, and
   * the save happens only once the new session is coherent. */
  const replace = (next: GameSim) => {
    cancelGesture()
    if (tool === 'siphon' && !next.state.ownsSiphon) tool = 'feed'
    hoverFishId = undefined
    selectedFishId = undefined
    affordWarnAtMs = 0
    sim = next
    awaySummary = null
    toasts = []
    presenter?.resetTransient()
    publish()
    save()
  }

  const frame = (nowMs: number) => {
    frameHandle = deps.frames.request(frame)
    if (lastFrameMs === undefined) lastFrameMs = nowMs
    const dt = (nowMs - lastFrameMs) / 1000
    lastFrameMs = nowMs

    // One gap policy: a real absence (background tab, sleep) over five
    // seconds runs the slowed, capped away-time catch-up; anything shorter
    // is simulated in full at the fixed tick — nothing is discarded.
    if (!paused && sim) {
      if (dt > 5) {
        sim.advanceOffline(dt)
      } else {
        sim.advanceElapsed(dt * speed, deps.visible() ? 'visible' : 'background')
      }
      projectEvents([...pendingBootEvents.splice(0), ...sim.drainEvents()])
      pulseGesture(nowMs)
    }

    if (sim) presenter?.draw(sim.state, { realTime: nowMs / 1000, selectedFishId, hoverFishId })

    hudAccumulator += dt
    if (hudAccumulator > 0.25) {
      hudAccumulator = 0
      publish()
    }
    saveAccumulator += dt
    if (saveAccumulator > 15) {
      saveAccumulator = 0
      save()
    }
  }

  const onVisibility = () => {
    if (!deps.visible()) save()
  }

  return {
    start(canvas) {
      if (sim) throw new Error('GameRuntime.start: already started')

      const loaded = loadFromStorage(deps.storage)
      if (loaded.kind === 'loaded') {
        sim = new GameSim(hydrate(loaded.document))
        const awaySeconds = (deps.now() - loaded.document.savedAtMs) / 1000
        // Emits an awaySummary event delivered on the first frame.
        if (awaySeconds > 90) sim.advanceOffline(awaySeconds)
      } else {
        sim = GameSim.fresh(deps.now() >>> 0)
        if (loaded.kind !== 'empty') {
          // loadFromStorage already preserved the unreadable payload under
          // the recovery key; say so instead of pretending this is a first visit.
          pendingBootEvents.push({
            type: 'toast',
            tone: 'warning',
            message: `Your saved tank could not be read, so this one starts fresh. The old data is kept in your browser under “${RECOVERY_KEY}”.`,
          })
        }
      }

      presenter = deps.createPresenter(canvas)

      if (process.env.NODE_ENV === 'development') {
        const rawSpeed = new URLSearchParams(window.location.search).get('speed')
        if (rawSpeed !== null) speed = normaliseDevSpeed(Number(rawSpeed))
        devTools = createGlassgardenDevTools({
          getSim: () => sim!,
          replaceSim: replace,
          getSpeed: () => speed,
          setSpeed: (next) => {
            speed = next
          },
          save,
        })
        window.__glassgardenDev = devTools
      }

      document.addEventListener('visibilitychange', onVisibility)
      window.addEventListener('beforeunload', save)
      frameHandle = deps.frames.request(frame)
      publish()
    },

    stop() {
      if (frameHandle !== undefined) deps.frames.cancel(frameHandle)
      frameHandle = undefined
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('beforeunload', save)
      if (window.__glassgardenDev === devTools) delete window.__glassgardenDev
      cancelGesture()
      save()
      presenter?.dispose()
      presenter = null
      sim = null
    },

    /** Pausing silences the player's hands, not just the clock: the held
     * gesture is cancelled and every direct intent is gated, so resuming
     * requires a fresh pointer-down. */
    pause() {
      if (paused) return
      cancelGesture()
      paused = true
      save() // pausing is a safe point; keep the save fresh
      publish()
    },

    resume() {
      if (!paused) return
      paused = false
      publish()
    },

    replace,

    newGame() {
      replace(GameSim.fresh(deps.now() >>> 0))
    },

    setTool(next) {
      tool = next
      publish()
    },

    buy(itemId) {
      if (!sim || paused) return
      sim.buy(itemId)
      publish()
    },

    selectFish(fishId) {
      selectedFishId = fishId
      publish()
    },

    pointerDown(point) {
      if (!sim || paused) return
      const fish = tool === 'feed' ? sim.fishAt(point.x, point.y) : undefined
      if (tool === 'feed' && !fish) selectedFishId = undefined
      cancelGesture()
      const nowMs = deps.monotonicNow()
      const active: Gesture = {
        tool,
        startedAtMs: nowMs,
        startedOverFishId: fish?.id,
        pelletsDropped: 0,
        point,
        lastSiphonPoint: point,
        nextPulseAtMs: nowMs + (tool === 'siphon' ? SIPHON_INTERVAL_MS : SPRINKLE_INTERVAL_MS),
      }
      gesture = active
      if (tool === 'siphon') siphonSweep(active)
      else if (!fish && tryDropPellet(point.x)) active.pelletsDropped += 1
      publish()
    },

    pointerMove(point) {
      if (!sim) return 'none'
      if (gesture) {
        gesture.point = point
        // Sweeping fast shouldn't wait for the next pulse.
        if (
          gesture.tool === 'siphon' &&
          Math.hypot(point.x - gesture.lastSiphonPoint.x, point.y - gesture.lastSiphonPoint.y) >
            SIPHON_SWEEP_DISTANCE
        ) {
          siphonSweep(gesture)
        }
      }
      const hovered = sim.fishAt(point.x, point.y)
      hoverFishId = hovered?.id
      return hovered ? 'fish' : 'none'
    },

    pointerUp() {
      const ended = cancelGesture()
      if (!ended) return
      const quickTap = deps.monotonicNow() - ended.startedAtMs < TAP_MAX_MS
      if (quickTap && ended.startedOverFishId !== undefined && ended.pelletsDropped === 0) {
        selectedFishId = ended.startedOverFishId
        publish()
      }
    },

    dismissToast(key) {
      toasts = toasts.filter((toast) => toast.key !== key)
      publish()
    },

    dismissAwaySummary() {
      awaySummary = null
      publish()
    },

    subscribe(listener) {
      listeners.add(listener)
      listener(buildView())
      return () => listeners.delete(listener)
    },
  }
}

/** The production wiring: real browser clocks, storage, RAF, and canvas. */
export function browserRuntimeDeps(): GameRuntimeDeps {
  return {
    storage: window.localStorage,
    now: () => Date.now(),
    monotonicNow: () => performance.now(),
    visible: () => document.visibilityState === 'visible',
    frames: {
      request: (callback) => requestAnimationFrame(callback),
      cancel: (handle) => cancelAnimationFrame(handle),
    },
    createPresenter: (canvas) => createCanvasPresenter(canvas),
  }
}

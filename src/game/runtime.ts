import { loadFromStorage, RECOVERY_KEY, saveToStorage } from './browser-save'
import {
  createGlassgardenDevTools,
  normaliseDevSpeed,
  type GlassgardenDevTools,
} from './devtools'
import { tankBoundsFor } from './equipment'
import { buildHudSnapshot, EMPTY_HUD, type HudSnapshot, type WaterTier } from './hud'
import { TANK, type OfflineSummary, type UiNotification, type Vec2 } from './model'
import { createCanvasPresenter, type DrawOptions } from './render'
import { hydrate } from './save'
import { GameSim, type AdvanceResult, type ShopOfferId } from './sim'
import type { GameReadModel } from './state'

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
  /** Where the keyboard is aiming inside the tank, in logical tank
   * coordinates, or null while the player is using a pointer. Drawn as a
   * visible target so a keyboard user can see where an action will land. */
  caret: Vec2 | null
  /** What the caret is currently over, for the canvas's accessible name. */
  caretTarget: { fishId: number; name: string } | null
}

export const EMPTY_VIEW: GameView = {
  hud: EMPTY_HUD,
  toasts: [],
  awaySummary: null,
  tool: 'feed',
  paused: false,
  caret: null,
  caretTarget: null,
}

/** What the runtime needs from the canvas: drawing and cosmetic reset. The
 * production implementation (render.ts) owns the 2d context, DPR, and window
 * resize; tests use a recording fake. */
export type TankPresenter = {
  draw(state: GameReadModel, options: DrawOptions): void
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
  buy(itemId: ShopOfferId): void
  selectFish(fishId: number | undefined): void
  /**
   * Keyboard aiming. The caret is the keyboard's equivalent of the pointer:
   * it is shown in the tank, moved in steps, and `actAtCaret` runs the same
   * intents a click would. `nextResident` jumps it from fish to fish so
   * inspection does not require pixel hunting.
   */
  showCaret(): void
  hideCaret(): void
  moveCaret(dx: number, dy: number): void
  nextResident(step: 1 | -1): void
  /** One action with the current tool at the caret, like a click. */
  actAtCaret(): void
  /** Inspect whatever the caret is over, like a tap on a fish. */
  inspectAtCaret(): void
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
/** Half the reticle's drawn size, plus a little, so it is never clipped. */
const CARET_MARGIN = 30
/** Clear of the tool palette floating over the top-left of the tank. */
const CARET_TOP_MARGIN = 72

const TAP_MAX_MS = 260
const SPRINKLE_INTERVAL_MS = 280
const SIPHON_INTERVAL_MS = 220
const SIPHON_SWEEP_DISTANCE = 55

/**
 * The gap policy, made explicit so it is deterministic and testable.
 * Elapsed wall time between two frames is treated as exactly one of:
 *
 * - an ordinary frame delta (≤ FRAME_GAP_SECONDS): simulated at the selected
 *   speed, 'visible' or 'background' by current page visibility;
 * - a short absence with the page still open (≤ EXTENDED_ABSENCE_SECONDS —
 *   a hidden tab, a brief laptop suspend): honest time, simulated IN FULL at
 *   the selected speed under 'background' rules, where nothing can die;
 * - an extended absence (beyond that, or a page closure older than
 *   EXTENDED_ABSENCE_SECONDS at boot): the slowed, capped offline catch-up
 *   with its "while you were away" summary.
 */
const FRAME_GAP_SECONDS = 5
const EXTENDED_ABSENCE_SECONDS = 90

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

/** Boot outcomes queued for the first frame. Module scope, not runtime
 * scope: in dev, React strict mode stops and restarts the runtime after the
 * first start has already consumed the save (advancing away time, or
 * replacing an invalid payload with a fresh autosave), so a runtime-local
 * value would silently drop the away summary or the recovery warning. Only
 * the frame loop consumes this, and RAF never fires on the discarded mount. */
const bootHandoff: { notifications: UiNotification[]; awaySummary: OfflineSummary | null } = {
  notifications: [],
  awaySummary: null,
}

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
  let caret: Vec2 | null = null
  /** Where the caret was when the tank last lost focus, so coming back —
   * after closing an inspector, say — resumes where the player left off. */
  let lastCaret: Vec2 | null = null

  const listeners = new Set<(view: GameView) => void>()

  /** The live habitat's bounds; the starter tank's before a session exists. */
  const tankBounds = () => (sim ? tankBoundsFor(sim.read.equipment.habitat) : TANK)

  /** Keep the whole reticle on screen and out from under the floating tool
   * palette, so the keyboard target is always visible where it lands. */
  const clampCaret = (point: Vec2): Vec2 => {
    const bounds = tankBounds()
    return {
      x: Math.min(bounds.width - CARET_MARGIN, Math.max(CARET_MARGIN, point.x)),
      y: Math.min(
        bounds.sandTop - CARET_MARGIN,
        Math.max(bounds.waterTop + CARET_TOP_MARGIN, point.y),
      ),
    }
  }

  const buildView = (): GameView => {
    const hud = sim ? buildHudSnapshot(sim, selectedFishId, waterTier) : EMPTY_HUD
    waterTier = hud.waterQuality
    const visibleToasts = [...toasts]
      .sort((a, b) => TOAST_PRIORITY[a.tone] - TOAST_PRIORITY[b.tone] || b.key - a.key)
      .slice(0, 3)
      .map(({ key, tone, message }) => ({ key, tone, message }))
    const overFish = caret && sim ? sim.fishAt(caret.x, caret.y) : undefined
    return {
      hud,
      toasts: visibleToasts,
      awaySummary,
      tool,
      paused,
      caret: caret ? { ...caret } : null,
      caretTarget:
        overFish?.resident && caret
          ? { fishId: overFish.id, name: overFish.resident.name }
          : null,
    }
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

  const applyAdvance = (result: AdvanceResult) => {
    for (const notification of result.notifications) {
      pushToast(notification.tone, notification.message)
    }
  }

  /** Announce an offline catch-up: the panel for a real absence, plus the
   * developments re-told as toasts so they are not missed. */
  const applySummary = (summary: OfflineSummary) => {
    if (summary.simulatedSeconds > 10) awaySummary = summary
    for (const message of summary.developments) pushToast('development', message)
  }

  const save = () => {
    if (!sim) return
    // Quota or privacy-mode failure: the game stays playable, unsaved.
    if (!saveToStorage(deps.storage, sim.toSave(deps.now()))) {
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
    const result = sim.dropFood(x)
    if (result.ok) {
      presenter?.notifyFeed(x)
      return true
    }
    // Game over is announced by its own overlay; only poverty warrants a
    // (throttled) nudge.
    if (result.reason === 'unaffordable' && deps.monotonicNow() - affordWarnAtMs > 5000) {
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
    if (tool === 'siphon' && !next.read.equipment.siphon) tool = 'feed'
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

    // One gap policy (see FRAME_GAP_SECONDS above): a short absence with the
    // page open is honest, fully-simulated time; only an extended absence
    // runs the slowed, capped away-time catch-up. Nothing is discarded.
    if (!paused && sim) {
      if (bootHandoff.awaySummary) {
        awaySummary = bootHandoff.awaySummary
        bootHandoff.awaySummary = null
      }
      for (const notification of bootHandoff.notifications.splice(0)) {
        pushToast(notification.tone, notification.message)
      }
      if (dt > EXTENDED_ABSENCE_SECONDS) {
        applySummary(sim.advanceOffline(dt))
      } else if (dt > FRAME_GAP_SECONDS) {
        // An ordinary tab switch must not become 20% offline catch-up: the
        // aquarium advances at the selected speed, and the 'background'
        // mode keeps the no-death-while-absent promise.
        applyAdvance(sim.advanceElapsed(dt * speed, 'background'))
      } else {
        applyAdvance(sim.advanceElapsed(dt * speed, deps.visible() ? 'visible' : 'background'))
      }
      pulseGesture(nowMs)
    }

    if (sim) {
      presenter?.draw(sim.read, {
        realTime: nowMs / 1000,
        selectedFishId,
        hoverFishId,
        caret: caret ?? undefined,
      })
    }

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
        if (awaySeconds > EXTENDED_ABSENCE_SECONDS) {
          // Handed to the first frame rather than applied here — see bootHandoff.
          const summary = sim.advanceOffline(awaySeconds)
          if (summary.simulatedSeconds > 10) bootHandoff.awaySummary = summary
          for (const message of summary.developments) {
            bootHandoff.notifications.push({ tone: 'development', message })
          }
        }
      } else {
        sim = GameSim.fresh(deps.now() >>> 0)
        if (loaded.kind !== 'empty') {
          // loadFromStorage already preserved the unreadable payload under
          // the recovery key; say so instead of pretending this is a first visit.
          bootHandoff.notifications.push({
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
          advanceElapsed: (seconds) => {
            if (!sim) return
            applyAdvance(sim.advanceElapsed(seconds, 'visible'))
            publish()
          },
          simulateAway: (seconds) => {
            if (!sim) throw new Error('runtime not started')
            const summary = sim.advanceOffline(seconds)
            applySummary(summary)
            publish()
            return summary
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
      if (next === 'siphon' && !sim?.read.equipment.siphon) return
      tool = next
      publish()
    },

    buy(itemId) {
      if (!sim || paused) return
      const result = sim.buy(itemId)
      if (result.ok) {
        for (const notification of result.notifications) {
          pushToast(notification.tone, notification.message)
        }
      }
      publish()
    },

    selectFish(fishId) {
      selectedFishId = fishId
      publish()
    },

    showCaret() {
      if (!caret) {
        const bounds = tankBounds()
        caret = lastCaret ?? {
          x: bounds.width / 2,
          y: (bounds.waterTop + bounds.sandTop) / 2,
        }
      }
      publish()
    },

    hideCaret() {
      lastCaret = caret
      caret = null
      publish()
    },

    moveCaret(dx, dy) {
      if (!caret) {
        const bounds = tankBounds()
        caret = { x: bounds.width / 2, y: (bounds.waterTop + bounds.sandTop) / 2 }
      }
      caret = clampCaret({ x: caret.x + dx, y: caret.y + dy })
      hoverFishId = sim?.fishAt(caret.x, caret.y)?.id
      publish()
    },

    /** Jump the caret between residents in a stable order, so inspecting a
     * fish never requires aiming at a moving target. */
    nextResident(step) {
      if (!sim) return
      const residents = [...sim.read.world.with('resident')].sort((a, b) => a.id - b.id)
      if (residents.length === 0) return
      const currentId = caret ? sim.fishAt(caret.x, caret.y)?.id : undefined
      const currentIndex = residents.findIndex((entity) => entity.id === currentId)
      const nextIndex =
        currentIndex === -1
          ? step === 1
            ? 0
            : residents.length - 1
          : (currentIndex + step + residents.length) % residents.length
      const target = residents[nextIndex]
      caret = clampCaret({ x: target.position.x, y: target.position.y })
      hoverFishId = target.id
      publish()
    },

    actAtCaret() {
      if (!sim || paused || !caret) return
      if (tool === 'siphon') {
        if (sim.siphonAt(caret.x, caret.y).ok) presenter?.notifySiphon(caret.x, caret.y)
      } else {
        tryDropPellet(caret.x)
      }
      publish()
    },

    inspectAtCaret() {
      if (!sim || !caret) return
      selectedFishId = sim.fishAt(caret.x, caret.y)?.id
      publish()
    },

    pointerDown(point) {
      if (!sim || paused) return
      caret = null // the pointer takes over aiming
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

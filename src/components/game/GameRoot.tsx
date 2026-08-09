'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  createGlassgardenDevTools,
  normaliseDevSpeed,
  type GlassgardenDevTools,
} from '@/game/devtools'
import { TANK, TUNING, type Fish, type GameEvent, type JournalKind } from '@/game/model'
import { TankRenderer } from '@/game/render'
import { deserialize, parseSave, SAVE_KEY, serialize } from '@/game/save'
import { GameSim, type OfflineSummary, type ShopItem } from '@/game/sim'
import { pollutionAt } from '@/game/water'

type Tool = 'feed' | 'siphon'

type Toast = {
  key: number
  tone: 'development' | 'info' | 'warning'
  message: string
  expiresAt: number
}

const TOAST_LIFETIME_MS: Record<Toast['tone'], number> = {
  development: 10_000,
  warning: 7_000,
  info: 5_500,
}

/** Immutable view of the sim for React rendering, refreshed from the loop. */
type HudSnapshot = {
  coins: number
  incomePerSecond: number
  fishCount: number
  distressedCount: number
  criticalNames: string[]
  ownsSiphon: boolean
  gameOver: boolean
  /** False only until the player's very first pellet; drives the feed hint. */
  fedOnce: boolean
  waterQuality: WaterTier
  /** Worst water cell in [0, 1], driving the quality meter's fill. */
  worstPollution: number
  /** Tank Journal entries, newest first, ages pre-formatted for display. */
  journal: { kind: JournalKind; message: string; age: string }[]
  shopItems: ShopItem[]
  residents: {
    id: number
    name: string
    hue: number
    saturation: number
    weightGrams: number
    mood: string
    moodEmoji: string
  }[]
  selectedFish?: {
    id: number
    name: string
    generation: number
    stage: string
    mood: string
    weightGrams: number
    age: string
    origin: 'arrived' | 'hatched'
    parents?: [string, string]
    hatchedInMurkyWater: boolean
  }
}

const EMPTY_HUD: HudSnapshot = {
  coins: 0,
  incomePerSecond: 0,
  fishCount: 0,
  distressedCount: 0,
  criticalNames: [],
  ownsSiphon: false,
  gameOver: false,
  fedOnce: true, // no hint until the real sim reports otherwise
  waterQuality: 'clear',
  worstPollution: 0,
  journal: [],
  shopItems: [],
  residents: [],
}

function describeMood(fish: Fish, pollution = 0): string {
  if (fish.hunger >= 0.999) return 'starving'
  if (fish.sickness >= 0.75) return 'gravely ill'
  if (fish.sickness > 0.4) return 'sick'
  if (fish.hunger > 0.85) return 'very hungry'
  if (fish.hunger > 0.5) return 'peckish'
  if (pollution > TUNING.sicknessAbovePollution) return 'uneasy in the murk'
  if (fish.activity.kind === 'court') return 'smitten'
  return 'content'
}

function moodEmoji(fish: Fish, pollution = 0): string {
  if (fish.sickness >= 0.75) return '🤢'
  if (fish.sickness > 0.4) return '🤒'
  if (fish.hunger >= 0.999) return '😫'
  if (fish.hunger > 0.85) return '😟'
  if (fish.hunger > 0.5) return '😐'
  if (pollution > TUNING.sicknessAbovePollution) return '😖'
  if (fish.activity.kind === 'court') return '🥰'
  if (fish.activity.kind === 'distress') return '😰'
  return '😊'
}

function describeStage(fish: Fish): string {
  const maturity = fish.weight / fish.genome.maxWeight
  if (maturity < 0.2) return 'fry'
  if (maturity < TUNING.breedingMinWeightFraction) return 'juvenile'
  return 'adult'
}

const JOURNAL_GLYPHS: Record<JournalKind, string> = {
  arrival: '🐟',
  birth: '🐣',
  death: '🥀',
  development: '✦',
  purchase: '◉',
  away: '🌙',
}

const WATER_TIERS = [
  { tier: 'clear', below: 0.12 },
  { tier: 'tinged', below: 0.3 },
  { tier: 'murky', below: 0.5 },
  { tier: 'foul', below: Infinity },
] as const

type WaterTier = (typeof WATER_TIERS)[number]['tier']

/** Sticky tiering: needs to cross a boundary by a margin to change, so the
 * pill doesn't flicker while pollution hovers at a threshold. */
function describeWater(worstPollution: number, previous: WaterTier): WaterTier {
  const index = WATER_TIERS.findIndex((entry) => worstPollution < entry.below)
  const previousIndex = WATER_TIERS.findIndex((entry) => entry.tier === previous)
  if (index > previousIndex) {
    const boundary = WATER_TIERS[index - 1].below
    if (worstPollution < boundary + 0.04) return previous
  } else if (index < previousIndex) {
    const boundary = WATER_TIERS[index].below
    if (worstPollution > boundary - 0.04) return previous
  }
  return WATER_TIERS[index].tier
}

function formatAge(seconds: number): string {
  if (seconds < 90) return 'moments ago'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ago`
}

function formatAway(seconds: number): string {
  if (seconds < 120) return `${Math.round(seconds)} seconds`
  if (seconds < 7200) return `${Math.round(seconds / 60)} minutes`
  return `${(seconds / 3600).toFixed(1)} hours`
}

export function buildHudSnapshot(
  sim: GameSim,
  selectedFishId: number | undefined,
  previousWater: WaterTier,
): HudSnapshot {
  const state = sim.state
  const fishEntities = [...state.world.with('fish')].sort((a, b) => a.id - b.id)
  const selected = selectedFishId !== undefined ? state.byId.get(selectedFishId) : undefined
  return {
    coins: Math.floor(state.coins),
    incomePerSecond: sim.incomePerSecond(),
    fishCount: fishEntities.length,
    distressedCount: fishEntities.filter(
      (entity) =>
        entity.fish.hunger > TUNING.distressHungerAbove ||
        entity.fish.sickness > TUNING.distressSicknessAbove,
    ).length,
    criticalNames: fishEntities
      .filter((entity) => entity.fish.hunger >= 0.999 || entity.fish.sickness >= 0.75)
      .map((entity) => entity.fish.name),
    ownsSiphon: state.ownsSiphon,
    gameOver: state.gameOver,
    fedOnce: state.unlocks.fedOnce,
    waterQuality: describeWater(sim.worstPollution(), previousWater),
    worstPollution: sim.worstPollution(),
    journal: [...state.journal]
      .reverse()
      .map((entry) => ({
        kind: entry.kind,
        message: entry.message,
        age: formatAge(state.time - entry.atSim),
      })),
    shopItems: sim.shopItems(),
    residents: fishEntities.map((entity) => {
      const pollution = pollutionAt(state.water, entity.position)
      return {
        id: entity.id,
        name: entity.fish.name,
        hue: entity.fish.genome.hue,
        saturation: entity.fish.genome.saturation,
        weightGrams: entity.fish.weight,
        mood: describeMood(entity.fish, pollution),
        moodEmoji: moodEmoji(entity.fish, pollution),
      }
    }),
    selectedFish: selected?.fish
      ? {
          id: selected.id,
          name: selected.fish.name,
          generation: selected.fish.generation,
          stage: describeStage(selected.fish),
          mood: describeMood(selected.fish, pollutionAt(state.water, selected.position)),
          weightGrams: selected.fish.weight,
          age: formatAge(selected.fish.ageSeconds),
          origin: selected.fish.parents ? 'hatched' : 'arrived',
          parents: selected.fish.parents,
          hatchedInMurkyWater: selected.fish.hatchedInMurkyWater,
        }
      : undefined,
  }
}

export default function GameRoot() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simRef = useRef<GameSim | null>(null)
  const hoverFishRef = useRef<number | undefined>(undefined)
  const selectedFishRef = useRef<number | undefined>(undefined)
  const toolRef = useRef<Tool>('feed')
  const refreshHudRef = useRef<() => void>(() => {})
  const rendererRef = useRef<TankRenderer | null>(null)
  const affordWarnAtRef = useRef(0)
  /** True while the main menu is open: the frame loop keeps drawing but the
   * sim does not advance — the tank holds its breath. */
  const pausedRef = useRef(false)
  const replaceSimRef = useRef<(next: GameSim) => void>(() => {})
  const saveRef = useRef<() => void>(() => {})

  const [hud, setHud] = useState<HudSnapshot>(EMPTY_HUD)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [tool, setToolState] = useState<Tool>('feed')
  const [helpOpen, setHelpOpen] = useState(false)
  const [journalOpen, setJournalOpen] = useState(false)
  const [menuOpen, setMenuOpenState] = useState(false)
  const [confirmingNewGame, setConfirmingNewGame] = useState(false)
  const [awaySummary, setAwaySummary] = useState<OfflineSummary | null>(null)

  const setTool = (next: Tool) => {
    toolRef.current = next
    setToolState(next)
  }

  /** Held-tool gestures. Feed: a quick tap keeps its old meanings (inspect a
   * fish, drop one pellet), while holding rains pellets at the pointer; a
   * gesture that starts over a fish delays its first pellet one interval, so
   * tapping a fish still reads as inspection rather than feeding it in the
   * face. Siphon: hold and sweep like a real gravel vac — it pulls debris and
   * pollution continuously under the pointer as it moves. */
  const TAP_MAX_MS = 260
  const SPRINKLE_INTERVAL_MS = 280
  const SIPHON_INTERVAL_MS = 220
  const SIPHON_SWEEP_DISTANCE = 55

  type CanvasGesture = {
    tool: Tool
    pointerId: number
    startedAtMs: number
    startedOverFishId?: number
    pelletsDropped: number
    point: { x: number; y: number }
    lastSiphonPoint: { x: number; y: number }
    intervalId: ReturnType<typeof setInterval>
  }
  const gestureRef = useRef<CanvasGesture | null>(null)

  /** Invalidate the active gesture: pause, session replacement, and pointer-up
   * all funnel through here so no timer outlives the session that started it.
   * A callback already queued behind clearInterval still fires once; it no-ops
   * because gestureRef no longer points at its gesture. */
  const cancelGesture = useCallback((): CanvasGesture | null => {
    const gesture = gestureRef.current
    if (gesture) clearInterval(gesture.intervalId)
    gestureRef.current = null
    return gesture
  }, [])

  useEffect(() => {
    return () => {
      cancelGesture()
    }
  }, [cancelGesture])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let sim: GameSim | null = null
    const stored = window.localStorage.getItem(SAVE_KEY)
    if (stored) {
      const save = parseSave(stored)
      if (save) {
        sim = new GameSim(deserialize(save))
        const awaySeconds = (Date.now() - save.savedAtMs) / 1000
        // Emits an awaySummary event delivered on the first frame.
        if (awaySeconds > 90) sim.advanceOffline(awaySeconds)
      }
    }
    if (!sim) sim = GameSim.fresh(Date.now() >>> 0)
    simRef.current = sim

    let simSpeed = 1
    if (process.env.NODE_ENV === 'development') {
      const rawSpeed = new URLSearchParams(window.location.search).get('speed')
      if (rawSpeed !== null) simSpeed = normaliseDevSpeed(Number(rawSpeed))
    }
    const renderer = new TankRenderer()
    rendererRef.current = renderer

    const dpr = Math.min(2, window.devicePixelRatio || 1)
    let renderScale = dpr
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const width = Math.max(1, Math.round(rect.width * dpr))
      canvas.width = width
      canvas.height = Math.round((width * TANK.height) / TANK.width)
      renderScale = width / TANK.width
    }
    resize()
    window.addEventListener('resize', resize)
    const ctx = canvas.getContext('2d')!

    const save = () => {
      try {
        window.localStorage.setItem(SAVE_KEY, JSON.stringify(serialize(sim!.state, Date.now())))
      } catch (error) {
        // Quota or privacy-mode failure: the game stays playable, unsaved.
        console.warn('Glassgarden: could not save', error)
      }
    }
    const refreshHud = () =>
      setHud((previous) => buildHudSnapshot(sim!, selectedFishRef.current, previous.waterQuality))
    refreshHudRef.current = refreshHud

    /** Atomic session replacement: everything the old session owned —
     * gesture timers, tool, hover/selection, throttles, transient notices,
     * renderer residue — is invalidated before the new sim is installed,
     * and the save happens only once the new session is coherent. */
    const replaceSession = (next: GameSim) => {
      cancelGesture()
      if (toolRef.current === 'siphon' && !next.state.ownsSiphon) setTool('feed')
      hoverFishRef.current = undefined
      selectedFishRef.current = undefined
      affordWarnAtRef.current = 0
      sim = next
      simRef.current = next
      setAwaySummary(null)
      setToasts([])
      renderer.resetTransient()
      refreshHud()
      save()
    }
    replaceSimRef.current = replaceSession
    saveRef.current = save

    let devTools: GlassgardenDevTools | undefined
    if (process.env.NODE_ENV === 'development') {
      devTools = createGlassgardenDevTools({
        getSim: () => sim!,
        replaceSim: replaceSession,
        getSpeed: () => simSpeed,
        setSpeed: (next) => {
          simSpeed = next
        },
        save,
      })
      window.__glassgardenDev = devTools
    }

    let raf = 0
    let lastFrameMs: number | undefined
    let hudAccumulator = 1
    let saveAccumulator = 0

    const applyEvents = (events: GameEvent[]) => {
      if (events.length === 0) return
      const summaryEvent = events.findLast((event) => event.type === 'awaySummary')
      if (summaryEvent && summaryEvent.type === 'awaySummary') {
        setAwaySummary(summaryEvent.summary)
      }
      const now = performance.now()
      setToasts((current) => {
        const alive = current.filter((toast) => toast.expiresAt > now)
        const additions: Toast[] = []
        for (const [index, event] of events.entries()) {
          if (event.type !== 'toast') continue
          const existing = alive.find(
            (toast) => toast.message === event.message && toast.tone === event.tone,
          )
          if (existing) {
            existing.expiresAt = now + TOAST_LIFETIME_MS[event.tone]
            continue
          }
          additions.push({
            key: now + index + Math.random(),
            tone: event.tone,
            message: event.message,
            expiresAt: now + TOAST_LIFETIME_MS[event.tone],
          })
        }
        return [...alive, ...additions].slice(-12)
      })
    }

    const frame = (nowMs: number) => {
      raf = requestAnimationFrame(frame)
      if (lastFrameMs === undefined) lastFrameMs = nowMs
      const dt = (nowMs - lastFrameMs) / 1000
      lastFrameMs = nowMs

      // Any real gap (background tab, sleep, reload) runs at the slowed,
      // clamped away-time rate; the modal only appears for longer absences.
      if (!pausedRef.current) {
        if (dt > 5) {
          sim!.advanceOffline(dt)
        } else {
          sim!.step(dt * simSpeed, document.visibilityState === 'visible')
        }
        applyEvents(sim!.drainEvents())
      }

      ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0)
      renderer.draw(ctx, sim!.state, {
        realTime: nowMs / 1000,
        selectedFishId: selectedFishRef.current,
        hoverFishId: hoverFishRef.current,
      })

      hudAccumulator += dt
      if (hudAccumulator > 0.25) {
        hudAccumulator = 0
        refreshHud()
        setToasts((current) => {
          const now = performance.now()
          return current.some((toast) => toast.expiresAt <= now)
            ? current.filter((toast) => toast.expiresAt > now)
            : current
        })
      }
      saveAccumulator += dt
      if (saveAccumulator > 15) {
        saveAccumulator = 0
        save()
      }
    }
    raf = requestAnimationFrame(frame)

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') save()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('beforeunload', save)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('beforeunload', save)
      window.removeEventListener('resize', resize)
      if (window.__glassgardenDev === devTools) delete window.__glassgardenDev
      save()
    }
  }, [cancelGesture])

  const toLogical = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * TANK.width,
      y: ((event.clientY - rect.top) / rect.height) * TANK.height,
    }
  }

  const tryDropPellet = (x: number): boolean => {
    const sim = simRef.current
    if (!sim || pausedRef.current) return false
    if (sim.dropFood(x)) {
      rendererRef.current?.notifyFeed(x)
      refreshHudRef.current()
      return true
    }
    if (!sim.state.gameOver && performance.now() - affordWarnAtRef.current > 5000) {
      affordWarnAtRef.current = performance.now()
      setToasts((current) => [
        ...current,
        {
          key: performance.now(),
          tone: 'warning',
          message: 'Not enough coins for food — they trickle in as your fish grow.',
          expiresAt: performance.now() + TOAST_LIFETIME_MS.warning,
        },
      ])
    }
    return false
  }

  const siphonSweep = (gesture: CanvasGesture) => {
    const sim = simRef.current
    if (!sim || pausedRef.current) return
    sim.siphonAt(gesture.point.x, gesture.point.y)
    rendererRef.current?.notifySiphon(gesture.point.x, gesture.point.y)
    gesture.lastSiphonPoint = { ...gesture.point }
    refreshHudRef.current()
  }

  const onCanvasPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const sim = simRef.current
    if (!sim || pausedRef.current) return
    setHelpOpen(false)
    setJournalOpen(false)
    const point = toLogical(event)
    const tool = toolRef.current
    const fish = tool === 'feed' ? sim.fishAt(point.x, point.y) : undefined
    if (tool === 'feed' && !fish) selectedFishRef.current = undefined
    cancelGesture()
    const gesture: CanvasGesture = {
      tool,
      pointerId: event.pointerId,
      startedAtMs: performance.now(),
      startedOverFishId: fish?.id,
      pelletsDropped: 0,
      point,
      lastSiphonPoint: point,
      intervalId: setInterval(
        () => {
          const active = gestureRef.current
          if (!active || pausedRef.current) return
          if (active.tool === 'siphon') siphonSweep(active)
          else if (tryDropPellet(active.point.x)) active.pelletsDropped += 1
        },
        tool === 'siphon' ? SIPHON_INTERVAL_MS : SPRINKLE_INTERVAL_MS,
      ),
    }
    gestureRef.current = gesture
    event.currentTarget.setPointerCapture(event.pointerId)
    if (tool === 'siphon') siphonSweep(gesture)
    else if (!fish && tryDropPellet(point.x)) gesture.pelletsDropped += 1
    refreshHudRef.current()
  }

  const onCanvasPointerUp = () => {
    const gesture = cancelGesture()
    if (!gesture) return
    const quickTap = performance.now() - gesture.startedAtMs < TAP_MAX_MS
    if (quickTap && gesture.startedOverFishId !== undefined && gesture.pelletsDropped === 0) {
      selectedFishRef.current = gesture.startedOverFishId
      refreshHudRef.current()
    }
  }

  const onCanvasMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const sim = simRef.current
    if (!sim) return
    const point = toLogical(event)
    const gesture = gestureRef.current
    if (gesture && event.pointerId === gesture.pointerId) {
      gesture.point = point
      // Sweeping fast shouldn't wait for the next interval tick.
      if (
        gesture.tool === 'siphon' &&
        Math.hypot(point.x - gesture.lastSiphonPoint.x, point.y - gesture.lastSiphonPoint.y) >
          SIPHON_SWEEP_DISTANCE
      ) {
        siphonSweep(gesture)
      }
    }
    const hovered = sim.fishAt(point.x, point.y)
    hoverFishRef.current = hovered?.id
    event.currentTarget.style.cursor = hovered
      ? 'pointer'
      : toolRef.current === 'siphon'
        ? 'cell'
        : 'default'
  }

  const TOAST_PRIORITY: Record<Toast['tone'], number> = { warning: 0, development: 1, info: 2 }
  const visibleToasts = [...toasts]
    .sort((a, b) => TOAST_PRIORITY[a.tone] - TOAST_PRIORITY[b.tone] || b.key - a.key)
    .slice(0, 3)

  const dismissToast = (key: number) => {
    setToasts((current) => current.filter((toast) => toast.key !== key))
  }

  const buy = (itemId: ShopItem['id']) => {
    if (pausedRef.current) return
    simRef.current?.buy(itemId)
    refreshHudRef.current()
  }

  const closeInspector = () => {
    selectedFishRef.current = undefined
    refreshHudRef.current()
  }

  const selectFish = (fishId: number) => {
    selectedFishRef.current = fishId
    setJournalOpen(false)
    refreshHudRef.current()
  }

  /** Pausing must silence the player's hands, not just the clock: the held
   * gesture is cancelled and every direct intent is gated on pausedRef, so
   * resuming requires a fresh pointer-down. */
  const setMenuOpen = (open: boolean) => {
    if (open) cancelGesture()
    pausedRef.current = open
    setMenuOpenState(open)
    setConfirmingNewGame(false)
    if (open) {
      setHelpOpen(false)
      setJournalOpen(false)
      saveRef.current() // pausing is a safe point; keep the save fresh
    }
  }

  const startNewGame = () => {
    replaceSimRef.current(GameSim.fresh(Date.now() >>> 0))
    setMenuOpen(false)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      pausedRef.current = false
      setMenuOpenState(false)
      setConfirmingNewGame(false)
      setHelpOpen(false)
      setJournalOpen(false)
      selectedFishRef.current = undefined
      refreshHudRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_top,_#12303e,_#0a1a24_65%)] p-4 text-slate-100">
      <div className="flex w-full max-w-[min(1720px,calc((100svh-7rem)*16/9+21rem))] items-end justify-between px-1">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-cyan-100">Glassgarden</h1>
          <p className="text-xs text-cyan-300/70">a quiet aquarium that grows around your care</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="menu-toggle"
            onClick={() => setMenuOpen(true)}
            className="rounded-full border border-white/10 bg-slate-900/60 px-4 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800/60"
          >
            ⏸ Menu
          </button>
          <div
            className="rounded-full border border-amber-200/20 bg-amber-950/40 px-4 py-1.5 text-sm font-medium text-amber-200 tabular-nums"
            data-testid="coins"
          >
            ◉ {hud.coins.toLocaleString()}
            <span className="ml-2 text-xs text-amber-200/60">
              +{hud.incomePerSecond.toFixed(2)}/s
            </span>
          </div>
        </div>
      </div>

      <div
        className="grid w-full max-w-[min(1720px,calc((100svh-7rem)*16/9+21rem))] items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]"
        data-layout="tank-with-shop-sidebar"
      >
      <div
        className="relative min-w-0 overflow-hidden rounded-2xl border border-cyan-100/15 bg-slate-950 shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
        data-testid="tank-shell"
      >
        <canvas
          ref={canvasRef}
          className="block aspect-[16/9] w-full touch-none"
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasMove}
          onPointerUp={onCanvasPointerUp}
          onPointerCancel={onCanvasPointerUp}
          data-testid="tank-canvas"
        />

        {!hud.fedOnce && !hud.gameOver && (
          <div
            className="pointer-events-none absolute inset-x-0 top-[16%] flex justify-center"
            data-testid="first-feed-hint"
          >
            <div className="flex animate-pulse flex-col items-center gap-1.5">
              <span className="text-2xl drop-shadow" aria-hidden="true">
                🫘
              </span>
              <span className="rounded-full bg-slate-950/70 px-4 py-1.5 text-sm text-cyan-100 shadow-lg backdrop-blur">
                click the water to drop food — hold to sprinkle
              </span>
            </div>
          </div>
        )}

        {hud.criticalNames.length > 0 && !hud.gameOver && (
          <div
            className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-red-950/90 to-red-950/0 px-6 pt-3 pb-8 text-center"
            data-testid="critical-banner"
          >
            <span className="rounded-full bg-red-500/20 px-4 py-1 text-sm font-semibold text-red-200">
              {hud.criticalNames.join(', ')} {hud.criticalNames.length === 1 ? 'is' : 'are'} in
              serious trouble — act now
            </span>
          </div>
        )}

        <div
          className="absolute top-3 left-3 z-20 flex items-center gap-2"
          data-testid="tool-palette"
          data-ui-anchor="top-left"
        >
          <button
            type="button"
            onClick={() => setTool('feed')}
            data-testid="tool-feed"
            className={`rounded-xl border px-4 py-2 text-sm font-medium backdrop-blur transition ${
              tool === 'feed'
                ? 'border-amber-300/60 bg-amber-400/20 text-amber-100'
                : 'border-white/10 bg-slate-900/60 text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            🫘 Feed <span className="ml-1 text-xs opacity-70">◉1</span>
          </button>
          {hud.ownsSiphon && (
            <button
              type="button"
              onClick={() => setTool('siphon')}
              data-testid="tool-siphon"
              className={`rounded-xl border px-4 py-2 text-sm font-medium backdrop-blur transition ${
                tool === 'siphon'
                  ? 'border-cyan-300/60 bg-cyan-400/20 text-cyan-100'
                  : 'border-white/10 bg-slate-900/60 text-slate-300 hover:bg-slate-800/60'
              }`}
            >
              🧹 Siphon
            </button>
          )}
          <span className="ml-1 hidden rounded-full bg-slate-950/60 px-3 py-1 text-xs text-slate-200/90 backdrop-blur sm:block">
            {tool === 'feed'
              ? 'click to drop food · hold to sprinkle'
              : 'hold and sweep the sand to clean'}
          </span>
        </div>

        <div className="absolute right-3 bottom-3 flex items-center gap-2 text-xs">
          <span
            data-testid="water-quality"
            className={`flex items-center gap-2 rounded-full bg-slate-950/60 px-3 py-1 backdrop-blur ${
              hud.waterQuality === 'clear'
                ? 'text-cyan-200/90'
                : hud.waterQuality === 'tinged'
                  ? 'text-lime-200/90'
                  : hud.waterQuality === 'murky'
                    ? 'text-amber-300/90'
                    : 'text-red-300/90'
            }`}
          >
            {hud.waterQuality} water
            <span className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-700/70">
              <span
                data-testid="water-quality-bar"
                className={`block h-full rounded-full transition-[width] duration-500 ${
                  hud.waterQuality === 'clear'
                    ? 'bg-cyan-300/80'
                    : hud.waterQuality === 'tinged'
                      ? 'bg-lime-300/80'
                      : hud.waterQuality === 'murky'
                        ? 'bg-amber-400/90'
                        : 'bg-red-400/90'
                }`}
                style={{ width: `${Math.round(hud.worstPollution * 100)}%` }}
              />
            </span>
          </span>
          <span
            data-testid="population"
            className="rounded-full bg-slate-950/60 px-3 py-1 text-slate-200/90 backdrop-blur"
          >
            {hud.fishCount} fish
            {hud.distressedCount > 0 && (
              <span className="ml-2 text-amber-300/90">{hud.distressedCount} unhappy</span>
            )}
          </span>
          <button
            type="button"
            data-testid="journal-toggle"
            aria-label="Tank Journal"
            onClick={() => {
              setJournalOpen((open) => !open)
              setHelpOpen(false)
            }}
            className="rounded-full border border-white/10 bg-slate-900/60 px-2.5 py-1 text-slate-300 hover:bg-slate-800/60"
          >
            📖
          </button>
          <button
            type="button"
            onClick={() => {
              setHelpOpen((open) => !open)
              setJournalOpen(false)
            }}
            className="rounded-full border border-white/10 bg-slate-900/60 px-2.5 py-1 text-slate-300 hover:bg-slate-800/60"
          >
            ?
          </button>
        </div>

        {journalOpen && (
          <div
            data-testid="tank-journal"
            className="absolute right-3 bottom-14 z-20 flex max-h-[70%] w-80 flex-col rounded-xl border border-cyan-100/20 bg-slate-900/95 shadow-xl backdrop-blur"
          >
            <div className="flex items-center justify-between border-b border-cyan-100/10 px-4 py-2.5">
              <p className="font-medium text-cyan-100">Tank Journal</p>
              <button
                type="button"
                onClick={() => setJournalOpen(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <ul className="flex flex-col gap-2.5 overflow-y-auto px-4 py-3 text-sm">
              {hud.journal.length === 0 ? (
                <li className="text-slate-500">Nothing yet — the journal fills as the tank lives.</li>
              ) : (
                hud.journal.map((entry, index) => (
                  <li key={index} data-testid="journal-entry" className="flex gap-2 text-slate-300">
                    <span aria-hidden="true" className="w-5 shrink-0 text-center">
                      {JOURNAL_GLYPHS[entry.kind]}
                    </span>
                    <span className="min-w-0 leading-5">
                      {entry.message}
                      <span className="ml-2 text-xs whitespace-nowrap text-slate-500">
                        {entry.age}
                      </span>
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}

        {helpOpen && (
          <div className="absolute right-3 bottom-14 w-72 rounded-xl border border-cyan-100/20 bg-slate-900/95 p-4 text-sm text-slate-300 shadow-xl backdrop-blur">
            <p className="mb-2 font-medium text-cyan-100">How to play</p>
            <p className="mb-2">
              Click the water to drop food, or press and hold to sprinkle. Keep an eye on your fish
              — and on the water they swim in.
            </p>
            <p className="mb-2">
              The tank keeps living while you&apos;re away, a little slower, shaped by how you left
              it.
            </p>
            <p className="text-slate-400">Everything else, you&apos;ll discover by caring.</p>
          </div>
        )}

        {hud.selectedFish && (
          <div
            className="absolute right-3 bottom-14 w-72 rounded-2xl border border-cyan-100/20 bg-slate-900/95 p-4 shadow-2xl backdrop-blur"
            data-testid="fish-inspector"
          >
            <div className="mb-1 flex items-center justify-between">
              <h3 className="font-semibold text-cyan-100">{hud.selectedFish.name}</h3>
              <button
                type="button"
                onClick={closeInspector}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-400">
              generation {hud.selectedFish.generation} · {hud.selectedFish.stage} ·{' '}
              {hud.selectedFish.origin} {hud.selectedFish.age}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              <dt className="text-slate-400">Mood</dt>
              <dd className="text-slate-100">{hud.selectedFish.mood}</dd>
              <dt className="text-slate-400">Weight</dt>
              <dd className="text-slate-100 tabular-nums">
                {hud.selectedFish.weightGrams.toFixed(1)} g
              </dd>
            </dl>
            {hud.selectedFish.parents && (
              <p className="mt-2 text-xs text-slate-400">
                child of {hud.selectedFish.parents[0]} &amp; {hud.selectedFish.parents[1]}
              </p>
            )}
            {hud.selectedFish.hatchedInMurkyWater && (
              <p className="mt-1 text-xs text-emerald-300/80">
                hatched in murky water — small and delicate
              </p>
            )}
          </div>
        )}

        {hud.gameOver && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-950/85 backdrop-blur-sm"
            data-testid="game-over"
          >
            <h2 className="text-2xl font-semibold text-slate-100">The tank has gone quiet.</h2>
            <p className="max-w-md text-center text-sm text-slate-400">
              No fish remain. Your coins and equipment are still yours — the glass keeps its
              memories, and the shop has starter glimmerfins.
            </p>
            <div className="text-sm text-amber-200 tabular-nums">◉ {hud.coins.toLocaleString()}</div>
            <button
              type="button"
              data-testid="restart-buy-starter"
              disabled={hud.coins < TUNING.starterFishCost}
              onClick={() => buy('starterFish')}
              className="rounded-xl border border-cyan-300/40 bg-cyan-400/20 px-6 py-2.5 font-medium text-cyan-100 transition hover:bg-cyan-400/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Buy a new starter fish (◉ {TUNING.starterFishCost})
            </button>
            {hud.coins < TUNING.starterFishCost && (
              <p className="text-xs text-slate-500">
                coins are still trickling in — a fresh start isn&apos;t far away
              </p>
            )}
          </div>
        )}

        {menuOpen && (
          <div
            className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm"
            data-testid="main-menu"
          >
            <div className="w-80 rounded-2xl border border-cyan-100/20 bg-slate-900/95 p-6 shadow-2xl">
              <h2 className="text-lg font-semibold text-cyan-100">Paused</h2>
              <p className="mt-1 text-xs text-slate-400">
                the tank holds its breath while you&apos;re here
              </p>
              <p className="mt-3 text-sm text-slate-300">
                {hud.fishCount} fish · ◉ {hud.coins.toLocaleString()} · {hud.waterQuality} water
              </p>
              <div className="mt-5 flex flex-col gap-2">
                <button
                  type="button"
                  data-testid="menu-resume"
                  onClick={() => setMenuOpen(false)}
                  className="w-full rounded-xl border border-cyan-300/40 bg-cyan-400/20 px-4 py-2 font-medium text-cyan-100 transition hover:bg-cyan-400/30"
                >
                  Resume
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    setHelpOpen(true)
                  }}
                  className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-4 py-2 text-slate-200 transition hover:bg-slate-800"
                >
                  How to play
                </button>
                {confirmingNewGame ? (
                  <div className="rounded-xl border border-red-400/30 bg-red-950/40 p-3">
                    <p className="text-sm text-red-100">
                      Start over? Your fish, coins, and equipment are gone for good — the journal
                      too.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        data-testid="menu-confirm-new-game"
                        onClick={startNewGame}
                        className="flex-1 rounded-lg border border-red-400/50 bg-red-500/20 px-3 py-1.5 text-sm font-medium text-red-100 transition hover:bg-red-500/30"
                      >
                        Start over
                      </button>
                      <button
                        type="button"
                        data-testid="menu-keep-tank"
                        onClick={() => setConfirmingNewGame(false)}
                        className="flex-1 rounded-lg border border-white/10 bg-slate-800/60 px-3 py-1.5 text-sm text-slate-200 transition hover:bg-slate-800"
                      >
                        Keep my tank
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    data-testid="menu-new-game"
                    onClick={() => setConfirmingNewGame(true)}
                    className="w-full rounded-xl border border-white/10 bg-slate-800/60 px-4 py-2 text-slate-200 transition hover:bg-slate-800"
                  >
                    Start a new game
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {awaySummary && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
            <div
              className="w-96 rounded-2xl border border-cyan-100/20 bg-slate-900/95 p-6 shadow-2xl"
              data-testid="away-summary"
            >
              <h2 className="text-lg font-semibold text-cyan-100">While you were away…</h2>
              <p className="mt-1 text-xs text-slate-400">
                {formatAway(awaySummary.awaySeconds)} passed. The tank drifted on without you, a
                little slower.
              </p>
              {awaySummary.companion && (
                <p className="mt-3 text-sm text-slate-300">
                  {awaySummary.companion} kept circling the kelp, watching for you.
                </p>
              )}
              <ul className="mt-4 flex flex-col gap-2 text-sm text-slate-200">
                <li>◉ {Math.floor(awaySummary.coinsEarned)} coins collected</li>
                {awaySummary.births.map((name) => (
                  <li key={name}>🐟 {name} hatched!</li>
                ))}
                {awaySummary.developments.map((message) => (
                  <li key={message}>✦ {message}</li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setAwaySummary(null)}
                className="mt-5 w-full rounded-xl border border-cyan-300/40 bg-cyan-400/20 px-4 py-2 font-medium text-cyan-100 transition hover:bg-cyan-400/30"
              >
                Back to the tank
              </button>
            </div>
          </div>
        )}
      </div>
      <aside
        className="flex min-h-56 flex-col rounded-2xl border border-cyan-100/15 bg-slate-950/80 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.35)] lg:min-h-0"
        data-testid="shop-panel"
        data-ui-anchor="right-sidebar"
      >
        {/* Toasts live in the sidebar, off the playable tank surface, so a
         * dismissible notice can never intercept a Feed or Siphon gesture. */}
        <div
          className="mb-3 flex flex-col gap-2 empty:hidden"
          data-testid="toast-stack"
          data-ui-anchor="sidebar"
          aria-live="polite"
        >
          {visibleToasts.map((toast) => (
            <button
              type="button"
              key={toast.key}
              data-testid={`toast-${toast.tone}`}
              title="Dismiss"
              onClick={() => dismissToast(toast.key)}
              className={`w-full cursor-pointer rounded-xl border px-4 py-2 text-left text-sm shadow-lg transition animate-in fade-in slide-in-from-right-2 duration-300 ${
                toast.tone === 'development'
                  ? 'border-amber-300/80 bg-gradient-to-r from-amber-950/90 to-yellow-900/80 text-amber-100 shadow-[0_0_24px_rgba(251,191,36,0.28)]'
                  : toast.tone === 'warning'
                    ? 'border-red-400/40 bg-red-950/85 text-red-100'
                    : 'border-cyan-200/20 bg-slate-900/80 text-slate-200'
              }`}
            >
              {toast.tone === 'development' && <span className="mr-2 text-base">✦</span>}
              {toast.message}
            </button>
          ))}
        </div>
        <div className="mb-4 border-b border-cyan-100/10 pb-3">
          <p className="text-[0.65rem] font-semibold tracking-[0.2em] text-cyan-300/55 uppercase">
            Tank supplies
          </p>
          <h2 className="mt-1 text-lg font-semibold text-cyan-100">Shop</h2>
        </div>
        {hud.shopItems.length === 0 ? (
          <p className="text-sm leading-6 text-slate-400">
            Nothing for sale just yet. The shop takes an interest in tanks that are going places.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {hud.shopItems.map((item) => (
              <li key={item.id} className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-medium text-slate-100">{item.label}</span>
                  <span className="shrink-0 text-sm text-amber-200 tabular-nums">◉ {item.cost}</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-400">{item.description}</p>
                <button
                  type="button"
                  data-testid={`buy-${item.id}`}
                  disabled={!item.affordable}
                  onClick={() => buy(item.id)}
                  className="mt-3 w-full rounded-lg border border-cyan-300/30 bg-cyan-400/15 px-3 py-1.5 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/25 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-slate-800/40 disabled:text-slate-500"
                >
                  {item.affordable ? 'Buy' : 'Not enough coins'}
                </button>
              </li>
            ))}
          </ul>
        )}
        <section
          className="mt-auto border-t border-cyan-100/10 pt-4"
          data-testid="fish-roster"
          data-ui-section="shop-footer"
        >
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-xs font-semibold tracking-wide text-cyan-100 uppercase">Residents</h3>
            <span className="text-[0.65rem] text-slate-500 tabular-nums">
              {hud.residents.length}/{TUNING.maxPopulation}
            </span>
          </div>
          {hud.residents.length === 0 ? (
            <p className="text-xs text-slate-500">The tank has no residents.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {hud.residents.map((resident) => (
                <button
                  key={resident.id}
                  type="button"
                  onClick={() => selectFish(resident.id)}
                  aria-label={`${resident.name}, ${resident.weightGrams.toFixed(1)} grams, ${resident.mood}`}
                  aria-pressed={hud.selectedFish?.id === resident.id}
                  data-testid={`resident-${resident.id}`}
                  className="group min-w-0 rounded-xl border border-white/10 bg-slate-950/60 p-2 text-left transition hover:border-cyan-200/25 hover:bg-slate-900/80 aria-pressed:border-cyan-300/40 aria-pressed:bg-cyan-950/50"
                >
                  <div className="flex items-center gap-1.5">
                    <svg
                      viewBox="0 0 48 28"
                      className="h-7 w-11 shrink-0 drop-shadow-sm"
                      style={{
                        color: `hsl(${resident.hue}, ${resident.saturation * 100}%, 58%)`,
                      }}
                      aria-hidden="true"
                    >
                      <path d="M14 14 2 4v20Z" fill="currentColor" opacity="0.72" />
                      <ellipse cx="29" cy="14" rx="16" ry="10" fill="currentColor" />
                      <circle cx="36" cy="11" r="2.2" fill="#e8f4f6" />
                      <circle cx="36.7" cy="11" r="1" fill="#1c2733" />
                    </svg>
                    <span className="min-w-0 truncate text-xs font-medium text-slate-100">
                      {resident.name}
                    </span>
                    <span className="ml-auto text-base leading-none" aria-hidden="true">
                      {resident.moodEmoji}
                    </span>
                  </div>
                  <p className="mt-1 text-[0.65rem] text-slate-400 tabular-nums">
                    {resident.weightGrams.toFixed(1)} g
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>
      </aside>
      </div>
    </main>
  )
}

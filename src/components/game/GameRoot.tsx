'use client'

import { useEffect, useRef, useState } from 'react'

import { TANK, TUNING, type Fish, type GameEvent } from '@/game/model'
import { TankRenderer } from '@/game/render'
import { deserialize, parseSave, SAVE_KEY, serialize } from '@/game/save'
import { GameSim, type OfflineSummary, type ShopItem } from '@/game/sim'

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
  waterQuality: WaterTier
  shopItems: ShopItem[]
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
  waterQuality: 'clear',
  shopItems: [],
}

function describeMood(fish: Fish): string {
  if (fish.hunger >= 0.999) return 'starving'
  if (fish.sickness >= 0.75) return 'gravely ill'
  if (fish.sickness > 0.4) return 'sick'
  if (fish.hunger > 0.85) return 'very hungry'
  if (fish.hunger > 0.5) return 'peckish'
  if (fish.activity.kind === 'court') return 'smitten'
  return 'content'
}

function describeStage(fish: Fish): string {
  const maturity = fish.weight / fish.genome.maxWeight
  if (maturity < 0.2) return 'fry'
  if (maturity < TUNING.breedingMinWeightFraction) return 'juvenile'
  return 'adult'
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

function buildHudSnapshot(
  sim: GameSim,
  selectedFishId: number | undefined,
  previousWater: WaterTier,
): HudSnapshot {
  const state = sim.state
  const fishEntities = [...state.world.with('fish')]
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
    waterQuality: describeWater(sim.worstPollution(), previousWater),
    shopItems: sim.shopItems(),
    selectedFish: selected?.fish
      ? {
          id: selected.id,
          name: selected.fish.name,
          generation: selected.fish.generation,
          stage: describeStage(selected.fish),
          mood: describeMood(selected.fish),
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

  const [hud, setHud] = useState<HudSnapshot>(EMPTY_HUD)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [tool, setToolState] = useState<Tool>('feed')
  const [shopOpen, setShopOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [awaySummary, setAwaySummary] = useState<OfflineSummary | null>(null)

  const setTool = (next: Tool) => {
    toolRef.current = next
    setToolState(next)
  }

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

    // Dev-only playtest accelerator and automation handle; absent in production builds.
    let simSpeed = 1
    if (process.env.NODE_ENV === 'development') {
      const speedParam = Number(new URLSearchParams(window.location.search).get('speed'))
      if (Number.isFinite(speedParam) && speedParam >= 1) simSpeed = Math.min(16, speedParam)
      ;(window as unknown as { __glassgarden?: unknown }).__glassgarden = sim
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
      if (dt > 5) {
        sim!.advanceOffline(dt)
      } else {
        sim!.step(dt * simSpeed, document.visibilityState === 'visible')
      }
      applyEvents(sim!.drainEvents())

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
      save()
    }
  }, [])

  const toLogical = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * TANK.width,
      y: ((event.clientY - rect.top) / rect.height) * TANK.height,
    }
  }

  const onCanvasClick = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const sim = simRef.current
    if (!sim) return
    setHelpOpen(false)
    setShopOpen(false)
    const point = toLogical(event)
    const fish = sim.fishAt(point.x, point.y)
    if (fish) {
      selectedFishRef.current = fish.id
    } else {
      selectedFishRef.current = undefined
      if (toolRef.current === 'feed') {
        const dropped = sim.dropFood(point.x)
        if (!dropped && !sim.state.gameOver && performance.now() - affordWarnAtRef.current > 5000) {
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
      } else if (toolRef.current === 'siphon') {
        sim.siphonAt(point.x, point.y)
        rendererRef.current?.notifySiphon(point.x, point.y)
      }
    }
    refreshHudRef.current()
  }

  const onCanvasMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const sim = simRef.current
    if (!sim) return
    const point = toLogical(event)
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

  const buy = (itemId: ShopItem['id']) => {
    simRef.current?.buy(itemId)
    refreshHudRef.current()
  }

  const closeInspector = () => {
    selectedFishRef.current = undefined
    refreshHudRef.current()
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setHelpOpen(false)
      setShopOpen(false)
      selectedFishRef.current = undefined
      refreshHudRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_top,_#12303e,_#0a1a24_65%)] p-4 text-slate-100">
      <div className="flex w-full max-w-[min(1720px,calc((100svh-9rem)*16/9))] items-end justify-between px-1">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-cyan-100">Glassgarden</h1>
          <p className="text-xs text-cyan-300/70">a quiet aquarium that grows around your care</p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="rounded-full border border-amber-200/20 bg-amber-950/40 px-4 py-1.5 text-sm font-medium text-amber-200 tabular-nums"
            data-testid="coins"
          >
            ◉ {hud.coins.toLocaleString()}
            <span className="ml-2 text-xs text-amber-200/60">
              +{hud.incomePerSecond.toFixed(2)}/s
            </span>
          </div>
          <button
            type="button"
            data-testid="shop-toggle"
            onClick={() => setShopOpen((open) => !open)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              shopOpen
                ? 'border-cyan-300/60 bg-cyan-400/20 text-cyan-100'
                : 'border-cyan-200/20 bg-cyan-950/40 text-cyan-200 hover:bg-cyan-900/40'
            }`}
          >
            Shop
          </button>
        </div>
      </div>

      <div className="relative w-full max-w-[min(1720px,calc((100svh-9rem)*16/9))] overflow-hidden rounded-2xl border border-cyan-100/15 bg-slate-950 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
        <canvas
          ref={canvasRef}
          className="block aspect-[16/9] w-full"
          onPointerDown={onCanvasClick}
          onPointerMove={onCanvasMove}
          data-testid="tank-canvas"
        />

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
          className={`pointer-events-none absolute inset-x-0 flex flex-col items-center gap-2 px-4 ${
            hud.criticalNames.length > 0 && !hud.gameOver ? 'top-16' : 'top-3'
          }`}
        >
          {visibleToasts.map((toast) => (
            <div
              key={toast.key}
              data-testid={`toast-${toast.tone}`}
              className={`pointer-events-none max-w-xl rounded-xl border px-4 py-2 text-sm shadow-lg backdrop-blur transition animate-in fade-in slide-in-from-top-2 duration-300 ${
                toast.tone === 'development'
                  ? 'border-amber-300/80 bg-gradient-to-r from-amber-950/90 to-yellow-900/80 text-amber-100 shadow-[0_0_24px_rgba(251,191,36,0.28)]'
                  : toast.tone === 'warning'
                    ? 'border-red-400/40 bg-red-950/85 text-red-100'
                    : 'border-cyan-200/20 bg-slate-900/80 text-slate-200'
              }`}
            >
              {toast.tone === 'development' && <span className="mr-2 text-base">✦</span>}
              {toast.message}
            </div>
          ))}
        </div>

        <div className="absolute bottom-3 left-3 flex items-center gap-2">
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
            {tool === 'feed' ? 'click the water to drop food' : 'click debris to clean it up'}
          </span>
        </div>

        <div className="absolute right-3 bottom-3 flex items-center gap-2 text-xs">
          <span
            data-testid="water-quality"
            className={`rounded-full bg-slate-950/60 px-3 py-1 backdrop-blur ${
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
            onClick={() => setHelpOpen((open) => !open)}
            className="rounded-full border border-white/10 bg-slate-900/60 px-2.5 py-1 text-slate-300 hover:bg-slate-800/60"
          >
            ?
          </button>
        </div>

        {helpOpen && (
          <div className="absolute right-3 bottom-14 w-72 rounded-xl border border-cyan-100/20 bg-slate-900/95 p-4 text-sm text-slate-300 shadow-xl backdrop-blur">
            <p className="mb-2 font-medium text-cyan-100">How to play</p>
            <p className="mb-2">
              Click the water to drop food. Keep an eye on your fish — and on the water they swim
              in.
            </p>
            <p className="mb-2">
              The tank keeps living while you&apos;re away, a little slower, shaped by how you left
              it.
            </p>
            <p className="text-slate-400">Everything else, you&apos;ll discover by caring.</p>
          </div>
        )}

        {shopOpen && (
          <div
            className="absolute top-3 right-3 w-80 rounded-2xl border border-cyan-100/20 bg-slate-900/95 p-4 shadow-2xl backdrop-blur"
            data-testid="shop-panel"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-wide text-cyan-100 uppercase">Shop</h2>
              <button
                type="button"
                onClick={() => setShopOpen(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            {hud.shopItems.length === 0 ? (
              <p className="text-sm text-slate-400">
                Nothing for sale just yet. The shop takes an interest in tanks that are going
                places.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {hud.shopItems.map((item) => (
                  <li key={item.id} className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-100">{item.label}</span>
                      <span className="text-sm text-amber-200 tabular-nums">◉ {item.cost}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{item.description}</p>
                    <button
                      type="button"
                      data-testid={`buy-${item.id}`}
                      disabled={!item.affordable}
                      onClick={() => buy(item.id)}
                      className="mt-2 w-full rounded-lg border border-cyan-300/30 bg-cyan-400/15 px-3 py-1.5 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/25 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-slate-800/40 disabled:text-slate-500"
                    >
                      {item.affordable ? 'Buy' : 'Not enough coins'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {hud.selectedFish && (
          <div
            className="absolute bottom-16 left-3 w-72 rounded-2xl border border-cyan-100/20 bg-slate-900/95 p-4 shadow-2xl backdrop-blur"
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
    </main>
  )
}

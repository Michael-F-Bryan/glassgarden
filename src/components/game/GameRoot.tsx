'use client'

import { useEffect, useRef, useState } from 'react'

import { formatAway } from '@/game/hud'
import { TANK, TUNING, type JournalKind } from '@/game/model'
import {
  browserRuntimeDeps,
  createGameRuntime,
  EMPTY_VIEW,
  type GameRuntime,
  type GameView,
  type Tool,
} from '@/game/runtime'
import type { ShopOfferId } from '@/game/sim'

const JOURNAL_GLYPHS: Record<JournalKind, string> = {
  arrival: '🐟',
  birth: '🐣',
  death: '🥀',
  development: '✦',
  purchase: '◉',
  away: '🌙',
}

/**
 * Page-level composition and view. Everything with a lifecycle — the live
 * sim, browser clocks, persistence, renderer, gestures, replacement — lives
 * in the game runtime; this component renders the subscribed view and
 * translates DOM events into runtime calls. Only overlay chrome (menu, help,
 * journal, confirmation) is React state here.
 */
export default function GameRoot() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const runtimeRef = useRef<GameRuntime | null>(null)

  const [view, setView] = useState<GameView>(EMPTY_VIEW)
  const [helpOpen, setHelpOpen] = useState(false)
  const [journalOpen, setJournalOpen] = useState(false)
  const [menuOpen, setMenuOpenState] = useState(false)
  const [confirmingNewGame, setConfirmingNewGame] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const runtime = createGameRuntime(browserRuntimeDeps())
    runtimeRef.current = runtime
    const unsubscribe = runtime.subscribe(setView)
    runtime.start(canvas)
    return () => {
      unsubscribe()
      runtime.stop()
      runtimeRef.current = null
    }
  }, [])

  const hud = view.hud

  const toLogical = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * TANK.width,
      y: ((event.clientY - rect.top) / rect.height) * TANK.height,
    }
  }

  const onCanvasPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    setHelpOpen(false)
    setJournalOpen(false)
    runtimeRef.current?.pointerDown(toLogical(event))
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onCanvasMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const hover = runtimeRef.current?.pointerMove(toLogical(event))
    event.currentTarget.style.cursor =
      hover === 'fish' ? 'pointer' : view.tool === 'siphon' ? 'cell' : 'default'
  }

  const onCanvasPointerUp = () => {
    runtimeRef.current?.pointerUp()
  }

  const setTool = (tool: Tool) => runtimeRef.current?.setTool(tool)

  const buy = (itemId: ShopOfferId) => runtimeRef.current?.buy(itemId)

  const closeInspector = () => runtimeRef.current?.selectFish(undefined)

  const selectFish = (fishId: number) => {
    setJournalOpen(false)
    runtimeRef.current?.selectFish(fishId)
  }

  const setMenuOpen = (open: boolean) => {
    if (open) runtimeRef.current?.pause()
    else runtimeRef.current?.resume()
    setMenuOpenState(open)
    setConfirmingNewGame(false)
    if (open) {
      setHelpOpen(false)
      setJournalOpen(false)
    }
  }

  const startNewGame = () => {
    runtimeRef.current?.newGame()
    setMenuOpen(false)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === '1') {
        runtimeRef.current?.setTool('feed')
        return
      }
      if (event.key === '2') {
        runtimeRef.current?.setTool('siphon')
        return
      }
      if (event.key !== 'Escape') return
      setMenuOpenState(false)
      setConfirmingNewGame(false)
      setHelpOpen(false)
      setJournalOpen(false)
      runtimeRef.current?.resume()
      runtimeRef.current?.selectFish(undefined)
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
            aria-keyshortcuts="1"
            aria-pressed={view.tool === 'feed'}
            className={`rounded-xl border px-4 py-2 text-sm font-medium backdrop-blur transition ${
              view.tool === 'feed'
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
              aria-keyshortcuts="2"
              aria-pressed={view.tool === 'siphon'}
              className={`rounded-xl border px-4 py-2 text-sm font-medium backdrop-blur transition ${
                view.tool === 'siphon'
                  ? 'border-cyan-300/60 bg-cyan-400/20 text-cyan-100'
                  : 'border-white/10 bg-slate-900/60 text-slate-300 hover:bg-slate-800/60'
              }`}
            >
              🧹 Siphon
            </button>
          )}
          <span className="ml-1 hidden rounded-full bg-slate-950/60 px-3 py-1 text-xs text-slate-200/90 backdrop-blur sm:block">
            {view.tool === 'feed'
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

        {view.awaySummary && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
            <div
              className="w-96 rounded-2xl border border-cyan-100/20 bg-slate-900/95 p-6 shadow-2xl"
              data-testid="away-summary"
            >
              <h2 className="text-lg font-semibold text-cyan-100">While you were away…</h2>
              <p className="mt-1 text-xs text-slate-400">
                {formatAway(view.awaySummary.awaySeconds)} passed. The tank drifted on without you, a
                little slower.
              </p>
              {view.awaySummary.companion && (
                <p className="mt-3 text-sm text-slate-300">
                  {view.awaySummary.companion} kept circling the kelp, watching for you.
                </p>
              )}
              <ul className="mt-4 flex flex-col gap-2 text-sm text-slate-200">
                <li>◉ {Math.floor(view.awaySummary.coinsEarned)} coins collected</li>
                {view.awaySummary.births.map((name) => (
                  <li key={name}>🐟 {name} hatched!</li>
                ))}
                {view.awaySummary.developments.map((message) => (
                  <li key={message}>✦ {message}</li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => runtimeRef.current?.dismissAwaySummary()}
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
          {view.toasts.map((toast) => (
            <button
              type="button"
              key={toast.key}
              data-testid={`toast-${toast.tone}`}
              title="Dismiss"
              onClick={() => runtimeRef.current?.dismissToast(toast.key)}
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

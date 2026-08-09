import { TANK, type Vec2 } from './model'
import type { Rng } from './rng'

/**
 * Spatial water quality. Pollution is a coarse grid of [0, 1] values so the
 * water visibly greens where waste sits, keeping cause and effect legible.
 */
export const WATER_COLS = 12
export const WATER_ROWS = 7

export type WaterGrid = {
  cells: number[] // WATER_COLS * WATER_ROWS, row-major
}

/** What read-only consumers (HUD, renderer) may see of the grid. */
export type WaterGridView = {
  readonly cells: readonly number[]
}

export function createWaterGrid(): WaterGrid {
  return { cells: new Array(WATER_COLS * WATER_ROWS).fill(0) }
}

function clampIndex(value: number, count: number): number {
  return Math.min(count - 1, Math.max(0, value))
}

export function cellIndexAt(position: Vec2): number {
  const col = clampIndex(Math.floor((position.x / TANK.width) * WATER_COLS), WATER_COLS)
  const row = clampIndex(
    Math.floor(((position.y - TANK.waterTop) / (TANK.sandTop - TANK.waterTop)) * WATER_ROWS),
    WATER_ROWS,
  )
  return row * WATER_COLS + col
}

export function pollutionAt(grid: WaterGridView, position: Vec2): number {
  return grid.cells[cellIndexAt(position)]
}

export function addPollution(grid: WaterGrid, position: Vec2, amount: number): void {
  const index = cellIndexAt(position)
  grid.cells[index] = Math.min(1, grid.cells[index] + amount)
}

export function clearPollutionNear(grid: WaterGrid, position: Vec2, fraction: number): void {
  const index = cellIndexAt(position)
  grid.cells[index] *= 1 - fraction
}

/** Filtration: pull a flat amount out of every cell, never below clean. */
export function clearPollutionEverywhere(grid: WaterGrid, amount: number): void {
  for (let index = 0; index < grid.cells.length; index += 1) {
    grid.cells[index] = Math.max(0, grid.cells[index] - amount)
  }
}

export function maxPollution(grid: WaterGridView): number {
  return Math.max(...grid.cells)
}

export function averagePollution(grid: WaterGridView): number {
  return grid.cells.reduce((sum, value) => sum + value, 0) / grid.cells.length
}

/** Diffuse toward the four-neighbour average, then decay. */
export function stepWater(grid: WaterGrid, dt: number, diffusion: number, decay: number): void {
  const previous = grid.cells.slice()
  for (let row = 0; row < WATER_ROWS; row += 1) {
    for (let col = 0; col < WATER_COLS; col += 1) {
      const index = row * WATER_COLS + col
      const neighbours: number[] = []
      if (col > 0) neighbours.push(previous[index - 1])
      if (col < WATER_COLS - 1) neighbours.push(previous[index + 1])
      if (row > 0) neighbours.push(previous[index - WATER_COLS])
      if (row < WATER_ROWS - 1) neighbours.push(previous[index + WATER_COLS])
      const neighbourAverage = neighbours.reduce((sum, value) => sum + value, 0) / neighbours.length
      const towardNeighbours = neighbourAverage - previous[index]
      const diffused = previous[index] + towardNeighbours * Math.min(1, diffusion * dt)
      grid.cells[index] = Math.max(0, diffused - decay * dt)
    }
  }
}

/** A random point inside the swimmable water volume. */
export function randomWaterPoint(rng: Rng, margin = 60): Vec2 {
  return {
    x: rng.range(margin, TANK.width - margin),
    y: rng.range(TANK.waterTop + margin, TANK.sandTop - margin / 2),
  }
}

import { tankBoundsFor, type FeederStage, type HabitatStage } from './equipment'
import { fishLength, TANK, type Entity, type TankBounds } from './model'
import type { GameReadModel } from './state'
import { averagePollution, WATER_COLS, WATER_ROWS } from './water'

/**
 * Canvas presentation of the simulation. Pure observer: reads the GameReadModel,
 * never mutates it. Keeps its own cosmetic state (bubbles, offscreen
 * pollution layer) that is irrelevant to the sim.
 */

type Bubble = { x: number; y: number; radius: number; speed: number; wobble: number }

export type DrawOptions = {
  /** Real seconds since page load, for animation phases. */
  realTime: number
  selectedFishId?: number
  hoverFishId?: number
  /** Where the keyboard is aiming, drawn as a visible target. */
  caret?: { x: number; y: number }
}

/** Deterministic per-entity variation without touching the sim RNG. */
function hash01(seed: number): number {
  let h = (seed * 2654435761) >>> 0
  h ^= h >>> 13
  h = (h * 2246822519) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const KELP = [
  { x: 96, height: 300, fronds: 3 },
  { x: 292, height: 180, fronds: 2 },
  { x: 962, height: 340, fronds: 4 },
  { x: 1120, height: 220, fronds: 3 },
]

/** Fresh planting that arrives with the habitat expansion, rooted in the new
 * ground east of the original glass line so the growth reads as new space. */
const EXPANDED_KELP = [
  { x: 1268, height: 380, fronds: 4 },
  { x: 1420, height: 240, fronds: 3 },
  { x: 1548, height: 320, fronds: 3 },
]

function kelpFor(habitat: HabitatStage) {
  return habitat === 'expanded' ? [...KELP, ...EXPANDED_KELP] : KELP
}

/** What the renderer needs from a living resident. */
type DrawableResident = Entity &
  Required<Pick<Entity, 'resident' | 'genome' | 'physiology' | 'behaviour'>>

type SiphonPuff = { x: number; y: number; at: number }
type CoinFloat = { x: number; y: number; at: number }

/** How long the returning-appetite cue lingers, in sim seconds. Cosmetic:
 * the sim records only the crossing moment (Physiology.appetiteSince). */
const APPETITE_CUE_SECONDS = 4

/**
 * The runtime's window onto the canvas: owns the 2d context, device-pixel
 * scaling, and the window resize listener, so the runtime itself never
 * touches the canvas API and tests can substitute a recording fake.
 */
export function createCanvasPresenter(canvas: HTMLCanvasElement) {
  const renderer = new TankRenderer()
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const resize = () => {
    const rect = canvas.getBoundingClientRect()
    const width = Math.max(1, Math.round(rect.width * dpr))
    canvas.width = width
    // Every habitat stage is 16:9, so the buffer's aspect never changes —
    // an expansion changes the logical scale below, not the canvas shape.
    canvas.height = Math.round((width * 9) / 16)
  }
  resize()
  window.addEventListener('resize', resize)
  const ctx = canvas.getContext('2d')!

  return {
    draw(state: GameReadModel, options: DrawOptions): void {
      // Scale from the owned habitat's bounds each frame: buying the
      // expansion pulls the camera back to take in the larger tank.
      const renderScale = canvas.width / tankBoundsFor(state.equipment.habitat).width
      ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0)
      renderer.draw(ctx, state, options)
    },
    notifyFeed: (x: number) => renderer.notifyFeed(x),
    notifySiphon: (x: number, y: number) => renderer.notifySiphon(x, y),
    resetTransient: () => renderer.resetTransient(),
    dispose: () => window.removeEventListener('resize', resize),
  }
}

export class TankRenderer {
  private pollutionLayer = document.createElement('canvas')
  private bubbles: Bubble[] = []
  private lastBubbleTime: number | undefined
  private puffs: SiphonPuff[] = []
  private coinFloats: CoinFloat[] = []
  /** The owned habitat's bounds, refreshed at the top of every draw so all
   * cosmetic state (bubbles, floats) follows an expansion. */
  private bounds: TankBounds = TANK
  private habitat: HabitatStage = 'starter'

  /** Cosmetic confirmation that a siphon click landed. */
  notifySiphon(x: number, y: number): void {
    this.puffs.push({ x, y, at: performance.now() / 1000 })
    if (this.puffs.length > 8) this.puffs.shift()
  }

  /** Cosmetic "−◉1" drifting up from where a pellet was paid for. */
  notifyFeed(x: number): void {
    this.coinFloats.push({ x, y: this.bounds.waterTop + 14, at: performance.now() / 1000 })
    if (this.coinFloats.length > 10) this.coinFloats.shift()
  }

  constructor() {
    this.pollutionLayer.width = WATER_COLS
    this.pollutionLayer.height = WATER_ROWS
    this.resetTransient()
  }

  /** Forget cosmetic residue (siphon puffs, coin floats, bubble cadence) so a
   * replaced session starts visually clean instead of inheriting effects that
   * belong to the previous tank. */
  resetTransient(): void {
    this.puffs = []
    this.coinFloats = []
    this.lastBubbleTime = undefined
    this.bubbles = []
    for (let i = 0; i < 14; i += 1) this.bubbles.push(this.newBubble(true))
  }

  private newBubble(anywhere: boolean): Bubble {
    return {
      x: Math.random() * this.bounds.width,
      y: anywhere ? this.bounds.waterTop + Math.random() * (this.bounds.sandTop - this.bounds.waterTop) : this.bounds.sandTop - 10,
      radius: 1.5 + Math.random() * 3,
      speed: 14 + Math.random() * 22,
      wobble: Math.random() * Math.PI * 2,
    }
  }

  draw(ctx: CanvasRenderingContext2D, state: GameReadModel, options: DrawOptions): void {
    const { realTime } = options
    this.habitat = state.equipment.habitat
    this.bounds = tankBoundsFor(this.habitat)
    // Overall murk drives every water-quality cue at once: green tint, dying
    // light, drifting particulate. The tank itself must tell the truth.
    const murk = Math.min(1, averagePollution(state.water) * 1.6)
    ctx.clearRect(0, 0, this.bounds.width, this.bounds.height)
    this.drawWater(ctx)
    this.drawPollution(ctx, state, murk)
    this.drawLightShafts(ctx, realTime, murk)
    this.drawMurkMotes(ctx, realTime, murk)
    this.drawRocks(ctx)
    this.drawKelp(ctx, realTime, true)
    this.drawSand(ctx)

    for (const entity of state.world.with('egg')) this.drawEgg(ctx, entity, state.time, realTime)
    for (const entity of state.world.with('waste')) this.drawWaste(ctx, entity)
    for (const entity of state.world.with('food')) this.drawFood(ctx, entity)

    const fishEntities = [...state.world.with('resident', 'genome', 'physiology', 'behaviour')].sort(
      (a, b) => a.position.y - b.position.y,
    )
    for (const entity of fishEntities) {
      const highlighted = entity.id === options.selectedFishId || entity.id === options.hoverFishId
      this.drawFish(ctx, entity, state.time, realTime, highlighted)
      if (entity.id === options.selectedFishId || entity.id === options.hoverFishId) {
        this.drawNameplate(ctx, entity)
      }
    }
    for (const entity of state.world.with('remains')) this.drawRemains(ctx, entity, state.time)

    this.drawKelp(ctx, realTime, false)
    if (state.equipment.feeder !== 'none') this.drawFeeder(ctx, state.equipment.feeder)
    if (state.equipment.filter !== 'none') this.drawFilter(ctx, realTime)
    this.drawPuffs(ctx, realTime)
    this.drawCoinFloats(ctx, realTime)
    this.drawBubbles(ctx, realTime)
    this.drawSurface(ctx, realTime)
    if (options.caret) this.drawCaret(ctx, options.caret, realTime)
  }

  /** The keyboard's aiming target. Drawn last and with a pulse so it stays
   * findable against a busy tank — a keyboard player has no cursor. */
  private drawCaret(ctx: CanvasRenderingContext2D, caret: { x: number; y: number }, realTime: number): void {
    const pulse = 1 + Math.sin(realTime * 4) * 0.12
    ctx.save()
    ctx.translate(caret.x, caret.y)
    ctx.strokeStyle = 'rgba(232, 244, 246, 0.95)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(0, 0, 16 * pulse, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(10, 26, 36, 0.9)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(0, 0, 16 * pulse + 1.5, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(232, 244, 246, 0.95)'
    ctx.lineWidth = 2
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      ctx.beginPath()
      ctx.moveTo(dx * 10, dy * 10)
      ctx.lineTo(dx * 24, dy * 24)
      ctx.stroke()
    }
    ctx.restore()
  }

  /** Each feeder stage reads as a bigger machine: one chamber, two, then a
   * wide rotary drum, so an upgrade is visible on the glass, not just in a
   * menu. */
  private drawFeeder(ctx: CanvasRenderingContext2D, stage: FeederStage): void {
    const chambers = stage === 'rotary' ? 3 : stage === 'twin' ? 2 : 1
    const halfWidth = 18 + chambers * 8
    ctx.save()
    ctx.translate(this.bounds.width - 80, this.bounds.waterTop - 12)
    ctx.fillStyle = '#31404d'
    ctx.beginPath()
    ctx.roundRect(-halfWidth, -14, halfWidth * 2, 26, 6)
    ctx.fill()
    ctx.fillStyle = '#4b5d6b'
    for (let i = 0; i < chambers; i += 1) {
      const spacing = (halfWidth * 2 - 12) / chambers
      const x = -halfWidth + 6 + spacing * i
      ctx.beginPath()
      ctx.roundRect(x, -10, spacing - 4, 10, 4)
      ctx.fill()
    }
    ctx.fillStyle = '#e8b04b'
    ctx.beginPath()
    ctx.arc(0, 16, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  /** The sponge filter: a squat cylinder in the far corner with a slow
   * bubble column, so filtration is visibly present in the tank. */
  private drawFilter(ctx: CanvasRenderingContext2D, realTime: number): void {
    ctx.save()
    ctx.translate(56, this.bounds.sandTop - 46)
    ctx.fillStyle = '#5b6f63'
    ctx.beginPath()
    ctx.roundRect(-16, 0, 32, 46, 7)
    ctx.fill()
    ctx.fillStyle = 'rgba(20, 34, 30, 0.5)'
    for (let i = 0; i < 4; i += 1) {
      ctx.fillRect(-13, 7 + i * 10, 26, 3)
    }
    ctx.fillStyle = '#3a4a53'
    ctx.fillRect(-4, -14, 8, 16)
    ctx.fillStyle = 'rgba(226, 244, 246, 0.5)'
    for (let i = 0; i < 3; i += 1) {
      const phase = (realTime * 0.5 + i * 0.33) % 1
      ctx.beginPath()
      ctx.arc(Math.sin(phase * 7 + i) * 3, -16 - phase * 40, 2.2 * (1 - phase * 0.5), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  private drawPuffs(ctx: CanvasRenderingContext2D, realTime: number): void {
    const LIFETIME = 0.6
    this.puffs = this.puffs.filter((puff) => realTime - puff.at < LIFETIME)
    for (const puff of this.puffs) {
      const t = (realTime - puff.at) / LIFETIME
      ctx.save()
      ctx.globalAlpha = (1 - t) * 0.7
      ctx.strokeStyle = 'rgba(220, 240, 250, 0.9)'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(puff.x, puff.y, 12 + t * 46, 0, Math.PI * 2)
      ctx.stroke()
      for (let i = 0; i < 5; i += 1) {
        const angle = (i / 5) * Math.PI * 2 + puff.x
        ctx.fillStyle = 'rgba(200, 226, 238, 0.8)'
        ctx.beginPath()
        ctx.arc(
          puff.x + Math.cos(angle) * (10 + t * 34),
          puff.y + Math.sin(angle) * (8 + t * 26) - t * 18,
          2.5 * (1 - t),
          0,
          Math.PI * 2,
        )
        ctx.fill()
      }
      ctx.restore()
    }
  }

  private drawCoinFloats(ctx: CanvasRenderingContext2D, realTime: number): void {
    const LIFETIME = 0.9
    this.coinFloats = this.coinFloats.filter((float) => realTime - float.at < LIFETIME)
    for (const float of this.coinFloats) {
      const t = (realTime - float.at) / LIFETIME
      ctx.save()
      ctx.globalAlpha = 0.85 * (1 - t * t)
      ctx.font = '600 13px Nunito, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillStyle = '#ffd97a'
      ctx.shadowColor = 'rgba(10, 20, 30, 0.7)'
      ctx.shadowBlur = 3
      ctx.fillText('−◉1', float.x, float.y - t * 26)
      ctx.restore()
    }
  }

  private drawWater(ctx: CanvasRenderingContext2D): void {
    const gradient = ctx.createLinearGradient(0, 0, 0, this.bounds.height)
    gradient.addColorStop(0, '#7ec9d8')
    gradient.addColorStop(0.25, '#3f97b4')
    gradient.addColorStop(0.7, '#20647f')
    gradient.addColorStop(1, '#173f52')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, this.bounds.width, this.bounds.height)
  }

  // Drawn over the murk layer so failing light doubles as a water-quality cue:
  // the dirtier the tank, the dimmer the shafts, until foul water kills them.
  private drawLightShafts(ctx: CanvasRenderingContext2D, realTime: number, murk: number): void {
    const strength = 0.16 * (1 - 0.9 * murk)
    if (strength <= 0.005) return
    ctx.save()
    ctx.globalCompositeOperation = 'overlay'
    const shafts = this.bounds.width > 1400 ? 4 : 3
    for (let i = 0; i < shafts; i += 1) {
      const drift = Math.sin(realTime * 0.07 + i * 2.1) * 90
      const x = 220 + i * 360 + drift
      const shaft = ctx.createLinearGradient(x, 0, x - 140, this.bounds.height)
      shaft.addColorStop(0, `rgba(255,255,255,${strength.toFixed(3)})`)
      shaft.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = shaft
      ctx.beginPath()
      ctx.moveTo(x - 40, 0)
      ctx.lineTo(x + 46, 0)
      ctx.lineTo(x - 110, this.bounds.height)
      ctx.lineTo(x - 210, this.bounds.height)
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()
  }

  private drawPollution(ctx: CanvasRenderingContext2D, state: GameReadModel, murk: number): void {
    const layer = this.pollutionLayer.getContext('2d')!
    const image = layer.createImageData(WATER_COLS, WATER_ROWS)
    for (let i = 0; i < state.water.cells.length; i += 1) {
      const value = state.water.cells[i]
      image.data[i * 4 + 0] = 64
      image.data[i * 4 + 1] = 105
      image.data[i * 4 + 2] = 52
      // Slightly super-linear: tinged water stays subtle, foul water is unmissable.
      image.data[i * 4 + 3] = Math.min(215, Math.pow(value, 1.1) * 320)
    }
    layer.putImageData(image, 0, 0)
    ctx.save()
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.globalAlpha = 0.85
    ctx.drawImage(
      this.pollutionLayer,
      0,
      this.bounds.waterTop,
      this.bounds.width,
      this.bounds.sandTop - this.bounds.waterTop + 18,
    )
    ctx.restore()
    // A whole-tank cast on top of the per-cell layer, so even diffuse
    // pollution shifts the room's colour instead of hiding in one corner.
    if (murk > 0.02) {
      ctx.save()
      ctx.fillStyle = `rgba(70, 108, 52, ${(murk * 0.32).toFixed(3)})`
      ctx.fillRect(0, this.bounds.waterTop, this.bounds.width, this.bounds.height - this.bounds.waterTop)
      ctx.restore()
    }
  }

  // Suspended particulate that thickens as the water fouls.
  private drawMurkMotes(ctx: CanvasRenderingContext2D, realTime: number, murk: number): void {
    if (murk < 0.08) return
    ctx.save()
    ctx.fillStyle = `rgba(150, 170, 110, ${(0.14 + murk * 0.3).toFixed(3)})`
    const count = Math.round(60 * murk)
    const span = this.bounds.sandTop - this.bounds.waterTop - 40
    for (let i = 0; i < count; i += 1) {
      const drift = realTime * (2 + hash01(i * 7) * 6)
      const x = (hash01(i * 13) * this.bounds.width + drift) % this.bounds.width
      const bob = Math.sin(realTime * 0.4 + i) * 14
      const y = this.bounds.waterTop + 20 + ((hash01(i * 29) * span + bob + span) % span)
      const radius = 0.8 + hash01(i * 41) * 1.6
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  private drawSand(ctx: CanvasRenderingContext2D): void {
    const gradient = ctx.createLinearGradient(0, this.bounds.sandTop - 10, 0, this.bounds.height)
    gradient.addColorStop(0, '#d9bd8f')
    gradient.addColorStop(0.4, '#c2a172')
    gradient.addColorStop(1, '#9a7c53')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.moveTo(0, this.bounds.sandTop + 6)
    for (let x = 0; x <= this.bounds.width; x += 60) {
      ctx.quadraticCurveTo(x + 30, this.bounds.sandTop - 8 + hash01(x) * 14, x + 60, this.bounds.sandTop + 6 + hash01(x + 7) * 6)
    }
    ctx.lineTo(this.bounds.width, this.bounds.height)
    ctx.lineTo(0, this.bounds.height)
    ctx.closePath()
    ctx.fill()
    // Pebbles: kept low-contrast so droppings stand out against them.
    const pebbles = Math.round((26 * this.bounds.width) / 1200)
    for (let i = 0; i < pebbles; i += 1) {
      const px = hash01(i * 31) * this.bounds.width
      const py = this.bounds.sandTop + 14 + hash01(i * 57) * 36
      const radius = 2 + hash01(i * 91) * 4
      ctx.fillStyle = `rgba(96, 82, 60, ${0.16 + hash01(i * 13) * 0.18})`
      ctx.beginPath()
      ctx.ellipse(px, py, radius * 1.4, radius, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  private drawKelp(ctx: CanvasRenderingContext2D, realTime: number, background: boolean): void {
    const beds = kelpFor(this.habitat)
    ctx.save()
    for (let k = 0; k < beds.length; k += 1) {
      if (background !== (k % 2 === 0)) continue
      const kelp = beds[k]
      const fill = background ? 'rgba(16, 74, 60, 0.8)' : 'rgba(42, 122, 82, 0.92)'
      const leafFill = background ? 'rgba(20, 86, 68, 0.7)' : 'rgba(56, 138, 92, 0.85)'
      for (let frond = 0; frond < kelp.fronds; frond += 1) {
        const baseX = kelp.x + (frond - kelp.fronds / 2) * 18
        const height = kelp.height * (0.75 + hash01(k * 17 + frond) * 0.4)
        const sway = Math.sin(realTime * 0.7 + k + frond * 1.7)

        // Sample the frond's spine, then draw it as one tapering ribbon.
        const spine: { x: number; y: number }[] = []
        for (let i = 0; i <= 8; i += 1) {
          const t = i / 8
          const bend = Math.sin(t * 2.2) * sway
          spine.push({
            x: baseX + bend * 26 * t + sway * 8 * t * t,
            y: this.bounds.sandTop + 8 - height * t,
          })
        }
        ctx.fillStyle = fill
        ctx.beginPath()
        ctx.moveTo(spine[0].x - 8, spine[0].y)
        for (let i = 1; i <= 8; i += 1) {
          ctx.lineTo(spine[i].x - 8 * (1 - i / 8) - 1.5, spine[i].y)
        }
        for (let i = 8; i >= 0; i -= 1) {
          ctx.lineTo(spine[i].x + 8 * (1 - i / 8) + 1.5, spine[i].y)
        }
        ctx.closePath()
        ctx.fill()

        // Short alternating leaf lobes along the spine.
        ctx.fillStyle = leafFill
        for (let i = 2; i <= 7; i += 2) {
          const side = i % 4 === 0 ? 1 : -1
          const leafSway = sway * 4
          ctx.beginPath()
          ctx.ellipse(
            spine[i].x + side * 13 + leafSway,
            spine[i].y + 4,
            13,
            4.5,
            side * (0.5 + sway * 0.15),
            0,
            Math.PI * 2,
          )
          ctx.fill()
        }
      }
    }
    ctx.restore()
  }

  // A couple of quiet rock piles so the mid-water isn't a bare field.
  private drawRocks(ctx: CanvasRenderingContext2D): void {
    ctx.save()
    const piles =
      this.habitat === 'expanded'
        ? [
            { x: 520, scale: 1 },
            { x: 780, scale: 0.6 },
            { x: 1180, scale: 0.8 },
          ]
        : [
            { x: 520, scale: 1 },
            { x: 780, scale: 0.6 },
          ]
    for (const pile of piles) {
      for (let i = 0; i < 3; i += 1) {
        const radius = (26 - i * 7) * pile.scale
        const px = pile.x + (hash01(pile.x + i * 31) - 0.5) * 60 * pile.scale
        ctx.fillStyle = `rgba(30, 52, 64, ${0.55 + i * 0.1})`
        ctx.beginPath()
        ctx.ellipse(px, this.bounds.sandTop + 6 - radius * 0.35, radius * 1.5, radius, 0, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    if (this.habitat === 'expanded') this.drawCave(ctx)
    ctx.restore()
  }

  /** The expansion's landmark: a rock cave in the new eastern ground, with a
   * genuinely dark mouth — a place for the larger community to gather. */
  private drawCave(ctx: CanvasRenderingContext2D): void {
    const x = 1372
    const baseY = this.bounds.sandTop + 8
    ctx.save()
    for (const stone of [
      { dx: -58, dy: -18, rx: 46, ry: 34, alpha: 0.72 },
      { dx: 56, dy: -16, rx: 44, ry: 32, alpha: 0.7 },
      { dx: 0, dy: -52, rx: 74, ry: 34, alpha: 0.78 },
    ]) {
      ctx.fillStyle = `rgba(36, 58, 70, ${stone.alpha})`
      ctx.beginPath()
      ctx.ellipse(x + stone.dx, baseY + stone.dy, stone.rx, stone.ry, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = 'rgba(8, 16, 22, 0.92)'
    ctx.beginPath()
    ctx.ellipse(x, baseY - 6, 34, 26, 0, Math.PI, 0)
    ctx.fill()
    ctx.restore()
  }

  private drawFood(ctx: CanvasRenderingContext2D, entity: Entity): void {
    const spoiled = entity.food!.spoiled
    // Size follows nutrition, so a starter flake reads lighter than the
    // hearty pellet that replaces it.
    const radius = 3 + entity.food!.nutrition * 1.5
    ctx.fillStyle = spoiled ? '#6b6b35' : entity.food!.nutrition < 1 ? '#ecc98f' : '#e8b04b'
    ctx.beginPath()
    ctx.arc(entity.position.x, entity.position.y, radius, 0, Math.PI * 2)
    ctx.fill()
    if (spoiled) {
      ctx.strokeStyle = 'rgba(120, 150, 60, 0.6)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(entity.position.x, entity.position.y, radius + 2.5, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  // Droppings must read as "clean me", never as sand decoration: dark olive
  // clumps under a faint green haze — the same colour language as pollution.
  private drawWaste(ctx: CanvasRenderingContext2D, entity: Entity): void {
    const size = 4.5 + entity.waste!.size * 3.4
    const { x, y } = entity.position
    ctx.save()
    ctx.fillStyle = 'rgba(110, 140, 60, 0.2)'
    ctx.beginPath()
    ctx.ellipse(x, y - size * 0.3, size * 1.9, size * 1.1, 0, 0, Math.PI * 2)
    ctx.fill()
    const lumps = [
      { dx: -0.55, dy: 0.05, scale: 0.75 },
      { dx: 0.5, dy: -0.1, scale: 0.65 },
      { dx: 0, dy: -0.35, scale: 0.85 },
    ]
    for (const lump of lumps) {
      ctx.fillStyle = '#333f27'
      ctx.beginPath()
      ctx.ellipse(x + lump.dx * size, y + lump.dy * size, size * lump.scale, size * lump.scale * 0.7, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = 'rgba(90, 110, 60, 0.55)'
    ctx.beginPath()
    ctx.ellipse(x - size * 0.2, y - size * 0.5, size * 0.4, size * 0.25, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  private drawEgg(ctx: CanvasRenderingContext2D, entity: Entity, simTime: number, realTime: number): void {
    const remaining = Math.max(0, entity.egg!.hatchAt - simTime)
    const pulse = remaining < 12 ? 1 + Math.sin(realTime * 6) * 0.12 : 1
    ctx.save()
    ctx.translate(entity.position.x, entity.position.y)
    ctx.fillStyle = 'rgba(250, 244, 214, 0.85)'
    ctx.beginPath()
    ctx.ellipse(0, 0, 8 * pulse, 10 * pulse, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(233, 168, 84, 0.9)'
    ctx.beginPath()
    ctx.arc(0, 1, 3.4, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.ellipse(0, 0, 8 * pulse, 10 * pulse, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  private drawFish(
    ctx: CanvasRenderingContext2D,
    entity: DrawableResident,
    simTime: number,
    realTime: number,
    highlighted: boolean,
  ): void {
    const fish = { ...entity.physiology, ...entity.behaviour, genome: entity.genome }
    const length = fishLength(fish.weight)
    const height = (length * fish.genome.bodyAspect) / 2
    const speed = Math.hypot(entity.velocity.x, entity.velocity.y)
    const phase = realTime * (3 + fish.genome.speed / 30) + entity.id * 1.7
    const wiggle = Math.sin(phase) * (0.18 + Math.min(0.3, speed / 200))
    const tilt = Math.atan2(entity.velocity.y, Math.abs(entity.velocity.x) + 24) * 0.5

    const hue = fish.genome.hue
    const saturation = fish.genome.saturation * (1 - 0.55 * fish.sickness)
    const lightness = 0.52 + 0.06 * Math.sin(hue / 60)

    ctx.save()
    ctx.translate(entity.position.x, entity.position.y)
    ctx.scale(fish.facing, 1)
    ctx.rotate(tilt * fish.facing)
    if (fish.sickness > 0.4) ctx.rotate(0.12 * fish.facing)

    if (highlighted) {
      ctx.save()
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)'
      ctx.beginPath()
      ctx.ellipse(0, 0, length * 0.75, height * 0.95, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    const bodyColor = `hsl(${hue}, ${saturation * 100}%, ${lightness * 100}%)`
    const darkColor = `hsl(${hue}, ${saturation * 90}%, ${lightness * 62}%)`
    const finColor = `hsla(${hue}, ${saturation * 100}%, ${Math.min(72, lightness * 112)}%, 0.9)`

    // Tail: rooted across a base overlapping the body so it never pinches off.
    const tailBase = -length * 0.36
    const tailLength = length * (0.3 + fish.genome.finFlair * 0.35)
    const tailSpread = height * (0.85 + fish.genome.finFlair * 0.6)
    const rootHalf = height * 0.35
    ctx.save()
    ctx.translate(tailBase, 0)
    ctx.rotate(wiggle)
    ctx.fillStyle = finColor
    ctx.beginPath()
    ctx.moveTo(length * 0.06, -rootHalf)
    if (fish.genome.finShape === 'forked') {
      ctx.quadraticCurveTo(-tailLength * 0.5, -tailSpread * 0.9, -tailLength, -tailSpread)
      ctx.quadraticCurveTo(-tailLength * 0.5, -tailSpread * 0.1, -tailLength * 0.4, 0)
      ctx.quadraticCurveTo(-tailLength * 0.5, tailSpread * 0.1, -tailLength, tailSpread)
      ctx.quadraticCurveTo(-tailLength * 0.5, tailSpread * 0.9, length * 0.06, rootHalf)
    } else if (fish.genome.finShape === 'veil') {
      ctx.bezierCurveTo(-tailLength * 0.9, -tailSpread * 1.2, -tailLength * 1.5, -tailSpread * 0.35, -tailLength * 1.1, 0)
      ctx.bezierCurveTo(-tailLength * 1.5, tailSpread * 0.35, -tailLength * 0.9, tailSpread * 1.2, length * 0.06, rootHalf)
    } else {
      ctx.quadraticCurveTo(-tailLength * 0.55, -tailSpread * 1.05, -tailLength, -tailSpread * 0.75)
      ctx.quadraticCurveTo(-tailLength * 0.55, 0, -tailLength, tailSpread * 0.75)
      ctx.quadraticCurveTo(-tailLength * 0.55, tailSpread * 1.05, length * 0.06, rootHalf)
    }
    ctx.closePath()
    ctx.fill()
    ctx.restore()

    // Body.
    const bodyGradient = ctx.createLinearGradient(0, -height, 0, height)
    bodyGradient.addColorStop(0, darkColor)
    bodyGradient.addColorStop(0.45, bodyColor)
    bodyGradient.addColorStop(1, `hsl(${hue}, ${saturation * 60}%, ${Math.min(88, lightness * 150)}%)`)
    ctx.fillStyle = bodyGradient
    ctx.beginPath()
    ctx.ellipse(0, 0, length / 2, height, 0, 0, Math.PI * 2)
    ctx.fill()

    // Pattern.
    if (fish.genome.pattern === 'stripes') {
      ctx.save()
      ctx.beginPath()
      ctx.ellipse(0, 0, length / 2, height, 0, 0, Math.PI * 2)
      ctx.clip()
      ctx.strokeStyle = `hsla(${(hue + 200) % 360}, 45%, 28%, ${fish.genome.patternIntensity * 0.55})`
      ctx.lineWidth = length * 0.07
      for (let i = -1; i <= 1; i += 1) {
        ctx.beginPath()
        ctx.moveTo(i * length * 0.16, -height)
        ctx.quadraticCurveTo(i * length * 0.16 + length * 0.05, 0, i * length * 0.16, height)
        ctx.stroke()
      }
      ctx.restore()
    } else if (fish.genome.pattern === 'spots') {
      ctx.fillStyle = `hsla(${(hue + 180) % 360}, 50%, 30%, ${fish.genome.patternIntensity * 0.5})`
      for (let i = 0; i < 5; i += 1) {
        const sx = (hash01(entity.id * 13 + i) - 0.5) * length * 0.7
        const sy = (hash01(entity.id * 29 + i) - 0.5) * height * 1.2
        ctx.beginPath()
        ctx.arc(sx, sy, length * 0.05 * (0.6 + hash01(i * 7)), 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // Dorsal and pelvic fins.
    ctx.fillStyle = finColor
    ctx.beginPath()
    ctx.moveTo(-length * 0.18, -height * 0.85)
    ctx.quadraticCurveTo(0, -height * (1.25 + fish.genome.finFlair * 0.7), length * 0.16, -height * 0.8)
    ctx.closePath()
    ctx.fill()
    ctx.save()
    ctx.rotate(wiggle * 0.5)
    ctx.beginPath()
    ctx.moveTo(length * 0.05, height * 0.7)
    ctx.quadraticCurveTo(-length * 0.08, height * (1.1 + fish.genome.finFlair * 0.4), -length * 0.18, height * 0.72)
    ctx.closePath()
    ctx.fill()
    ctx.restore()

    // Eye.
    const eyeX = length * 0.28
    const eyeY = -height * 0.18
    const eyeRadius = Math.max(2.2, length * 0.055)
    ctx.fillStyle = 'white'
    ctx.beginPath()
    ctx.arc(eyeX, eyeY, eyeRadius, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#1c2733'
    ctx.beginPath()
    ctx.arc(eyeX + eyeRadius * 0.25, eyeY, eyeRadius * 0.55, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.beginPath()
    ctx.arc(eyeX + eyeRadius * 0.05, eyeY - eyeRadius * 0.3, eyeRadius * 0.2, 0, Math.PI * 2)
    ctx.fill()

    // Mouth gasp when starving.
    if (fish.hunger > 0.85) {
      ctx.strokeStyle = 'rgba(30, 30, 40, 0.7)'
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.arc(length * 0.48, height * 0.1, Math.max(1.6, length * 0.045), 0, Math.PI * 2)
      ctx.stroke()
    }

    // Sickness veil.
    if (fish.sickness > 0.15) {
      ctx.fillStyle = `rgba(110, 160, 70, ${Math.min(0.35, fish.sickness * 0.4)})`
      ctx.beginPath()
      ctx.ellipse(0, 0, length / 2, height, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.restore()

    // A brief "peckish again" cue the moment appetite returns: three amber
    // crumbs above the fish that fade within seconds, so returning interest
    // in food is visible without becoming standing icon clutter. Distress
    // owns the space once hunger is serious (the pips below take over).
    const appetite = fish.appetiteSince
    if (
      appetite !== undefined &&
      simTime - appetite < APPETITE_CUE_SECONDS &&
      fish.hunger <= 0.85 &&
      fish.activity.kind !== 'court'
    ) {
      const t = (simTime - appetite) / APPETITE_CUE_SECONDS
      ctx.save()
      ctx.fillStyle = `rgba(255, 217, 122, ${(0.9 * (1 - t)).toFixed(3)})`
      for (let i = -1; i <= 1; i += 1) {
        ctx.beginPath()
        ctx.arc(
          entity.position.x + i * 7,
          entity.position.y - height - 14 - Math.sin(realTime * 4 + i) * 1.5,
          2.2,
          0,
          Math.PI * 2,
        )
        ctx.fill()
      }
      ctx.restore()
    }

    // Status pips above distressed fish, drawn unrotated.
    if (fish.hunger > 0.85 || fish.sickness > 0.6) {
      const symbol = fish.hunger > 0.85 ? '!' : '~'
      ctx.save()
      ctx.font = 'bold 18px Nunito, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillStyle = fish.hunger > 0.85 ? '#ffd166' : '#a3d977'
      const bob = Math.sin(realTime * 4 + entity.id) * 3
      ctx.fillText(symbol, entity.position.x, entity.position.y - height - 16 + bob)
      ctx.restore()
    }
    if (fish.activity.kind === 'court') {
      ctx.save()
      ctx.font = '14px Nunito, system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.globalAlpha = 0.7 + Math.sin(realTime * 5 + entity.id) * 0.3
      ctx.fillText('♥', entity.position.x, entity.position.y - height - 14)
      ctx.restore()
    }
  }

  private drawNameplate(ctx: CanvasRenderingContext2D, entity: DrawableResident): void {
    const y =
      entity.position.y - fishLength(entity.physiology.weight) * entity.genome.bodyAspect - 30
    ctx.save()
    ctx.font = '600 14px Nunito, system-ui, sans-serif'
    ctx.textAlign = 'center'
    const label = entity.resident.name
    const width = ctx.measureText(label).width + 16
    ctx.fillStyle = 'rgba(8, 25, 34, 0.72)'
    ctx.beginPath()
    ctx.roundRect(entity.position.x - width / 2, y - 14, width, 22, 8)
    ctx.fill()
    ctx.fillStyle = '#e8f4f6'
    ctx.fillText(label, entity.position.x, y + 2)
    ctx.restore()
  }

  private drawRemains(ctx: CanvasRenderingContext2D, entity: Entity, simTime: number): void {
    const remains = entity.remains!
    const alpha = Math.max(0, Math.min(1, (remains.expiresAt - simTime) / 6))
    const length = fishLength(remains.weight)
    const height = (length * remains.genome.bodyAspect) / 2
    ctx.save()
    ctx.globalAlpha = alpha * 0.8
    ctx.translate(entity.position.x, entity.position.y)
    ctx.scale(1, -1)
    ctx.fillStyle = `hsl(${remains.genome.hue}, 12%, 62%)`
    ctx.beginPath()
    ctx.ellipse(0, 0, length / 2, height, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#3a4750'
    ctx.beginPath()
    ctx.arc(length * 0.28, height * 0.18, Math.max(2, length * 0.05), 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  private drawBubbles(ctx: CanvasRenderingContext2D, realTime: number): void {
    const dt = Math.min(0.1, Math.max(0, realTime - (this.lastBubbleTime ?? realTime)))
    this.lastBubbleTime = realTime
    ctx.save()
    for (const bubble of this.bubbles) {
      bubble.y -= bubble.speed * dt
      bubble.x += Math.sin(realTime * 2 + bubble.wobble) * 18 * dt
      if (bubble.y < this.bounds.waterTop + 6) {
        Object.assign(bubble, this.newBubble(false))
      }
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(bubble.x, bubble.y, bubble.radius, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'
      ctx.fill()
    }
    ctx.restore()
  }

  private drawSurface(ctx: CanvasRenderingContext2D, realTime: number): void {
    ctx.save()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let x = 0; x <= this.bounds.width; x += 24) {
      const y = this.bounds.waterTop + Math.sin(realTime * 1.4 + x / 90) * 2.5
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    const sheen = ctx.createLinearGradient(0, 0, 0, this.bounds.waterTop)
    sheen.addColorStop(0, 'rgba(233, 250, 255, 0.85)')
    sheen.addColorStop(1, 'rgba(210, 240, 250, 0.25)')
    ctx.fillStyle = sheen
    ctx.fillRect(0, 0, this.bounds.width, this.bounds.waterTop)
    ctx.restore()
  }
}

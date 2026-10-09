import { IContext, LLog, LynxContext, UIBase } from '@lynx/lynx'
import { DrawContext, FrameCallback, FrameNode, RenderNode } from '@kit.ArkUI'
import { drawing } from '@kit.ArkGraphics2D'
import { image } from '@kit.ImageKit'

interface LensAnimation {
  frames: number[][]
  count: number
  duration: number
  startedAt?: number
}

/** An asynchronous, bounded material capture feeds a GPU mesh. Neither the
 * foreground controls nor this renderer belong to the capture source.
 * Vertex alpha restricts refraction to the bevel; the selection wash persists.
 */
class TabGlassNode extends RenderNode {
  pixels?: image.PixelMap
  pose: number[] = [0, 1, 1, 0]
  count: number = 1
  light: number = 0.55
  density: number = 1
  capsule: boolean = false

  override draw(context: DrawContext): void {
    const pixels = this.pixels
    const strength = this.pose[3]
    if (!pixels || strength <= 0 || this.count <= 0) return
    const width = context.sizeInPixel.width
    const height = context.sizeInPixel.height
    const slot = width / this.count
    const cx = slot * (this.pose[0] + 0.5)
    const cy = height / 2
    const ex = (slot - (this.capsule ? 0 : 8 * this.density)) / 2
    const ey = this.capsule ? height / 2 : 26 * this.density
    if (ex <= 0 || width <= 0 || height <= 0) return
    const sx = this.pose[1]
    const sy = this.pose[2]
    const radius = Math.min(ex, ey)
    const columns = Math.ceil(width / (3 * this.density))
    const rows = Math.ceil(height / (3 * this.density))
    const vertices: number[] = []
    const colors: number[] = []
    for (let y = 0; y <= rows; y++) {
      for (let x = 0; x <= columns; x++) {
        const xx = width * x / columns
        const yy = height * y / rows
        const px = (xx - cx) / sx
        const py = (yy - cy) / sy
        const qx = Math.abs(px) - (ex - radius)
        const qy = Math.abs(py) - (ey - radius)
        const ox = Math.max(qx, 0)
        const oy = Math.max(qy, 0)
        const d = Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - radius
        let nx = ox * Math.sign(px)
        let ny = oy * Math.sign(py)
        if (Math.hypot(nx, ny) < 0.001) {
          nx = qx > qy ? Math.sign(px) : 0
          ny = qx > qy ? 0 : Math.sign(py)
        }
        const length = Math.max(Math.hypot(nx, ny), 0.001)
        nx /= length * sx
        ny /= length * sy
        const normalScale = Math.max(Math.hypot(nx, ny), 0.001)
        nx /= normalScale
        ny /= normalScale
        const t = Math.max(0, Math.min(1, -d / (10 * this.density)))
        const edge = 1 - t * t * (3 - 2 * t)
        const bend = 5 * this.density * strength * Math.sin(edge * Math.PI / 2)
        // A forward mesh is the inverse of the displacement sampler.
        vertices.push(xx + nx * bend, yy + ny * bend)
        const alpha = Math.round(Math.max(0, Math.min(1, 0.5 - d / this.density)) * (this.capsule ? 1 : edge * strength) * 255)
        const shade = Math.pow(edge, 3) * Math.max(nx * 0.6 + ny * 0.8, 0) * this.light * strength * 0.12
        const value = Math.round(255 * (1 - shade))
        colors.push(((alpha << 24) | (value << 16) | (value << 8) | value) >>> 0)
      }
    }
    const canvas = context.canvas
    const brush = new drawing.Brush()
    brush.setAntiAlias(true)
    canvas.save()
    canvas.clipRoundRect(new drawing.RoundRect({ left: cx - ex * sx, top: cy - ey * sy, right: cx + ex * sx, bottom: cy + ey * sy }, radius * sx, radius * sy), drawing.ClipOp.INTERSECT, true)
    canvas.attachBrush(brush)
    canvas.drawPixelMapMesh(pixels, columns, rows, vertices, 0, colors, 0)
    canvas.detachBrush()
    canvas.restore()
  }
}

class LensFrame extends FrameCallback {
  private owner: SongloftTabGlassUI
  private generation: number

  constructor(owner: SongloftTabGlassUI, generation: number) {
    super()
    this.owner = owner
    this.generation = generation
  }

  override onFrame(_time: number): void { this.owner.tick(this.generation) }
}

export class SongloftTabGlassUI extends UIBase {
  private frame?: FrameNode
  private lens: TabGlassNode = new TabGlassNode()
  private animation?: LensAnimation
  private generation: number = 0
  private capturing: boolean = false
  private disposed: boolean = false
  private failedCaptureGeneration: number = -1
  private sourceId: string = 'songloft-tab-backdrop'
  private running: boolean = false
  private observingDraw: boolean = false
  private sourceBytes?: Uint8Array
  private drawListener: () => void = () => {
    if (this.running && !this.disposed) this.capture(this.generation)
  }

  constructor(context: IContext) { super(context) }

  override onCreate(): void {
    if (!this.uiContext) return
    this.frame = new FrameNode(this.uiContext)
    this.frame.getRenderNode()?.appendChild(this.lens)
    this.lens.density = this.lynxContext.getDensity()
    this.lens.capsule = this.tag === 'songloft-capsule-glass'
    this.nativeUI?.setFrameNode(this.frame)
  }

  override layout(_x: number, _y: number, width: number, height: number, _pl: number, _pt: number,
    _pr: number, _pb: number, _ml: number, _mt: number, _mr: number, _mb: number, _sticky?: number[]): void {
    this.width = width
    this.height = height
    this.lens.size = { width: width, height: height }
  }

  override update(props: Record<string, Object>): void {
    const light = props['songloft-glass-light']
    if (typeof light === 'number') this.lens.light = Math.max(0, Math.min(1, light))
    const source = props['capture-target']
    if (typeof source === 'string' && source !== this.sourceId) {
      this.stop()
      this.sourceId = source
    }
  }

  override onNodeReady(): void {
    if (!this.lens.capsule || this.running || this.disposed || !this.uiContext) return
    this.running = true
    this.lens.pose = [0, 1, 1, 1]
    this.uiContext.getUIObserver().on('willDraw', this.drawListener)
    this.observingDraw = true
    this.capture(this.generation)
  }

  override onEnterForeground(): void { this.onNodeReady() }

  protected override needWindowStateChangeEvent(): boolean { return true }

  override invokeMethod(method: string, params: Object, callback: (code: number, res: Object) => void): boolean {
    if (method !== 'animateTabLens') return false
    this.stop()
    const animation = params as LensAnimation
    const result: Record<string, Object> = {}
    if (animation.duration === 0) { callback(0, result); return true }
    if (!Array.isArray(animation.frames) || animation.frames.length < 2 || animation.frames.length > 120
      || !Number.isFinite(animation.count) || animation.count < 1 || animation.count > 10
      || !Number.isFinite(animation.duration) || animation.duration <= 0 || animation.duration > 2000
      || animation.frames.some(row => row.length !== 4 || row.some(value => !Number.isFinite(value)) || row[1] <= 0 || row[2] <= 0)) {
      callback(4, result); return true
    }
    animation.startedAt = animation.startedAt ?? Date.now()
    this.animation = animation
    this.lens.count = animation.count
    this.tick(this.generation)
    callback(0, result)
    return true
  }

  tick(generation: number): void {
    const animation = this.animation
    if (this.disposed || generation !== this.generation || !this.uiContext) return
    if (!animation) return
    const progress = Math.max(0, Math.min(1, (Date.now() - (animation.startedAt ?? 0)) / animation.duration))
    const cursor = progress * (animation.frames.length - 1)
    const first = Math.min(Math.floor(cursor), animation.frames.length - 2)
    const fraction = cursor - first
    this.lens.pose = animation.frames[first].map((value, j) => value * (1 - fraction) + animation.frames[first + 1][j] * fraction)
    this.lens.invalidate()
    if (progress >= 1) { this.stop(); return }
    this.capture(generation)
    this.uiContext.postFrameCallback(new LensFrame(this, generation))
  }

  private async capture(generation: number): Promise<void> {
    if (this.capturing || this.failedCaptureGeneration === generation || this.width <= 0 || this.height <= 0) return
    this.capturing = true
    let snapshot: image.PixelMap | undefined = undefined
    try {
      const context = this.lynxContext as LynxContext
      snapshot = await context.getComponentSnapshot(this.sourceId, { scale: 1 / this.lens.density, waitUntilRenderFinished: false })
      const pixels = snapshot
      if (this.disposed || generation !== this.generation) {
        return
      } else {
        if (this.lens.capsule) {
          // Refresh on actual scene draws, not a perpetual frame timer. An
          // unchanged source must not invalidate itself and cause a draw loop.
          const bytes = new Uint8Array(pixels.getPixelBytesNumber())
          pixels.readPixelsToBufferSync(bytes.buffer)
          const previous = this.sourceBytes
          let same = previous !== undefined && previous.length === bytes.length
          if (previous && same) {
            for (let i = 0; i < bytes.length; i++) {
              if (bytes[i] !== previous[i]) { same = false; break }
            }
          }
          if (same) return
          this.sourceBytes = bytes
        }
        const old = this.lens.pixels
        this.lens.pixels = pixels
        snapshot = undefined
        this.lens.invalidate()
        if (old) await old.release()
      }
    } catch (_) {
      if (!this.disposed && generation === this.generation) {
        this.failedCaptureGeneration = generation
        LLog.w('SongloftTabGlass', 'Material snapshot unavailable; retaining selection wash')
        if (this.lens.capsule) this.stop()
      }
    } finally {
      if (snapshot) await snapshot.release().catch(() => {})
      this.capturing = false
    }
  }

  private stop(): void {
    this.generation++
    this.animation = undefined
    this.running = false
    if (this.observingDraw && this.uiContext) {
      this.uiContext.getUIObserver().off('willDraw', this.drawListener)
      this.observingDraw = false
    }
    this.sourceBytes = undefined
    this.lens.pose = [0, 1, 1, 0]
    const pixels = this.lens.pixels
    this.lens.pixels = undefined
    if (pixels) pixels.release().catch(() => {})
    this.lens.invalidate()
  }

  override onEnterBackground(): void { this.stop() }
  override dispose(): void {
    this.disposed = true
    this.stop()
    this.frame?.dispose()
    this.frame = undefined
    this.lens.dispose()
    super.dispose()
  }
}

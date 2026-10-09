import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { expect, test, vi } from 'vitest'

// Execute the actual ArkTS control/math source. Native snapshot/render APIs
// retain their async/lifetime preconditions; device rendering is a separate gate.
class Pixel {
  releases = 0
  bytes = new Uint8Array(16).fill(128)
  getPixelBytesNumber() { return this.bytes.length }
  readPixelsToBufferSync(buffer: ArrayBuffer) { new Uint8Array(buffer).set(this.bytes) }
  async release() { this.releases++ }
}
class RenderNode {
  children: RenderNode[] = []
  invalidations = 0
  disposed = false
  appendChild(node: RenderNode) { this.children.push(node) }
  invalidate() { this.invalidations++ }
  dispose() { this.disposed = true }
}
interface LensNode extends RenderNode {
  pose: number[]
  pixels?: Pixel
  draw(context: { sizeInPixel: { width: number, height: number }, canvas: object }): void
}
class FrameNode {
  root = new RenderNode()
  getRenderNode() { return this.root }
  dispose() { this.root.dispose() }
}
class Brush { setAntiAlias() {} }
class RoundRect { constructor(public rect: object) {} }

class Host {
  node?: FrameNode
  drawListener?: () => void
  frameCallbacks: { onFrame(time: number): void }[] = []
  pending: { source: string, resolve(pixel: Pixel): void }[] = []
  getDensity() { return 2 }
  getComponentSnapshot(source: string) {
    return new Promise<Pixel>(resolve => { this.pending.push({ source, resolve }) })
  }
  getUIObserver() {
    return {
      on: (_event: string, fn: () => void) => { this.drawListener = fn },
      off: (_event: string, fn: () => void) => { if (this.drawListener === fn) this.drawListener = undefined },
    }
  }
  postFrameCallback(callback: { onFrame(time: number): void }) { this.frameCallbacks.push(callback) }
}
interface UI {
  tag: string
  onCreate(): void
  update(props: object): void
  layout(...dimensions: number[]): void
  onNodeReady(): void
  onEnterBackground(): void
  onEnterForeground(): void
  dispose(): void
  invokeMethod(method: string, params: object, callback: (code: number) => void): boolean
}
function mount(tag: string) {
  const host = new Host()
  let clock = 1000
  class UIBase {
    lynxContext = host
    uiContext = host
    nativeUI = { setFrameNode: (node: FrameNode) => { host.node = node } }
    constructor(_context: object) {}
    dispose() {}
  }
  const source = readFileSync(resolve(__dirname, '../../harmony/entry/src/main/ets/ui/SongloftTabGlassUI.ets'), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports: Record<string, unknown> = {}
  const modules: Record<string, object> = {
    '@lynx/lynx': { UIBase, LLog: { w: vi.fn() } },
    '@kit.ArkUI': { RenderNode, FrameNode, FrameCallback: class {} },
    '@kit.ArkGraphics2D': { drawing: { Brush, RoundRect, ClipOp: { INTERSECT: 0 } } },
    '@kit.ImageKit': {},
  }
  runInNewContext(js, { exports, require: (name: string) => modules[name], Date: { now: () => clock } })
  const Constructor = exports.SongloftTabGlassUI as new (host: Host) => UI
  const ui = new Constructor(host)
  ui.tag = tag
  ui.onCreate()
  ui.layout(0, 0, 351, 64, 0, 0, 0, 0, 0, 0, 0, 0)
  const node = host.node!.root.children[0] as LensNode
  return { ui, host, node, setClock: (value: number) => { clock = value } }
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0))
const animation = {
  frames: [[0, 1, 1, 0], [1, 0.9, 1.1, 1], [1, 1, 1, 0]], count: 3, duration: 560, startedAt: 1000,
}

test('a capsule samples only its material and becomes idle once its source stops changing', async () => {
  const { ui, host, node } = mount('songloft-capsule-glass')
  ui.update({ 'capture-target': 'material-only' })
  ui.onNodeReady()
  for (let i = 0; i < 10; i++) host.drawListener!()
  expect(host.pending).toHaveLength(1)
  expect(host.pending[0]!.source).toBe('material-only')
  expect(host.frameCallbacks).toHaveLength(0)
  const first = new Pixel()
  host.pending.shift()!.resolve(first)
  await flush()
  const painted = node.invalidations
  host.drawListener!()
  const unchanged = new Pixel()
  host.pending.shift()!.resolve(unchanged)
  await flush()
  expect(node.invalidations).toBe(painted)
  expect(unchanged.releases).toBe(1)
  expect(first.releases).toBe(0)
  ui.onEnterBackground()
  expect(first.releases).toBe(1)
  expect(host.drawListener).toBeUndefined()
  ui.onEnterForeground()
  expect(host.drawListener).toBeTypeOf('function')
  ui.dispose()
  expect(host.drawListener).toBeUndefined()
  expect(node.disposed).toBe(true)
  const late = new Pixel()
  host.pending.shift()!.resolve(late)
  await flush()
  expect(late.releases).toBe(1)
  expect(node.pixels).toBeUndefined()
})

test('a late moving-lens capture cannot revive an interrupted or destroyed animation', async () => {
  const { ui, host, node, setClock } = mount('songloft-tab-glass')
  const callback = vi.fn()
  ui.invokeMethod('animateTabLens', animation, callback)
  expect(callback).toHaveBeenCalledWith(0, expect.anything())
  expect(host.pending[0]!.source).toBe('songloft-tab-backdrop')
  const staleFrame = host.frameCallbacks.shift()!
  ui.invokeMethod('animateTabLens', { frames: [], count: 3, duration: 0 }, callback)
  const late = new Pixel()
  host.pending.shift()!.resolve(late)
  await flush()
  setClock(1200)
  staleFrame.onFrame(0)
  expect(late.releases).toBe(1)
  expect(node.pixels).toBeUndefined()
  expect(host.pending).toHaveLength(0)
  expect(host.frameCallbacks).toHaveLength(0)
  ui.dispose()
})

test('GPU geometry stays finite, bounded and transparent outside the moving bevel', async () => {
  const { ui, host, node, setClock } = mount('songloft-tab-glass')
  ui.invokeMethod('animateTabLens', animation, vi.fn())
  host.pending.shift()!.resolve(new Pixel())
  await flush()
  setClock(1280)
  host.frameCallbacks.shift()!.onFrame(0)
  const mesh = vi.fn()
  const canvas = { save() {}, restore() {}, clipRoundRect() {}, attachBrush() {}, detachBrush() {}, drawPixelMapMesh: mesh }
  node.draw({ sizeInPixel: { width: 702, height: 128 }, canvas })
  const [, columns, rows, vertices, , colors] = mesh.mock.calls[0] as [Pixel, number, number, number[], number, number[]]
  expect(vertices).toHaveLength((columns + 1) * (rows + 1) * 2)
  expect(vertices.every(Number.isFinite)).toBe(true)
  for (let y = 0; y <= rows; y++) for (let x = 0; x <= columns; x++) {
    const i = (y * (columns + 1) + x) * 2
    expect(Math.hypot(vertices[i]! - 702 * x / columns, vertices[i + 1]! - 128 * y / rows)).toBeLessThanOrEqual(10.001)
  }
  const alphas = colors.map(color => color >>> 24)
  expect(alphas[0]).toBe(0)
  expect(Math.max(...alphas)).toBeGreaterThan(100)
  expect(alphas.filter(alpha => alpha > 0).length).toBeLessThan(colors.length / 3)
  ui.dispose()
})

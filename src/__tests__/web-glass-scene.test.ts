import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { expect, test, vi } from 'vitest'

const { JSDOM } = createRequire(import.meta.url)('jsdom')
const code = readFileSync(resolve(__dirname, '../../web/glass-scene-host.js'), 'utf8')

function setup() {
  const dom = new JSDOM('<div class="theme-root" style="background:white"><div id="source"></div><blur-view id="glass"></blur-view><button>Foreground</button></div>', { runScripts: 'outside-only' })
  const win = dom.window
  const frames = new Map<number, () => void>()
  let nextFrame = 0
  win.requestAnimationFrame = (callback: () => void) => { frames.set(++nextFrame, callback); return nextFrame }
  win.cancelAnimationFrame = (id: number) => frames.delete(id)
  win.ResizeObserver = class {
    observe() {}
    disconnect() {}
  }
  Object.defineProperty(win.document, 'fonts', { value: new win.EventTarget() })
  win.Element.prototype.getBoundingClientRect = function () {
    const [x, y, width, height] = JSON.parse(this.getAttribute('data-box') || '[0,0,375,900]')
    return new win.DOMRect(x, y, width, height)
  }
  win.Range.prototype.getBoundingClientRect = function () {
    return this.startContainer.parentElement.getBoundingClientRect()
  }
  win.Range.prototype.getClientRects = function () { return [this.getBoundingClientRect()] }
  const source = win.document.getElementById('source')
  const host = win.document.getElementById('glass')
  host.setAttribute('data-box', '[13,829,349,62]')
  host.attachShadow({ mode: 'open' })
  win.eval(code + ';globalThis.makeSceneForTest = songloftGlassScene')
  const scene = win.makeSceneForTest(host, source, 6)
  const flush = () => {
    const pending = [...frames.values()]
    frames.clear()
    for (const callback of pending) callback()
  }
  return { dom, win, source, host, scene, frames, flush }
}

test('real source changes in a shadow root refresh inert text without copying foreground controls', async () => {
  const f = setup()
  try {
    const content = f.win.document.createElement('x-content')
    content.setAttribute('data-box', '[0,800,375,100]')
    const shadow = content.attachShadow({ mode: 'open' })
    shadow.innerHTML = '<span data-box="[20,840,100,20]">Actual song</span>'
    f.source.append(content)
    f.scene.refresh()
    expect(f.scene.valid).toBe(true)
    expect(f.scene.svg.textContent).toContain('Actual song')
    expect(f.scene.svg.querySelector('text')?.textContent).toBe('Actual song')
    expect(f.scene.svg.querySelector('foreignObject')?.textContent || '').not.toContain('Actual song')
    expect(f.scene.svg.textContent).not.toContain('Foreground')
    expect(f.scene.svg.querySelector('x-content')).toBeNull()
    shadow.querySelector('span').textContent = 'Updated song'
    await Promise.resolve()
    f.flush()
    expect(f.scene.svg.textContent).toContain('Updated song')
    expect(f.scene.svg.textContent).not.toContain('Actual song')
    expect(f.scene.svg.getAttribute('viewBox')).toBe('0 0 349 62')
  } finally { f.scene.dispose(); f.dom.window.close() }
})

test('unsupported visible content uses actual blur; content outside the capture region does not disable optics', async () => {
  const f = setup()
  // jsdom's CSS parser does not implement backdrop-filter. Observe the actual
  // browser style command; rendered fallback is checked in browser acceptance.
  const setStyle = vi.spyOn(f.host.style, 'setProperty')
  try {
    const canvas = f.win.document.createElement('canvas')
    canvas.setAttribute('data-box', '[0,830,375,80]')
    f.source.append(canvas)
    f.scene.refresh()
    expect(f.scene.valid).toBe(false)
    expect(setStyle).toHaveBeenCalledWith('backdrop-filter', 'blur(6px)', 'important')
    expect(f.scene.svg.style.opacity).toBe('0')
    canvas.setAttribute('data-box', '[0,10,375,80]')
    await Promise.resolve()
    f.flush()
    expect(f.scene.valid).toBe(true)
    expect(setStyle).toHaveBeenCalledWith('backdrop-filter', 'none', 'important')
    expect(f.scene.svg.style.opacity).toBe('1')
  } finally { f.scene.dispose(); f.dom.window.close() }
})

test('idle does not capture continuously and disposal cancels pending work and source subscriptions', async () => {
  const f = setup()
  try {
    f.flush()
    await Promise.resolve()
    expect(f.frames.size).toBe(0)
    f.source.setAttribute('data-version', '2')
    await Promise.resolve()
    expect(f.frames.size).toBe(1)
    f.scene.dispose()
    expect(f.frames.size).toBe(0)
    expect(f.scene.svg.isConnected).toBe(false)
    expect(f.host.style.getPropertyValue('backdrop-filter')).toBe('')
    f.source.setAttribute('data-version', '3')
    f.source.dispatchEvent(new f.win.Event('scroll'))
    f.win.document.fonts.dispatchEvent(new f.win.Event('loadingdone'))
    await Promise.resolve()
    expect(f.frames.size).toBe(0)
  } finally { f.dom.window.close() }
})

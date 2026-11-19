import type { SelectorQuery } from '@lynx-js/types'
import { describe, expect, it, vi } from 'vitest'
import { createProbeDrawer } from '../probe-draw.js'

function harness() {
  let callbacks: {
    success?: (data: string) => void
    fail?: (data: { code: number }) => void
  } = {}
  const exec = vi.fn()
  const invoke = vi.fn((options) => {
    callbacks = options
    return { exec }
  })
  const query = { select: vi.fn(() => ({ invoke })) }
  const report = vi.fn()
  const drawer = createProbeDrawer(
    () => query as unknown as SelectorQuery,
    report,
  )
  return { drawer, invoke, exec, report, complete: () => callbacks }
}

describe('native probe drawing', () => {
  it('draws again after invoke completes, without relying on an exec callback', () => {
    const h = harness()
    h.drawer.draw()
    expect(h.exec.mock.calls).toEqual([[]])
    h.drawer.draw()
    expect(h.invoke).toHaveBeenCalledTimes(1)
    h.complete().success?.('')
    h.drawer.draw()
    expect(h.invoke).toHaveBeenCalledTimes(2)
    expect(h.report).not.toHaveBeenCalled()
  })

  it('releases a failed request so a newly attached view can draw', () => {
    const h = harness()
    h.drawer.draw()
    h.complete().fail?.({ code: 2 })
    expect(h.report).toHaveBeenCalledWith('Native draw failed (2)')
    h.drawer.draw()
    expect(h.invoke).toHaveBeenCalledTimes(2)
  })

  it('reports surface failures and ignores callbacks after disposal', () => {
    const h = harness()
    h.drawer.draw()
    h.complete().success?.('IOSurfaceLock failed')
    expect(h.report).toHaveBeenCalledWith('IOSurfaceLock failed')
    h.drawer.draw()
    h.drawer.dispose()
    h.complete().success?.('late failure')
    h.drawer.draw()
    expect(h.invoke).toHaveBeenCalledTimes(2)
    expect(h.report).toHaveBeenCalledTimes(1)
  })

  it('releases a synchronously rejected request for retry', () => {
    const h = harness()
    h.invoke.mockImplementationOnce(() => {
      throw new Error('view detached')
    })
    h.drawer.draw()
    h.drawer.draw()
    expect(h.invoke).toHaveBeenCalledTimes(2)
    expect(h.report).toHaveBeenCalledWith('Error: view detached')
  })
})

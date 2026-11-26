import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { expect, test, vi } from 'vitest'

const require = createRequire(import.meta.url)
const dist = dirname(require.resolve('@lynx-js/lynx-ui-slider'))
const source = readFileSync(process.env.SONGLOFT_SLIDER_ROOT_SOURCE ?? join(dist, 'SliderRoot/index.jsx'), 'utf8')
const utils = readFileSync(join(dist, 'utils/index.jsx'), 'utf8').split('export {')[0]

// Execute the shipped controller, excluding only JSX composition. The host
// supplies hook refs, asynchronous bounds and native event coordinates. This
// avoids replacing the very gesture logic the regression must exercise.
function controller(platform = 'Android', step = 0.2) {
  const begin = source.indexOf('{', source.indexOf('function SliderRootImpl(')) + 1
  const end = source.indexOf('    const contextValue =', begin)
  expect(begin).toBeGreaterThan(0)
  expect(end).toBeGreaterThan(begin)
  const measure = vi.fn<(...args: unknown[]) => Promise<{ left: number; width: number }>>()
  const commit = vi.fn()
  const change = vi.fn()
  const cleanups: (() => void)[] = []
  const run = new Function('useRef', 'useEffect', 'useState', 'useImperativeHandle', 'SystemInfo', 'invokeByRef', 'props', 'ref', 'getRectByRef',
    utils + source.slice(begin, end) + '\ntrackRef.current = {}; return {handleTouchStart, handleMoveX, handleEnd, getValue};')
  const gestures = run(
    (current: unknown) => ({ current }),
    (effect: () => unknown) => { const cleanup = effect(); if (typeof cleanup === 'function') cleanups.push(cleanup as () => void) },
    (value: unknown) => [value, () => {}],
    () => {}, { platform }, measure,
    { value: 0, step, onValueCommit: commit, onValueChange: change }, null, measure,
  ) as {
    handleTouchStart: (event: unknown) => void
    handleMoveX: (x: number) => void
    handleEnd: () => void
    getValue: () => number
  }
  return { ...gestures, measure, commit, change, unmount: () => cleanups.forEach(fn => fn()) }
}

async function flush() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }

test('a short tap commits even when bounds arrive after release', async () => {
  const c = controller()
  let resolve!: (rect: { left: number; width: number }) => void
  c.measure.mockReturnValue(new Promise(r => { resolve = r }))
  c.handleTouchStart({ detail: { x: 200 } })
  c.handleEnd()
  expect(c.commit).not.toHaveBeenCalled()
  resolve({ left: 100, width: 200 })
  await flush()
  expect(c.change).toHaveBeenLastCalledWith(expect.closeTo(0.6), 'drag')
  expect(c.commit).toHaveBeenCalledExactlyOnceWith(expect.closeTo(0.6))
  c.handleMoveX(100)
  expect(c.change).toHaveBeenCalledTimes(1)
})

test('release commits the latest buffered move once', async () => {
  const c = controller()
  let resolve!: (rect: { left: number; width: number }) => void
  c.measure.mockReturnValue(new Promise(r => { resolve = r }))
  c.handleTouchStart({ detail: { x: 100 } })
  c.handleMoveX(260)
  c.handleEnd()
  resolve({ left: 100, width: 200 })
  await flush()
  c.handleEnd()
  expect(c.commit).toHaveBeenCalledExactlyOnceWith(0.8)
})

test('an old measurement cannot apply to a new gesture', async () => {
  const c = controller()
  let resolve!: (rect: { left: number; width: number }) => void
  c.measure.mockReturnValueOnce(new Promise(r => { resolve = r }))
    .mockResolvedValue({ left: 300, width: 200 })
  c.handleTouchStart({ detail: { x: 150 } })
  c.handleEnd()
  c.handleTouchStart({ detail: { x: 460 } })
  c.handleEnd()
  resolve({ left: 100, width: 200 })
  await flush()
  expect(c.measure).toHaveBeenCalledTimes(2)
  expect(c.commit).toHaveBeenCalledExactlyOnceWith(0.8)
})

test('unmount drops a pending gesture and hover cannot start one', async () => {
  const c = controller()
  c.handleMoveX(150)
  expect(c.measure).not.toHaveBeenCalled()
  let resolve!: (rect: { left: number; width: number }) => void
  c.measure.mockReturnValue(new Promise(r => { resolve = r }))
  c.handleTouchStart({ detail: { x: 200 } })
  c.unmount()
  resolve({ left: 100, width: 200 })
  await flush()
  expect(c.commit).not.toHaveBeenCalled()
  expect(c.change).not.toHaveBeenCalled()
})

for (const platform of ['Android', 'iOS', 'Harmony', 'web']) {
  test(`bounds match touch coordinate space on ${platform}`, async () => {
    const c = controller(platform, 0.125)
    c.measure.mockImplementation((...args: unknown[]) => {
      const params = args[2] as { relativeTo: string | null } | undefined
      const correct = params?.relativeTo === null
      // Native relativeTo:'' produces left=0 even when the rail is inset.
      return Promise.resolve({ left: correct ? 32 : 0, width: 328 })
    })
    c.handleTouchStart(platform === 'web' ? { x: 196, clientX: 296 } : { detail: { x: 196 } })
    c.handleEnd()
    await flush()
    expect(c.measure).toHaveBeenCalledWith(expect.anything(), 'boundingClientRect', expect.objectContaining({
      relativeTo: null,
    }))
    expect(c.commit).toHaveBeenCalledExactlyOnceWith(0.5)
  })
}

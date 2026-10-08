import { act, render } from '@lynx-js/react/testing-library'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { getSurfaceAppearance, subscribeSurfaceAppearance, useSurfaceAppearance } from '../surface-appearance.js'

const upstream = vi.hoisted(() => ({
  theme: 'light' as 'light' | 'dark',
  reduceMotion: false,
  policy: { reduceTransparency: false, increaseContrast: false, opaque: false, blur: true, liquidGlass: true, androidCapture: false },
  policyListeners: new Set<() => void>(),
  themeListeners: new Set<() => void>(),
  subscribePolicy: vi.fn(),
  subscribeTheme: vi.fn(),
  stopPolicy: vi.fn(),
  stopTheme: vi.fn(),
  onAttach: null as (() => void) | null,
}))

vi.mock('../surface-policy.js', () => ({
  getSurfacePolicy: () => ({ ...upstream.policy }),
  subscribeSurfacePolicy: (listener: () => void) => {
    upstream.subscribePolicy()
    upstream.onAttach?.()
    upstream.policyListeners.add(listener)
    return () => { upstream.stopPolicy(); upstream.policyListeners.delete(listener) }
  },
}))
vi.mock('../theme-model.js', () => ({
  getAppTheme: () => upstream.theme,
  resolveTheme: (theme: string) => theme,
  subscribeAppTheme: (listener: () => void) => {
    upstream.subscribeTheme()
    upstream.themeListeners.add(listener)
    return () => { upstream.stopTheme(); upstream.themeListeners.delete(listener) }
  },
}))
vi.mock('../reduce-motion-model.js', () => ({ getReduceMotion: () => upstream.reduceMotion }))

const cleanups: (() => void)[] = []
const notifyPolicy = () => upstream.policyListeners.forEach(listener => listener())
beforeEach(() => {
  upstream.theme = 'light'
  upstream.reduceMotion = false
  upstream.onAttach = null
  upstream.policy = { reduceTransparency: false, increaseContrast: false, opaque: false, blur: true, liquidGlass: true, androidCapture: false }
  vi.clearAllMocks()
})
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()))

test('many surfaces share one upstream set, with release after the last leaf', () => {
  const observers = Array.from({ length: 12 }, () => vi.fn())
  const stops = observers.map(listener => subscribeSurfaceAppearance(listener))
  cleanups.push(...stops)
  expect(upstream.subscribePolicy).toHaveBeenCalledTimes(1)
  expect(upstream.subscribeTheme).toHaveBeenCalledTimes(1)
  stops.slice(0, -1).forEach(stop => stop())
  expect(upstream.stopPolicy).not.toHaveBeenCalled()
  upstream.reduceMotion = true
  notifyPolicy()
  observers.slice(0, -1).forEach(observer => expect(observer).not.toHaveBeenCalled())
  expect(observers.at(-1)).toHaveBeenCalledTimes(1)
  stops.at(-1)!()
  expect(upstream.stopPolicy).toHaveBeenCalledTimes(1)
  expect(upstream.stopTheme).toHaveBeenCalledTimes(1)
  // A new mount reconnects and reads changes that happened with no consumers.
  cleanups.length = 0
  upstream.theme = 'dark'
  cleanups.push(subscribeSurfaceAppearance(vi.fn()))
  expect(upstream.subscribePolicy).toHaveBeenCalledTimes(2)
  expect(getSurfaceAppearance().theme).toBe('dark')
})

test('duplicate and irrelevant notifications keep identity and do not notify surfaces', () => {
  const observer = vi.fn()
  cleanups.push(subscribeSurfaceAppearance(observer))
  const original = getSurfaceAppearance()
  notifyPolicy()
  upstream.themeListeners.forEach(listener => listener())
  expect(getSurfaceAppearance()).toBe(original)
  expect(observer).not.toHaveBeenCalled()
  upstream.theme = 'dark'
  upstream.themeListeners.forEach(listener => listener())
  notifyPolicy() // System-theme push also reaches the policy subscription.
  expect(observer).toHaveBeenCalledTimes(1)
  expect(getSurfaceAppearance().theme).toBe('dark')
})

test('reading a new snapshot before the event does not swallow delivery', () => {
  const observer = vi.fn()
  cleanups.push(subscribeSurfaceAppearance(observer))
  upstream.policy = { ...upstream.policy, reduceTransparency: true, opaque: true, blur: false, liquidGlass: false }
  expect(getSurfaceAppearance().opaque).toBe(true)
  notifyPolicy()
  expect(observer).toHaveBeenCalledTimes(1)
})

test('the mounted hook updates theme and motion and releases both subscriptions', async () => {
  function Probe() {
    const { theme, reduceMotion } = useSurfaceAppearance()
    return <text>{`${theme}:${reduceMotion}`}</text>
  }
  const r = render(<><Probe /><Probe /><Probe /></>)
  expect(upstream.subscribePolicy).toHaveBeenCalledTimes(1)
  await act(async () => {
    upstream.theme = 'dark'
    upstream.reduceMotion = true
    notifyPolicy()
  })
  expect(r.container.textContent).toBe('dark:truedark:truedark:true')
  r.unmount()
  expect(upstream.stopPolicy).toHaveBeenCalledTimes(1)
  expect(upstream.stopTheme).toHaveBeenCalledTimes(1)
})

test('the hook catches a change between render and subscription without an event', () => {
  upstream.onAttach = () => { upstream.theme = 'dark' }
  function Probe() { return <text>{useSurfaceAppearance().theme}</text> }
  const r = render(<Probe />)
  expect(r.container.textContent).toBe('dark')
  r.unmount()
})

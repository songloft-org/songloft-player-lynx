import '../../../shims/router-env.js'

import { afterEach, expect, test, vi } from 'vitest'
import { act, render } from '@lynx-js/react/testing-library'
import { applySystemAppearance, setSystemAppearanceForTests } from '../../../native/system-appearance.js'
import { LiquidTabIndicator } from '../LiquidTabIndicator.js'
import { getPlatformTarget } from '../../../native/platform-target.js'
import { readSystemInfo } from '../../../native/native-modules.js'
import { createMemoryStorage } from '../../../core/storage/index.js'
import { changeIncreaseContrast } from '../../theme/increase-contrast-model.js'
import { changeReduceTransparency } from '../../theme/reduce-transparency-model.js'

vi.mock('../../../native/platform-target.js', () => ({ getPlatformTarget: vi.fn(() => 'android') }))
vi.mock('../../../native/native-modules.js', async original => ({
  ...(await original<typeof import('../../../native/native-modules.js')>()),
  readSystemInfo: vi.fn(() => null),
}))

// Observe commands only; actual Element.animate is exercised on Android/Web.
const { calls } = vi.hoisted(() => ({ calls: [] as unknown[][] }))
vi.mock('@lynx-js/react', async original => ({
  ...(await original<Record<string, unknown>>()),
  runOnMainThread: () => (...args: unknown[]) => { calls.push(args) },
}))

afterEach(() => {
  setSystemAppearanceForTests(null)
  calls.length = 0
})

test('route changes retarget once; unrelated renders do not restart the spring', async () => {
  const host = render(<LiquidTabIndicator index={0} count={3} />)
  await act(async () => {})
  expect(calls.at(-1)).toEqual([0, 3, false])
  await act(async () => { host.rerender(<LiquidTabIndicator index={2} count={3} />) })
  expect(calls.at(-1)).toEqual([2, 3, false])
  const count = calls.length
  await act(async () => { host.rerender(<LiquidTabIndicator index={2} count={3} />) })
  expect(calls).toHaveLength(count)
  host.unmount()
  expect(calls.at(-1)).toEqual([0, 1, true, true])
})

test('live reduce-motion cancels travel and snaps the lens to the selected slot', async () => {
  render(<LiquidTabIndicator index={1} count={5} />)
  await act(async () => { applySystemAppearance({ theme: null, locale: null, reduceMotion: true }) })
  expect(calls.at(-1)).toEqual([1, 5, true])
  await act(async () => { applySystemAppearance({ theme: null, locale: null, reduceMotion: false }) })
  expect(calls.at(-1)).toEqual([1, 5, false])
})

test('capture excludes the optical layer; live accessibility preferences remove the lens', async () => {
  const host = lynx as unknown as { __globalProps: unknown }
  const props = host.__globalProps
  const storage = createMemoryStorage()
  host.__globalProps = { backdropSdkVersion: '4.0.0', backdropBlurSupported: true, androidCaptureSupported: true, androidGlassSupported: true, androidTabGlassSupported: true }
  vi.mocked(getPlatformTarget).mockReturnValue('android')
  vi.mocked(readSystemInfo).mockReturnValue(null)
  const screen = render(<LiquidTabIndicator index={0} count={3}><text>Tabs</text></LiquidTabIndicator>)
  try {
    const source = screen.container.querySelector('#songloft-tab-backdrop')!
    const optics = screen.container.querySelector('.nav-indicator__optics')!
    expect(source.contains(optics)).toBe(false)
    expect(optics.getAttribute('android-capture-target')).toBe('songloft-tab-backdrop')
    expect(optics.getAttribute('blur-radius')).toBe('0px')
    expect(optics.getAttribute('enable-auto-blur')).toBe('false')
    await act(async () => { await changeIncreaseContrast(true, storage) })
    expect(screen.container.querySelector('.nav-indicator__optics')).toBeNull()
    expect(screen.container.textContent).toContain('Tabs')
    await act(async () => { await changeIncreaseContrast(false, storage); await changeReduceTransparency(true, storage) })
    expect(screen.container.querySelector('.nav-indicator__optics')).toBeNull()
  } finally {
    screen.unmount()
    host.__globalProps = props
    await changeIncreaseContrast(false, storage)
    await changeReduceTransparency(false, storage)
  }
})

test('an older Android host advertising only outer glass retains the visible tint fallback', async () => {
  const host = lynx as unknown as { __globalProps: unknown }
  const props = host.__globalProps
  host.__globalProps = { backdropSdkVersion: '4.0.0', backdropBlurSupported: true, androidCaptureSupported: true, androidGlassSupported: true }
  vi.mocked(getPlatformTarget).mockReturnValue('android')
  const screen = render(<LiquidTabIndicator index={0} count={3} />)
  try {
    expect(screen.container.querySelector('.nav-indicator__optics')).toBeNull()
    expect(screen.container.querySelector('.nav-indicator__pill')).not.toBeNull()
  } finally { screen.unmount(); host.__globalProps = props }
})

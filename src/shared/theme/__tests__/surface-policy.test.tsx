import { act, render } from '@lynx-js/react/testing-library'
import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import { createMemoryStorage } from '../../../core/storage/index.js'
import { getPlatformTarget } from '../../../native/platform-target.js'
import { getBackdropCapabilities } from '../../../native/backdrop-capabilities.js'
import { readSystemInfo } from '../../../native/native-modules.js'
import { applySystemAppearance, setSystemAppearanceForTests } from '../../../native/system-appearance.js'
import { changeIncreaseContrast } from '../increase-contrast-model.js'
import { changeReduceTransparency, applySavedReduceTransparency, getReduceTransparency } from '../reduce-transparency-model.js'
import { getSurfacePolicy, subscribeSurfacePolicy } from '../surface-policy.js'
import { changeAppTheme } from '../theme-model.js'
import { ThemeProvider } from '../ThemeProvider.js'
import { CONTRAST_ACCENT } from '../theme-pack-mapping.js'
import { BackdropBlur } from '../../ui/BackdropBlur.js'

vi.mock('../../../native/platform-target.js', () => ({ getPlatformTarget: vi.fn(() => 'ios') }))
vi.mock('../../../native/native-modules.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../../native/native-modules.js')>(),
  readSystemInfo: vi.fn(() => null),
}))
const storage = createMemoryStorage()
const host = () => lynx as unknown as { __globalProps: unknown }
let originalProps: unknown
const props = () => ({ backdropSdkVersion: '4.0.1', backdropBlurSupported: true, liquidGlassSupported: true })

beforeEach(async () => {
  originalProps = host().__globalProps
  host().__globalProps = props()
  vi.mocked(getPlatformTarget).mockReturnValue('ios')
  vi.mocked(readSystemInfo).mockReturnValue(null)
  setSystemAppearanceForTests({ theme: 'light', locale: 'en' })
  await changeIncreaseContrast(false, storage)
  await changeReduceTransparency(false, storage)
  await changeAppTheme('light', storage)
})
afterEach(() => {
  host().__globalProps = originalProps
  setSystemAppearanceForTests(null)
})

test.each([undefined, null, '3.9.0', 'nonsense', '4'])('unknown or old SDK %s cannot enable native blur', version => {
  host().__globalProps = { ...props(), backdropSdkVersion: version }
  expect(getBackdropCapabilities().blur).toBe(false)
  const r = render(<ThemeProvider><BackdropBlur /></ThemeProvider>)
  expect((r.container.firstElementChild as unknown as { style: Record<string, string> }).style['--material-fill']).toBe('rgba(255, 255, 255, 1)')
})
test('old iOS uses themed blur without glass-only props; supported iOS selects glass', () => {
  host().__globalProps = { ...props(), liquidGlassSupported: false }
  expect(getSurfacePolicy().liquidGlass).toBe(false)
  const r = render(<BackdropBlur />)
  expect(r.container.innerHTML).not.toContain('glass-style')
  expect(r.container.innerHTML).toContain('blur-effect="light"')
})
test('system flags update real root material, palette, motion and blur without remounting', async () => {
  const r = render(<ThemeProvider><BackdropBlur className='ui-backdrop-blur--panel' /></ThemeProvider>)
  const root = () => r.container.firstElementChild as unknown as { style: Record<string, string>; className: string }
  expect(r.container.innerHTML).toContain('blur-effect="glass"')
  expect(root().style['--material-fill-menu']).toBe('rgba(255, 255, 255, 0.99)')
  await act(async () => applySystemAppearance({ theme: 'light', locale: 'en', reduceTransparency: true, increaseContrast: true, reduceMotion: true }))
  expect(root().style['--material-fill']).toBe('rgba(255, 255, 255, 1)')
  expect(root().style['--material-fill-menu']).toBe('rgba(255, 255, 255, 1)')
  expect(root().className).toContain('increase-contrast')
  expect(root().style['--accent']).toBe(CONTRAST_ACCENT.light.accent)
  expect(root().className).toContain('reduce-motion')
  expect(r.container.innerHTML).not.toContain('blur-view')
  await act(async () => applySystemAppearance({ theme: 'light', locale: 'en', reduceTransparency: false, increaseContrast: true, reduceMotion: false }))
  expect(r.container.innerHTML).toContain('blur-effect="light"')
  expect(r.container.innerHTML).not.toContain('glass-style')
  await act(async () => applySystemAppearance({ theme: 'light', locale: 'en' }))
  expect(r.container.innerHTML).toContain('blur-effect="glass"')
})
test('compact glass is decorative; full-screen scrims retain themed blur', async () => {
  const r = render(<ThemeProvider><BackdropBlur /><BackdropBlur className='ui-backdrop-blur--pill' /></ThemeProvider>)
  const layers = () => Array.from(r.container.querySelectorAll('blur-view'))
  expect(layers()).toHaveLength(2)
  expect(layers()[0]!.getAttribute('blur-effect')).toBe('light')
  expect(layers()[0]!.hasAttribute('glass-style')).toBe(false)
  expect(layers()[1]!.getAttribute('glass-style')).toBe('regular')
  expect(layers()[1]!.getAttribute('glass-interactive')).toBe('false')
  for (const layer of layers()) expect(layer.getAttribute('accessibility-element')).toBe('false')
  await act(async () => { await changeAppTheme('dark', storage) })
  expect(layers()[0]!.getAttribute('blur-effect')).toBe('dark')
  expect(layers()[1]!.getAttribute('ios-user-interface-style')).toBe('dark')
})
test('local preference survives saved replay, respects system-on, and unsubscribes', async () => {
  const listener = vi.fn()
  const unsubscribe = subscribeSurfacePolicy(listener)
  await changeReduceTransparency(true, storage)
  expect(await storage.prefs.get('reduce_transparency')).toBe('true')
  await applySavedReduceTransparency(storage)
  expect(getReduceTransparency()).toBe(true)
  applySystemAppearance({ theme: 'light', locale: 'en', reduceTransparency: true })
  await changeReduceTransparency(false, storage)
  expect(getSurfacePolicy().opaque).toBe(true)
  expect(await storage.prefs.get('reduce_transparency')).toBeNull()
  unsubscribe()
  const count = listener.mock.calls.length
  applySystemAppearance({ theme: 'light', locale: 'en', reduceTransparency: false })
  expect(listener).toHaveBeenCalledTimes(count)
})
test.each(['android', 'harmony', 'web'] as const)('%s never chooses iOS glass', platform => {
  vi.mocked(getPlatformTarget).mockReturnValue(platform)
  host().__globalProps = { ...props(), androidCaptureSupported: true }
  expect(getBackdropCapabilities().liquidGlass).toBe(false)
  expect(getBackdropCapabilities().androidCapture).toBe(platform === 'android')
})

test('missing registration never enables blur even with a new SDK', () => {
  host().__globalProps = { ...props(), backdropBlurSupported: 'true' }
  expect(getSurfacePolicy().opaque).toBe(true)
  expect(render(<BackdropBlur />).container.innerHTML).not.toContain('blur-view')
})

test('the actual Android SDK spelling 4.0 passes the SDK gate', () => {
  host().__globalProps = { ...props(), backdropSdkVersion: '0.0.1' }
  vi.mocked(readSystemInfo).mockReturnValue({ engineVersion: '4.0', lynxSdkVersion: '4.0' })
  expect(getBackdropCapabilities().blur).toBe(true)
})

test('an old runtime cannot be overridden by newer host version metadata', () => {
  vi.mocked(readSystemInfo).mockReturnValue({ engineVersion: '3.9', lynxSdkVersion: '4.0' })
  expect(getBackdropCapabilities().blur).toBe(false)
})

test('Android capture props are emitted only on Android', () => {
  vi.mocked(getPlatformTarget).mockReturnValue('android')
  host().__globalProps = { ...props(), androidCaptureSupported: true }
  const html = render(<BackdropBlur />).container.innerHTML
  expect(html).toContain('android-capture-target="songloft-backdrop"')
  expect(html).not.toContain('blur-effect')
  expect(html).not.toContain('glass-style')
  expect(html).not.toContain('ios-user-interface-style')
})

test('Android refraction needs an explicit host capability and only decorates capsules', async () => {
  vi.mocked(getPlatformTarget).mockReturnValue('android')
  host().__globalProps = { ...props(), androidCaptureSupported: true }
  expect(getSurfacePolicy().androidGlass).toBe(false)
  host().__globalProps = { ...props(), androidCaptureSupported: true, androidGlassSupported: true }
  const r = render(<>
    <BackdropBlur />
    <BackdropBlur className='ui-backdrop-blur--panel' />
    <BackdropBlur className='ui-backdrop-blur--pill' />
  </>)
  const layers = () => [...r.container.querySelectorAll('blur-view')]
  expect(layers().map(layer => layer.getAttribute('songloft-glass'))).toEqual(['false', 'false', 'true'])
  expect(layers().map(layer => layer.getAttribute('blur-radius'))).toEqual(['20px', '20px', '6px'])
  await act(async () => { await changeIncreaseContrast(true, storage) })
  expect(layers().every(layer => layer.getAttribute('songloft-glass') === 'false')).toBe(true)
  expect(layers().map(layer => layer.getAttribute('blur-radius'))).toEqual(['20px', '20px', '12px'])
  await act(async () => { await changeReduceTransparency(true, storage) })
  expect(layers()).toHaveLength(0)
})

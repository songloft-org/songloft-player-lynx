import { act, render } from '@lynx-js/react/testing-library'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { createMemoryStorage } from '../../../core/storage/index.js'
import { getPlatformTarget } from '../../../native/platform-target.js'
import { changeAppTheme } from '../theme-model.js'
import { changeIncreaseContrast } from '../increase-contrast-model.js'
import { changeMaterialVariant } from '../material-model.js'
import { MATERIAL_TOKENS } from '../material-tokens.js'
import { setActiveThemePack } from '../theme-pack-model.js'
import { ThemeProvider } from '../ThemeProvider.js'

vi.mock('../../../native/platform-target.js', () => ({ getPlatformTarget: vi.fn() }))
vi.mock('../../../native/backdrop-capabilities.js', () => ({
  getBackdropCapabilities: () => ({ blur: true, liquidGlass: getPlatformTarget() === 'ios', androidCapture: false }),
}))

const storage = createMemoryStorage()
const keys = Object.keys(MATERIAL_TOKENS.regular.light)

function texture(container: unknown) {
  const style = (container as { firstElementChild: { style: Record<string, string> } }).firstElementChild.style
  return Object.fromEntries(keys.map(key => [key, style[key]]))
}

beforeEach(async () => {
  vi.mocked(getPlatformTarget).mockReturnValue('ios')
  await changeAppTheme('light', storage)
  await changeMaterialVariant('regular', storage)
  await changeIncreaseContrast(false, storage)
})

afterEach(async () => {
  setActiveThemePack(null)
  await changeMaterialVariant('regular', storage)
  await changeIncreaseContrast(false, storage)
})

test.each(['light', 'dark'] as const)('%s iOS writes the intended native tint to the effective root', async theme => {
  await changeAppTheme(theme, storage)
  const r = render(<ThemeProvider />)
  // Inline beats every platform CSS selector. Check the actual consumer rather
  // than a declaration that could exist without ever affecting the screen.
  expect(texture(r.container)).toEqual(MATERIAL_TOKENS['ultra-thin'][theme])
})

test.each(['android', 'harmony', 'web'] as const)('%s retains the standard texture', platform => {
  vi.mocked(getPlatformTarget).mockReturnValue(platform)
  const r = render(<ThemeProvider />)
  expect(texture(r.container)).toEqual(MATERIAL_TOKENS.regular.light)
})

test('native tint follows thickness and contrast changes without remounting', async () => {
  const r = render(<ThemeProvider />)
  const original = texture(r.container)
  await act(async () => { await changeMaterialVariant('thick', storage) })
  expect(texture(r.container)['--material-fill']).not.toBe(original['--material-fill'])
  await act(async () => { await changeIncreaseContrast(true, storage) })
  expect(texture(r.container)).toEqual(MATERIAL_TOKENS.thick.light)
  await act(async () => { await changeIncreaseContrast(false, storage) })
  expect(texture(r.container)).not.toEqual(MATERIAL_TOKENS.thick.light)
  await act(async () => { await changeMaterialVariant('regular', storage) })
  expect(texture(r.container)).toEqual(original)
  expect(Object.values(texture(r.container)).every(Boolean)).toBe(true)
})

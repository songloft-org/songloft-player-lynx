import { readFileSync } from 'node:fs'
import path from 'node:path'
import { act, render } from '@lynx-js/react/testing-library'
import { afterEach, expect, test, vi } from 'vitest'

import { createMemoryStorage } from '../../../core/storage/index.js'
import { changeReduceTransparency } from '../../theme/reduce-transparency-model.js'
import { changeMaterialVariant } from '../../theme/material-model.js'
import { changeIncreaseContrast } from '../../theme/increase-contrast-model.js'
import { ThemeProvider } from '../../theme/ThemeProvider.js'
import { BackdropBlur } from '../BackdropBlur.js'
import { useCapsuleMaterialStyle } from '../capsule-material.js'

vi.mock('../../../native/backdrop-capabilities.js', () => ({
  BACKDROP_CAPTURE_TARGET: 'songloft-backdrop',
  getBackdropCapabilities: () => ({ blur: true, liquidGlass: false, androidCapture: true }),
}))
vi.mock('../../../native/platform-target.js', () => ({ getPlatformTarget: () => 'android' }))

const read = (file: string) => readFileSync(path.resolve(__dirname, '../../../', file), 'utf8')
const css = read('shared/ui/BackdropBlur.css').replace(/\/\*[\s\S]*?\*\//g, '')
const rule = (source: string, name: string) => {
  const body = new RegExp(`\\.${name}\\s*\\{([^{}]*)\\}`).exec(source)?.[1]
  expect(body, `missing .${name}`).toBeDefined()
  return body!
}
const storage = createMemoryStorage()
afterEach(async () => {
  await changeReduceTransparency(false, storage)
  await changeIncreaseContrast(false, storage)
  await changeMaterialVariant('regular', storage)
})

function Material() {
  const style = useCapsuleMaterialStyle()
  return <view className='ui-capsule-material' style={style} />
}

test('Android captures a complete page base, preventing sharp alpha bleed-through on Home', () => {
  const shell = read('shared/layouts/ShellLayout.tsx')
  expect(shell).toMatch(/<view className='shell__body' id='songloft-backdrop' flatten=\{false\}/)
  const body = rule(read('shared/layouts/ShellLayout.css'), 'shell__body')
  expect(body).toMatch(/background-color:\s*var\(--system-background\)/)
})

test.each([
  ['shared/layouts/ShellLayout.tsx', 'shared/layouts/ShellLayout.css', 'shell__bottombar', 'nav-indicator'],
  ['features/player/widgets/MiniPlayer.tsx', 'features/player/widgets/MiniPlayer.css', 'mini-player', 'mini-player__progress'],
])('%s composites blur, material and controls in that order', (tsx, stylesheet, panel, content) => {
  const source = read(tsx)
  const blur = source.indexOf("<BackdropBlur className='ui-backdrop-blur--pill' />")
  const tint = source.indexOf("<view className='ui-capsule-material ")
  const foreground = source.indexOf(`className='${content}'`)
  expect(blur).toBeGreaterThan(source.indexOf(`className='${panel}`))
  expect(tint).toBeGreaterThan(blur)
  expect(foreground).toBeGreaterThan(tint)
  expect(source.slice(tint, foreground)).toMatch(/flatten=\{false\} accessibility-element=\{false\}/)
  expect(source.slice(tint, foreground)).toContain('style={capsuleMaterialStyle}')
  expect(source).toContain('const capsuleMaterialStyle = useCapsuleMaterialStyle()')
  const outer = rule(read(stylesheet), panel)
  expect(outer).toMatch(/background-color:\s*transparent/)
  expect(outer).not.toMatch(/background-image:/)
  const material = rule(css, 'ui-capsule-material')
  const blurStyle = rule(css, 'ui-backdrop-blur--pill')
  expect(material).toMatch(/z-index:\s*-1/)
  expect(blurStyle).toMatch(/z-index:\s*-2/)
  for (const layer of [material, blurStyle]) {
    expect(layer).toMatch(/border-radius:\s*var\(--radius-pill\)/)
  }
  expect(material).toMatch(/background-color:\s*var\(--material-fill\)/)
  expect(material).toMatch(/pointer-events:\s*none/)
  expect(material).not.toMatch(/transition:|animation:/)
})

test('reducing transparency removes only blur and preserves the opaque capsule material', async () => {
  const r = render(<ThemeProvider>
    <BackdropBlur className='ui-backdrop-blur--pill' />
    <Material />
    <text>Navigation</text>
  </ThemeProvider>)
  expect(r.container.querySelector('blur-view')).not.toBeNull()
  await act(async () => { await changeReduceTransparency(true, storage) })
  expect(r.container.querySelector('blur-view')).toBeNull()
  expect(r.container.querySelector('.ui-capsule-material')).not.toBeNull()
  const root = r.container.firstElementChild as unknown as { style: Record<string, string> }
  expect(root.style['--material-fill']).toMatch(/, 1\)$/)
  expect(r.container.textContent).toContain('Navigation')
  const material = r.container.querySelector('.ui-capsule-material') as unknown as { style: Record<string, string> }
  expect(material.style.backgroundColor).toBe('rgb(255, 255, 255)')
})

test('the capsule updates its concrete paint when thickness and contrast change', async () => {
  const r = render(<Material />)
  const fill = () => (r.container.firstElementChild as unknown as { style: Record<string, string> }).style.backgroundColor
  await act(async () => { await changeMaterialVariant('ultra-thin', storage) })
  const thin = fill()
  await act(async () => { await changeMaterialVariant('thick', storage) })
  expect(fill()).not.toBe(thin)
  expect(fill()).toMatch(/, 0\.92\)$/)
  await act(async () => { await changeMaterialVariant('ultra-thin', storage) })
  await act(async () => { await changeIncreaseContrast(true, storage) })
  expect(fill()).toMatch(/, 0\.92\)$/)
})

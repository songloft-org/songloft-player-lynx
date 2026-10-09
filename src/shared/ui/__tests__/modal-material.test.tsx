import { act, render } from '@lynx-js/react/testing-library'
import { afterEach, expect, test, vi } from 'vitest'

import { createMemoryStorage } from '../../../core/storage/index.js'
import { changeReduceTransparency } from '../../theme/reduce-transparency-model.js'
import { ModalMaterial } from '../ModalMaterial.js'
import { ModalScrim } from '../ModalScrim.js'

vi.mock('../../../native/backdrop-capabilities.js', () => ({
  BACKDROP_CAPTURE_TARGET: 'songloft-backdrop',
  getBackdropCapabilities: () => ({ blur: true, liquidGlass: true }),
}))
vi.mock('../../../native/platform-target.js', () => ({ getPlatformTarget: () => 'ios' }))
const storage = createMemoryStorage()
afterEach(async () => { await changeReduceTransparency(false, storage) })

function paint(node: Element) {
  return (node as unknown as { style: Record<string, string> }).style.backgroundColor
}

test('nested dialog owns one dim and releases it back to its sheet', () => {
  const r = render(<>
    <ModalScrim className='sheet-dim' />
    <ModalScrim active={false} priority={200} className='dialog-dim' />
  </>)
  const sheet = () => r.container.querySelector('.sheet-dim')!
  const dialog = () => r.container.querySelector('.dialog-dim')!
  expect(paint(sheet())).toMatch(/rgba\(0, 0, 0, 0\.(16|24)\)/)
  r.rerender(<>
    <ModalScrim className='sheet-dim' />
    <ModalScrim priority={200} className='dialog-dim' />
  </>)
  expect(paint(sheet())).toBe('transparent')
  expect(paint(dialog())).toMatch(/rgba\(0, 0, 0, 0\.(16|24)\)/)
  r.rerender(<ModalScrim className='sheet-dim' />)
  expect(paint(sheet())).toMatch(/rgba\(0, 0, 0, 0\.(16|24)\)/)
  r.unmount()
  const next = render(<ModalScrim className='fresh-dim' />)
  expect(paint(next.container.firstElementChild!)).toMatch(/rgba\(0, 0, 0, 0\.(16|24)\)/)
})

test('a later lower-priority sheet cannot take the dialog dim', () => {
  const r = render(<>
    <ModalScrim priority={200} className='dialog-dim' />
    <ModalScrim className='sheet-dim' />
  </>)
  expect(paint(r.container.querySelector('.sheet-dim')!)).toBe('transparent')
  expect(paint(r.container.querySelector('.dialog-dim')!)).toMatch(/rgba\(0, 0, 0, 0\.(16|24)\)/)
})

test('same-priority sheets dim only the last mounted surface', () => {
  const r = render(<>
    <ModalScrim className='first-dim' />
    <ModalScrim className='second-dim' />
  </>)
  expect(paint(r.container.querySelector('.first-dim')!)).toBe('transparent')
  expect(paint(r.container.querySelector('.second-dim')!)).toMatch(/rgba\(0, 0, 0, 0\.(16|24)\)/)
  r.rerender(<ModalScrim className='first-dim' />)
  expect(paint(r.container.querySelector('.first-dim')!)).toMatch(/rgba\(0, 0, 0, 0\.(16|24)\)/)
})

test('modal content opacity stays at one during enter and leave so its blur can sample the page', async () => {
  const { readFileSync } = await import('node:fs')
  const css = readFileSync('src/shared/ui/ConfirmDialog.css', 'utf8')
  const keyframes = css.slice(css.indexOf('@keyframes dialog-enter'))
  expect(keyframes).not.toMatch(/opacity:/)
  expect(css.match(/\.confirm-dialog__content\.ui-leaving\s*\{([^}]*)\}/)![1]).not.toMatch(/opacity:/)
  const sheets = readFileSync('src/shared/ui/overlay-motion.css', 'utf8')
  const slide = sheets.slice(sheets.indexOf('@keyframes overlay-enter-up'), sheets.indexOf('@keyframes overlay-enter-scale'))
  expect(slide).not.toMatch(/opacity:/)
  expect(sheets.match(/\.overlay--leave-up\s*\{([^}]*)\}/)![1]).not.toMatch(/opacity:/)
})

test('local content blur keeps its tint on top and respects reduced transparency', async () => {
  const r = render(<ModalMaterial shape='sheet' />)
  const blur = r.container.querySelector('blur-view')!
  expect(blur.getAttribute('blur-effect')).toBe('light')
  expect(blur.getAttribute('blur-radius')).toBe('20px')
  const material = r.container.querySelector('.ui-modal-material')!
  expect(blur.nextElementSibling).toBe(material)
  expect(paint(material)).toBe('rgba(255, 255, 255, 0.94)')
  await act(async () => { await changeReduceTransparency(true, storage) })
  expect(r.container.querySelector('blur-view')).toBeNull()
  expect(paint(material)).toBe('rgb(255, 255, 255)')
})

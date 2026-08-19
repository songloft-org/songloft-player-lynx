import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from '@lynx-js/react/testing-library'

import { clearBackHandlersForTests, dispatchBack, getBackStackDepth } from '../../nav/back-stack.js'

/**
 * Overlays must consume the back key themselves.
 *
 * Registering inside each shared overlay — rather than at its call sites — is what
 * makes the back key work for all 14 of them (and every future one) from 7 edits.
 * The failure mode if one forgets is silent and unpleasant: back skips the dialog on
 * screen and navigates the page out from under it.
 *
 * Two gates here, deliberately different in kind:
 *  1. a **derived** source gate, so a *new* overlay component cannot quietly opt out;
 *  2. **behavioural** tests that dispatch a real press and check what closed.
 */

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('@lynx-js/lynx-ui-dialog', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiDialog(),
)
vi.mock('@lynx-js/lynx-ui-popover', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiPopover(),
)

const { ActionSheet } = await import('../ActionSheet.js')
const { ConfirmDialog } = await import('../ConfirmDialog.js')
const { PopoverMenu } = await import('../PopoverMenu.js')

beforeEach(() => clearBackHandlersForTests())
afterEach(() => {
  clearBackHandlersForTests()
  vi.clearAllMocks()
})

/**
 * Every overlay in `src/shared/ui` has to claim the back key.
 *
 * The requirement is **derived from the source** rather than listed here, the same
 * way `android-manifest-contract` derives its component list from the Kotlin: a
 * component whose props carry both a visibility flag and a close callback is an
 * overlay, and adding one without `useBackHandler` fails this test with no edit here.
 */
describe('every shared overlay claims the back key', () => {
  const uiDir = path.resolve(__dirname, '..')
  const VISIBILITY = /^\s{2}(show|open)\??:\s*boolean/m
  const CLOSE = /^\s{2}(onClose|onCancel|onShowChange)\??:/m

  const overlays = readdirSync(uiDir)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => ({ file: f, src: readFileSync(path.join(uiDir, f), 'utf8') }))
    .filter((e) => VISIBILITY.test(e.src) && CLOSE.test(e.src))

  test('the detection found the overlays it should have', () => {
    // Guards the derivation: if the props are renamed, this must not silently start
    // asserting over an empty list.
    const files = overlays.map((o) => o.file).sort()
    expect(files).toEqual(['ActionSheet.tsx', 'ConfirmDialog.tsx', 'PopoverMenu.tsx'])
  })

  test.each(overlays.map((o) => o.file))('%s calls useBackHandler', (file) => {
    const entry = overlays.find((o) => o.file === file)!
    expect(
      entry.src,
      `${file} looks like an overlay (visibility prop + close callback) but never calls `
      + 'useBackHandler, so the back key will navigate the page instead of closing it. '
      + 'See docs/reference/back-navigation.md.',
    ).toContain('useBackHandler(')
  })
})

describe('a back press closes the overlay instead of falling through', () => {
  test('ConfirmDialog cancels', () => {
    const onCancel = vi.fn()
    render(
      <ConfirmDialog
        show
        title='t'
        message='m'
        confirmLabel='ok'
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    )

    expect(getBackStackDepth()).toBe(1)
    expect(dispatchBack()).toBe(true)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  test('ActionSheet closes', () => {
    const onClose = vi.fn()
    render(<ActionSheet open onClose={onClose}><text>body</text></ActionSheet>)

    expect(dispatchBack()).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  /**
   * The popover must close through `onShowChange(false)`, not some other channel:
   * it is controlled, and lynx-ui has no imperative close — `PopoverRoot.onClose` is
   * a "finished leaving" lifecycle callback, so driving that would deadlock.
   */
  test('PopoverMenu closes through onShowChange', () => {
    const onShowChange = vi.fn()
    render(
      <PopoverMenu
        show
        onShowChange={onShowChange}
        trigger={<text>open</text>}
        items={[{ key: 'a', label: 'A' }]}
        onSelect={() => {}}
      />,
    )

    expect(dispatchBack()).toBe(true)
    expect(onShowChange).toHaveBeenCalledWith(false)
  })
})

describe('a closed overlay does not hold the back key', () => {
  /**
   * The other half of the contract, and the one that breaks navigation rather than
   * overlays: these components stay mounted while closed (call sites render them
   * unconditionally), so a registration that ignored the visibility flag would eat
   * every press on the page forever.
   */
  test('ConfirmDialog registers nothing while hidden', () => {
    const onCancel = vi.fn()
    render(
      <ConfirmDialog
        show={false}
        title='t'
        message='m'
        confirmLabel='ok'
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    )

    expect(getBackStackDepth()).toBe(0)
    expect(dispatchBack()).toBe(false)
    expect(onCancel).not.toHaveBeenCalled()
  })

  test('ActionSheet registers nothing while hidden', () => {
    const onClose = vi.fn()
    render(<ActionSheet open={false} onClose={onClose}><text>body</text></ActionSheet>)

    expect(getBackStackDepth()).toBe(0)
    expect(dispatchBack()).toBe(false)
  })
})

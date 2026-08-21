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
vi.mock('@lynx-js/lynx-ui-input', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiInput(),
)

const { ActionSheet } = await import('../ActionSheet.js')
const { ConfirmDialog } = await import('../ConfirmDialog.js')
const { GlobalMenu } = await import('../GlobalMenu.js')
const { PopoverMenu } = await import('../PopoverMenu.js')
const { PromptDialog } = await import('../PromptDialog.js')

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

  const candidates = readdirSync(uiDir)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => ({ file: f, src: readFileSync(path.join(uiDir, f), 'utf8') }))
    .filter((e) => VISIBILITY.test(e.src) && CLOSE.test(e.src))

  const registers = (src: string) => src.includes('useBackHandler(')
  const byFile = new Map(candidates.map((e) => [e.file, e.src]))

  /**
   * What the contract actually requires is *reachability*, not a call in this exact
   * file: somewhere in the overlay's own subtree, one component registers.
   *
   * So a candidate passes if it calls `useBackHandler` **or** it renders a shared/ui
   * component that does. `PopoverMenu` and `PopoverPanel` take the second route —
   * both delegate their whole body to `PopoverSurface`, which registers once. Adding
   * a registration in the wrapper *as well* would be the bug, not the fix: two
   * handlers for one visible panel means the second press gets eaten by whichever
   * sibling has not unregistered yet.
   *
   * Location is deliberately not part of this. `GlobalMenu` is imported only from
   * inside `shared/ui` (by `SongRowOverlays`, which registers nothing) and still has
   * to claim the key itself.
   *
   * One level of delegation is enough for every overlay here, and going deeper would
   * start counting an unrelated nested overlay's registration as this one's.
   */
  const delegatesTo = (src: string) =>
    [...byFile.entries()]
      .filter(([file]) => src.includes(`/${file.replace(/\.tsx$/, '.js')}`))
      .filter(([, childSrc]) => registers(childSrc))
      .map(([file]) => file)

  test('the detection found the overlays it should have', () => {
    // Guards the derivation: if the props are renamed, this must not silently start
    // asserting over an empty list.
    expect(candidates.map((o) => o.file).sort()).toEqual([
      'ActionSheet.tsx',
      'ConfirmDialog.tsx',
      'GlobalMenu.tsx',
      'PopoverMenu.tsx',
      'PopoverPanel.tsx',
      'PopoverSurface.tsx',
      'PromptDialog.tsx',
    ])
    // And that the delegating route is genuinely in use — otherwise the `or` branch
    // below could rot into dead code and nobody would notice.
    expect(
      candidates.filter((o) => !registers(o.src)).map((o) => o.file).sort(),
    ).toEqual(['PopoverMenu.tsx', 'PopoverPanel.tsx'])
  })

  test.each(candidates.map((o) => o.file))('%s claims the back key', (file) => {
    const src = byFile.get(file)!
    const delegates = delegatesTo(src)
    expect(
      registers(src) || delegates.length > 0,
      `${file} looks like an overlay (visibility prop + close callback) but neither calls `
      + 'useBackHandler nor delegates to a shared/ui component that does, so the back key '
      + 'will navigate the page instead of closing it. See docs/reference/back-navigation.md.',
    ).toBe(true)
    // Both at once is the double-registration bug described above.
    expect(
      registers(src) && delegates.length > 0,
      `${file} registers a back handler *and* renders ${delegates.join(', ')}, which `
      + 'registers too. One visible overlay must put exactly one handler on the stack.',
    ).toBe(false)
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
   * The popover must close through `onShowChange(false)`, not some other channel: it
   * is controlled, so its visibility only ever changes by the owner writing state —
   * anything that hid the panel without telling the owner would leave `show` true and
   * the trigger unable to reopen it.
   *
   * This also covers the delegation the source gate above only reads statically:
   * `PopoverMenu` itself calls nothing, so a press arriving here proves
   * `PopoverSurface`'s registration is really wired to the wrapper's props.
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

  test('GlobalMenu closes', () => {
    const onClose = vi.fn()
    render(
      <GlobalMenu
        show
        onClose={onClose}
        items={[{ key: 'a', label: 'A' }]}
        onSelect={() => {}}
      />,
    )

    expect(dispatchBack()).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test('PromptDialog cancels', () => {
    const onCancel = vi.fn()
    render(
      <PromptDialog
        show
        title='t'
        label='name'
        confirmLabel='create'
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    )

    expect(dispatchBack()).toBe(true)
    expect(onCancel).toHaveBeenCalledTimes(1)
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

  test('GlobalMenu registers nothing while hidden', () => {
    const onClose = vi.fn()
    render(
      <GlobalMenu
        show={false}
        onClose={onClose}
        items={[{ key: 'a', label: 'A' }]}
        onSelect={() => {}}
      />,
    )

    expect(getBackStackDepth()).toBe(0)
    expect(dispatchBack()).toBe(false)
    expect(onClose).not.toHaveBeenCalled()
  })

  test('PromptDialog registers nothing while hidden', () => {
    const onCancel = vi.fn()
    render(
      <PromptDialog
        show={false}
        title='t'
        label='name'
        confirmLabel='create'
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    )

    expect(getBackStackDepth()).toBe(0)
    expect(dispatchBack()).toBe(false)
    expect(onCancel).not.toHaveBeenCalled()
  })
})

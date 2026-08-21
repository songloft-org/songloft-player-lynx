import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

/**
 * The three overlay properties of `ConfirmDialog` that no render test can see.
 *
 * The Vitest env has no layout engine and the shared lynx-ui Dialog stand-in
 * (`mockLynxUiDialog`) passes `DialogBackdrop` / `DialogContent` straight
 * through — it drops `style` and `dialogContentProps` — so the scrim's box and
 * the outside-tap wiring are invisible to rendering. Same reason
 * `popover-menu-css.test.ts` is a static assertion.
 *
 * What these pin, all three found by browser verification:
 *
 *  1. The scrim needs `position: fixed` from the **inline style**. lynx-ui
 *     hard-codes `position: absolute; width: 100%; height: 100%` inline, which
 *     beats the stylesheet, and its parent (`DialogView`) is a dimensionless
 *     fixed wrapper — so the class's `fixed` was dead and the scrim resolved to
 *     0×0: no visible dim, and `clickToClose` unreachable.
 *  2. Outside-tap cancel must sit on the **content** layer. That layer is
 *     `fixed; inset: 0` with `event-through={false}`, so it covers the scrim
 *     entirely; a tap outside the card can only ever reach the content view.
 *  3. The card must `catchtap`. Otherwise a tap on the confirm button bubbles to
 *     the content layer and fires `onCancel` right after `onConfirm`.
 */

const SRC = path.resolve(__dirname, '../ConfirmDialog.tsx')

/** Source with comments stripped — the prose above each fix explains it and
 *  must not be what satisfies these assertions. */
function source(): string {
  return readFileSync(SRC, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

/** The JSX attributes of `<Tag …>`, up to the closing `>` of the open tag. */
function openTag(src: string, tag: string): string {
  const start = src.indexOf(`<${tag}`)
  expect(start, `<${tag}> not found in ConfirmDialog.tsx`).toBeGreaterThan(-1)
  const end = src.indexOf('>', start)
  return src.slice(start, end)
}

describe('ConfirmDialog overlay wiring', () => {
  test('the scrim is pinned to the viewport through the inline style', () => {
    const backdrop = openTag(source(), 'DialogBackdrop')
    expect(
      backdrop,
      'DialogBackdrop needs style={{ position: \'fixed\', … }} — its own inline '
        + '`position: absolute` overrides the class, leaving a 0×0 scrim',
    ).toMatch(/style=\{\{[^}]*position:\s*'fixed'/)
    // Offsets too: a fixed box with auto offsets resolves to its static
    // position, which is inside the dimensionless DialogView wrapper.
    for (const side of ['top', 'left', 'right', 'bottom']) {
      expect(backdrop, `the scrim must declare ${side}`).toMatch(
        new RegExp(`style=\\{\\{[^}]*${side}:\\s*0`),
      )
    }
  })

  test('outside taps cancel through the content layer', () => {
    expect(
      openTag(source(), 'DialogContent'),
      'DialogContent needs dialogContentProps={{ bindtap: onCancel }} — the '
        + 'backdrop it covers can never receive the tap',
    ).toMatch(/dialogContentProps=\{\{\s*bindtap:\s*onCancel\s*\}\}/)
  })

  test('the card swallows taps so confirm does not also cancel', () => {
    expect(
      openTag(source(), 'view className=\'confirm-dialog\''),
      'the .confirm-dialog card must catchtap, or button taps bubble into the '
        + 'outside-tap cancel above it',
    ).toMatch(/catchtap=/)
  })
})

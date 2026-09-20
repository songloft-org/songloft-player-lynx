import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from 'vitest'

/**
 * Static assertions on the mini-player stylesheet, in the shape of
 * `play-history-panel-css.test.ts`: the Vitest env has no layout engine, so
 * neither the fixed capsule height nor text truncation can ever be caught by
 * a render test — the rules themselves are the only thing assertable.
 */

const CSS = path.resolve(__dirname, '../widgets/MiniPlayer.css')

/** CSS with comments stripped, so the prose above the rules cannot satisfy
 * these assertions in place of the properties. */
function rules(): string {
  return readFileSync(CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

function block(css: string, selector: string): string {
  const match = new RegExp(`\\${selector}\\s*\\{([^}]*)\}`).exec(css)
  expect(match, `missing rule for ${selector}`).not.toBeNull()
  return match![1]!
}

/**
 * Regression for a long title/artist line wrapping inside the capsule (the
 * screenshot case): both meta lines are one line, ellipsized on overflow.
 *
 * All three properties are load-bearing: `nowrap` alone would push the row
 * past the capsule edge, `overflow: hidden` alone would cut mid-glyph, and
 * `text-overflow: ellipsis` without a clipped box does nothing. The standard
 * trio survives both the native template encode and the web encode.
 */
test('the meta lines are one line, ellipsized on overflow', () => {
  const css = rules()
  for (const selector of ['.mini-player__title', '.mini-player__subtitle']) {
    const line = block(css, selector)
    expect(line, `${selector} must not wrap long text`).toMatch(/white-space:\s*nowrap/)
    expect(line, `${selector} must clip the overflowing line`).toMatch(/overflow:\s*hidden/)
    expect(line, `${selector} must show an ellipsis`).toMatch(/text-overflow:\s*ellipsis/)
  }
})

/**
 * The meta column must be allowed to shrink below its content: a flex item's
 * automatic minimum size would keep the row at content width, so the trio
 * above never triggers — the row just crowds the play button instead.
 */
test('the meta column can shrink below its content', () => {
  expect(block(rules(), '.mini-player__meta')).toMatch(/min-width:\s*0/)
})

/**
 * The capsule's height must not depend on the song metadata — no subtitle,
 * a giant title, any font metrics. The shell sizes the `--nav-inset: 144px`
 * tier against a constant ~53px player (3px progress + 48px row + border);
 * a taller one re-hides list tails under the floating capsule. The exact
 * value is asserted on purpose: changing it means re-checking that inset.
 */
test('the row height is fixed, not content-sized', () => {
  expect(block(rules(), '.mini-player__row')).toMatch(/height:\s*48px/)
  expect(block(rules(), '.mini-player__row'), 'no vertical padding — it would ' +
    'add on top of the fixed height under content-box').toMatch(/padding:\s*0\s/)
})

/**
 * Transport cluster (prev · play/pause · next) must exist so the mini player
 * lets the user skip tracks without opening the full player — the standard
 * mini-bar affordance every major music player ships.
 */
test('the transport cluster exists with flex layout', () => {
  const transport = block(rules(), '.mini-player__transport')
  expect(transport).toMatch(/display:\s*flex/)
  expect(transport).toMatch(/flex-direction:\s*row/)
  expect(transport).toMatch(/flex-shrink:\s*0/)
})

/**
 * Prev/next buttons must use the HIG 44px tap target — same as the play
 * button's hit area, so the three buttons are equally tappable.
 */
test('skip buttons use the HIG tap target', () => {
  const btn = block(rules(), '.mini-player__btn')
  expect(btn).toMatch(/width:\s*var\(--tap-target\)/)
  expect(btn).toMatch(/height:\s*var\(--tap-target\)/)
})

/**
 * Favorite button: hidden on narrow, shown on wide. `display: none` on the
 * base class keeps the DOM element mounted (the hook stays hot) while the
 * `.shell--wide` override reveals it where there is room.
 */
test('favorite is hidden on narrow, visible on wide', () => {
  expect(block(rules(), '.mini-player__favorite')).toMatch(/display:\s*none/)
  expect(block(rules(), '.shell--wide .mini-player__favorite')).toMatch(/display:\s*flex/)
})

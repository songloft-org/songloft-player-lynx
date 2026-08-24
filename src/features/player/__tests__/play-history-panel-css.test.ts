import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from 'vitest'

/**
 * Static assertions on the play-history panel stylesheet, in the shape of
 * `popover-menu-css.test.ts`: the Vitest env has no layout engine, so text
 * truncation can never be caught by a render test — the rules themselves are
 * the only thing assertable.
 */

const CSS = path.resolve(__dirname, '../widgets/PlayHistoryPanel.css')

/** CSS with comments stripped, so the prose above the rules cannot satisfy
 * these assertions in place of the properties. */
function rules(): string {
  return readFileSync(CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

function block(css: string, selector: string): string {
  const match = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`).exec(css)
  expect(match, `missing rule for ${selector}`).not.toBeNull()
  return match![1]!
}

/**
 * Regression for the long-titled panel wrapping its header onto two lines
 * while the Flutter sheet truncates (`maxLines: 1 + TextOverflow.ellipsis`).
 *
 * All three properties are load-bearing: `nowrap` alone would push the header
 * row past the panel edge (a `flex: 1` title keeps its automatic minimum size
 * while overflow is visible), `overflow: hidden` alone would cut mid-glyph,
 * and `text-overflow: ellipsis` without a clipped box does nothing. The
 * standard trio survives both the native template encode and the web encode —
 * only the `-webkit-line-clamp` family is stripped (see
 * `PlaylistDetailPage.css`'s desc rule for that caveat).
 */
test('the panel title is one line, ellipsized on overflow', () => {
  const title = block(rules(), '.play-history__title')
  expect(title, '.play-history__title must not wrap long titles').toMatch(/white-space:\s*nowrap/)
  expect(title, '.play-history__title must clip the overflowing line').toMatch(/overflow:\s*hidden/)
  expect(title, '.play-history__title must show an ellipsis').toMatch(
    /text-overflow:\s*ellipsis/,
  )
})

/**
 * The header row holds two 32px icon buttons (trash + close) next to the
 * `flex: 1` title; without a gap they sit flush against each other.
 */
test('the header row spaces its title and icon buttons', () => {
  expect(block(rules(), '.play-history__header')).toMatch(/gap:\s*var\(--space-2\)/)
})

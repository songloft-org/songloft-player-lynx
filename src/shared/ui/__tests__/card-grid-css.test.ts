import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from 'vitest'

/**
 * The responsive card grids (library facet/folder/tag + playlists) size their
 * cards with `flex: 1 0 var(--grid-card-min); max-width: var(--grid-card-max)`
 * inside a `flex-wrap: wrap` row, and pad the last row with `GridSpacers`.
 *
 * The failure this gates: when the cap binds *before* the row is full, `flex-grow`
 * has nothing left to absorb and the default `justify-content: flex-start` dumps
 * the whole leftover on the right — lopsided, not centered. It shows up on 375pt
 * phones, where the 343px content fits 2 columns rather than 3
 * (3 × 108 + 2 × 12 = 348 > 343): the two cards cap at 128, the row is 268px, and
 * the remaining 75px sits entirely right of them (16px left margin vs 91px right).
 * That is what a screenshot review caught, and no render test can see it, so it is
 * asserted statically here.
 *
 * The second half of the contract is the card/spacer mirror: `GridSpacers` reads
 * the same two custom properties, so a change to a card's basis or cap that skips
 * the spacer would silently make the last row's cards a different width.
 */

const SRC = path.resolve(__dirname, '../../..')

/** CSS with comments removed — prose describing these rules must not count. */
function rules(relPath: string): string {
  return readFileSync(path.join(SRC, relPath), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

function rule(relPath: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const body = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(rules(relPath))?.[1]
  expect(body, `${relPath} must define ${selector}`).toBeTruthy()
  return body!
}

const GRIDS = [
  { selector: '.library__grid', file: 'features/library/pages/LibraryPage.css' },
  { selector: '.playlists__grid', file: 'features/playlist/widgets/PlaylistsView.css' },
]

test.each(GRIDS)('$selector centers the leftover width instead of stacking it right', ({ selector, file }) => {
  const grid = rule(file, selector)
  expect(grid, 'the row must wrap for the column count to adapt').toMatch(/flex-wrap:\s*wrap/)
  expect(
    grid,
    'leftover width must split evenly — without this, the cap leaves it all on the right',
  ).toMatch(/justify-content:\s*center/)
  expect(grid, 'both card-sizing vars belong to the grid container').toMatch(
    /--grid-card-min:\s*108px[\s\S]*-{2}grid-card-max:\s*128px/,
  )
})

/** Card-wrapper rules that the flex sizing must live on, plus the spacer mirror. */
const CARD_BOXES = [
  { selector: '.facet-card', file: 'features/library/pages/LibraryPage.css' },
  { selector: '.playlists__grid-item', file: 'features/playlist/widgets/PlaylistsView.css' },
  { selector: '.grid-spacer', file: 'shared/ui/GridSpacers.css' },
]

test.each(CARD_BOXES)('$selector grows on the shared min basis and stops at the shared cap', ({ selector, file }) => {
  const box = rule(file, selector)
  expect(box).toMatch(/flex:\s*1 0 var\(--grid-card-min/)
  expect(box).toMatch(/max-width:\s*var\(--grid-card-max/)
})

import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

import { expect, test } from 'vitest'

/**
 * P5 playlist list + detail migrations, pinned where they silently regress.
 * A reverted cover size or search height just hardcodes the number again; a
 * reverted radius/typography recolours nothing but reads wrong with no break.
 */
const SRC = resolve(process.cwd(), 'src')
const DETAIL = readFileSync(resolve(SRC, 'features/playlist/pages/PlaylistDetailPage.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
const LIST = readFileSync(resolve(SRC, 'features/playlist/widgets/PlaylistsView.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

function ruleFor(css: string, selector: string): string {
  const escaped = selector.replace(/[.+*?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css)
  expect(m, `no rule for \`${selector}\``).not.toBeNull()
  return m![1]!
}

test('the detail cover is 160×160 with the small radius, and the meta caps at 160', () => {
  const cover = ruleFor(DETAIL, '.playlist-detail__cover')
  expect(cover).toMatch(/width:\s*160px/)
  expect(cover).toMatch(/height:\s*160px/)
  expect(cover).toMatch(/border-radius:\s*var\(--radius-sm\)/)
  expect(ruleFor(DETAIL, '.playlist-detail__meta')).toMatch(/height:\s*160px/)
  // The name stepped up to title2 (22); the stat-style footnote for desc/count.
  expect(ruleFor(DETAIL, '.playlist-detail__name')).toMatch(/font-size:\s*var\(--font-title2\)/)
  expect(ruleFor(DETAIL, '.playlist-detail__desc')).toMatch(/font-size:\s*var\(--font-footnote\)/)
  expect(ruleFor(DETAIL, '.playlist-detail__count')).toMatch(/font-size:\s*var\(--font-footnote\)/)
})

test('the search fields are the Apple control height, filled, and borderless', () => {
  // A border on a filled Apple search field reads as a double outline; the fill
  // IS the field. Both pages' inputs agree.
  for (const css of [DETAIL, LIST]) {
    const sel = css === DETAIL ? '.playlist-detail__search-input' : '.playlists__search-input'
    const input = ruleFor(css, sel)
    expect(input, `${sel}: Apple small control height`).toMatch(/height:\s*var\(--control-height-sm\)/)
    expect(input, `${sel}: filled, not bordered`).toMatch(/background-color:\s*var\(--tertiary-system-fill\)/)
    expect(input, `${sel}: no hairline on a filled field`).not.toMatch(/border(?!-radius)/)
  }
})

test('the card name is subhead, the card cover is responsive-square with the small radius', () => {
  expect(ruleFor(LIST, '.playlist-card__name')).toMatch(/font-size:\s*var\(--font-subhead\)/)
  const cover = ruleFor(LIST, '.playlist-card__cover')
  // Cover tracks the grid-item column width (was fixed 104×104): width:100%
  // fills the .playlists__grid-item wrapper, aspect-ratio:1 keeps it square at
  // any column size. The grid-item carries the grow/cap flex sizing.
  expect(cover, 'cover fills its column, not a fixed 104px').toMatch(/width:\s*100%/)
  expect(cover).toMatch(/aspect-ratio:\s*1/)
  expect(cover).toMatch(/border-radius:\s*var\(--radius-sm\)/)
})

test('no Muse colour aliases survive anywhere in the playlist feature CSS', () => {
  // The whole feature directory was migrated in one sweep; a stray alias here
  // would mean a new file slipped in unmigrated. List every CSS file.
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = join(dir, e.name)
      return e.isDirectory() ? walk(full) : e.name.endsWith('.css') ? [full] : []
    })
  const ALIAS = /var\(--(?:content|content-2|content-muted|paper|line|neutral-faint|primary|primary-content|primary-faint|danger)\)/
  const offenders = walk(join(SRC, 'features/playlist'))
    .map((f) => [f, readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')] as const)
    .filter(([, css]) => ALIAS.test(css))
    .map(([f]) => f.split('/src/')[1])
  expect(offenders.sort(), 'unmigrated Muse colour aliases in playlist CSS').toEqual([])
})

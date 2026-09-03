import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from 'vitest'

/**
 * The `.song-row*` rules were copy-pasted into `LibraryPage.css`,
 * `CategorySongsPage.css` and `PlaylistDetailPage.css`. The router eagerly imports
 * every page, so all three copies landed in the bundle at equal specificity and the
 * winner was decided by source order — and the copies were NOT equivalent (two used
 * `width: 100%`, the playlist one `flex: 1; min-width: 0`). They now live in one
 * place, `features/library/widgets/SongRow.css`, imported by `SongRow.tsx`.
 *
 * No render test can catch a re-forked CSS rule, so this asserts statically: the
 * shared stylesheet still carries the row, and nothing else defines `.song-row*`.
 *
 * Matching note: we search for the literal `.song-row` (dot included). That
 * distinguishes the row's own classes from look-alikes such as
 * `.playlist-detail__song-row-wrapper`, where the dot sits before
 * `playlist-detail`, not before `song-row`.
 */

const SRC = path.resolve(__dirname, '../../..')
const SHARED = 'features/library/widgets/SongRow.css'

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return cssFiles(full)
    return entry.endsWith('.css') ? [path.relative(SRC, full)] : []
  })
}

/** CSS with comments removed — prose mentioning song rows must not count. */
function rules(relPath: string): string {
  return readFileSync(path.join(SRC, relPath), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

test('the shared stylesheet carries the song row', () => {
  const css = rules(SHARED)
  expect(css).toMatch(/\.song-row\s*\{/)
  // The root must fill its box and be allowed to shrink so the meta ellipsis works.
  expect(css).toMatch(/\.song-row\s*\{[^}]*width:\s*100%/)
  expect(css).toMatch(/\.song-row\s*\{[^}]*min-width:\s*0/)
  // The meta column needs min-width:0 or the title/subtitle never ellipsize.
  expect(css).toMatch(/\.song-row__meta\s*\{[^}]*min-width:\s*0/)
  // Current-song highlight.
  expect(css).toMatch(/\.song-row--current \.song-row__title\s*\{[^}]*color:\s*var\(--accent\)/)
})

test('no other file re-forks the .song-row rules', () => {
  const forked = cssFiles(SRC)
    .filter((f) => f !== SHARED)
    .filter((f) => rules(f).includes('.song-row'))
  expect(forked).toEqual([])
})

test('a list that washes selected rows tells the row it is selected', () => {
  /*
   * The wash lives on the wrapper (it has to cover the checkbox column), the
   * text step-up lives on the row (`SongRow.css`), and the only thing joining
   * them is the `isSelected` prop. Forget it in a new list and nothing breaks
   * loudly: the row is washed and its tertiary text quietly sits at 4.14:1.
   */
  const tsx = (function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = path.join(dir, entry)
      if (statSync(full).isDirectory()) return entry === 'node_modules' ? [] : walk(full)
      return entry.endsWith('.tsx') ? [path.relative(SRC, full)] : []
    })
  })(SRC)

  const washingLists = tsx.filter((f) => {
    const src = readFileSync(path.join(SRC, f), 'utf8')
    return /--selected/.test(src) && /<Song(?:ListRow|Row)\b/.test(src)
  })
  // Non-vacuity: the two multi-select lists must be what this finds.
  expect(washingLists.sort()).toEqual([
    'features/library/widgets/FlatSongsView.tsx',
    'features/playlist/pages/PlaylistDetailPage.tsx',
  ])
  for (const f of washingLists) {
    expect(
      readFileSync(path.join(SRC, f), 'utf8'),
      `${f} paints a selection wash but never passes isSelected — see SongRow.css`,
    ).toMatch(/isSelected=\{/)
  }
})

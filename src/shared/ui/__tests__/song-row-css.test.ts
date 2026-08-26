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

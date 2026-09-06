import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import { classTokens, openingTags } from '../shared/testing/jsx-classes.js'

/**
 * Multi-line text clamping belongs on the `text-maxline` attribute, never in
 * business CSS.
 *
 * The `-webkit-box` / `-webkit-box-orient` / `-webkit-line-clamp` trio was
 * written out per surface for a long time, with a comment in each file saying
 * the native template encoder strips it and the `max-height` is the real clamp
 * there. That was accepted as "deliberate cross-platform double-writing", and
 * it is what produced the four pairs of `⚠ Unsupported property … was removed
 * during template encode` warnings on every `pnpm run build` — the class of
 * warning this repo treats as an error (`docs/project/pitfalls.md` §4).
 *
 * It was never necessary. web-elements ships the whole mechanism behind the
 * attribute: `x-text.css` has `x-text[text-maxline] { overflow: hidden }` plus
 * `x-text[text-maxline]::part(inner-box) { display: -webkit-box;
 * -webkit-box-orient: vertical }`, and `XTextTruncation._handleAttributeChange`
 * writes `-webkit-line-clamp` onto that same inner box. Native Lynx supports
 * `text-maxline` directly. So the trio was stripped on one platform and
 * redundant on the other — and worse than redundant on Web, where it landed on
 * the host element and overrode `x-text { display: flex }`.
 *
 * Nothing else catches a relapse: re-adding the trio keeps every existing test
 * green and only shows up as a build *warning*, which is exactly how it
 * survived this long. bugs.md's retired "警告归零" entry already recorded the
 * lesson — 没有闸门读的文档断言不会自己保持为真 — so this is that gate.
 */

const SRC = path.resolve(__dirname, '..')

function walk(dir: string, ext: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full, ext))
    else if (entry.endsWith(ext)) out.push(full)
  }
  return out
}

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

const stylesheets = walk(SRC, '.css').map(file => ({
  file: path.relative(SRC, file),
  css: stripComments(readFileSync(file, 'utf8')),
}))

/**
 * Every `<text …>` opening tag that clamps, with the classes it carries.
 *
 * Comments are stripped from the TSX *before* the scan, and that is
 * load-bearing rather than tidiness: `openingTags` tracks quote state, so a
 * JSX comment sitting between attributes with an apostrophe in its prose
 * (`SongInfoDialog.tsx` has "the stylesheet's calc/vh") flips it and makes the
 * scanner swallow every following tag into one. Without this strip the
 * `<text text-maxline='2'>` in that file is absorbed by the `<view>` above it
 * and simply does not appear in the derived list — green, and blind.
 */
const clampedTags = walk(SRC, '.tsx').flatMap(file =>
  openingTags(stripComments(readFileSync(file, 'utf8')))
    .filter(tag => /^<text[\s>]/.test(tag) && tag.includes('text-maxline'))
    .map(tag => ({
      file: path.relative(SRC, file),
      lines: Number(/text-maxline=['"](\d+)['"]/.exec(tag)?.[1] ?? NaN),
      classes: classTokens(tag),
    })),
)

describe('multi-line clamping rides on text-maxline, not on stripped CSS', () => {
  test('the scan is not empty (guard against every assertion passing vacuously)', () => {
    // A broken walker would make the "no trio anywhere" test below green no
    // matter what the stylesheets say.
    expect(stylesheets.length, 'stylesheet walk found nothing').toBeGreaterThan(30)
    expect(
      stylesheets.map(s => s.file),
      'the four surfaces that used to declare the trio must be in the scan',
    ).toEqual(
      expect.arrayContaining([
        path.join('features', 'playlist', 'pages', 'PlaylistDetailPage.css'),
        path.join('features', 'jsplugin', 'pages', 'PluginManagerPage.css'),
        path.join('features', 'library', 'widgets', 'SongInfoDialog.css'),
        path.join('features', 'player', 'pages', 'LyricAdjustPage.css'),
      ]),
    )
  })

  test('no business stylesheet declares the stripped -webkit clamp trio', () => {
    const offenders = stylesheets
      .filter(s => /-webkit-line-clamp|-webkit-box-orient|display:\s*-webkit-box/.test(s.css))
      .map(s => s.file)
    expect(
      offenders,
      'these properties are removed by the native template encoder (build warning) and are '
        + 'applied by web-elements itself on Web — put `text-maxline` on the <text> instead',
    ).toEqual([])
  })

  test('every clamped <text> carries a line count and a clipped box', () => {
    expect(clampedTags.length, 'no clamped <text> found — did the attribute get dropped?')
      .toBeGreaterThanOrEqual(4)
    for (const tag of clampedTags) {
      expect(tag.lines, `${tag.file}: text-maxline must be a positive line count`)
        .toBeGreaterThan(0)
      // The attribute truncates; the stylesheet still has to clip the box, or a
      // native height cap would show a sliced third line.
      const clipped = tag.classes.some(cls =>
        stylesheets.some(s =>
          new RegExp(`\\.${cls.replace(/[-[\]{}()*+?.\\^$|]/g, '\\$&')}\\s*\\{[^{}]*overflow:\\s*hidden`)
            .test(s.css)
        )
      )
      expect(clipped, `${tag.file}: no rule for ${tag.classes.join('/')} clips the box`).toBe(true)
    }
  })

  test('the four migrated surfaces still clamp', () => {
    // A floor, in the spirit of the a11y gate's ALWAYS_CHECKED: the derived
    // scan above would stay green if a surface silently lost its clamp
    // altogether, since it would simply drop out of the derived list.
    const clampedClasses = new Set(clampedTags.flatMap(t => t.classes))
    for (const cls of [
      'playlist-detail__desc',
      'plugin-manager__desc',
      'song-info-dialog__name',
      'lyric-adjust__line-text',
    ]) {
      expect(clampedClasses, `.${cls} lost its text-maxline clamp`).toContain(cls)
    }
  })
})

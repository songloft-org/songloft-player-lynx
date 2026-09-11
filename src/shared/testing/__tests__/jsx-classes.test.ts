import { describe, expect, test } from 'vitest'

import { classTokens, fileClasses, openingTags } from '../jsx-classes.js'

/**
 * The first direct tests for the shared JSX scanner.
 *
 * It had none, and it feeds two gates that derive their rosters from usage
 * (`a11y-tap-target`, `glass-surface`) plus one that filters tags by element
 * type (`text-clamp`). This repo's own rule is that a derived roster is only as
 * wide as its parser — so the parser needs a gate of its own, or the rule has
 * no teeth.
 *
 * Both bugs pinned here were found from the outside, while chasing something
 * else: the template-interpolation one (recorded in `classTokens`) and the
 * comment one below. Neither showed up as a red test, because a scanner that
 * quietly returns less still returns something.
 *
 * Fixtures are plain single-quoted strings so a JSX backtick or `${` in the
 * subject under test does not have to be escaped into unreadability.
 */

/** The real shape from `SongInfoDialog.tsx`, trimmed to the load-bearing part. */
const APOSTROPHE_COMMENT = [
  '<view',
  '  className=\'song-info-dialog\'',
  '  /*',
  '   * Inline clamps (device): the stylesheet\'s calc/vh is the Web half — on',
  '   * the native engines the viewport-relative units proved unreliable.',
  '   */',
  '  style={{ width: 320 }}',
  '>',
  '  <text className=\'song-info-dialog__name\' text-maxline=\'2\'>',
  '    {data.title}',
  '  </text>',
  '</view>',
].join('\n')

/**
 * The real shape from `MiniPlayer.tsx` (batch 67), trimmed to the trigger: a
 * LINE comment sitting between two attributes, with an apostrophe in its prose.
 */
const LINE_COMMENT_BETWEEN_ATTRIBUTES = [
  '<view',
  '  className=\'mini-player__btn\'',
  '  catchtap={canPrev ? playPrev : undefined}',
  '  // `disabled` rather than `button,disabled`: Lynx\'s converter splits the',
  '  // comma list, but the typed prop is a union of single tokens.',
  '  accessibility-traits={canPrev ? \'button\' : \'disabled\'}',
  '>',
  '  <text className=\'mini-player__label\' text-maxline=\'1\'>',
  '    {song.title}',
  '  </text>',
  '</view>',
].join('\n')

describe('openingTags', () => {
  test('a comment between attributes does not swallow the tags after it', () => {
    // The apostrophe in "the stylesheet's calc/vh" used to flip the quote
    // state, so the scan ran past this tag's `>` and returned ONE tag holding
    // both elements. Everything downstream that asks "which tag is this?" —
    // element type, handler attribution — was answered about the wrong tag.
    const tags = openingTags(APOSTROPHE_COMMENT)
    expect(tags, 'the view and the text are two tags').toHaveLength(2)
    expect(tags[0]).toMatch(/^<view/)
    expect(tags[1]).toMatch(/^<text/)
    expect(
      tags[0],
      'the <text> attributes must not end up inside the <view> tag',
    ).not.toContain('text-maxline')
  })

  test('a LINE comment between attributes is elided as well', () => {
    // The block-comment case above was fixed by eliding only `/* … */`, and the
    // `//` branch was left guarded by `depth > 0` on the stated belief that
    // attribute position cannot hold a line comment — "no valid JSX
    // distinguishes the two". Batch 67 is the counterexample: the TS/Babel JSX
    // parser accepts prose there, and the apostrophe in "Lynx's converter"
    // flipped the quote state, blobbing the rest of `MiniPlayer.tsx` into this
    // very tag. Nothing in THIS file went red; the tap-target gate caught it
    // downstream, as a 36px `.mini-player__play` suddenly reading as tappable.
    const tags = openingTags(LINE_COMMENT_BETWEEN_ATTRIBUTES)
    expect(tags, 'the view and the text are two tags').toHaveLength(2)
    expect(tags[1]).toMatch(/^<text/)
    expect(tags[0], 'comment prose must not survive into the tag').not.toContain('Lynx')
    expect(
      tags[0],
      'the next element must not be swallowed into this tag',
    ).not.toContain('text-maxline')
  })

  test('comment text is elided, not merely skipped over', () => {
    // Skipping would fix the boundaries and still leave the prose in the tag,
    // where every consumer regex reads it as code: `bindtap` in a sentence
    // would make the a11y gate call the element tappable.
    const tags = openingTags(
      '<view /* toggled by bindtap in PluginRow, see .plugin-manager__row */ className=\'x\' />',
    )
    expect(tags).toHaveLength(1)
    expect(tags[0], 'prose must not survive into the tag text').not.toContain('bindtap')
    expect(tags[0], 'the real attribute is still there').toContain('className=\'x\'')
  })

  test('a line comment inside an expression container is elided too', () => {
    const tags = openingTags([
      '<view',
      '  style={{',
      '    // .shell-rail owns the width and its bindtap, this only follows',
      '    width: 320,',
      '  }}',
      '  className=\'shell\'',
      '>',
    ].join('\n'))
    expect(tags).toHaveLength(1)
    expect(classTokens(tags[0]!)).toContain('shell')
    // Asserting only the two lines above would pass with no line-comment
    // handling at all: `//` inside braces breaks neither the boundaries nor
    // `className`. What it does break is what the prose is read as.
    expect(tags[0], 'a class named in a line comment is not usage').not.toContain('shell-rail')
    expect(tags[0], 'a handler named in a line comment is not a handler').not.toContain('bindtap')
  })

  test('a quoted attribute value may contain a `>`', () => {
    // The quote state is what keeps this one tag whole; without it the scan
    // ends at the `>` inside the label and everything after it — including the
    // class — is attributed to a tag that does not exist.
    const tags = openingTags(
      '<text data-label=\'width > 320\' className=\'facet-card__badge\'>',
    )
    expect(tags).toHaveLength(1)
    expect(classTokens(tags[0]!)).toContain('facet-card__badge')
  })

  test('a `//` in an attribute string is a URL, not a comment', () => {
    // Documentation, not a gate: two independent clauses (the quote branch and
    // the `depth > 0` guard) each keep this working on their own, so no single
    // mutation turns it red. Kept because a future reader deleting one of them
    // needs to see the case that motivated both.
    const tags = openingTags('<image src=\'https://example.com/a.png\' className=\'cover\' />')
    expect(tags).toHaveLength(1)
    expect(classTokens(tags[0]!)).toContain('cover')
  })

  test('a `>` inside an arrow function does not end the tag', () => {
    // Pre-existing behaviour, pinned so the comment work above cannot regress
    // it: this is why the scanner exists instead of a `/<[^>]*>/`.
    const tags = openingTags('<view bindtap={() => setCount(n > 0 ? 0 : 1)} className=\'row\' />')
    expect(tags).toHaveLength(1)
    expect(tags[0]).toContain('className=\'row\'')
    expect(classTokens(tags[0]!)).toEqual(['row'])
  })
})

describe('classTokens', () => {
  test('a class named only in a comment is not applied', () => {
    const [tag] = openingTags('<view /* mirrors .ui-backdrop-blur--panel */ className=\'real\' />')
    const tokens = classTokens(tag!)
    expect(tokens).toContain('real')
    expect(tokens, 'a mention is not a usage').not.toContain('ui-backdrop-blur--panel')
  })

  test('template interpolation contributes the base and the modifier', () => {
    // The bug this file's sibling docstring records: the naive version read
    // `song-row${isCurrent` as the first word and dropped the whole roster
    // entry, `.song-row` — a tappable row — included.
    const [tag] = openingTags(
      '<view className={`song-row${isCurrent ? \' song-row--current\' : \'\'}`} bindtap={onTap} />',
    )
    const tokens = classTokens(tag!)
    expect(tokens).toContain('song-row')
    expect(tokens).toContain('song-row--current')
  })

  test('every *ClassName prop counts, not just className', () => {
    const [tag] = openingTags(
      '<Slider thumbClassName=\'player-volume__thumb\' trackClassName=\'player-volume__track\' />',
    )
    expect(classTokens(tag!).sort()).toEqual(['player-volume__thumb', 'player-volume__track'])
  })
})

describe('fileClasses', () => {
  test('unions the classes of every tag in the file, comments excluded', () => {
    const classes = fileClasses(APOSTROPHE_COMMENT)
    expect(classes.has('song-info-dialog')).toBe(true)
    expect(classes.has('song-info-dialog__name')).toBe(true)
  })

  test('the fixture is non-trivial (guard against a scanner that returns nothing)', () => {
    // Without this, a scanner regressed to `return []` passes every
    // `not.toContain` assertion above.
    expect(openingTags(APOSTROPHE_COMMENT).length).toBeGreaterThan(1)
    expect(fileClasses(APOSTROPHE_COMMENT).size).toBeGreaterThan(1)
  })
})

import '@testing-library/jest-dom'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from 'vitest'
import { render } from '@lynx-js/react/testing-library'

import { createMemoryStorage } from '../../../core/storage/index.js'
import { changeFontScale, type FontScaleOption } from '../../theme/font-scale-model.js'

const { Icon, ICON_SCALE_DAMPING, iconScaleFactor } = await import('../Icon.js')

/**
 * Icon font-scale damping gate.
 *
 * Icons pick up HALF the text scale so a glyph stays in step with the label
 * beside it without outgrowing the fixed geometry it sits in — the constants
 * are asserted here, not merely computed, so changing the damping without
 * updating the table (and re-measuring the slots) is a red gate.
 *
 * The second half of the file guards the opt-OUT. The bottom bar and the wide
 * rail pin their glyphs, because a plugin tab's icon is a CSS-sized
 * `<svg>`/`<image>` (`--nav-icon-size`) that the font scale cannot reach: if the
 * built-in glyphs scaled and the plugin ones did not, one bar would show two
 * glyph sizes. That invariant is invisible to every other test, so it is
 * asserted structurally, and so is the 24px box the two kinds of glyph share.
 */

const SRC = path.resolve(__dirname, '../../../..')

/** Source with comments stripped — prose must not be able to satisfy a match. */
function source(rel: string): string {
  return readFileSync(path.join(SRC, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
}

/** Every `<Icon … />` tag in a source file, as its raw text. */
function iconTags(src: string): string[] {
  const tags: string[] = []
  let at = src.indexOf('<Icon')
  while (at !== -1) {
    const close = src.indexOf('/>', at)
    expect(close, `<Icon at offset ${at} is not self-closing`).toBeGreaterThan(at)
    tags.push(src.slice(at, close))
    at = src.indexOf('<Icon', close)
  }
  return tags
}

const storage = createMemoryStorage()
const AT_REST: FontScaleOption = 'default'

/** Amplitude of the glyph box, in px, as the renderer serialized it. */
function renderedBox(size: number, scale?: boolean): number {
  render(<Icon name='check' size={size} testId='probe' scale={scale} />)
  // `elementTree` is the testing-library's global, rebound by `render` (the
  // repo's convention — see `full-player-responsive.test.tsx`).
  const glyph = elementTree.root!.querySelector('[data-testid="probe"]') as HTMLElement
  expect(glyph, 'the icon did not render').toBeTruthy()
  const style = glyph.getAttribute('style') ?? ''
  const width = /width:\s*(\d+(?:\.\d+)?)px/.exec(style)
  expect(width, `no px width in "${style}"`).not.toBeNull()
  return Number(width![1])
}

test('the damping is half the text delta, per option', async () => {
  // The ratio itself, asserted: 1.3 → 1.15 only follows from 0.5.
  expect(ICON_SCALE_DAMPING).toBe(0.5)

  const expected: Record<FontScaleOption, number> = {
    small: 0.925,
    default: 1,
    large: 1.075,
    xlarge: 1.15,
  }

  try {
    for (const option of Object.keys(expected) as FontScaleOption[]) {
      await changeFontScale(option, storage)
      expect(iconScaleFactor(), `factor at ${option}`).toBeCloseTo(expected[option], 10)
    }
  } finally {
    await changeFontScale(AT_REST, storage)
  }
})

test('the default scale renders the declared size unchanged', () => {
  // The whole look of the app at the default setting — every existing
  // measurement, screenshot and pixel assertion — depends on this being exact,
  // not merely close: the factor is 1 and integer sizes must survive it.
  expect(iconScaleFactor()).toBe(1)
  for (const size of [10, 14, 16, 18, 20, 22, 24, 40, 64]) {
    expect(renderedBox(size), `size ${size} at the default scale`).toBe(size)
  }
})

test('a scaled box is damped AND rounded to whole px', async () => {
  try {
    await changeFontScale('xlarge', storage)
    // Damped, not 1:1: 24 × 1.3 would be 31.
    expect(renderedBox(24), '24px at xlarge').toBe(28)
    // Rounded, because fractional boxes blur the stroke: 14 × 1.15 = 16.1.
    expect(renderedBox(14), '14px at xlarge').toBe(16)
    // 10 × 1.15 = 11.5 → 12; the point is that rounding happened at all.
    expect(renderedBox(10), '10px at xlarge').toBe(12)

    await changeFontScale('small', storage)
    // Shrinks too, and settles rather than compounding: 24 × 0.925 = 22.2.
    expect(renderedBox(24), '24px at small').toBe(22)
    // 14 × 0.925 = 12.95 → 13.
    expect(renderedBox(14), '14px at small').toBe(13)
  } finally {
    await changeFontScale(AT_REST, storage)
  }
})

test('scale={false} pins the glyph at the declared size', async () => {
  try {
    await changeFontScale('xlarge', storage)
    expect(
      renderedBox(24, false),
      'a pinned glyph followed the font scale — the fixed slots it exists for '
        + '(the nav capsule, the CSS-sized plugin icons) would break',
    ).toBe(24)
  } finally {
    await changeFontScale(AT_REST, storage)
  }
})

test('every nav destination glyph is pinned', () => {
  // These three render the glyphs of the destinations in the bottom bar, the
  // wide rail and the More sheet — the same set of destinations, whose plugin
  // icons are sized by `--nav-icon-size` in CSS. A built-in glyph that scaled
  // here would show one size for a built-in tab and another for a plugin tab.
  for (const file of [
    'src/shared/layouts/ShellLayout.tsx',
    'src/shared/nav/MoreTabsSheet.tsx',
    'src/features/jsplugin/widgets/PluginTabIcon.tsx',
  ]) {
    const tags = iconTags(source(file))
    expect(tags.length, `${file} renders no <Icon> at all`).toBeGreaterThan(0)
    for (const tag of tags) {
      expect(tag, `${file}: a nav glyph is not pinned to its declared size`)
        .toMatch(/scale=\{false\}/)
    }
  }
})

test('the built-in nav box matches the plugin icon box', () => {
  // `tokens.css` states the invariant — "Built-in nav glyphs and plugin icons
  // share Apple's default 24px box" — but the built-in side is a literal in the
  // TSX while the plugin side is this token, so nothing coupled them until now.
  const css = source('src/shared/theme/tokens.css')
  const token = /--nav-icon-size:\s*(\d+)px/.exec(css)
  expect(token, '--nav-icon-size is missing from tokens.css').not.toBeNull()

  const layout = source('src/shared/layouts/ShellLayout.tsx')
  const sizes = [...layout.matchAll(/<Icon[\s\S]*?size=\{(\d+)\}/g)].map((m) => Number(m[1]))
  expect(sizes.length, 'no built-in nav glyph size found in ShellLayout').toBeGreaterThan(0)
  for (const size of sizes) {
    expect(
      `${size}px`,
      'a built-in nav glyph and the plugin icons no longer share a box',
    ).toBe(`${token![1]}px`)
  }
})

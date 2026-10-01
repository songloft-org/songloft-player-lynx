import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { expect, test } from 'vitest'

/**
 * The rail's geometry contract: the collapse animates ONE edge (the rail's clip)
 * and the content is laid out against a pinned, expanded-size column.
 *
 * Why this is a CSS gate rather than a render assertion. The jitter defect
 * (songloft-org/songloft#487, Flutter desktop sidebar) was exactly this: the
 * content was laid out against the narrowing box, so every frame re-laid-out —
 * icons snapped to the box's centre, labels re-wrapped, and the inspector
 * reported a `RenderFlex overflow`. None of that is visible to a render test,
 * and all of it comes back the moment someone sizes a row to the rail's width
 * again ("just use a percentage"). Every rule below is one of the three ways
 * that regression can be written, so each is pinned where it lives.
 */

const SRC = resolve(process.cwd(), 'src')
const CSS = readFileSync(resolve(SRC, 'shared/layouts/ShellLayout.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

/** Body of the first rule whose selector matches exactly. */
function ruleFor(selector: string): string {
  const escaped = selector.replace(/[.+*?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(CSS)
  expect(m, `ShellLayout.css has no rule for \`${selector}\``).not.toBeNull()
  return m![1]!
}

test('the rail animates its own width and clips the fixed-size content', () => {
  const wide = ruleFor('.shell--wide')
  expect(wide, 'the rail footprint must be tokenised')
    .toMatch(/--rail-width:\s*\d+px/)
  expect(wide, 'the collapsed footprint must be tokenised')
    .toMatch(/--rail-collapsed-width:\s*\d+px/)

  const rail = ruleFor('.shell__rail')
  expect(rail, 'the rail width is the animated value')
    .toMatch(/width:\s*var\(--rail-width\)/)
  expect(rail, 'the rail must clip its overhanging content')
    .toMatch(/overflow:\s*hidden/)
  expect(rail, 'the width change is a tokenised transition')
    .toMatch(/transition:\s*width\s+var\(--duration-[a-z]+\)\s+var\(--ease-[a-z]+\)/)

  expect(ruleFor('.shell--rail-collapsed .shell__rail'))
    .toMatch(/width:\s*var\(--rail-collapsed-width\)/)
})

test('the rail content is pinned to the EXPANDED width until the collapse', () => {
  const inner = ruleFor('.shell__rail-inner')
  expect(inner, 'the content column starts at the expanded width')
    .toMatch(/width:\s*var\(--rail-content-width\)/)
  // The collapse animates THIS edge (the rail's own `width` would be swallowed
  // by the fixed-size content, since the content is what defines the visible
  // boundary). Both change by the same 176px, so the padding on either side is
  // preserved and the glyph column's left edge never moves.
  expect(inner, 'the collapse animates the content column, not the rail box')
    .toMatch(/transition:\s*width\s+var\(--duration-[a-z]+\)\s+var\(--ease-[a-z]+\)/)
  expect(ruleFor('.shell--rail-collapsed .shell__rail-inner'),
    'collapsed, the column is exactly the glyph column')
    .toMatch(/width:\s*var\(--rail-glyph-column\)/)
})

test('rail rows keep a fixed pill and a fixed label column', () => {
  const pill = ruleFor('.shell--wide .nav-item__pill')
  expect(pill, 'the pill must NOT be sized to the rail (no flex: 1)')
    .not.toMatch(/flex:\s*1\s*;/)
  expect(pill, 'the pill is pinned to the expanded content width')
    .toMatch(/width:\s*var\(--rail-content-width\)/)

  const label = ruleFor('.shell--wide .nav-item__label')
  expect(label, 'the label column is pinned so the text never re-wraps')
    .toMatch(/width:\s*var\(--rail-label-width\)/)
  expect(label, 'and it fades with a tokenised transition, never a raw duration')
    .toMatch(/transition:\s*opacity\s+var\(--duration-[a-z]+\)\s+var\(--ease-[a-z]+\)/)
})

test('the rail glyph is pinned against being shrunk away', () => {
  // The pill narrows to 48 while its label column stays a fixed 164, so the
  // overflow is 176px larger than the box. Flex hands that to whichever child
  // can still shrink — and the icon can, unless it is pinned. Measured in the
  // browser before this rule existed: `.nav-item__icon` came back 24px wide when
  // expanded and **0px** when collapsed, so the icon-only rail showed no icons.
  expect(ruleFor('.shell--wide .nav-item__icon'))
    .toMatch(/flex:\s*none/)
})

test('the collapsed pill shrinks to the glyph column so the clip never slices it', () => {
  // A 164px-wide rect inside an 80px rail would be sliced mid-way; the pill is
  // narrowed to exactly the glyph column instead.
  expect(ruleFor('.shell--rail-collapsed .nav-item__pill'))
    .toMatch(/width:\s*var\(--rail-glyph-column\)/)
  // The rail foot's row wears the same classes, so it is covered by the rule
  // above rather than needing a second one.
  expect(CSS, 'the foot row must not carry a redundant second pill rule')
    .not.toMatch(/\.shell--rail-collapsed \.shell__rail-foot \.nav-item__pill/)
})

test('labels hide when collapsed, ahead of the clip edge', () => {
  // --duration-fast (150ms) inside the rail's --duration-normal (250ms): text is
  // gone before the edge reaches it, so nothing is ever sliced in half.
  const label = ruleFor('.shell--rail-collapsed .nav-item__label')
  expect(label, 'labels hide when the rail is collapsed').toMatch(/opacity:\s*0/)
  expect(label, 'and must stop taking part in hit-testing / ellipsis')
    .toMatch(/visibility:\s*hidden/)
  const brand = ruleFor('.shell--rail-collapsed .shell__brand-text')
  expect(brand, 'the wordmark hides too').toMatch(/opacity:\s*0/)
  expect(brand).toMatch(/visibility:\s*hidden/)
})

test('the wordmark cannot wrap while the column narrows', () => {
  // Measured on the built bundle before this rule existed: with the rail
  // collapsed the wordmark "Songloft" wrapped into EIGHT stacked lines inside
  // the 48px column, growing `.shell__brand` from 36px to 224px and pushing
  // every glyph below it down by 188px — the "图标位置错乱" this whole batch is
  // about. Row labels already carry `nowrap`; the wordmark is the other text
  // node outside the rows (the 插件 header, the third one, is gone entirely —
  // see shell-nav-css.test.ts).
  expect(ruleFor('.shell__brand-text'), 'the wordmark must stay on one line')
    .toMatch(/white-space:\s*nowrap/)
  expect(ruleFor('.shell__brand-text'), 'and must not be shrunk by the row box')
    .toMatch(/flex:\s*none/)
})

test('the collapsed rules can actually match (the two classes share an element)', () => {
  // `shell--wide` and `shell--rail-collapsed` are BOTH put on the shell root, so
  // a descendant combinator between them (`.shell--rail-collapsed .shell--wide`)
  // matches nothing and every declaration inside it is silently dead. That is
  // exactly how the collapsed label/pill rules shipped inert, and no render test
  // could see it — the markup was right, the state was right, only the selector
  // was impossible. Hence a gate on the selector shape itself.
  const impossible = [...CSS.matchAll(
    /\.shell--rail-collapsed\s+\.shell--wide[^{]*\{/g,
  )].map((m) => m[0].trim())
  expect(
    impossible,
    'these selectors can never match — the classes are on the same element:\n  '
    + impossible.join('\n  '),
  ).toEqual([])

  // Positive control: the collapsed rules must live under the shell root alone.
  expect(CSS).toMatch(/\.shell--rail-collapsed \.shell__rail\s*\{/)
  expect(CSS).toMatch(/\.shell--rail-collapsed \.nav-item__pill\s*\{/)
})

test('the rail foot glyph flips to point the way the rail will move', () => {
  // Collapsed, the sidebar-panel glyph is 180°-rotated: a left panel becomes a
  // right panel, i.e. "expand" — the platform sidebars' own icon language and
  // the Flutter client's behaviour.
  expect(ruleFor('.shell__rail-foot .nav-item__icon'))
    .toMatch(/transition:\s*transform\s+var\(--duration-[a-z]+\)\s+var\(--ease-[a-z]+\)/)
  expect(ruleFor('.shell--rail-collapsed .shell__rail-foot .nav-item__icon'))
    .toMatch(/transform:\s*rotate\(180deg\)/)
})

test('the collapsed footprint puts the glyph column on the rail centre line', () => {
  // Collapsed width = 2 × the nav glyph's centre, i.e.
  //   2 × (16 rail padding + 12 pill padding + 12 half of the 24px glyph) = 80.
  // Deriving the number from the paddings is what lets "clip the expanded
  // layout" land on the collapsed design exactly — there is no second layout to
  // snap to at the end of the move, which is where a hand-picked width drifts
  // the moment someone retunes --space-4.
  const tokens = readFileSync(resolve(SRC, 'shared/theme/tokens.css'), 'utf8')
  const token = (name: string): number =>
    Number(new RegExp(`--${name}:\\s*(\\d+)px`).exec(tokens)![1])

  const railPadding = token('space-4')
  const pillPadding = token('space-3')
  const glyph = token('nav-icon-size')
  const collapsed = Number(
    /--rail-collapsed-width:\s*(\d+)px/.exec(ruleFor('.shell--wide'))![1],
  )

  expect(collapsed).toBe(2 * (railPadding + pillPadding + glyph / 2))
  // …and the pill's padding is the one that number assumed.
  expect(ruleFor('.shell--wide .nav-item__pill'))
    .toMatch(/padding:\s*var\(--space-2\)\s+var\(--space-3\)/)
})

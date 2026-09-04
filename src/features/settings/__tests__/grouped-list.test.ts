import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { expect, test } from 'vitest'

/**
 * The Apple inset-grouped list, pinned where it can silently come apart.
 *
 * Three claims in this batch are structural rather than cosmetic, and each one
 * fails quietly if a later change forgets it:
 *
 *  1. **The separator inset lives on `.settings-row__content`.** Apple insets a
 *     grouped separator to where the row's text starts. A `border-top` on the row
 *     itself is always full-bleed, so the row is `[icon][content]` and the border
 *     rides `__content`. A row component that renders `.settings-row` WITHOUT the
 *     wrapper still looks right on its own and breaks the run of hairlines around
 *     it — visible only in a mixed card, which no unit test renders.
 *  2. **The card has no border.** It is defined by the contrast between
 *     `--secondary-system-grouped-background` and the page's
 *     `--system-grouped-background`; a hairline on top of that reads as a double
 *     outline.
 *  3. **Only card-bearing sub-pages get the grouped page colour.** Seven of the
 *     sixteen sub-pages have no cards; a grey page there would put content
 *     straight onto the grouped background with nothing raised above it.
 */

const SRC = resolve(__dirname, '../../..')
const SETTINGS_CSS = readFileSync(
  join(SRC, 'features/settings/widgets/Settings.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '')

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : tsxFiles(full)
    return entry.name.endsWith('.tsx') ? [full] : []
  })
}

/** Source of every non-test `.tsx`, comments stripped, keyed by repo-relative path. */
function sources(): Array<[string, string]> {
  return tsxFiles(SRC).map((file) => [
    file.slice(SRC.length + 1),
    readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''),
  ])
}

/** One CSS rule body by exact selector. */
function ruleFor(selector: string): string {
  const escaped = selector.replace(/[.+*?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(SETTINGS_CSS)
  expect(m, `Settings.css has no rule for \`${selector}\``).not.toBeNull()
  return m![1]!
}

test('every component that renders a settings row also renders the content wrapper', () => {
  const renderers = sources().filter(([, src]) => /'settings-row'/.test(src))
  // Non-vacuity: the two row components must be found, or the probe has drifted
  // away from how the class is spelled and this test is asserting nothing.
  expect(renderers.map(([file]) => file).sort()).toEqual([
    'features/settings/widgets/SettingsRow.tsx',
    'features/settings/widgets/SwitchRow.tsx',
  ])
  const missing = renderers
    .filter(([, src]) => !/settings-row__content/.test(src))
    .map(([file]) => file)
  expect(
    missing,
    'a row without `.settings-row__content` carries no separator, so it breaks the '
      + 'run of hairlines in any card it shares — see Settings.css for the derivation',
  ).toEqual([])
})

test('the separator rides the content wrapper, not the row', () => {
  // The regression this rejects is the obvious "simplification": moving the border
  // back onto `.settings-row + .settings-row`, which is full-bleed again.
  expect(
    SETTINGS_CSS,
    'the inset separator rule is gone — the hairlines are either missing or full-bleed',
  ).toMatch(/\.settings-row \+ \.settings-row \.settings-row__content\s*\{[^}]*border-top/)

  const bareSibling = /(?:^|\})\s*\.settings-row \+ \.settings-row\s*\{([^}]*)\}/m
    .exec(SETTINGS_CSS)
  expect(
    bareSibling?.[1] ?? '',
    'a border on the bare adjacent-sibling rule is full-bleed; it belongs on __content',
  ).not.toMatch(/border/)
})

test('the row geometry is what makes the inset possible', () => {
  const row = ruleFor('.settings-row')
  // Horizontal inset only: the vertical padding has to be inside __content so the
  // border lands on the row boundary, and a full-height row is what lets --active
  // paint a full-bleed highlight.
  expect(row, '.settings-row must not carry vertical padding').toMatch(
    /padding:\s*0\s+var\(--space-4\)/,
  )
  expect(row, '__content must fill the row height for its border to sit at the edge')
    .toMatch(/align-items:\s*stretch/)

  const content = ruleFor('.settings-row__content')
  expect(content, 'the HIG tap target is also Apple\'s single-line grouped row height')
    .toMatch(/min-height:\s*var\(--tap-target\)/)
})

test('the grouped card is defined by contrast, not by a hairline', () => {
  const card = ruleFor('.settings-section__card')
  expect(card).toMatch(/background-color:\s*var\(--secondary-system-grouped-background\)/)
  expect(card).toMatch(/border-radius:\s*var\(--radius-grouped\)/)
  expect(
    card,
    'a border on top of the page/card contrast reads as a double outline',
  ).not.toMatch(/border(?!-radius)/)
})

test('the grouped page colour is set exactly where there are cards', () => {
  const withShell = sources().filter(([, src]) => /<SubPageShell/.test(src))
  // Non-vacuity: this only means anything while the shell is actually in use, and
  // while both kinds of page exist to be told apart.
  expect(withShell.length, 'no <SubPageShell> call sites found').toBeGreaterThanOrEqual(12)

  const wrong: string[] = []
  for (const [file, src] of withShell) {
    // The opening tag only — a `grouped` mention elsewhere in the file must not count.
    const tag = /<SubPageShell\b[\s\S]*?>/.exec(src)?.[0] ?? ''
    const passesGrouped = /\bgrouped\b/.test(tag)
    const hasCards = /<SettingsSection\b/.test(src)
    if (hasCards !== passesGrouped) {
      wrong.push(`${file}: cards=${hasCards} grouped=${passesGrouped}`)
    }
  }
  expect(
    wrong.sort(),
    'a page with SettingsSection cards needs `grouped` (the cards are invisible '
      + 'against a matching page), and a page without them must not have it (content '
      + 'would sit straight on the grouped background with nothing raised above it)',
  ).toEqual([])

  // …and both kinds must be present, or the equality above is trivially satisfied.
  const grouped = withShell.filter(([, s]) => /<SettingsSection\b/.test(s)).length
  expect(grouped, 'some sub-pages must be grouped').toBeGreaterThanOrEqual(5)
  expect(withShell.length - grouped, 'and some must be plain').toBeGreaterThanOrEqual(5)
})

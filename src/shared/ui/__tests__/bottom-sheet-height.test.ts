import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

/**
 * Bottom sheets must not collapse to their header row.
 *
 * All of them share one shape: a `position: absolute` panel pinned with
 * `left`/`right`/`bottom` (no `top`), inside a `position: fixed` root. With no
 * `top` and no `height`, such a box is sized **shrink-to-fit** — by its content.
 * So a panel whose scrolling body carries `flex-basis: 0` (i.e. `flex: 1`) has a
 * content height of just its chrome, and any `max-height` ceiling is never
 * approached. That is not a Lynx quirk; Web only survived it because
 * web-elements resolves `x-view` heights differently.
 *
 * Two shapes are therefore legal, and this gate accepts either:
 *
 *  - **fixed footprint** — the panel declares `height: X%` (proven on-device by
 *    add-to-playlist), or
 *  - **hug the content** — the body keeps `flex-basis: auto`, so content sizes the
 *    panel and `max-height` only clamps the overflow case.
 *
 * What it rejects is the combination that shipped broken: a panel sized only by
 * `max-height` whose body has a zero basis.
 */

const ROOT = join(import.meta.dirname, '../../..')

interface Sheet {
  name: string
  css: string
  /** The panel rule that positions the sheet. */
  panel: string
  /** The scrolling body inside the panel. */
  body: string
}

const SHEETS: Sheet[] = [
  {
    name: 'play history',
    css: 'features/player/widgets/PlayHistoryPanel.css',
    panel: '.play-history__panel',
    body: '.play-history__list',
  },
  {
    name: 'more tabs',
    css: 'shared/nav/MoreTabsSheet.css',
    panel: '.more-tabs__panel',
    body: '.more-tabs__list',
  },
  {
    name: 'playlist description',
    css: 'features/playlist/widgets/PlaylistDescPanel.css',
    panel: '.playlist-desc__panel',
    body: '.playlist-desc__scroll',
  },
  {
    name: 'add to playlist',
    css: 'features/playlist/widgets/AddToPlaylistSheet.css',
    panel: '.atp__panel',
    body: '.atp__list',
  },
  {
    name: 'playlist drawer (queue)',
    css: 'features/player/widgets/SheetShell.css',
    panel: '.drawer__panel--queue',
    body: '.drawer__list',
  },
  {
    name: 'sleep timer',
    css: 'features/player/widgets/SheetShell.css',
    panel: '.drawer__panel--sleep',
    body: '.drawer__list',
  },
]

/** Body of a top-level rule, comments stripped. */
function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css)
  if (!match) throw new Error(`rule ${selector} not found`)
  return match[1].replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('bottom sheets are not sized only by max-height over a zero-basis body', () => {
  for (const sheet of SHEETS) {
    it(`${sheet.name}: panel has a height source`, () => {
      const css = readFileSync(join(ROOT, sheet.css), 'utf8')
      const panel = ruleBody(css, sheet.panel)
      const body = ruleBody(css, sheet.body)

      const panelHasHeight = /(^|[\s;])height:/.test(panel)
      // `flex: 1` / `flex: 1 1 0` / an explicit `flex-basis: 0` all mean zero basis.
      const bodyZeroBasis =
        /(^|[\s;])flex:\s*1(\s|;|$)/.test(body) ||
        /(^|[\s;])flex:\s*\d+\s+\d+\s+0/.test(body) ||
        /(^|[\s;])flex-basis:\s*0/.test(body)

      // The broken combination: no height on the panel AND a zero-basis body.
      expect(
        panelHasHeight || !bodyZeroBasis,
        `${sheet.panel} has no \`height\` and ${sheet.body} has a zero flex-basis — ` +
          'the panel will collapse to its chrome on the native engines. Give the ' +
          'panel `height: X%`, or let the body keep `flex-basis: auto`.',
      ).toBe(true)
    })

    it(`${sheet.name}: a hugging body can still shrink to scroll`, () => {
      const css = readFileSync(join(ROOT, sheet.css), 'utf8')
      const panel = ruleBody(css, sheet.panel)
      const body = ruleBody(css, sheet.body)
      if (/(^|[\s;])height:/.test(panel)) return // fixed-footprint sheets are unaffected

      // Hugging sheets rely on the body shrinking past its content when the cap
      // bites; without `min-height: 0` its automatic minimum size prevents that
      // and the panel is pushed past its own max-height instead of scrolling.
      expect(
        /min-height:\s*0/.test(body),
        `${sheet.body} sizes its panel by content, so it needs \`min-height: 0\` to ` +
          'shrink into a scroll instead of overflowing the panel.',
      ).toBe(true)
    })
  }
})

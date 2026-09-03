import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

/**
 * Structural gate for the player's backdrop.
 *
 * None of this is visible to a render test — the DOM is identical whether the image
 * is blurred or razor sharp, whether the veil is opaque enough to read text on, and
 * whether the whole thing paints over the controls or under them. Nor to a screenshot
 * of the one theme you happened to look at.
 *
 * Comments are stripped before every assertion. `popover-menu-css.test.ts` learned
 * this the hard way: a `.toContain('...')` gate passed because the string it wanted
 * appeared in a comment explaining why the rule mattered, while the rule itself had
 * been deleted.
 */

const CSS_DIR = path.resolve(__dirname, '../widgets')

function sheet(name: string): string {
  return readFileSync(path.join(CSS_DIR, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Declarations of one top-level rule, as a `prop → value` map. */
function rule(css: string, selector: string): Record<string, string> {
  const re = new RegExp(`(?:^|\\})\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`)
  const m = css.match(re)
  expect(m, `rule ${selector} not found`).not.toBeNull()
  const out: Record<string, string> = {}
  for (const decl of m![1]!.split(';')) {
    const i = decl.indexOf(':')
    if (i < 0) continue
    out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim()
  }
  return out
}

const BACKDROP = sheet('PlayerBackdrop.css')

describe('the blurred cover stays blurred', () => {
  const img = rule(BACKDROP, '.player-backdrop__img')

  test('the image is actually blurred, by a non-trivial radius', () => {
    // A sharp full-bleed cover behind the controls is a different (and much worse)
    // design than the one that was signed off, and `filter` is the sort of line that
    // gets dropped as a "performance win".
    const blur = /blur\(\s*([\d.]+)px\s*\)/.exec(img['filter'] ?? '')
    expect(blur, `.player-backdrop__img needs filter: blur(Npx), got ${img['filter']}`)
      .not.toBeNull()
    expect(Number(blur![1])).toBeGreaterThanOrEqual(16)
  })

  test('the image is scaled past the clip so its feathered edges are hidden', () => {
    // Blur fades the outer pixels to transparent; unscaled, that shows as a halo of
    // bare canvas around all four sides.
    const scale = /scale\(\s*([\d.]+)\s*\)/.exec(img['transform'] ?? '')
    expect(scale, `.player-backdrop__img needs transform: scale(N), got ${img['transform']}`)
      .not.toBeNull()
    expect(Number(scale![1])).toBeGreaterThan(1)
  })

  test('the container clips, or the scale above leaks past the viewport', () => {
    expect(rule(BACKDROP, '.player-backdrop')['overflow']).toBe('hidden')
  })
})

describe('the cover keeps its colour', () => {
  const vivid = rule(BACKDROP, '.player-backdrop__vivid')

  test('saturation is boosted, in its own element', () => {
    // Lynx takes exactly one filter function per declaration and the image spends its
    // one on blur, so the boost has to nest. Collapsing both onto one element silently
    // drops one of them — which looks like "the blur stopped working" on device.
    const sat = /saturate\(\s*([\d.]+)\s*\)/.exec(vivid['filter'] ?? '')
    expect(sat, `.player-backdrop__vivid needs filter: saturate(N), got ${vivid['filter']}`)
      .not.toBeNull()
    expect(Number(sat![1])).toBeGreaterThan(1)
  })

  test('the wrapper is full-bleed, or it crops the scaled image', () => {
    // The image sizes itself at 100% of this box and scales past it. A wrapper smaller
    // than the whole backdrop moves the crop inward and brings the feathered edges the
    // scale exists to hide back into view.
    expect(vivid['position']).toBe('absolute')
    for (const side of ['left', 'right', 'top', 'bottom']) {
      expect(vivid[side], `.player-backdrop__vivid needs ${side}: 0`).toBe('0')
    }
  })
})

describe('the veil is a gradient built from the theme tokens', () => {
  const scrim = rule(BACKDROP, '.player-backdrop__scrim')

  test('it is a vertical gradient between the two scrim tokens', () => {
    const value = scrim['background-image'] ?? ''
    expect(value).toMatch(/linear-gradient\(/)
    // Tokens, not literals: the veil has to be the canvas colour of the *current*
    // theme. A hardcoded rgba would be right in one theme and inverted in the other.
    expect(value).toContain('var(--player-scrim-from)')
    expect(value).toContain('var(--player-scrim-to)')
  })
})

describe('the backdrop paints under the player, not over it', () => {
  test('backdrop z-index is below the content layer', () => {
    const backdropZ = Number(rule(BACKDROP, '.player-backdrop')['z-index'])
    const layerZ = Number(
      rule(sheet('../pages/FullPlayerPage.css'), '.full-player__layer')['z-index'],
    )
    expect(Number.isFinite(backdropZ), '.player-backdrop needs an explicit z-index').toBe(true)
    expect(Number.isFinite(layerZ), '.full-player__layer needs an explicit z-index').toBe(true)
    expect(backdropZ).toBeLessThan(layerZ)
  })

  test('both z-indexes are non-negative', () => {
    // A negative z-index would escape `.full-player` (not a stacking context) and
    // land behind `.theme-root`'s opaque canvas — i.e. invisible, with no warning.
    expect(Number(rule(BACKDROP, '.player-backdrop')['z-index'])).toBeGreaterThanOrEqual(0)
  })
})

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from 'vitest'

/**
 * Liquid Glass surface gate (A path).
 *
 * Step 0 of `docs/project/plans/liquid-glass-theme.md` verified — via a
 * headless-Chrome probe on a throwaway surface — that Lynx's style pipeline
 * keeps `box-shadow: inset` and multi-value (drop + inset) shadows, so the
 * glass sheen is done in pure CSS with no TSX structural change.
 *
 * The two failure modes this gate exists to catch are both **silent**:
 *
 *  - a surface reverted to `--paper`/`--paper-clear` reads as an ordinary
 *    opaque card — no error, just no glass, and the only signal is "it looks
 *    less like the design" (the same class of regression `tokens-defined.test.ts`
 *    exists for);
 *  - the `inset` keyword dropped from a `box-shadow` is stripped without a
 *    warning (the exact risk the spike measured), leaving the sheen gone while
 *    the declaration stays syntactically valid.
 *
 * So the gate locks the load-bearing facts per surface: a `--glass-fill*`
 * background AND an `inset` box-shadow. It does not pin the exact shadow
 * value — only that the sheen primitive is present.
 *
 * The same two surfaces later gained the depth stack — a `background-image`
 * carrying the sheen and luminance ramp, and side rims in the shadow list —
 * which fails the same way: drop either and the CSS stays valid, the surface
 * just flattens back to a tinted rectangle. Those are asserted as *composite
 * token references* rather than literal colours, because every alpha in them is
 * derived from the contrast budget in `theme/__tests__/contrast.test.ts`; a
 * surface that inlines its own gradient escapes that derivation silently.
 */

const SHARED = path.resolve(__dirname, '../../..') // src/

interface Surface {
  file: string
  selector: string
  /** Background token the surface must use (glass fill, not --paper). */
  fill: RegExp
}

const SURFACES: Surface[] = [
  {
    file: 'shared/layouts/ShellLayout.css',
    selector: '.shell__bottombar',
    fill: /var\(--glass-fill\)/,
  },
  {
    file: 'features/player/widgets/MiniPlayer.css',
    selector: '.mini-player',
    fill: /var\(--glass-fill\)/,
  },
  {
    file: 'shared/ui/PopoverMenu.css',
    selector: '.popover-menu',
    fill: /var\(--glass-fill-strong\)/,
  },
  {
    file: 'shared/ui/ConfirmDialog.css',
    selector: '.confirm-dialog',
    fill: /var\(--glass-fill-strong\)/,
  },
  {
    file: 'features/player/widgets/SheetShell.css',
    selector: '.drawer__panel',
    fill: /var\(--glass-fill-strong\)/,
  },
]

function rules(file: string): string {
  return readFileSync(path.join(SHARED, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

function block(css: string, selector: string): string {
  const match = new RegExp(`${selector.replace(/[.]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)
  expect(match, `missing rule for ${selector} in its file`).not.toBeNull()
  return match![1]!
}

test.each(SURFACES)(
  '$selector uses a glass fill (not --paper) and an inset sheen',
  ({ file, selector, fill }) => {
    const css = rules(file)
    const body = block(css, selector)
    // A reverted surface (opaque --paper/--paper-clear) is the silent regression.
    expect(body, `${selector} must use a --glass-fill* background`).toMatch(fill)
    expect(body, `${selector} must not fall back to --paper`).not.toMatch(/var\(--paper\)/)
    expect(body, `${selector} must not fall back to --paper-clear`).not.toMatch(
      /var\(--paper-clear\)/,
    )
    // The sheen primitive the spike verified — if `inset` is stripped, the
    // declaration stays valid but the highlight is gone.
    expect(body, `${selector} must carry an inset box-shadow sheen`).toMatch(/box-shadow:[\s\S]*inset/)
    // Depth stack: both layers, in this order (sheen paints over the ramp).
    expect(body, `${selector} must layer the sheen over the ramp`).toMatch(
      /background-image:\s*var\(--glass-sheen-layer\),\s*var\(--glass-ramp\)/,
    )
    // Side rims complete the perimeter the top highlight starts; without them
    // the bevel reads as a single bright line rather than a lit edge.
    expect(body, `${selector} must carry the side rims`).toMatch(
      /box-shadow:[\s\S]*var\(--glass-rim-sides\)/,
    )
  },
)

test('the nav capsule selection tint is the glass glow, not the ink wash', () => {
  // The selected pill switched from --primary-faint (ink/seed) to
  // --glass-glow-faint (the decorative personality tint). Reverting it would
  // recolour selection silently.
  const css = rules('shared/layouts/ShellLayout.css')
  const pill = block(css, '.nav-item--active .nav-item__pill')
  expect(pill).toMatch(/var\(--glass-glow-faint\)/)
  expect(pill).not.toMatch(/var\(--primary-faint\)/)
})

test('the ten glass tokens are declared in both themes', () => {
  const tokens = readFileSync(path.join(SHARED, 'shared/theme/tokens.css'), 'utf8')
  for (const which of ['dark', 'light'] as const) {
    const blockMatch = new RegExp(`\\.theme-root\\.theme-${which}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`).exec(tokens)
    expect(blockMatch, `theme-${which} block exists`).not.toBeNull()
    const body = blockMatch![1]!
    for (const token of [
      '--glass-fill',
      '--glass-fill-strong',
      '--glass-border',
      '--glass-highlight',
      '--glass-glow',
      '--glass-glow-faint',
      '--glass-sheen',
      // The depth stack's atomic inputs. The composites that combine them
      // (`--glass-rim-sides`, `--glass-ramp`, `--glass-sheen-layer`) live once
      // in `.theme-root` and resolve their nested var()s per theme, so they are
      // asserted there instead — see contrast.test.ts.
      '--glass-rim-side',
      '--glass-ramp-top',
      '--glass-ramp-bottom',
    ]) {
      expect(body, `${token} declared in theme-${which}`).toMatch(
        new RegExp(`${token.replace(/-/g, '\\-')}\\s*:`),
      )
    }
  }
})

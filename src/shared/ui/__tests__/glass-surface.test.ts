import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from 'vitest'

import { fileClasses } from '../../testing/jsx-classes.js'

/**
 * Liquid Glass surface gate (A path).
 *
 * Step 0 of `docs/archive/plans/liquid-glass-theme.md` verified — via a
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
 * So the gate locks the load-bearing facts per surface: a `--material-fill*`
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
  rimOnly?: boolean
  /** Capsules paint their material as a sibling above the native blur. */
  childMaterial?: boolean
}

const SURFACES: Surface[] = [
  {
    file: 'shared/layouts/ShellLayout.css',
    selector: '.shell__bottombar',
    fill: /var\(--material-fill\)/,
    childMaterial: true,
    rimOnly: true,
  },
  {
    file: 'features/player/widgets/MiniPlayer.css',
    selector: '.mini-player',
    fill: /var\(--material-fill\)/,
    childMaterial: true,
    rimOnly: true,
  },
  {
    file: 'shared/ui/PopoverMenu.css',
    selector: '.popover-menu',
    fill: /var\(--material-fill-menu\)/,
    rimOnly: true,
  },
  {
    file: 'shared/ui/ConfirmDialog.css',
    selector: '.confirm-dialog',
    fill: /var\(--material-fill-elevated\)/,
  },
  {
    file: 'features/player/widgets/SheetShell.css',
    selector: '.drawer__panel',
    fill: /var\(--material-fill-elevated\)/,
  },
  {
    // Added late, and the reason it was late is the point: this panel kept
    // `var(--paper)` through both glass batches and was the only floating surface
    // in the app left opaque — a flat card beside the very popovers its own CSS
    // comment claimed it matched. It is here so "the surface reverted to --paper"
    // is a failure for the song menu too, not just for the five that were listed.
    file: 'shared/ui/GlobalMenu.css',
    selector: '.global-menu__panel',
    fill: /var\(--material-fill-elevated\)/,
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
  ({ file, selector, fill, rimOnly, childMaterial }) => {
    const css = rules(file)
    const shell = block(css, selector)
    const body = childMaterial
      ? block(rules('shared/ui/BackdropBlur.css'), '.ui-capsule-material')
      : shell
    if (childMaterial) {
      expect(shell).toMatch(/background-color:\s*transparent/)
      expect(shell).not.toMatch(/background-image:/)
      expect(shell).toMatch(/box-shadow:\s*var\(--shadow-md\)/)
    }
    // A reverted surface (an opaque card colour instead of the glass fill) is the
    // silent regression. Both the legacy alias and the Apple token it now points
    // at are named: once a screen migrates off `--paper` the alias stops appearing,
    // and a guard that only knew the old name would quietly stop biting.
    expect(body, `${selector} must use a --material-fill* background`).toMatch(fill)
    expect(body, `${selector} must not fall back to --paper`).not.toMatch(/var\(--paper\)/)
    expect(body, `${selector} must not fall back to --paper-clear`).not.toMatch(
      /var\(--paper-clear\)/,
    )
    expect(
      body,
      `${selector} must not fall back to --secondary-system-background`,
    ).not.toMatch(/var\(--secondary-system-background\)/)
    // The sheen primitive the spike verified — if `inset` is stripped, the
    // declaration stays valid but the highlight is gone.
    expect(body, `${selector} must carry an inset box-shadow sheen`).toMatch(/box-shadow:[\s\S]*inset/)
    // Depth stack: both layers, in this order (sheen paints over the ramp).
    if (rimOnly) expect(body).toMatch(/background-image:\s*none/)
    else expect(body, `${selector} must layer the sheen over the ramp`).toMatch(
      /background-image:\s*var\(--material-sheen-layer\),\s*var\(--material-ramp\)/,
    )
    // Side rims complete the perimeter the top highlight starts; without them
    // the bevel reads as a single bright line rather than a lit edge.
    expect(body, `${selector} must carry the side rims`).toMatch(
      /box-shadow:[\s\S]*var\(--material-rim-sides\)/,
    )
  },
)

test('the nav capsule selection tint is the accent wash, not the glass glow', () => {
  // A picked tab is a selection — the same semantic as a selected row, so it
  // wears --tint-fill (the accent wash a theme pack re-points at its seed),
  // NOT --material-glow-faint (the decorative star-blue personality tint). P3
  // reversed an earlier decision that used the glow here: the glow is a
  // decorative channel and a selection is not decoration. Reverting to the
  // glow would recolour selection silently. (The active glyph/label read in
  // --accent over --tint-fill, which clears 3:1 — 3.12 light / 4.39 dark —
  // per the --tint-fill derivation in tokens.css.)
  //
  // Migrated from .nav-item--active .nav-item__pill to .nav-indicator__pill:
  // the flow indicator now carries the selection capsule.
  const css = rules('shared/layouts/ShellLayout.css')
  const indicator = block(css, '.nav-indicator__pill')
  expect(indicator).toMatch(/var\(--tint-fill\)/)
  expect(indicator).not.toMatch(/var\(--material-glow-faint\)/)
})

test('the ten glass tokens are declared in both themes', () => {
  const tokens = readFileSync(path.join(SHARED, 'shared/theme/tokens.css'), 'utf8')
  for (const which of ['dark', 'light'] as const) {
    const blockMatch = new RegExp(`\\.theme-root\\.theme-${which}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`).exec(tokens)
    expect(blockMatch, `theme-${which} block exists`).not.toBeNull()
    const body = blockMatch![1]!
    for (const token of [
      '--material-fill',
      '--material-fill-elevated',
      '--material-border',
      '--material-highlight',
      '--material-glow',
      '--material-glow-faint',
      '--material-sheen',
      // The depth stack's atomic inputs. The composites that combine them
      // (`--material-rim-sides`, `--material-ramp`, `--material-sheen-layer`) live once
      // in `.theme-root` and resolve their nested var()s per theme, so they are
      // asserted there instead — see contrast.test.ts.
      '--material-rim-side',
      '--material-ramp-top',
      '--material-ramp-bottom',
    ]) {
      expect(body, `${token} declared in theme-${which}`).toMatch(
        new RegExp(`${token.replace(/-/g, '\\-')}\\s*:`),
      )
    }
  }
})

/*
 * Nothing inside a glass panel may paint an opaque fill across it.
 *
 * The regression this exists for was user-reported and is worth stating exactly,
 * because the shape recurs: the play-history panel and the add-to-playlist sheet
 * are the SAME material (`--material-fill-elevated` + depth stack), but their list rows
 * came from different components — `.media-list-item`, which declares no
 * background, and `.song-row`, which declared `background-color: var(--canvas)`.
 * So one panel read as frosted and the other as a flat white list
 * (「一个白色，一个透明色」). The rows tiled the whole content area, so they did not
 * merely tint the material — they replaced it, and hid the `<blur-view>` beneath
 * the panel completely. Every gate in this file was green: they all check what a
 * panel declares about ITSELF, and nothing checked what gets painted ON it.
 *
 * The rule below is mechanical rather than a roster, because a roster is what
 * failed here (and in `backdrop-blur.test.ts`, and in the old tap-target gate):
 *
 *   Inside a glass panel, an opaque fill is allowed only on a BOUNDED OBJECT —
 *   one that declares its own `border-radius`. A knob, a chip, a badge, an inset
 *   card: those sit ON the material and are how Apple's own sheets carry grouped
 *   content. An unbounded box with an opaque fill IS the material, replacing it.
 *
 * That distinction is exactly the difference between the rounded objects inside
 * panels (the switch knob, the `⋯` chip over artwork, cover art, text inputs,
 * segmented chips — things Apple's own sheets do paint opaquely) and the one that
 * was wrong (a full-bleed row). A new full-bleed opaque row in any panel fails
 * here with no list to update.
 *
 * Two refinements, both paid for by an escape:
 *
 *   - WHICH tokens count as opaque is derived from tokens.css by value, not
 *     listed here. The first version of this gate matched `--canvas|--paper` by
 *     hand and so never looked at `--neutral-faint` — `#1f1f25`, just as opaque,
 *     used in ~90 places. `.popover-menu__item--selected` painted it full-bleed
 *     across a glass popover: the same bug as `.song-row`, green under the gate
 *     written for `.song-row`.
 *   - A modifier is shaped by its base class. `.chip--active` never repeats the
 *     `border-radius` that `.chip` declares, so a self-only check reads every
 *     bounded object's states as unbounded — which invites adding a radius to
 *     silence it rather than fixing the fill.
 *
 * The second test below is the other half of the rule: even ON a bounded object,
 * a STATE inside a panel may not reach for a surface or separator colour. Those
 * are what the material is made of; a state is accent (`--primary-faint`) or
 * neutral-on-material (`--fill-faint`). Three rules broke this at once — two
 * multi-select highlights were `--paper` over `--canvas` (250 vs 255: an
 * invisible selection) and the play-queue drawer's active row was opaque
 * `--neutral-faint` over glass.
 *
 * Reach is derived: panels come from the CSS (any base rule filled with
 * `--material-fill*`), their renderers from usage, and the component graph is walked
 * transitively — `.song-row` sits two components below the panel
 * (`PlayHistoryPanel` → `SongListRow` → `SongRow`), so a one-level scan misses it.
 */

/** Classes the walk reaches that are not actually inside the panel. */
const NOT_INSIDE_A_PANEL: Record<string, string> = {
  /*
   * These are rendered by `ShellLayout`, which also renders `.shell__bottombar`,
   * but they are the app root and the wide-screen side rail — the bottombar's
   * ANCESTOR and its SIBLING. This is the walk's one honest blind spot: it
   * resolves "which components render a panel" and then "what those components
   * paint", which is not the same as "what is inside the panel's subtree". These
   * entries are a tool limitation, not a design decision — unlike the
   * rounded objects above, which the border-radius rule admits on purpose.
   */
  shell: 'the app root behind everything, not inside the nav capsule',
  shell__rail: 'the wide-screen side rail, a sibling of the nav capsule',
  shell__body: 'the Android capture source, a sibling behind the nav capsule',
}

/*
 * Whether a token is opaque is a fact about tokens.css, so read it from there:
 * `#rrggbb` / `rgb()` / `rgba(…, 1)` cover the material, `rgba(…, a<1)` tints it.
 * A token counts as opaque if it is opaque in EITHER theme — a fill that hides
 * the blur in light mode only is still a fill that hides the blur.
 */
function opaqueTokens(): Set<string> {
  const css = readFileSync(path.join(SHARED, 'shared/theme/tokens.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')

  /**
   * Three facts per token, because two are not enough:
   *  - `opaqueLiteral` — it has a literal declaration that covers.
   *  - `hasLiteral` — it has ANY literal declaration, opaque or not.
   *  - `aliasOf` — it has a `var()` declaration.
   *
   * `hasLiteral` is what stops a variant block from rewriting a token's nature.
   * `.increase-contrast` declares `--separator: var(--opaque-separator)`, which is
   * a legitimate override in another context, not the token's base value; without
   * this distinction that one line promoted a translucent separator to "opaque"
   * and turned the assertion below red for the right reason.
   */
  const opaqueLiteral = new Set<string>()
  const hasLiteral = new Set<string>()
  const aliasOf = new Map<string, string>()

  for (const m of css.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    const [, name, raw] = m as unknown as [string, string, string]
    const value = raw.trim()

    /*
     * Resolve one level of indirection. The Muse names survive in `tokens.css`
     * only as `--canvas: var(--system-background)` during the staged Apple
     * migration, and most feature CSS still says the alias. A classifier that
     * only understood literals would file every alias as "not opaque" and this
     * whole gate would go blind for the duration of the migration — the opposite
     * of what it is for. One level is enough by construction: `tokens-hig.test.ts`
     * asserts no alias points at another alias.
     */
    const alias = /^var\(\s*--([\w-]+)\s*\)$/.exec(value)
    if (alias != null) { aliasOf.set(name, alias[1]!); continue }

    const hex = /^#([0-9a-f]{3,8})$/i.exec(value)
    if (hex != null) {
      hasLiteral.add(name)
      const digits = hex[1]!
      const alpha = digits.length === 4
        ? digits[3]!.repeat(2)
        : digits.length === 8 ? digits.slice(6) : 'ff'
      if (alpha.toLowerCase() === 'ff') opaqueLiteral.add(name)
      continue
    }
    const rgba = /^rgba?\(([^)]*)\)$/.exec(value)
    if (rgba == null) continue
    hasLiteral.add(name)
    const parts = rgba[1]!.split(',')
    if (parts.length < 4) { opaqueLiteral.add(name); continue } // rgb(): no alpha
    if (Number(parts[3]) >= 1) opaqueLiteral.add(name)
  }

  // A token with any literal is judged on its literals (opaque in EITHER theme
  // counts, as before). Only a pure indirection — which is what every surviving
  // Muse alias is — is resolved through its target.
  const out = new Set(opaqueLiteral)
  for (const [name, target] of aliasOf) {
    if (hasLiteral.has(name)) continue
    if (opaqueLiteral.has(target)) out.add(name)
  }
  return out
}

const OPAQUE = opaqueTokens()

/** The first opaque token a rule paints as its background, if any. */
function opaqueFill(body: string): string | null {
  for (const m of body.matchAll(/background-color:\s*var\(--([\w-]+)\)/g)) {
    if (OPAQUE.has(m[1]!)) return m[1]!
  }
  return null
}

/** A class is bounded if it — or the base class it modifies — has a radius. */
function bounded(cls: string, rules: Map<string, { body: string, file: string }>): boolean {
  if (/border-radius/.test(rules.get(cls)?.body ?? '')) return true
  if (!cls.includes('--')) return false
  return /border-radius/.test(rules.get(cls.slice(0, cls.indexOf('--')))?.body ?? '')
}

/*
 * Tokens that ARE the surface or the lines drawn on it. A state may not paint
 * these (DESIGN.md §3.3 says the same about separators: 不要把 separator 颜色当
 * 背景色用). Accent and glass tokens are deliberately absent — a filled
 * `--accent` chip or a `--material-glow-faint` pill is how a state should read.
 *
 * Both the Apple names and the surviving Muse aliases are listed, because during
 * the staged migration a rule may still say either and both mean the same thing.
 *
 * Two former members are deliberately GONE, and it is a narrowing worth naming:
 * `--neutral-faint` and `--line` now resolve to `--tertiary-system-fill` and
 * `--separator`, which are TRANSLUCENT. Apple's fills and separators are meant to
 * sit on content, so painting a state with one no longer replaces the material
 * underneath — the failure this list was written for stops existing for them. The
 * separator tokens stay listed anyway: covering the material was only half the
 * objection, and using a line colour as a fill is still a semantic error.
 */
const SURFACE_CHANNEL = [
  // Apple background tiers — opaque, so painting a state with one covers glass.
  'system-background', 'secondary-system-background', 'tertiary-system-background',
  'system-grouped-background', 'secondary-system-grouped-background',
  'tertiary-system-grouped-background',
  // Lines. `separator` is translucent; it is here on semantic grounds, not
  // coverage grounds.
  'separator', 'opaque-separator',
]

/** SURFACE_CHANNEL members that are translucent, so exempt from the opacity check. */
const TRANSLUCENT_SURFACE_CHANNEL = ['separator']

/*
 * Modifier suffixes that mean "the user is interacting with this". Read off the
 * codebase's own vocabulary and then widened: only `--active`, `--selected` and
 * `--on` exist today, and the unused words cost nothing while catching the next
 * `.foo--current`.
 *
 * The suffixes deliberately NOT here are the ones that describe what a thing IS
 * rather than what is happening to it:
 *
 *   - `--empty` / `--placeholder`: an artwork slot with no artwork. Six of these
 *     paint `--neutral-faint`, correctly — the slot is an opaque rounded box
 *     whether or not an image loaded, which is exactly how iOS draws a missing
 *     cover. Nothing is being replaced; the box IS the object.
 *   - `--primary` / `--tinted` / `--filled` / `--prominent` / `--secondary` /
 *     `--submit` / `--danger`: button emphasis levels, not states.
 *   - `--error` / `--docked`: a toast's severity and a menu backdrop's position.
 */
const INTERACTION_STATES = [
  'active', 'selected', 'on', 'current', 'playing', 'checked', 'pressed',
  'highlighted', 'open', 'expanded',
]

function filesOf(dir: string, ext: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (entry === 'node_modules' || entry === '__tests__') return []
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return filesOf(full, ext)
    return entry.endsWith(ext) ? [full] : []
  })
}

/** Every class's own base rule (`.cls { … }`), across every stylesheet. */
function baseRules(): Map<string, { body: string, file: string }> {
  const out = new Map<string, { body: string, file: string }>()
  for (const file of filesOf(SHARED, '.css')) {
    const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const selector = m[1]!.trim()
      const cls = /^\.([a-z][\w-]*)$/.exec(selector)?.[1]
      if (cls != null && !out.has(cls)) out.set(cls, { body: m[2]!, file })
    }
  }
  return out
}

/** Component name → source file, for resolving `<Foo />` to what Foo paints. */
function componentIndex(): Map<string, string> {
  const out = new Map<string, string>()
  for (const file of filesOf(SHARED, '.tsx')) {
    const name = path.basename(file, '.tsx')
    if (!out.has(name)) out.set(name, file)
  }
  return out
}

/** Classes painted by a component and everything it renders, transitively. */
function reachableClasses(entry: string, components: Map<string, string>): Set<string> {
  const classes = new Set<string>()
  const seen = new Set<string>()
  const queue: Array<{ file: string, depth: number }> = [{ file: entry, depth: 0 }]
  while (queue.length > 0) {
    const { file, depth } = queue.shift()!
    if (seen.has(file) || depth > 4) continue
    seen.add(file)
    const src = readFileSync(file, 'utf8')
    for (const cls of fileClasses(src)) classes.add(cls)
    for (const m of src.matchAll(/<([A-Z]\w+)[\s/>]/g)) {
      const child = components.get(m[1]!)
      if (child != null) queue.push({ file: child, depth: depth + 1 })
    }
  }
  return classes
}

function glassPanels(rules: Map<string, { body: string, file: string }>): string[] {
  return [...rules.entries()]
    .filter(([, r]) => /background-color:\s*var\(--material-fill[\w-]*\)/.test(r.body))
    .map(([cls]) => cls)
}

test('no opaque unbounded fill is painted over a glass panel', () => {
  const rules = baseRules()
  const components = componentIndex()
  const panels = glassPanels(rules)
  const tsx = filesOf(SHARED, '.tsx')

  const violations: string[] = []
  for (const panel of panels) {
    const renderers = tsx.filter((file) => fileClasses(readFileSync(file, 'utf8')).has(panel))
    for (const renderer of renderers) {
      for (const cls of reachableClasses(renderer, components)) {
        const rule = rules.get(cls)
        const token = rule == null ? null : opaqueFill(rule.body)
        if (rule == null || token == null) continue
        if (bounded(cls, rules)) continue // a bounded object, allowed
        if (cls in NOT_INSIDE_A_PANEL) continue
        violations.push(
          `.${cls} (${path.relative(SHARED, rule.file)}) paints opaque --${token} with no `
          + `border-radius inside .${panel} — rendered via `
          + `${path.basename(renderer, '.tsx')}. An unbounded opaque box replaces the `
          + 'glass instead of sitting on it: let the panel own the fill, and give a '
          + 'row STATE a translucent one.',
        )
      }
    }
  }
  expect([...new Set(violations)].sort()).toEqual([])
})

test('the glass-panel walk actually reaches the rows inside the panels', () => {
  // Guards the test above against becoming vacuous — an empty panel list, a
  // broken class scanner or a one-level walk would all leave it silently green.
  const rules = baseRules()
  const panels = glassPanels(rules)
  expect(panels.length, 'no glass panels found — the panel derivation broke')
    .toBeGreaterThanOrEqual(8)
  expect(panels).toContain('play-history__panel')

  const reached = reachableClasses(
    path.join(SHARED, 'features/player/widgets/PlayHistoryPanel.tsx'),
    componentIndex(),
  )
  // Two components below the panel, and applied through an interpolated template
  // (`{`song-row${…}`}`) — the two ways this walk has actually been fooled.
  expect(reached, 'the walk must reach .song-row two components down').toContain('song-row')
  expect(reached, 'and the row parts under it').toContain('song-row__meta')
})

test('the shared row components leave their surface to whatever they sit on', () => {
  // The specific fix, pinned: these rows are rendered BOTH on pages (whose roots
  // are `--canvas`, making a row fill a no-op) and inside glass panels (where it
  // is not). `.song-row` carried `--canvas` for exactly that reason — it was
  // inherited from three page-local copies when they were collapsed into one
  // shared file, and the panel usage came later.
  const rules = baseRules()
  for (const cls of ['song-row', 'media-list-item']) {
    const rule = rules.get(cls)
    expect(rule, `.${cls} has no base rule`).toBeDefined()
    expect(
      opaqueFill(rule!.body),
      `.${cls} is rendered on pages AND inside glass panels; an opaque fill here `
      + 'is invisible on the former and covers the material on the latter',
    ).toBeNull()
  }
})

test('the opaque-token set is derived from tokens.css, not remembered', () => {
  // The escape this pins: `--neutral-faint` is `#1f1f25`, every bit as opaque as
  // `--canvas`, and the first version of this gate simply did not know about it.
  const opaque = [...opaqueTokens()]
  // Both channels must come out populated: a parser that classified everything
  // one way (every `rgba()` mis-read as opaque, say) would pass a one-sided floor
  // and then either flag the whole app or nothing at all.
  expect(opaque.length, 'the tokens.css parse found almost no opaque colours')
    .toBeGreaterThanOrEqual(12)
  const colours = [...readFileSync(path.join(SHARED, 'shared/theme/tokens.css'), 'utf8')
    .matchAll(/--([\w-]+):\s*(#[0-9a-f]{3,8}|rgba?\()/gi)].map((m) => m[1]!)
  expect(
    new Set(colours.filter((name) => !OPAQUE.has(name))).size,
    'no translucent colours found — every rgba() was read as opaque',
  ).toBeGreaterThanOrEqual(12)
  for (const name of [
    // Apple background tiers and the opaque line colour — flat hexes.
    'system-background', 'secondary-system-background', 'tertiary-system-background',
    'system-grouped-background', 'secondary-system-grouped-background',
    'tertiary-system-grouped-background', 'opaque-separator',
    'label', 'accent', 'system-red', 'system-green', 'toast-fill',
    // (P10 deleted the Muse aliases that used to be checked here for resolving
    // to an opaque target — the indirection is gone, so only real tokens remain.)
  ]) {
    expect(opaque, `--${name} resolves to a flat hex in tokens.css, so it is opaque`)
      .toContain(name)
  }
  for (const name of [
    'material-fill', 'material-fill-elevated',
    // Apple's fills and separators are translucent BY DESIGN — they sit on
    // content rather than replacing it.
    'system-fill', 'secondary-system-fill', 'tertiary-system-fill',
    'quaternary-system-fill', 'separator', 'tint-fill',
    'secondary-label', 'tertiary-label', 'quaternary-label',
    // (P10 deleted the Muse aliases --line/--neutral-faint/etc. that used to be
    // checked here as translucent — only real Apple translucent tokens remain.)
  ]) {
    expect(opaque, `--${name} resolves to rgba() below alpha 1 — it tints, it does not cover`)
      .not.toContain(name)
  }
  // Every surface-channel token must be classified, or the state test below is
  // quietly narrower than it reads. The two translucent members are exempt: they
  // are listed there on semantic grounds, not coverage grounds.
  for (const name of SURFACE_CHANNEL) {
    if (TRANSLUCENT_SURFACE_CHANNEL.includes(name)) continue
    expect(opaque, `--${name} must be known-opaque for the state gate to bite`)
      .toContain(name)
  }
  // Non-vacuity for the exemption list: it must not silently grow to cover the
  // whole channel, which would turn the loop above into a no-op. (P10 removed
  // the Muse aliases from SURFACE_CHANNEL, so the opaque floor dropped with them.)
  expect(
    SURFACE_CHANNEL.filter((n) => !TRANSLUCENT_SURFACE_CHANNEL.includes(n)).length,
    'most of the surface channel must still be opaque',
  ).toBeGreaterThanOrEqual(7)
})

test('no surface or separator colour is used as a row-state wash inside a panel', () => {
  const rules = baseRules()
  const components = componentIndex()
  const panels = glassPanels(rules)
  const tsx = filesOf(SHARED, '.tsx')

  const violations: string[] = []
  const states: string[] = []
  for (const panel of panels) {
    const renderers = tsx.filter((file) => fileClasses(readFileSync(file, 'utf8')).has(panel))
    for (const renderer of renderers) {
      for (const cls of reachableClasses(renderer, components)) {
        if (!cls.includes('--')) continue
        if (!INTERACTION_STATES.includes(cls.slice(cls.indexOf('--') + 2))) continue
        const rule = rules.get(cls)
        const fill = rule == null
          ? null
          : /background-color:\s*var\(--([\w-]+)\)/.exec(rule.body)?.[1]
        if (rule == null || fill == null) continue
        states.push(cls)
        if (!SURFACE_CHANNEL.includes(fill)) continue
        violations.push(
          `.${cls} (${path.relative(SHARED, rule.file)}) washes a state with --${fill} `
          + `inside .${panel}. That token is the surface (or a line on it), not a `
          + 'state: an opaque background tier replaces the material over glass, and '
          + 'a line colour is not a fill at any opacity. Use --tint-fill for a '
          + 'selection the theme pack should tint, or --quaternary-system-fill for '
          + 'a neutral on-material fill.\n'
          + 'Note the original invisibility argument no longer applies: under the '
          + 'Muse palette --paper on --canvas was 250 vs 255 (ratio 1.04, i.e. the '
          + 'wash did not exist), whereas Apple\'s secondary background on the '
          + 'primary one measures 1.116 in light and 1.234 in dark. It is now '
          + 'visible and still wrong — the objection is semantic.',
        )
      }
    }
  }
  expect([...new Set(violations)].sort()).toEqual([])
  // Non-vacuity: the walk must actually be finding interaction states with
  // fills, and both of the words that carry them today must still be in use —
  // a rename to a suffix outside INTERACTION_STATES would silently empty this.
  const reached = [...new Set(states)].sort()
  expect(reached, 'the play-queue drawer\'s active row must be reached')
    .toContain('drawer__row--active')
  expect(reached, 'and the popover\'s selected item')
    .toContain('popover-menu__item--selected')
})

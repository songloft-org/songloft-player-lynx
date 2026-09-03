import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from 'vitest'

import { fileClasses } from '../../testing/jsx-classes.js'

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
  {
    // Added late, and the reason it was late is the point: this panel kept
    // `var(--paper)` through both glass batches and was the only floating surface
    // in the app left opaque — a flat card beside the very popovers its own CSS
    // comment claimed it matched. It is here so "the surface reverted to --paper"
    // is a failure for the song menu too, not just for the five that were listed.
    file: 'shared/ui/GlobalMenu.css',
    selector: '.global-menu__panel',
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

/*
 * Nothing inside a glass panel may paint an opaque fill across it.
 *
 * The regression this exists for was user-reported and is worth stating exactly,
 * because the shape recurs: the play-history panel and the add-to-playlist sheet
 * are the SAME material (`--glass-fill-strong` + depth stack), but their list rows
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
 * That distinction is exactly the difference between the six opaque things
 * currently inside panels (all rounded — the switch knob, the `⋯` chip over
 * artwork, four inset info blocks in the plugin dialogs) and the one that was
 * wrong (a full-bleed row). A new full-bleed opaque row in any panel fails here
 * with no list to update.
 *
 * Reach is derived: panels come from the CSS (any base rule filled with
 * `--glass-fill*`), their renderers from usage, and the component graph is walked
 * transitively — `.song-row` sits two components below the panel
 * (`PlayHistoryPanel` → `SongListRow` → `SongRow`), so a one-level scan misses it.
 */

/** Classes the walk reaches that are not actually inside the panel. */
const NOT_INSIDE_A_PANEL: Record<string, string> = {
  /*
   * Both are rendered by `ShellLayout`, which also renders `.shell__bottombar`,
   * but they are the app root and the wide-screen side rail — the bottombar's
   * ANCESTOR and its SIBLING. This is the walk's one honest blind spot: it
   * resolves "which components render a panel" and then "what those components
   * paint", which is not the same as "what is inside the panel's subtree". These
   * two entries are a tool limitation, not a design decision — unlike the
   * rounded objects above, which the border-radius rule admits on purpose.
   */
  shell: 'the app root behind everything, not inside the nav capsule',
  shell__rail: 'the wide-screen side rail, a sibling of the nav capsule',
}

const OPAQUE_FILL = /background-color:\s*var\(--(?:canvas|paper)\)/

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
    .filter(([, r]) => /background-color:\s*var\(--glass-fill[\w-]*\)/.test(r.body))
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
        if (rule == null || !OPAQUE_FILL.test(rule.body)) continue
        if (/border-radius/.test(rule.body)) continue // a bounded object, allowed
        if (cls in NOT_INSIDE_A_PANEL) continue
        violations.push(
          `.${cls} (${path.relative(SHARED, rule.file)}) paints an opaque fill with no `
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
      rule!.body,
      `.${cls} is rendered on pages AND inside glass panels; an opaque fill here `
        + 'is invisible on the former and covers the material on the latter',
    ).not.toMatch(OPAQUE_FILL)
  }
})

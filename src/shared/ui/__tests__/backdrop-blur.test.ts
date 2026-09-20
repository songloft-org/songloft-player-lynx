import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, it, expect } from 'vitest'

import { BACKDROP_BLUR_RADIUS, blurEffectFor } from '../BackdropBlur.js'

/**
 * The real backdrop blur behind every translucent surface in the app.
 *
 * Lynx has no CSS `backdrop-filter` (see `docs/architecture/lynx-constraints.md`),
 * so `<blur-view>` is the only route to one — and it is an *element*, which means
 * the whole contract is structural: which subtree it sits in, and in what order.
 * That is what this file holds, since none of it can be expressed in a stylesheet.
 *
 * ## The inventory is derived from both sides, and that is the point
 *
 * The first version of this gate walked the **stylesheets** and required every
 * `var(--backdrop)` rule to be classified. It passed while six dialogs shipped
 * with no blur at all, because those dialogs reuse `ConfirmDialog`'s classes from
 * their own markup: the rule had an owner, the owner had a blur, and the six
 * other files rendering the same class were invisible to a CSS-keyed scan.
 *
 * So the scan is keyed on **usage**. The stylesheets say which classes are a dim
 * or a translucent fill; the `.tsx` files say who renders them; every renderer
 * must mount the blur. Reusing a surface's classes from a new file now fails here
 * instead of silently shipping a see-through modal.
 *
 * ## The properties, in the order they are worth breaking
 *
 *  1. **Every dimming scrim has a blur, and it comes first.** Lynx paints in tree
 *     order, so a blur *after* the scrim would blur nothing the scrim had already
 *     covered.
 *  2. **Every translucent glass panel is backed by a blur too** — either by the
 *     scrim it sits over (modals) or by its own panel-mode layer (popovers, the
 *     nav capsule, the mini-player). A 0.72–0.85 fill over *sharp* page content is
 *     what "you can read the page through it" looks like, and it is what those
 *     three surfaces did until this gate existed.
 *  3. **Scrim mode is a sibling; panel mode is a first child.** The scrims carry
 *     `bindtap={onClose}`, so a child there would swallow tap-to-dismiss. Panels
 *     carry no gesture and must clip the blur to their own rounded box, so a child
 *     is the only option there — with `z-index: -1`, or it covers the contents.
 *  4. **The props live in exactly one place.** `blur-effect` and
 *     `ios-user-interface-style` are iOS-only and theme-dependent; hand-rolling a
 *     second `<blur-view>` somewhere would fork them silently on the one platform
 *     no test here can reach.
 *
 * Note what is deliberately absent: any contrast assertion. Blur is a linear
 * filter, so a uniform backdrop is a fixed point of it, and every contrast gate
 * in this repo derives its worst case from uniform extremes. No amount of blur
 * can buy alpha headroom under those gates, so this work moved no token and
 * `contrast.test.ts` needed no change.
 */

const SRC = join(import.meta.dirname, '../../..')

function read(rel: string): string {
  return readFileSync(join(SRC, rel), 'utf8')
}

function walk(ext: string): string[] {
  const out: string[] = []
  const visit = (dir: string) => {
    for (const entry of readdirSync(join(SRC, dir), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') visit(rel)
      } else if (entry.name.endsWith(ext)) {
        out.push(rel)
      }
    }
  }
  visit('')
  return out.sort()
}

/** CSS comments in this repo quote selectors and declarations; strip them first. */
const stripCssComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/**
 * One rule's body, matched on the **exact** selector — not "any rule mentioning
 * this class", which is the looseness a mutation run already caught once in this
 * file (see the containing-block assertion). Pass comment-stripped CSS.
 */
function block(css: string, selector: string): string {
  const rule = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((m) => m[1]!.trim() === selector)
  expect(rule, `no base rule for ${selector}`).toBeDefined()
  return rule![2]!
}

/**
 * Rule-by-rule, so the selector credited with a declaration is the one that
 * actually owns it. The *last* class in the selector is the owner: `.a .b` and
 * `.a.b--x` both describe `b`.
 */
function ownersOf(declaration: RegExp): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>()
  for (const rel of walk('.css')) {
    for (const [, selector, body] of stripCssComments(read(rel)).matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
      if (!declaration.test(body!)) continue
      const classes = [...selector!.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]!)
      const owner = classes.at(-1)
      if (!owner) continue
      const at = found.get(owner) ?? new Set<string>()
      at.add(rel)
      found.set(owner, at)
    }
  }
  return found
}

/**
 * Class tokens a `.tsx` actually puts in the DOM. Only string literals count —
 * comments in this repo name classes constantly, and a mention is not a render.
 * Template holes are cut out so `` `popover-menu ${extra}` `` still yields
 * `popover-menu`.
 */
const TSX = walk('.tsx')
const CLASS_TOKENS = new Map<string, Set<string>>(
  TSX.map((rel) => {
    const body = read(rel).replace(/\/\*[\s\S]*?\*\//g, '')
    const tokens = new Set<string>()
    for (const [, single, double, backtick] of body.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g)) {
      for (const chunk of (single ?? double ?? backtick ?? '').split(/\$\{[^}]*\}/)) {
        for (const token of chunk.split(/\s+/)) if (token) tokens.add(token)
      }
    }
    return [rel, tokens] as const
  }),
)

const rendererOf = (cls: string) => TSX.filter((rel) => CLASS_TOKENS.get(rel)!.has(cls))

/** The specifier a file must import the component by. Computed, never listed. */
function importPath(tsx: string): string {
  const spec = relative(tsx.replace(/\/[^/]+$/, ''), 'shared/ui/BackdropBlur.js')
  return spec.startsWith('..') ? spec : `./${spec}`
}

const COMPONENT = read('shared/ui/BackdropBlur.tsx')
const COMPONENT_CSS = read('shared/ui/BackdropBlur.css')

/**
 * `var(--backdrop)` consumers that are **not** scrims, and so must not blur.
 * Listed rather than filtered out, so that adding a real scrim cannot pass by
 * looking like one of these.
 */
const NOT_A_SCRIM: Record<string, string> = {
  'full-player__video-badge': 'a badge that borrows the token as its own fill; it covers nothing',
}

/**
 * Surfaces whose blur is mounted by a *different* file than the one naming the
 * class. One entry, and it is a real delegation rather than a loophole: both
 * popovers hand their `panelClassName` to `PopoverSurface`, which is the only
 * place the panel element exists.
 */
const BLUR_DELEGATED_TO: Record<string, string> = {
  'popover-menu': 'shared/ui/PopoverSurface.tsx',
}

/** Every file that mounts a scrim-mode blur, as a roster a reviewer can read. */
const EXPECTED_SCRIM_SITES = [
  'features/jsplugin/widgets/PluginBatchUpdateDialog.tsx',
  'features/jsplugin/widgets/PluginUpdateDialog.tsx',
  'features/jsplugin/widgets/RegistryManageDialog.tsx',
  'features/library/widgets/ManageTagsSheet.tsx',
  'features/library/widgets/SongEditDialog.tsx',
  'features/library/widgets/SongInfoDialog.tsx',
  'features/player/widgets/PlayHistoryPanel.tsx',
  'features/player/widgets/PlaylistDrawer.tsx',
  'features/player/widgets/SleepTimerSheet.tsx',
  'features/playlist/widgets/AddToPlaylistSheet.tsx',
  'features/playlist/widgets/PlaylistDescPanel.tsx',
  'features/playlist/widgets/SongCoverPicker.tsx',
  'shared/nav/MoreTabsSheet.tsx',
  'shared/ui/ConfirmDialog.tsx',
  'shared/ui/GlobalMenu.tsx',
  'shared/ui/PromptDialog.tsx',
]

/**
 * Panel sites a per-file scan cannot derive, with the reason. The derivation is
 * "a glass panel whose file renders no dim needs its own layer"; anything listed
 * here is a panel that *looks* scrimmed to that scan and is not.
 */
const PANEL_NOT_DERIVED: Record<string, string> = {
  'global-menu__panel':
    'two forms in one file — the dim belongs to the docked form, so a per-file scan '
    + 'reads the anchored popover as scrimmed. That is exactly how its missing layer hid.',
}

interface PanelSite {
  name: string
  /** File that renders the panel element. */
  tsx: string
  /** The modifier class, which also picks the radius. */
  modifier: 'ui-backdrop-blur--panel' | 'ui-backdrop-blur--pill'
  /** The translucent panel's own class, and the stylesheet that positions it. */
  panel: string
  css: string
  /**
   * Markup that must come *after* the blur — the panel's first real child. Panel
   * mode is a first child, so this pins the order the same way the scrim sites pin
   * theirs against the dim.
   */
  firstChild: string
}

/**
 * The surfaces that are translucent with no scrim under them. Every one of them was
 * a flat wash over sharp page content before panel mode existed; these are the
 * entries that keep them from going back.
 */
const PANEL_SITES: PanelSite[] = [
  {
    name: 'popover menus and panels',
    tsx: 'shared/ui/PopoverSurface.tsx',
    modifier: 'ui-backdrop-blur--panel',
    panel: 'popover-menu',
    css: 'shared/ui/PopoverMenu.css',
    firstChild: '{children}',
  },
  {
    name: 'bottom nav capsule',
    tsx: 'shared/layouts/ShellLayout.tsx',
    modifier: 'ui-backdrop-blur--pill',
    panel: 'shell__bottombar',
    css: 'shared/layouts/ShellLayout.css',
    firstChild: '{renderBottomBarItems()}',
  },
  {
    name: 'mini-player capsule',
    tsx: 'features/player/widgets/MiniPlayer.tsx',
    modifier: 'ui-backdrop-blur--pill',
    panel: 'mini-player',
    css: 'features/player/widgets/MiniPlayer.css',
    firstChild: "className='mini-player__progress'",
  },
  {
    // The anchored form. Its docked form is modal and takes the scrim mode instead,
    // which is why this file is in *both* rosters — the only site that is.
    name: 'global menu (anchored form)',
    tsx: 'shared/ui/GlobalMenu.tsx',
    modifier: 'ui-backdrop-blur--panel',
    panel: 'global-menu__panel',
    css: 'shared/ui/GlobalMenu.css',
    firstChild: "className='global-menu__items'",
  },
]

describe('BackdropBlur component', () => {
  it('is the only place a blur-view is configured', () => {
    // Cheap, and it is the whole reason the component exists: `blur-effect` and
    // `ios-user-interface-style` are iOS-only, so a second call site would fork
    // them where nothing in CI can see the difference.
    for (const rel of TSX) {
      if (rel === 'shared/ui/BackdropBlur.tsx') continue
      expect(read(rel), `${rel} must mount <BackdropBlur/>, not a raw blur-view`)
        .not.toMatch(/<blur-view/)
    }
  })

  it('sets the blur radius from the shared constant', () => {
    expect(BACKDROP_BLUR_RADIUS).toMatch(/^\d+px$/)
    expect(COMPONENT).toMatch(/blur-radius=\{BACKDROP_BLUR_RADIUS\}/)
  })

  it('drives the iOS vibrancy from the resolved theme, never the default', () => {
    // The `blur-effect` default is 'light' — a layer that *brightens* what it
    // blurs, which is wrong under a dark theme. iOS opts into the native
    // iOS-26 Liquid Glass material instead; every other platform follows the
    // resolved theme. The branching lives in `blurEffectFor`, exercised below.
    expect(blurEffectFor('ios', 'light')).toBe('glass')
    expect(blurEffectFor('ios', 'dark')).toBe('glass')
    expect(blurEffectFor('android', 'light')).toBe('light')
    expect(blurEffectFor('android', 'dark')).toBe('dark')
    expect(blurEffectFor('harmony', 'dark')).toBe('dark')
    expect(blurEffectFor('web', 'light')).toBe('light')
    expect(COMPONENT).toMatch(/blur-effect=\{effect\}/)
    expect(COMPONENT).toMatch(/blurEffectFor\(PLATFORM, theme\)/)
    expect(COMPONENT).toMatch(/container && blurEffect === 'glass' \? 'glass-container' : blurEffect/)
    expect(COMPONENT).toMatch(/glass-style=\{glassStyle\}/)
    expect(COMPONENT).toMatch(/ios-user-interface-style=\{theme\}/)
    expect(COMPONENT).toMatch(/resolveTheme\(getAppTheme\(\)\)/)
    // Resolved theme, subscribed: under 'system' the choice never changes when
    // the host flips appearance, so subscribing to the choice alone would stick.
    expect(COMPONENT).toMatch(/subscribeAppTheme\(/)
  })

  it('keeps the base class an inset-0 fill that paints nothing', () => {
    const rule = COMPONENT_CSS.match(/\.ui-backdrop-blur\s*\{([\s\S]*?)\n\}/)
    expect(rule, '.ui-backdrop-blur rule missing').not.toBeNull()
    const body = rule![1]!
    expect(body).toMatch(/position:\s*absolute/)
    for (const side of ['top', 'left', 'right', 'bottom']) {
      expect(body, `must pin ${side}`).toMatch(new RegExp(`${side}:\\s*0`))
    }
    // No fill of its own: the dim is a separate layer painted after it, so that
    // the stack reads blur → dim → panel. A background here would double the dim.
    expect(body, 'the blur layer must not paint a fill').not.toMatch(/background/)
    // Scrim mode orders by tree position alone. A z-index on the base would apply
    // to panel mode too and fight the modifier that has to be negative.
    expect(body, 'scrim mode must order by tree position, not z-index').not.toMatch(/z-index/)
  })

  it('gives every panel-mode modifier a negative z-index and a radius', () => {
    for (const modifier of new Set(PANEL_SITES.map((s) => s.modifier))) {
      const rule = COMPONENT_CSS.match(new RegExp(`\\.${modifier}\\s*\\{([^{}]*)\\}`))
      expect(rule, `.${modifier} rule missing`).not.toBeNull()
      const body = rule![1]!
      // Without this the layer paints above the panel's in-flow contents, because
      // a positioned child outranks its non-positioned siblings.
      expect(body, `.${modifier} must sit under the panel contents`).toMatch(/z-index:\s*-1/)
      // Its own rounding, rather than relying on the parent to clip: one of the
      // three panels does not clip, and giving it an overflow clip for this would
      // change what its contents may do.
      expect(body, `.${modifier} must round itself`).toMatch(/border-radius:\s*var\(--radius-[\w-]+\)/)
      expect(body, `.${modifier} must not paint a fill`).not.toMatch(/background/)
    }
  })

  it('uses no modifier that the stylesheet does not define', () => {
    // A typo'd modifier is a silent square blur over the panel contents.
    const defined = new Set(
      [...COMPONENT_CSS.matchAll(/\.(ui-backdrop-blur--[\w-]+)\s*\{/g)].map((m) => m[1]!),
    )
    const used = new Set<string>()
    for (const rel of TSX) {
      for (const token of CLASS_TOKENS.get(rel)!) {
        if (token.startsWith('ui-backdrop-blur--')) used.add(token)
      }
    }
    expect([...used].filter((m) => !defined.has(m))).toEqual([])
  })
})

describe('every dimming scrim is blurred', () => {
  const dimOwners = ownersOf(/background-color:\s*var\(--backdrop\)/)

  it('classifies every var(--backdrop) consumer', () => {
    const unclassified = [...dimOwners.keys()].filter(
      (cls) => !(cls in NOT_A_SCRIM) && rendererOf(cls).length === 0,
    )
    expect(
      unclassified,
      'a var(--backdrop) rule nothing renders: name it in NOT_A_SCRIM or delete it',
    ).toEqual([])
  })

  it('holds the roster of files that mount a scrim blur', () => {
    // Derived from the two sides, then compared to a written list — so a new
    // modal shows up as a diff in review rather than as a silent addition.
    const sites = new Set<string>()
    for (const [cls] of dimOwners) {
      if (cls in NOT_A_SCRIM) continue
      for (const rel of rendererOf(cls)) sites.add(BLUR_DELEGATED_TO[cls] ?? rel)
    }
    expect([...sites].sort()).toEqual(EXPECTED_SCRIM_SITES)
  })

  for (const [cls, cssFiles] of ownersOf(/background-color:\s*var\(--backdrop\)/)) {
    if (cls in NOT_A_SCRIM) continue
    for (const tsx of rendererOf(cls)) {
      describe(`.${cls} in ${tsx}`, () => {
        it('paints the dim with the shared token', () => {
          for (const css of cssFiles) {
            expect(
              read(css),
              `.${cls} must dim with var(--backdrop)`,
            ).toMatch(new RegExp(`\\.${cls}[^{}\\n]*\\{[^{}]*background-color:\\s*var\\(--backdrop\\)`))
          }
        })

        it('mounts the blur before the dim, as a sibling', () => {
          const owner = BLUR_DELEGATED_TO[cls] ?? tsx
          const text = read(owner)
          expect(text, 'must import the shared component').toContain(
            `import { BackdropBlur } from '${importPath(owner)}'`,
          )
          const blur = text.indexOf('<BackdropBlur />')
          expect(blur, '<BackdropBlur /> is not mounted').toBeGreaterThan(-1)
          const dim = read(tsx).indexOf(cls)
          expect(dim, `${cls} not found in the markup`).toBeGreaterThan(-1)
          if (owner === tsx) {
            // Tree order is paint order: after the dim, the blur would sample a
            // backdrop the dim had already covered.
            expect(blur, 'the blur must precede the dim it sits behind').toBeLessThan(dim)
          }
          // Self-closing, so it can never acquire children — a child of the blur
          // would be inside the tag that may not resolve on Harmony.
          expect(text).not.toMatch(/<BackdropBlur[^/>]*>\s*[^<\s]/)
        })
      })
    }
  }
})

describe('every translucent glass panel is backed by a real blur', () => {
  const glassOwners = ownersOf(/background-color:\s*var\(--material-fill/)

  it('leaves no glass surface over unblurred page content', () => {
    // The gate that would have caught all of this in one shot. A `--material-fill`
    // rule means "you can see through me"; the file that renders it must mount a
    // blur in one mode or the other, or the show-through is of sharp content.
    const bare: string[] = []
    for (const [cls] of glassOwners) {
      for (const tsx of rendererOf(cls)) {
        const owner = BLUR_DELEGATED_TO[cls] ?? tsx
        // A *mount*, not the import: a leftover import satisfies `includes` while
        // the element is gone, which is the precise shape of the bug this gate exists
        // for.
        if (!/<BackdropBlur[\s/]/.test(read(owner))) bare.push(`.${cls} → ${tsx}`)
      }
    }
    expect(
      bare,
      'a translucent panel with no blur behind it: mount BackdropBlur, or make the fill opaque',
    ).toEqual([])
  })

  it('names every glass class that no file renders', () => {
    // A dead surface is not a covered one; it should be deleted, not tolerated.
    const dead = [...glassOwners.keys()].filter((cls) => rendererOf(cls).length === 0)
    expect(dead, 'a var(--material-fill*) rule nothing renders').toEqual([])
  })
})

describe('panel mode', () => {
  for (const site of PANEL_SITES) {
    describe(site.name, () => {
      it('mounts the blur as the panel’s first child, with its modifier', () => {
        const tsx = read(site.tsx)
        expect(tsx).toContain(`import { BackdropBlur } from '${importPath(site.tsx)}'`)
        const mount = `<BackdropBlur className='${site.modifier}' container />`
        const blur = tsx.indexOf(mount)
        expect(blur, `${mount} is not mounted`).toBeGreaterThan(-1)
        const panel = tsx.indexOf(site.panel)
        expect(panel, `${site.panel} not found in the markup`).toBeGreaterThan(-1)
        // Between the panel's own class and its first real child: inside the
        // panel, and ahead of everything the blur has to sit under.
        expect(blur, 'the blur must be inside the panel it backs').toBeGreaterThan(panel)
        const first = tsx.indexOf(site.firstChild)
        expect(first, `${site.firstChild} not found`).toBeGreaterThan(-1)
        expect(blur, 'the blur must come before the panel contents').toBeLessThan(first)
      })

      it('gives the panel a containing block for the layer', () => {
        // An inset-0 absolute child of a *static* box resolves against whichever
        // ancestor happens to be positioned, which is how a panel-sized blur
        // becomes a page-sized one.
        //
        // The **base** rule, matched on an exact selector, not "any rule mentioning
        // this class". `.mini-player` is only `position: fixed` under
        // `.shell--narrow`; on wide it is in flow, so a scan that accepted the
        // narrow variant would call it positioned while the wide layout stretched
        // its blur across the whole content column. That looser version of this
        // assertion is exactly what a mutation run caught.
        const rule = [
          ...stripCssComments(read(site.css)).matchAll(/([^{}]+)\{([^{}]*)\}/g),
        ].find((m) => m[1]!.trim() === `.${site.panel}`)
        expect(rule, `.${site.panel} has no base rule`).toBeDefined()
        expect(
          rule![2]!,
          `.${site.panel}'s own rule must be positioned — a variant selector is not enough`,
        ).toMatch(/position:\s*(relative|absolute|fixed|sticky)/)
      })

      it('rounds the layer to the panel’s own radius', () => {
        /*
         * The modifier rounds *itself* rather than relying on the panel's clip
         * (`.shell__bottombar` has none). That only lands on the panel's corners
         * while the two radii agree — and nothing was holding them together, so a
         * panel switching to `--radius-lg` would leave the blur's corners poking
         * out or cut short, with every other assertion here still green.
         */
        const modifier = new RegExp(`\\.${site.modifier}\\s*\\{[^{}]*border-radius:\\s*var\\((--radius-[\\w-]+)\\)`)
          .exec(stripCssComments(COMPONENT_CSS))
        expect(modifier, `.${site.modifier} sets no radius`).not.toBeNull()
        // The panel's radius may sit on a form modifier rather than its base rule
        // (the global menu's does), so accept `.panel` and `.panel--*` — but not
        // `.panel__child`, whose radius is its own business.
        const own = new Set<string>()
        for (const [, selector, body] of stripCssComments(read(site.css)).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
          const last = [...selector!.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]!).at(-1)
          if (last !== site.panel && !last?.startsWith(`${site.panel}--`)) continue
          const radius = /border-radius:\s*var\((--radius-[\w-]+)\)/.exec(body!)
          if (radius) own.add(radius[1]!)
        }
        expect(
          [...own],
          `.${site.panel} and .${site.modifier} must round to the same token`,
        ).toEqual([modifier![1]!])
      })

      it('is a translucent surface in the first place', () => {
        // If a panel ever goes opaque the blur is dead weight behind it, and this
        // entry should be dropped rather than left to mislead.
        expect(
          stripCssComments(read(site.css)),
          `.${site.panel} no longer uses a glass fill — drop its PANEL_SITES entry`,
        ).toMatch(new RegExp(`\\.${site.panel}[^{}]*\\{[^{}]*background-color:\\s*var\\(--material-fill`))
      })
    })
  }

  it('derives which panels need panel mode, instead of trusting the roster', () => {
    /*
     * `PANEL_SITES` was hand-written, and a hand-written roster is the shape of
     * every miss in this feature: the six dialogs, then the global menu. So derive
     * it. A `--material-fill*` panel is see-through; if the file that renders it puts
     * no `--backdrop` dim on screen, there is no scrim layer standing in for it and
     * the panel needs its own. Both directions are checked, so a new scrimless
     * panel *and* a stale entry both surface here.
     *
     * Without this, a scrimless panel added to a file that already mounts a blur
     * passes every other gate in this file — which is precisely what happened to
     * the global menu's anchored form.
     */
    const dims = [...ownersOf(/background-color:\s*var\(--backdrop\)/).keys()]
      .filter((cls) => !(cls in NOT_A_SCRIM))
    const scrimmed = (tsx: string) => dims.some((cls) => rendererOf(cls).includes(tsx))
    const needed = new Set<string>()
    for (const [cls] of ownersOf(/background-color:\s*var\(--material-fill/)) {
      for (const tsx of rendererOf(cls)) {
        if (!scrimmed(BLUR_DELEGATED_TO[cls] ?? tsx)) needed.add(cls)
      }
    }
    const listed = new Set(PANEL_SITES.map((site) => site.panel))
    expect(
      [...needed].filter((cls) => !listed.has(cls)).sort(),
      'a glass panel with no scrim under it and no PANEL_SITES entry: it is a wash over sharp page content',
    ).toEqual([])
    expect(
      [...listed].filter((cls) => !needed.has(cls) && !(cls in PANEL_NOT_DERIVED)).sort(),
      'a PANEL_SITES entry the surfaces no longer justify: drop it, or explain it in PANEL_NOT_DERIVED',
    ).toEqual([])
  })

  it('keeps the popover backdrop an invisible catcher', () => {
    // A popover is not modal. Panel mode is what made its material real; the page
    // behind it must stay undimmed, or the menu reads as a modal sheet.
    const rule = read('shared/ui/PopoverMenu.css').match(/\.popover-backdrop\s*\{([^{}]*)\}/)
    expect(rule, '.popover-backdrop rule missing').not.toBeNull()
    expect(rule![1]!, 'the outside-tap catcher must stay invisible').not.toMatch(/background/)
    expect(read('shared/ui/PopoverSurface.tsx'), 'a popover must not blur the whole page')
      .not.toContain('<BackdropBlur />')
  })

  it('gives the global menu the mode each of its two forms calls for', () => {
    /*
     * This menu is the one surface with both forms, and the previous version of
     * this assertion is why it shipped wrong: it read "anchored, its panel is
     * `--paper`, fully opaque, so it needs neither mode" and pinned that
     * `--paper` in place. The premise was stale — batch C had given every other
     * overlay a glass fill and fix2 had given the popovers a real blur — so the
     * gate was holding the app's most-used menu at a flat opaque card while
     * asserting all was well. A gate that pins a surface's *fill* is asserting a
     * design decision; this one now pins the *pairing* instead: whatever the fill
     * is, each form gets the mode that matches its shape.
     */
    const tsx = read('shared/ui/GlobalMenu.tsx')
    // Docked: modal, so scrim mode — page blurred, then dimmed.
    expect(tsx, 'the docked form is modal and needs the scrim-mode blur')
      .toMatch(/\{!anchored && <BackdropBlur \/>\}/)
    // Anchored: a popover, so panel mode — no dim, the material is the panel.
    expect(tsx, 'the anchored form is a popover and needs the panel-mode layer')
      .toMatch(/\{anchored && <BackdropBlur className='ui-backdrop-blur--panel' container \/>\}/)
    const css = stripCssComments(read('shared/ui/GlobalMenu.css'))
    expect(css, 'only the docked form dims the page behind it').toMatch(
      /\.global-menu__backdrop--docked\s*\{[^{}]*background-color:\s*var\(--backdrop\)/,
    )
    expect(
      block(css, '.global-menu__backdrop'),
      'the anchored form\u2019s catcher must stay invisible, like .popover-backdrop',
    ).not.toMatch(/background/)
    // The surface itself matches the popovers it sits beside. Asserted against
    // `.popover-menu`'s own rule rather than a literal, so the two cannot drift
    // apart again the way they just did.
    const surface = /background-color:\s*var\(--material-fill-elevated\)/
    expect(block(stripCssComments(read('shared/ui/PopoverMenu.css')), '.popover-menu'))
      .toMatch(surface)
    expect(
      block(css, '.global-menu__panel'),
      'the song menu must use the same fill as the toolbar menus beside it',
    ).toMatch(surface)
  })
})

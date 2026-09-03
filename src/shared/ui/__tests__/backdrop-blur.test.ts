import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

import { BACKDROP_BLUR_RADIUS } from '../BackdropBlur.js'

/**
 * The real backdrop blur behind every modal scrim.
 *
 * Lynx has no CSS `backdrop-filter` (see `docs/architecture/lynx-constraints.md`),
 * so `<blur-view>` is the only route to one — and it is an *element*, which means
 * the whole contract is structural: which subtree it sits in, and in what order.
 * That is what this file holds, since none of it can be expressed in a stylesheet.
 *
 * Three properties, in the order they are worth breaking:
 *
 *  1. **Every dimming scrim has one, and it comes first.** Lynx paints in tree
 *     order, so a blur *after* the scrim would blur nothing that the scrim had
 *     already covered. The inventory is derived from the CSS — every consumer of
 *     `var(--backdrop)` must be classified — so a scrim added later fails this
 *     file until it either gets a blur or is listed as an exemption with a reason.
 *  2. **It is a sibling, never a child.** The scrims carry `bindtap={onClose}`;
 *     a child would paint in front of that tap target and swallow tap-to-dismiss.
 *     A missing blur is cosmetic, a dead dismiss gesture is not — the same
 *     asymmetric-failure-mode rule that picked the mounting shape in batch B.
 *  3. **The props live in exactly one place.** `blur-effect` and
 *     `ios-user-interface-style` are iOS-only and theme-dependent; hand-rolling a
 *     second `<blur-view>` somewhere would fork them silently on the one platform
 *     no test here can reach.
 *
 * Note what is deliberately absent: any contrast assertion. Blur is a linear
 * filter, so a uniform backdrop is a fixed point of it, and every contrast gate
 * in this repo derives its worst case from uniform extremes. No amount of blur
 * can buy alpha headroom under those gates, so this batch moved no token and
 * `contrast.test.ts` needed no change.
 */

const ROOT = join(import.meta.dirname, '../../..')

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8')
}

const COMPONENT = read('shared/ui/BackdropBlur.tsx')
const COMPONENT_CSS = read('shared/ui/BackdropBlur.css')

interface Scrim {
  name: string
  /** The markup that mounts the blur and the scrim. */
  tsx: string
  /** Import specifier the file must use for the component. */
  importPath: string
  /** The stylesheet that paints `var(--backdrop)`. */
  css: string
  /** Class name of the dimming element, as it appears in both files. */
  dim: string
}

/**
 * Every modal scrim in the app. `dim` is the class that carries
 * `background-color: var(--backdrop)`, which is also the element the blur must
 * precede — the two are the same element everywhere except `ConfirmDialog`,
 * where lynx-ui's `DialogBackdrop` is the positioned wrapper and the dim sits on
 * an inner view (see that component for why `position: fixed` has to be inline).
 */
const SCRIMS: Scrim[] = [
  {
    name: 'playlist description',
    tsx: 'features/playlist/widgets/PlaylistDescPanel.tsx',
    importPath: '../../../shared/ui/BackdropBlur.js',
    css: 'features/playlist/widgets/PlaylistDescPanel.css',
    dim: 'playlist-desc__backdrop',
  },
  {
    name: 'song cover picker',
    tsx: 'features/playlist/widgets/SongCoverPicker.tsx',
    importPath: '../../../shared/ui/BackdropBlur.js',
    css: 'features/playlist/widgets/SongCoverPicker.css',
    dim: 'song-cover-picker__backdrop',
  },
  {
    name: 'add to playlist',
    tsx: 'features/playlist/widgets/AddToPlaylistSheet.tsx',
    importPath: '../../../shared/ui/BackdropBlur.js',
    css: 'features/playlist/widgets/AddToPlaylistSheet.css',
    dim: 'atp__backdrop',
  },
  {
    name: 'manage tags',
    tsx: 'features/library/widgets/ManageTagsSheet.tsx',
    importPath: '../../../shared/ui/BackdropBlur.js',
    css: 'features/library/widgets/ManageTagsSheet.css',
    dim: 'manage-tags__backdrop',
  },
  {
    name: 'play history',
    tsx: 'features/player/widgets/PlayHistoryPanel.tsx',
    importPath: '../../../shared/ui/BackdropBlur.js',
    css: 'features/player/widgets/PlayHistoryPanel.css',
    dim: 'play-history__backdrop',
  },
  // Two sheets share `SheetShell.css`, so `.drawer__backdrop` is asserted twice
  // — once per mounting file, which is the thing that can actually regress.
  {
    name: 'playlist drawer',
    tsx: 'features/player/widgets/PlaylistDrawer.tsx',
    importPath: '../../../shared/ui/BackdropBlur.js',
    css: 'features/player/widgets/SheetShell.css',
    dim: 'drawer__backdrop',
  },
  {
    name: 'sleep timer',
    tsx: 'features/player/widgets/SleepTimerSheet.tsx',
    importPath: '../../../shared/ui/BackdropBlur.js',
    css: 'features/player/widgets/SheetShell.css',
    dim: 'drawer__backdrop',
  },
  {
    name: 'more tabs',
    tsx: 'shared/nav/MoreTabsSheet.tsx',
    importPath: '../ui/BackdropBlur.js',
    css: 'shared/nav/MoreTabsSheet.css',
    dim: 'more-tabs__backdrop',
  },
  {
    name: 'confirm dialog',
    tsx: 'shared/ui/ConfirmDialog.tsx',
    importPath: './BackdropBlur.js',
    css: 'shared/ui/ConfirmDialog.css',
    dim: 'confirm-dialog__backdrop-inner',
  },
  {
    name: 'global menu (docked)',
    tsx: 'shared/ui/GlobalMenu.tsx',
    importPath: './BackdropBlur.js',
    css: 'shared/ui/GlobalMenu.css',
    dim: 'global-menu__backdrop--docked',
  },
]

/**
 * `var(--backdrop)` consumers that are **not** scrims, and so must not blur.
 * Listed rather than filtered out, so that adding a real scrim cannot pass by
 * looking like one of these.
 */
const NOT_A_SCRIM: { css: string; selector: string; why: string }[] = [
  {
    css: 'features/player/pages/FullPlayerPage.css',
    selector: '.full-player__video-badge',
    why: 'a badge that borrows the token as its own fill; it covers nothing',
  },
]

describe('BackdropBlur component', () => {
  it('is the only place a blur-view is configured', () => {
    // Cheap, and it is the whole reason the component exists: `blur-effect` and
    // `ios-user-interface-style` are iOS-only, so a second call site would fork
    // them where nothing in CI can see the difference.
    const sources = [
      ...SCRIMS.map((s) => s.tsx),
      'shared/ui/PopoverSurface.tsx',
      'shared/ui/PopoverPanel.tsx',
    ]
    for (const rel of sources) {
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
    // blurs, which is wrong under a dark theme. Both props must be present and
    // both must be theme-derived, not literals.
    expect(COMPONENT).toMatch(/blur-effect=\{theme === 'dark' \? 'dark' : 'light'\}/)
    expect(COMPONENT).toMatch(/ios-user-interface-style=\{theme\}/)
    expect(COMPONENT).toMatch(/resolveTheme\(getAppTheme\(\)\)/)
    // Resolved theme, subscribed: under 'system' the choice never changes when
    // the host flips appearance, so subscribing to the choice alone would stick.
    expect(COMPONENT).toMatch(/subscribeAppTheme\(/)
  })

  it('covers its scrim exactly, and paints nothing itself', () => {
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
  })
})

describe('every dimming scrim is blurred', () => {
  it('accounts for every var(--backdrop) consumer in the app', () => {
    // Derived, not hand-listed: a new scrim shows up here as an unclassified
    // selector rather than as a silently un-blurred modal.
    const dims = new Set(SCRIMS.map((s) => s.dim))
    const exempt = new Set(NOT_A_SCRIM.map((e) => e.selector.replace(/^\./, '')))
    const unclassified: string[] = []
    for (const rel of new Set([
      ...SCRIMS.map((s) => s.css),
      ...NOT_A_SCRIM.map((e) => e.css),
    ])) {
      const css = read(rel)
      // Rule-by-rule, so the selector credited with a declaration is the one
      // that actually owns it.
      for (const match of css.matchAll(/\n(\.[\w-]+(?:\.[\w-]+|--[\w-]+)*)[^{}\n]*\{([^{}]*)\}/g)) {
        if (!/background-color:\s*var\(--backdrop\)/.test(match[2]!)) continue
        const cls = match[1]!.split('.').filter(Boolean).at(-1)!
        if (!dims.has(cls) && !exempt.has(cls)) unclassified.push(`${rel} → ${match[1]}`)
      }
    }
    expect(
      unclassified,
      'new var(--backdrop) consumers must be listed as a SCRIM (and get a blur) or as NOT_A_SCRIM',
    ).toEqual([])
  })

  for (const scrim of SCRIMS) {
    describe(scrim.name, () => {
      it('paints the dim with the shared token', () => {
        const css = read(scrim.css)
        const rule = new RegExp(`\\.${scrim.dim}[^{}\\n]*\\{[^{}]*background-color:\\s*var\\(--backdrop\\)`)
        expect(css, `.${scrim.dim} must dim with var(--backdrop)`).toMatch(rule)
      })

      it('mounts the blur before the dim, as a sibling', () => {
        const tsx = read(scrim.tsx)
        expect(tsx, 'must import the shared component').toContain(
          `import { BackdropBlur } from '${scrim.importPath}'`,
        )
        const blur = tsx.indexOf('<BackdropBlur />')
        const dim = tsx.indexOf(scrim.dim)
        expect(blur, '<BackdropBlur /> is not mounted').toBeGreaterThan(-1)
        expect(dim, `${scrim.dim} not found in the markup`).toBeGreaterThan(-1)
        // Tree order is paint order: after the dim, the blur would sample a
        // backdrop the dim had already covered.
        expect(blur, 'the blur must precede the dim it sits behind').toBeLessThan(dim)
        // Self-closing, so it can never acquire children — a child of the blur
        // would be inside the tag that may not resolve on Harmony.
        expect(tsx).not.toMatch(/<BackdropBlur\s*>/)
      })
    })
  }
})

describe('overlays that must not blur the page', () => {
  it('leaves popovers alone', () => {
    // A popover is not modal — it is attached to its trigger, and the page
    // behind it stays legible on purpose. `.popover-backdrop` is an invisible
    // outside-tap catcher, not a scrim.
    expect(read('shared/ui/PopoverSurface.tsx')).not.toContain('BackdropBlur')
  })

  it('blurs the global menu only in its docked form', () => {
    const tsx = read('shared/ui/GlobalMenu.tsx')
    // The same `anchored` flag gates the scrim's paint; anchored, this menu *is*
    // a popover and falls under the rule above.
    expect(tsx).toMatch(/\{!anchored && <BackdropBlur \/>\}/)
    expect(read('shared/ui/GlobalMenu.css')).toMatch(
      /\.global-menu__backdrop--docked\s*\{[^{}]*background-color:\s*var\(--backdrop\)/,
    )
  })
})

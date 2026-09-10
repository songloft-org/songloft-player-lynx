import { useEffect, useMemo, useState } from '@lynx-js/react'

import { getPlatformTarget } from '../../native/platform-target.js'
import { getAppTheme, resolveTheme, subscribeAppTheme } from '../theme/theme-model.js'

import './BackdropBlur.css'

/**
 * Gaussian radius for every blurred surface. One value, because a modal that
 * blurs the page harder than the modal beside it reads as a bug, not as
 * hierarchy — and a menu that blurs it differently again reads the same way.
 *
 * `blur-radius` is a **string with a unit** (`BlurViewProps` documents the
 * default as `"0px"`), not a number — the Web implementation happens to be
 * lenient (it runs `parseFloat`), the native ones are not documented to be.
 */
export const BACKDROP_BLUR_RADIUS = '20px'

/** The native platform, read once and pinned (a host does not change at runtime). */
const PLATFORM = /* @__PURE__ */ getPlatformTarget()

/**
 * The `blur-effect` value for a surface, by platform and resolved theme.
 *
 * On **iOS** the app opts into the native iOS-26 Liquid Glass material
 * (`'glass'`); the translucent fill above this layer is lowered to a tint by
 * the `.platform-ios` token override, so the native material — not the CSS
 * fill — is what carries readability (Apple's vibrancy guarantees it, the way
 * the system bars read). Every other platform keeps the theme-driven
 * `'light'`/`'dark'` vibrancy, where the CSS fill is still the readability
 * carrier and `contrast.test.ts` still gates it.
 *
 * `'glass-container'` is reserved for panel mode below; a single glass element
 * uses plain `'glass'`.
 */
export function blurEffectFor(
  platform: ReturnType<typeof getPlatformTarget>,
  theme: 'light' | 'dark',
): 'light' | 'extra-light' | 'dark' | 'glass' | 'glass-container' {
  if (platform === 'ios') return 'glass'
  return theme === 'dark' ? 'dark' : 'light'
}

export interface BackdropBlurProps {
  /**
   * Extra class, for the **panel** mounting mode only — one of the
   * `.ui-backdrop-blur--*` modifiers in `BackdropBlur.css`. Scrim mode passes
   * nothing; the base class already covers its sibling's box exactly.
   */
  className?: string
  /**
   * Whether this surface is a **container** of multiple adjacent glass
   * elements (a popover menu, the nav capsule grouping its items). On iOS a
   * container uses `'glass-container'` so the native material merges the
   * elements into one combined effect rather than rendering each separately.
   * On non-iOS this is a no-op (vibrancy is per-surface there). Scrim mode
   * (modal dim) leaves this `false`.
   */
  container?: boolean
}

/**
 * Real backdrop blur — the app's only route to one, in the app's only two shapes.
 *
 * Batch B established that Lynx has no `backdrop-filter` in CSS, which is true —
 * but `<blur-view>` is a first-class element (`BlurViewProps` in
 * `@lynx-js/types`) and it is the one way to reach a real backdrop blur, on
 * every platform this app ships to:
 *
 *  - **Web** — the implementation exists (`web-core` registers `x-blur-view`,
 *    which writes `:host { backdrop-filter: blur(Npx) }` into its own shadow
 *    root) but the tag does NOT reach it on its own: `blur-view` is absent from
 *    `LYNX_TAG_TO_HTML_TAG_MAP`, so the identity fallback puts a literal, inert
 *    `<blur-view>` in the DOM. `web/index.html` aliases the name onto the real
 *    class; see `src/__tests__/web-host-page.test.ts`. Without that alias this
 *    whole component is a silent no-op on Web — which is how it first shipped,
 *    because the runtime check had constructed an `x-blur-view` by hand.
 *  - **iOS** — `XElement/BlurView` 4.0.1 is in `ios/Podfile.lock`, and
 *    `XElement/Behavior` self-registers it. On iOS 26 the `'glass'` material
 *    maps to a native `UIGlassEffect` — the real Liquid Glass surface — and the
 *    `.platform-ios` token override lowers the CSS fill above it to a tint so
 *    the native material shows. Readability there is the native material's
 *    vibrancy, verified on-device; `contrast.test.ts` still gates the baseline
 *    fill the other platforms render.
 *  - **Android** — `xelement-blur-view:4.0.0` arrives transitively through the
 *    `xelement` umbrella POM, and `MainActivity` calls
 *    `addBehaviors(XElementBehaviors().create())`.
 *  - **HarmonyOS** — `blur-radius` is documented for Harmony, but this host only
 *    installs `@lynx/xelement_svg`, so treat it as the platform where the tag
 *    may not resolve. That is what dictates the mounting rules below.
 *
 * ## Two mounting modes
 *
 * **Scrim mode** — `<BackdropBlur />`, mounted as the sibling immediately before
 * a dimming scrim. For modals: the blur covers the page, the scrim dims it, the
 * panel sits on top. A *sibling*, never a wrapper or a child, because the scrims
 * are self-closing `<view>`s that carry `bindtap={onClose}`; a child would paint
 * in front of that tap target and swallow tap-to-dismiss, and a wrapper would put
 * the entire modal subtree inside an element one platform might not resolve.
 *
 * **Panel mode** — `<BackdropBlur className='ui-backdrop-blur--panel' />` (or
 * `--pill`), mounted as the **first child of the translucent panel itself**. For
 * the surfaces that are not modal and so have no scrim to hide behind: popover
 * menus, the nav capsule, the mini-player. Those were the app's most transparent
 * layers precisely because they have no dim — a 0.72/0.85 fill over *sharp* page
 * content, which is what "you can read the page through it" actually looks like.
 * Apple's own context menus and bars are a real material, not a flat wash, and
 * this is that material.
 *
 * A child here rather than a sibling, and the sibling argument does not transfer:
 *
 *  - There is nothing to sit before. The blur has to be clipped to the panel's
 *    own rounded box, and only a child of that box is.
 *  - No tap gesture is at risk. `z-index: -1` puts the layer below the panel's
 *    in-flow rows (see the stylesheet for why that is not optional), and events
 *    on a child bubble to the panel exactly as they did before.
 *  - The Harmony hazard was about a *wrapper*, not a child. This element is a
 *    self-closing leaf in both modes, so an unresolved tag still costs only the
 *    blur.
 *
 * Panel mode needs no per-platform branch even though the platforms disagree
 * about paint order. On Web a negative-z child paints *after* its parent's own
 * background, so the blur samples `page ⊕ fill`; on native the parent's fill is
 * its layer's background and subviews always draw above it, so the sample is the
 * same. Both land on the same picture regardless, because blur is linear and
 * preserves constants: `blur(page ⊕ uniform) === blur(page) ⊕ uniform`.
 *
 * **No alpha anywhere gets to come down because of this.** Same reason, stated as
 * a fixed point: a uniform backdrop is unchanged by blur, so a blurred solid-white
 * cover is still solid white. Every contrast gate in this repo derives its worst
 * case from *uniform* extremes, which means no amount of blur can ever buy alpha
 * headroom under those gates — it only removes the high-frequency detail that WCAG
 * does not model in the first place. So this work changes no token, and
 * `contrast.test.ts` is untouched by design rather than by omission — *on the
 * non-iOS platforms*. iOS is the exception: there the native material replaces
 * the CSS fill as the readable surface, the `.platform-ios` override lowers the
 * fill, and that fill's contrast is not modelled in CSS (the surface behind the
 * text is a native vibrancy layer, not a composite). `platform-glass.test.ts`
 * carries that contract.
 */
export function BackdropBlur({ className, container = false }: BackdropBlurProps) {
  const [theme, setTheme] = useState(() => resolveTheme(getAppTheme()))

  // Same subscribe-the-model shape as `ThemeProvider` (this codebase has no
  // theme context). Resolved theme, not the `AppTheme` choice: under 'system' a
  // host dark-mode flip keeps the choice at 'system' and React would bail out.
  useEffect(
    () => subscribeAppTheme(() => setTheme(resolveTheme(getAppTheme()))),
    [],
  )

  // iOS opts into the native iOS-26 Liquid Glass material (`'glass'`, or
  // `'glass-container'` when several adjacent glass elements should merge into
  // one combined effect — the nav capsule, a popover menu). `glass-style` is
  // iOS-only in the type system and inert everywhere else; the whole tag does
  // not resolve on Harmony, so setting these unconditionally costs nothing
  // off-iOS while keeping the iOS material configurable in exactly one place.
  const glassStyle = useMemo(() => 'regular' as const, [])
  const blurEffect = blurEffectFor(PLATFORM, theme)
  const effect = container && blurEffect === 'glass' ? 'glass-container' : blurEffect

  return (
    <blur-view
      className={className ? `ui-backdrop-blur ${className}` : 'ui-backdrop-blur'}
      blur-radius={BACKDROP_BLUR_RADIUS}
      blur-effect={effect}
      glass-style={glassStyle}
      /*
       * iOS-only, and it has to be set: the default is `'light'`, a vibrancy
       * layer that brightens the blurred area — wrong under a dark theme.
       * Applies to the theme-driven vibrancy surfaces (non-iOS); on iOS the
       * material is `'glass'`, whose appearance the system tints by `theme`.
       */
      ios-user-interface-style={theme}
    />
  )
}

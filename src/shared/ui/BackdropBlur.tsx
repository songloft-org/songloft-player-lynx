import { useEffect, useState } from '@lynx-js/react'

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

export interface BackdropBlurProps {
  /**
   * Extra class, for the **panel** mounting mode only — one of the
   * `.ui-backdrop-blur--*` modifiers in `BackdropBlur.css`. Scrim mode passes
   * nothing; the base class already covers its sibling's box exactly.
   */
  className?: string
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
 *    `XElement/Behavior` self-registers it.
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
 * `contrast.test.ts` is untouched by design rather than by omission.
 */
export function BackdropBlur({ className }: BackdropBlurProps) {
  const [theme, setTheme] = useState(() => resolveTheme(getAppTheme()))

  // Same subscribe-the-model shape as `ThemeProvider` (this codebase has no
  // theme context). Resolved theme, not the `AppTheme` choice: under 'system' a
  // host dark-mode flip keeps the choice at 'system' and React would bail out.
  useEffect(
    () => subscribeAppTheme(() => setTheme(resolveTheme(getAppTheme()))),
    [],
  )

  return (
    <blur-view
      className={className ? `ui-backdrop-blur ${className}` : 'ui-backdrop-blur'}
      blur-radius={BACKDROP_BLUR_RADIUS}
      /*
       * iOS-only, and it has to be set: the default is `'light'`, a vibrancy
       * layer that brightens the blurred area — wrong under a dark theme.
       *
       * Deliberately NOT `'glass'`/`'glass-container'` (the iOS-26 liquid-glass
       * materials, also available here). Those would replace the material batch C
       * tuned, on the one platform where nothing in this repo can verify the
       * result, and they would be almost entirely hidden anyway: the panel above
       * this layer is opaque to 0.72–0.85, so a native glass material would show
       * through at 15–28% strength. The blur is what is actually visible through
       * a 0.35–0.55 scrim, so the blur is what this batch buys.
       */
      blur-effect={theme === 'dark' ? 'dark' : 'light'}
      /*
       * iOS ≥4.0 (this host is on 4.0.1). The app's theme is its own preference
       * and does not have to match the system appearance, so without this the
       * vibrancy would follow the *system* while everything around it follows
       * `theme-model.ts`.
       */
      ios-user-interface-style={theme}
    />
  )
}

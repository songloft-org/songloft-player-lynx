import { useEffect, useState } from '@lynx-js/react'

import { getAppTheme, resolveTheme, subscribeAppTheme } from '../theme/theme-model.js'

import './BackdropBlur.css'

/**
 * Gaussian radius for every modal scrim. One value, because a modal that blurs
 * the page harder than the modal beside it reads as a bug, not as hierarchy.
 *
 * `blur-radius` is a **string with a unit** (`BlurViewProps` documents the
 * default as `"0px"`), not a number — the Web implementation happens to be
 * lenient (it runs `parseFloat`), the native ones are not documented to be.
 */
export const BACKDROP_BLUR_RADIUS = '20px'

/**
 * Real backdrop blur behind a modal scrim.
 *
 * Batch B established that Lynx has no `backdrop-filter` in CSS, which is true —
 * but `<blur-view>` is a first-class element (`BlurViewProps` in
 * `@lynx-js/types`) and it is the one way to reach a real backdrop blur, on
 * every platform this app ships to:
 *
 *  - **Web** — `web-core` registers `x-blur-view`, whose whole implementation is
 *    to write `:host { backdrop-filter: blur(Npx) }` into its own shadow root.
 *    Verified end-to-end in Docker Chrome, including that the attribute is live
 *    (changing it re-renders, removing it clears the rule).
 *  - **iOS** — `XElement/BlurView` 4.0.1 is in `ios/Podfile.lock`, and
 *    `XElement/Behavior` self-registers it.
 *  - **Android** — `xelement-blur-view:4.0.0` arrives transitively through the
 *    `xelement` umbrella POM, and `MainActivity` calls
 *    `addBehaviors(XElementBehaviors().create())`.
 *  - **HarmonyOS** — `blur-radius` is documented for Harmony, but this host only
 *    installs `@lynx/xelement_svg`, so treat it as the platform where the tag
 *    may not resolve. That is what dictates the mounting rule below.
 *
 * **Mounted as a sibling, never as a wrapper or a child.** The scrims it sits
 * behind are self-closing `<view>`s that carry `bindtap={onClose}`; a child
 * would sit in front of that tap target and swallow tap-to-dismiss, and a
 * wrapper would put the entire modal subtree inside an element that one platform
 * might not resolve. As a preceding sibling the worst case is losing the blur —
 * the same asymmetric-failure-mode rule batch B used to pick `saturate()` over
 * `brightness()`.
 *
 * **No alpha anywhere gets to come down because of this.** Blur is a linear
 * filter, so a uniform backdrop is a fixed point of it: a blurred solid-white
 * cover is still solid white. Every contrast gate in this repo derives its worst
 * case from *uniform* extremes, which means no amount of blur can ever buy alpha
 * headroom under those gates — it only removes the high-frequency detail that
 * WCAG does not model in the first place. So this batch changes no token, and
 * `contrast.test.ts` is untouched by design rather than by omission.
 */
export function BackdropBlur() {
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
      className='ui-backdrop-blur'
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

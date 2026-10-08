import UIKit

/**
 * The host half of the system-appearance contract: the OS dark/light setting and
 * locale, handed to the Lynx page so Settings → Appearance / Language can
 * actually mean "follow the system". Mirror of
 * `org.songloft.lynx.system.SystemAppearance`.
 *
 * Lynx has no `prefers-color-scheme` and no locale API on any platform, so
 * without a host channel the JS side has nothing to follow and pins itself to
 * dark + English. The keys and event name must stay byte-identical to
 * `src/native/system-appearance.ts` — silent when broken, exactly like the audio
 * module's event names.
 */
enum SystemAppearance {
  /// `lynx.__globalProps` keys.
  static let propTheme = "systemTheme"
  static let propLocale = "systemLocale"
  /// OS "reduce motion" accessibility flag, same channel as theme.
  static let propReduceMotion = "systemReduceMotion"

  /// Global-event name for a live change.
  static let eventChanged = "SongloftSystem.appearanceChanged"

  /// Snapshot the host state in the shape the JS side parses.
  static func snapshot(traits: UITraitCollection) -> [String: Any] {
    [
      propTheme: theme(of: traits),
      propLocale: localeTag(),
      propReduceMotion: UIAccessibility.isReduceMotionEnabled,
      "systemReduceTransparency": UIAccessibility.isReduceTransparencyEnabled,
      "systemIncreaseContrast": UIAccessibility.isDarkerSystemColorsEnabled,
      "backdropSdkVersion": LynxVersion.versionString(),
      "backdropBlurSupported": true,
      "liquidGlassSupported": supportsLiquidGlass,
    ]
  }

  private static var supportsLiquidGlass: Bool {
    if #available(iOS 26.0, *) { return true }
    return false
  }

  /**
   * `"dark"` / `"light"`, or **`""` for `.unspecified`** — the JS side coerces
   * `""` to `null` and applies its own fallback rather than letting the host
   * guess. (Same contract as Kotlin's `UI_MODE_NIGHT_UNDEFINED` branch, which is
   * the case that actually occurs on some Android images; on iOS a view
   * controller in a window always resolves to light or dark.)
   */
  private static func theme(of traits: UITraitCollection) -> String {
    switch traits.userInterfaceStyle {
    case .dark: return "dark"
    case .light: return "light"
    default: return ""
    }
  }

  /**
   * The user's primary language as a BCP-47 tag (`"zh-Hans-CN"`, `"en-US"`); the
   * JS side takes the primary subtag (`languageFromLocale`), so the script
   * subtag is harmless.
   *
   * `Locale.preferredLanguages.first` rather than
   * `Bundle.main.preferredLocalizations.first`: the latter resolves against the
   * *bundle's* localizations, and this bundle ships none (all strings live in the
   * JS i18n catalogue), so it would answer `"en"` forever. `preferredLanguages`
   * is also what iOS 13+'s per-app language override rewrites, which makes it the
   * true analogue of Android's `Configuration.getLocales()[0]`.
   */
  private static func localeTag() -> String {
    Locale.preferredLanguages.first ?? ""
  }
}

/**
 * The host half of the safe-area contract: the four inset values, in points, that
 * the page turns into its `--safe-top` / `--safe-bottom` / `--safe-left` /
 * `--safe-right` tokens (`src/shared/theme/tokens.css`).
 *
 * **Why the host has to send these at all.** The stylesheets ask for
 * `env(safe-area-inset-*)`, which the Lynx CSS docs list as supported on every
 * backend. On this engine (iOS Lynx 4.0.1) it is **not**: measured on an
 * iPhone 17 Pro simulator through `boundingClientRect`, a
 * `padding-top: env(safe-area-inset-top)` on `.shell__body` leaves its child at
 * `top: 0` — both as a direct declaration and through a custom property, while
 * the same rule with a literal `59px` correctly reports `top: 59`. So `env()`
 * parses, resolves to zero, and reports nothing: the exact silent-failure shape
 * this app's host↔page contracts are otherwise gated against. The previous batch
 * worked around it by insetting the LynxView to the safe area, which is what left
 * the top and bottom bands painted by `view.backgroundColor` instead of the page
 * (see `ViewController`'s type comment).
 *
 * So this rides the same two channels as [SystemAppearance] — `globalProps` for
 * the value the first frame needs, a global event for later changes — and the
 * page prefers it over `env()` because inline custom properties beat the class
 * declarations that carry the `env()` defaults. Hosts that *do* resolve `env()`
 * (Web, with `viewport-fit=cover`) need to send nothing.
 *
 * Points, not CSS strings: Lynx treats 1pt as 1px, and keeping units out of the
 * host means the page owns the whole CSS vocabulary. Keys and event name must stay
 * byte-identical to `src/native/safe-area.ts`.
 */
enum SafeAreaInsets {
  /// `lynx.__globalProps` keys.
  static let propTop = "safeAreaTop"
  static let propBottom = "safeAreaBottom"
  static let propLeft = "safeAreaLeft"
  static let propRight = "safeAreaRight"

  /// Global-event name for a live change (rotation, or the first resolved layout).
  static let eventChanged = "SongloftSystem.safeAreaChanged"

  /// Snapshot the insets in the shape the JS side parses.
  static func snapshot(insets: UIEdgeInsets) -> [String: Any] {
    [
      propTop: Double(insets.top),
      propBottom: Double(insets.bottom),
      propLeft: Double(insets.left),
      propRight: Double(insets.right),
    ]
  }
}

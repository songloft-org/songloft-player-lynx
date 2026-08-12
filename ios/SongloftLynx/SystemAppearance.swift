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

  /// Global-event name for a live change.
  static let eventChanged = "SongloftSystem.appearanceChanged"

  /// Snapshot the host state in the shape the JS side parses.
  static func snapshot(traits: UITraitCollection) -> [String: Any] {
    [propTheme: theme(of: traits), propLocale: localeTag()]
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

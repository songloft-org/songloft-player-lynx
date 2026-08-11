package org.songloft.lynx.system

import android.content.res.Configuration

/**
 * The host half of the system-appearance contract: the OS dark/light setting and
 * locale, handed to the Lynx page so Settings → Appearance / Language can
 * actually mean "follow the system".
 *
 * Lynx has no `prefers-color-scheme` and no locale API, so without this the JS
 * side had nothing to follow and pinned itself to dark + English (`docs/bug.md`).
 *
 * The key and event names must stay byte-identical to
 * `src/native/system-appearance.ts` — same rule as the audio module's event
 * names, and just as silent when broken.
 */
object SystemAppearance {
    /** `lynx.__globalProps` keys. */
    const val PROP_THEME = "systemTheme"
    const val PROP_LOCALE = "systemLocale"

    /** Global-event name for a live change. */
    const val EVENT_CHANGED = "SongloftSystem.appearanceChanged"

    /** Snapshot `configuration` in the shape the JS side parses. */
    fun from(configuration: Configuration): Map<String, Any> = mapOf(
        PROP_THEME to themeOf(configuration),
        PROP_LOCALE to localeTagOf(configuration),
    )

    /**
     * `"dark"` / `"light"`, or **`""` when the system reports
     * `UI_MODE_NIGHT_UNDEFINED`** — some devices and emulator images leave it
     * unset, and claiming "light" there would override the app's own default with
     * a guess. The JS side coerces `""` to `null` and applies its fallback.
     */
    private fun themeOf(configuration: Configuration): String =
        when (configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) {
            Configuration.UI_MODE_NIGHT_YES -> "dark"
            Configuration.UI_MODE_NIGHT_NO -> "light"
            else -> ""
        }

    /**
     * The primary locale as a BCP-47 tag (`"zh-CN"`). `Configuration.getLocales()`
     * needs API 24, which is this app's `minSdk`, so no legacy branch is needed.
     * Empty when the list is empty — again, JS applies the fallback.
     */
    private fun localeTagOf(configuration: Configuration): String =
        configuration.locales.takeIf { !it.isEmpty }?.get(0)?.toLanguageTag() ?: ""
}

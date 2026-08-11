/**
 * i18n bootstrap (batch 9) — i18next core + react-i18next, configured for the
 * Lynx no-DOM / no-Intl runtime.
 *
 * **No browser-language detector.** `i18next-browser-languagedetector` reads
 * `navigator` / `document.cookie`, which do not exist in the Lynx background
 * realm and crash on device (AGENTS §3). Language is chosen manually: read from
 * `SongloftStorage.prefs` at startup, else the default. `changeAppLanguage`
 * flips i18next AND persists the choice.
 *
 * **No-Intl safety.** i18next only touches `Intl` for pluralization + number
 * formatting, and every access is `typeof Intl`-guarded. We additionally pin
 * `compatibilityJSON: 'v3'` so the `PluralResolver` uses i18next's built-in
 * CLDR rules instead of `Intl.PluralRules` (which Lynx engines may lack) — and
 * we never author plural-suffix keys anyway (see `common.songCount*`). i18next
 * core + react-i18next reference no `window` / `document` / `navigator` / `self`
 * at all (verified statically + in a no-DOM realm; see `src/__tests__/i18n-no-dom.test.ts`).
 */
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

import { getSongloftStorage } from '../core/storage/index.js'
import type { SongloftStorage } from '../core/storage/types.js'
import {
  getSystemAppearance,
  subscribeSystemAppearance,
} from '../native/system-appearance.js'
import {
  DEFAULT_LANGUAGE,
  resources,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from './resources.js'

export {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from './resources.js'

/** prefs key persisting the user's language choice. */
export const PREF_LANGUAGE = 'app_language'

/**
 * User-selectable language options. `'system'` means "follow the host OS";
 * storing it removes the pref so the host locale wins on the next launch.
 */
export type AppLanguage = 'system' | SupportedLanguage
export const APP_LANGUAGE_OPTIONS: readonly AppLanguage[] = [
  'system',
  'en',
  'zh',
]

/** True when `lng` is one of the shipped resource languages. */
export function isSupportedLanguage(lng: unknown): lng is SupportedLanguage {
  return (
    typeof lng === 'string' &&
    (SUPPORTED_LANGUAGES as readonly string[]).includes(lng)
  )
}

/**
 * Coerce an arbitrary persisted value into an {@link AppLanguage}. A stored
 * supported code → that code; anything else (null / unknown / '') → `'system'`.
 * Mirrors the zod `.catch()` tolerance rule (AGENTS §2): never throw, just
 * default.
 */
export function coerceAppLanguage(raw: string | null | undefined): AppLanguage {
  if (isSupportedLanguage(raw)) return raw
  return 'system'
}

/**
 * Match a host locale tag against the shipped languages. Compares the primary
 * subtag only, case-insensitively, so `'zh-CN'` / `'zh-Hans-CN'` / `'ZH'` all
 * map to `'zh'`; an unshipped language (`'fr-FR'`) or a missing tag → `null`,
 * leaving the fallback to the caller.
 *
 * Deliberately *not* `Intl.Locale`-based: Lynx engines may ship without `Intl`
 * (see the no-Intl note above), so this is plain string work.
 */
export function languageFromLocale(
  locale: string | null | undefined,
): SupportedLanguage | null {
  if (typeof locale !== 'string') return null
  const primary = locale.split(/[-_]/)[0]?.toLowerCase()
  return isSupportedLanguage(primary) ? primary : null
}

/**
 * Resolve an {@link AppLanguage} to the concrete i18next language code.
 * `'system'` asks the host (`src/native/system-appearance.ts`) and falls back to
 * {@link DEFAULT_LANGUAGE} when it reports no locale, or one we do not ship.
 */
export function resolveLanguage(app: AppLanguage): SupportedLanguage {
  if (app !== 'system') return app
  return languageFromLocale(getSystemAppearance().locale) ?? DEFAULT_LANGUAGE
}

let initialized = false
/** The live choice, so a host locale change knows whether it is being followed. */
let currentApp: AppLanguage = 'system'
let followingSystem = false

/**
 * Start re-applying the host locale while the user's choice is `'system'`.
 * Idempotent; a no-op on hosts with no signal.
 *
 * Unlike the theme, this is not just a re-render: i18next needs an explicit
 * `changeLanguage`, and `react-i18next`'s own subscription then re-renders every
 * `useTranslation` consumer.
 */
function followSystemAppearance(): void {
  if (followingSystem) return
  followingSystem = true
  subscribeSystemAppearance(() => {
    if (currentApp !== 'system') return
    void i18next.changeLanguage(resolveLanguage('system'))
  })
}

/**
 * Initialise i18next once, synchronously (`initImmediate: false` + inline
 * `resources`, no async backend → `t` is usable the moment this returns).
 * Idempotent. Call before the first render (see `App.tsx`).
 */
export function initI18n(
  lng: SupportedLanguage = DEFAULT_LANGUAGE,
): typeof i18next {
  if (initialized) return i18next
  initialized = true
  void i18next.use(initReactI18next).init({
    resources,
    lng,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
    // Built-in CLDR plural rules — never Intl.PluralRules (no-Intl safe).
    compatibilityJSON: 'v3',
    // Synchronous init: resources are inline, no async backend.
    initImmediate: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  })
  return i18next
}

/** The shared i18next instance (initialised lazily if not already). */
export const i18n = i18next

async function tryReadPref(
  storage: SongloftStorage,
  key: string,
): Promise<string | null> {
  try {
    return await storage.prefs.get(key)
  } catch {
    return null
  }
}

/** Read the persisted language choice (best-effort; defaults to `'system'`). */
export async function readSavedLanguage(
  storage: SongloftStorage = getSongloftStorage(),
): Promise<AppLanguage> {
  return coerceAppLanguage(await tryReadPref(storage, PREF_LANGUAGE))
}

/**
 * One-time startup: read the persisted language and apply it to i18next (init
 * first if needed), and start following host locale changes. Best-effort — a
 * rejecting prefs stub falls back to default.
 */
export async function applySavedLanguage(
  storage: SongloftStorage = getSongloftStorage(),
): Promise<AppLanguage> {
  followSystemAppearance()
  const saved = await readSavedLanguage(storage)
  currentApp = saved
  initI18n(resolveLanguage(saved))
  await i18next.changeLanguage(resolveLanguage(saved))
  return saved
}

/**
 * Switch the UI language AND persist the choice. `'system'` removes the pref (so
 * the host locale wins on the next launch) and applies the host locale now; a
 * concrete code is stored. Returns the resolved i18next code now in effect.
 */
export async function changeAppLanguage(
  app: AppLanguage,
  storage: SongloftStorage = getSongloftStorage(),
): Promise<SupportedLanguage> {
  // Also covers picking "system" at runtime in a process that never ran startup.
  followSystemAppearance()
  currentApp = app
  const resolved = resolveLanguage(app)
  initI18n(resolved)
  await i18next.changeLanguage(resolved)
  try {
    if (app === 'system') await storage.prefs.remove(PREF_LANGUAGE)
    else await storage.prefs.set(PREF_LANGUAGE, app)
  } catch {
    // best-effort — persistence may be unavailable (native stub / memory).
  }
  return resolved
}

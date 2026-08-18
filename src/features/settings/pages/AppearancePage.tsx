import { useEffect, useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import {
  APP_LANGUAGE_OPTIONS,
  type AppLanguage,
  changeAppLanguage,
  coerceAppLanguage,
  PREF_LANGUAGE,
} from '../../../i18n/index.js'
import { getSongloftStorage } from '../../../core/storage/index.js'
import {
  APP_THEME_OPTIONS,
  type AppTheme,
  changeAppTheme,
  coerceAppTheme,
  getAppTheme,
  PREF_THEME,
} from '../../../shared/theme/theme-model.js'
import { SettingsRow } from '../widgets/SettingsRow.js'
import { SettingsSection } from '../widgets/SettingsSection.js'
import { SubPageShell } from '../widgets/SubPageShell.js'

/** i18n key for a language option's label. */
function languageLabelKey(lang: AppLanguage): string {
  switch (lang) {
    case 'en':
      return 'settings.languageEnglish'
    case 'zh':
      return 'settings.languageChinese'
    default:
      return 'settings.languageSystem'
  }
}

/** i18n key for a theme option's label. */
function themeLabelKey(theme: AppTheme): string {
  switch (theme) {
    case 'light':
      return 'settings.themeLight'
    case 'dark':
      return 'settings.themeDark'
    default:
      return 'settings.themeSystem'
  }
}

/**
 * `/settings/appearance` — theme + language, the two choices that restyle the
 * whole app. Both apply live (they re-render the entire tree) and persist.
 */
export function AppearancePage() {
  const { t } = useTranslation()

  // Seeded from the live module state, which `applySavedTheme` already set at
  // startup (see `src/index.tsx`), then overridden below once the persisted pref
  // is re-read. Starting from `'system'` instead would flash a frame with the
  // wrong option ticked.
  const [theme, setTheme] = useState<AppTheme>(getAppTheme)
  const [language, setLanguage] = useState<AppLanguage>('system')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const saved = coerceAppTheme(await getSongloftStorage().prefs.get(PREF_THEME))
        if (!cancelled) setTheme(saved)
      } catch {
        /* best-effort — leave the live module state */
      }
    })()
    void (async () => {
      try {
        const saved = coerceAppLanguage(await getSongloftStorage().prefs.get(PREF_LANGUAGE))
        if (!cancelled) setLanguage(saved)
      } catch {
        /* best-effort — leave 'system' */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const selectTheme = (next: AppTheme) => {
    setTheme(next)
    void changeAppTheme(next)
  }

  const selectLanguage = (next: AppLanguage) => {
    setLanguage(next)
    void changeAppLanguage(next)
  }

  return (
    <SubPageShell title={t('settings.categoryAppearance')} backTestId='appearance-back'>
      <SettingsSection title={t('settings.themeSection')} icon='palette'>
        {APP_THEME_OPTIONS.map((option) => (
          <SettingsRow
            key={option}
            title={t(themeLabelKey(option))}
            selected={option === theme}
            trailingIcon={option === theme ? 'check' : undefined}
            onTap={() => selectTheme(option)}
            testId={`theme-${option}`}
          />
        ))}
      </SettingsSection>

      <SettingsSection title={t('settings.languageSection')} icon='settings'>
        {APP_LANGUAGE_OPTIONS.map((option) => (
          <SettingsRow
            key={option}
            title={t(languageLabelKey(option))}
            selected={option === language}
            trailingIcon={option === language ? 'check' : undefined}
            onTap={() => selectLanguage(option)}
            testId={`language-${option}`}
          />
        ))}
      </SettingsSection>
    </SubPageShell>
  )
}

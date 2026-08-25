import { useEffect, useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
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
import { ThemePacksSection } from '../widgets/ThemePacksSection.js'

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
 * `/settings/appearance` — theme + theme packs + language, the choices that
 * restyle the whole app. All apply live (they re-render the entire tree) and
 * persist. The theme-pack card used to be its own route
 * (`/settings/theme-packs`); it merged in here because light/dark and a color
 * pack are two halves of the same question — one is the base palette, the
 * other overrides its seed color.
 *
 * The store itself stays a page (`/settings/theme-catalog`, entered from the
 * card's tail row): browsing what can be installed is a different activity
 * than picking the active pack.
 */
export function AppearancePage({ onOpenCatalog }: { onOpenCatalog?: () => void }) {
  const navigate = useNavigate()
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

  /**
   * Open the theme store. In the wide settings master–detail this page sits in
   * the right pane and `onOpenCatalog` swaps the pane in place — a route
   * navigation would unmount SettingsPage and drop the settings list. As a
   * standalone route (single-column) there is no pane, so fall back to
   * routing. (Same shape as `PluginManagerPage.onOpenStore`.)
   */
  const openCatalog = () => {
    if (onOpenCatalog) {
      onOpenCatalog()
    } else {
      void navigate({ to: '/settings/theme-catalog' })
    }
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

      <ThemePacksSection onOpenCatalog={openCatalog} />

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

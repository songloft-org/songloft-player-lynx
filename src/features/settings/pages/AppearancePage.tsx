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
  type FontScaleOption,
  FONT_SCALE_OPTIONS,
  changeFontScale,
  coerceFontScale,
  getFontScale,
  PREF_FONT_SCALE,
} from '../../../shared/theme/font-scale-model.js'
import {
  type MaterialVariant,
  MATERIAL_VARIANT_OPTIONS,
  changeMaterialVariant,
  coerceMaterialVariant,
  getMaterialVariant,
  PREF_MATERIAL,
} from '../../../shared/theme/material-model.js'
import {
  changeIncreaseContrast,
  coerceIncreaseContrast,
  getIncreaseContrast,
  PREF_INCREASE_CONTRAST,
} from '../../../shared/theme/increase-contrast-model.js'
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
import { SegmentedControl } from '../widgets/SegmentedControl.js'
import { FontScaleSlider } from '../widgets/FontScaleSlider.js'
import { SwitchRow } from '../widgets/SwitchRow.js'
import { ThemeAppearancePicker } from '../widgets/ThemeAppearancePicker.js'
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

function fontScaleLabelKey(option: FontScaleOption): string {
  switch (option) {
    case 'small': return 'settings.fontScaleSmall'
    case 'large': return 'settings.fontScaleLarge'
    case 'xlarge': return 'settings.fontScaleXLarge'
    default: return 'settings.fontScaleDefault'
  }
}

function materialLabelKey(variant: MaterialVariant): string {
  switch (variant) {
    case 'ultra-thin': return 'settings.materialUltraThin'
    case 'thin': return 'settings.materialThin'
    case 'thick': return 'settings.materialThick'
    default: return 'settings.materialRegular'
  }
}

function materialDescKey(variant: MaterialVariant): string {
  switch (variant) {
    case 'ultra-thin': return 'settings.materialUltraThinDesc'
    case 'thin': return 'settings.materialThinDesc'
    case 'thick': return 'settings.materialThickDesc'
    default: return 'settings.materialRegularDesc'
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
  const [material, setMaterial] = useState<MaterialVariant>(getMaterialVariant)
  const [fontScale, setFontScale] = useState<FontScaleOption>(getFontScale)
  const [increaseContrast, setIncreaseContrast] = useState<boolean>(getIncreaseContrast)
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
      void (async () => {
        try {
          const saved = coerceFontScale(await getSongloftStorage().prefs.get(PREF_FONT_SCALE))
          if (!cancelled) setFontScale(saved)
        } catch {
          /* best-effort */
        }
      })()
      void (async () => {
        try {
          const saved = coerceMaterialVariant(await getSongloftStorage().prefs.get(PREF_MATERIAL))
          if (!cancelled) setMaterial(saved)
        } catch {
          /* best-effort */
        }
      })()
      void (async () => {
        try {
          const saved = coerceIncreaseContrast(
            await getSongloftStorage().prefs.get(PREF_INCREASE_CONTRAST),
          )
          if (!cancelled) setIncreaseContrast(saved)
        } catch {
          /* best-effort */
        }
      })()
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

  const selectFontScale = (next: FontScaleOption) => {
    setFontScale(next)
    void changeFontScale(next)
  }

  const toggleIncreaseContrast = (next: boolean) => {
    setIncreaseContrast(next)
    void changeIncreaseContrast(next)
  }

  const selectMaterial = (next: MaterialVariant) => {
    setMaterial(next)
    void changeMaterialVariant(next)
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
    <SubPageShell title={t('settings.categoryAppearance')} backTestId='appearance-back' grouped>
      <SettingsSection title={t('settings.themeSection')}>
        <view className='settings-section__padded'>
          <ThemeAppearancePicker
            options={APP_THEME_OPTIONS}
            selected={theme}
            onSelect={selectTheme}
            labelFor={(option) => t(themeLabelKey(option))}
            testId='theme'
          />
        </view>
      </SettingsSection>

      <SettingsSection title={t('settings.materialSection')}>
        <view className='settings-section__padded'>
          <SegmentedControl
            options={MATERIAL_VARIANT_OPTIONS}
            selected={material}
            onSelect={selectMaterial}
            labelFor={(option) => t(materialLabelKey(option))}
            testId='material'
          />
          <text className='appearance-material-desc'>{t(materialDescKey(material))}</text>
        </view>
      </SettingsSection>

      <SettingsSection title={t('settings.fontScaleSection')}>
        <view className='settings-section__padded'>
          <FontScaleSlider
            options={FONT_SCALE_OPTIONS}
            selectedIndex={FONT_SCALE_OPTIONS.indexOf(fontScale)}
            labelFor={(option) => t(fontScaleLabelKey(option))}
            onCommit={selectFontScale}
            testId='fontscale'
          />
        </view>
      </SettingsSection>

      {/* Sits right after text size: both are accessibility knobs that restyle
          the whole app live. Grouped under their own heading so a second a11y
          switch has an obvious home rather than joining the colour pickers. */}
      <SettingsSection title={t('settings.accessibilitySection')}>
        <SwitchRow
          icon='eye'
          title={t('settings.increaseContrast')}
          subtitle={t('settings.increaseContrastDesc')}
          checked={increaseContrast}
          onChange={toggleIncreaseContrast}
          testId='increase-contrast'
        />
      </SettingsSection>

      <ThemePacksSection onOpenCatalog={openCatalog} />

      <SettingsSection title={t('settings.languageSection')}>
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

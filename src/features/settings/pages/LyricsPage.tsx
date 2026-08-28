import { useEffect, useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import { getFloatingLyricModule } from '../../../native/floating-lyric.js'
import { getPlatformCapabilities } from '../../../native/platform-capabilities.js'
import {
  type FloatingLyricFontSize,
  type FloatingLyricOpacity,
  readAutoEnterLyrics,
  readFloatingLyricEnabled,
  readFloatingLyricFontSize,
  readFloatingLyricLocked,
  readFloatingLyricOpacity,
  readFloatingLyricTwoLine,
  readNotificationLyricInTitle,
  writeAutoEnterLyrics,
  writeFloatingLyricFontSize,
  writeFloatingLyricLocked,
  writeFloatingLyricOpacity,
  writeFloatingLyricTwoLine,
  writeNotificationLyricInTitle,
} from '../data/settings-prefs.js'
import {
  disableFloatingLyricOverlay,
  enableFloatingLyricOverlay,
  syncFloatingLyricOverlay,
} from '../domain/floating-lyric-overlay.js'
import { SettingsRow } from '../widgets/SettingsRow.js'
import { SettingsSection } from '../widgets/SettingsSection.js'
import { SubPageShell } from '../widgets/SubPageShell.js'
import { SwitchRow } from '../widgets/SwitchRow.js'

const FLOATING_LYRIC_FONT_SIZE_OPTIONS: FloatingLyricFontSize[] = ['small', 'medium', 'large']
const FLOATING_LYRIC_OPACITY_OPTIONS: FloatingLyricOpacity[] = [0.2, 0.4, 0.6, 0.8]

/**
 * `/settings/lyrics` — where lyrics show up: the full-screen view on launch, the
 * notification title line, and (where the platform supports an overlay window)
 * the floating lyrics and their appearance.
 */
export function LyricsPage() {
  const { t } = useTranslation()

  const [autoEnterLyrics, setAutoEnterLyrics] = useState(false)
  const [notificationLyricInTitle, setNotificationLyricInTitle] = useState(true)
  const [floatingLyricEnabled, setFloatingLyricEnabled] = useState(false)
  const [floatingLyricFontSize, setFloatingLyricFontSize] = useState<FloatingLyricFontSize>('medium')
  const [floatingLyricLocked, setFloatingLyricLocked] = useState(false)
  const [floatingLyricOpacity, setFloatingLyricOpacity] = useState<FloatingLyricOpacity>(0.4)
  const [floatingLyricTwoLine, setFloatingLyricTwoLine] = useState(true)

  useEffect(() => {
    let cancelled = false
    void readAutoEnterLyrics()
      .then((v) => { if (!cancelled) setAutoEnterLyrics(v) })
      .catch(() => {})
    void readNotificationLyricInTitle()
      .then((v) => { if (!cancelled) setNotificationLyricInTitle(v) })
      .catch(() => {})
    void readFloatingLyricEnabled()
      .then((v) => { if (!cancelled) setFloatingLyricEnabled(v) })
      .catch(() => {})
    // …then reconcile pref against grant, which is what the switch actually
    // reflects: this re-shows an overlay the user left on (a fresh process has
    // none) and, when the grant was revoked meanwhile, turns the pref off so the
    // switch stops reading "on" over nothing. No `requestPermission` here —
    // opening the page must not throw the user into system settings.
    void syncFloatingLyricOverlay()
      .then((on) => { if (!cancelled && getPlatformCapabilities().floatingLyric) setFloatingLyricEnabled(on) })
      .catch(() => {})
    void readFloatingLyricFontSize()
      .then((v) => { if (!cancelled) setFloatingLyricFontSize(v) })
      .catch(() => {})
    void readFloatingLyricLocked()
      .then((v) => { if (!cancelled) setFloatingLyricLocked(v) })
      .catch(() => {})
    void readFloatingLyricOpacity()
      .then((v) => { if (!cancelled) setFloatingLyricOpacity(v) })
      .catch(() => {})
    void readFloatingLyricTwoLine()
      .then((v) => { if (!cancelled) setFloatingLyricTwoLine(v) })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <SubPageShell title={t('settings.lyricsSection')} backTestId='lyrics-back'>
      <SettingsSection title={t('settings.lyricsSection')} icon='music'>
        <SwitchRow
          icon='music'
          title={t('settings.autoEnterLyrics')}
          subtitle={t('settings.autoEnterLyricsSubtitle')}
          checked={autoEnterLyrics}
          onChange={(next) => { setAutoEnterLyrics(next); void writeAutoEnterLyrics(next) }}
          testId='settings-auto-enter-lyrics'
        />
        <SwitchRow
          icon='music'
          title={t('settings.notificationLyricInTitle')}
          subtitle={t('settings.notificationLyricInTitleSubtitle')}
          checked={notificationLyricInTitle}
          onChange={(next) => { setNotificationLyricInTitle(next); void writeNotificationLyricInTitle(next) }}
          testId='settings-notification-lyric-title'
        />
        {getPlatformCapabilities().floatingLyric
          ? (
            <SwitchRow
              icon='music'
              title={t('settings.floatingLyrics')}
              subtitle={t('settings.floatingLyricsSubtitle')}
              checked={floatingLyricEnabled}
              onChange={(next) => {
                setFloatingLyricEnabled(next)
                if (next) {
                  // `enableFloatingLyricOverlay` owns the pref: it resolves only
                  // after the grant screen (if any) is done, and answers `false`
                  // when the user came back without granting — at which point the
                  // switch has to go back down rather than lie about an overlay.
                  void enableFloatingLyricOverlay()
                    .then((on) => { if (!on) setFloatingLyricEnabled(false) })
                    .catch(() => { setFloatingLyricEnabled(false) })
                } else {
                  void disableFloatingLyricOverlay().catch(() => {})
                }
              }}
              testId='settings-floating-lyric-toggle'
            />
          )
          : null}
      </SettingsSection>

      {/* The overlay's appearance only means anything once the overlay is on. */}
      {getPlatformCapabilities().floatingLyric && floatingLyricEnabled
        ? (
          <>
            <SettingsSection title={t('settings.floatingLyricFontSize')} icon='music'>
              {FLOATING_LYRIC_FONT_SIZE_OPTIONS.map((option) => (
                <SettingsRow
                  key={option}
                  title={t(`settings.floatingLyricFont${option.charAt(0).toUpperCase()}${option.slice(1)}`)}
                  selected={option === floatingLyricFontSize}
                  trailingIcon={option === floatingLyricFontSize ? 'check' : undefined}
                  onTap={() => { setFloatingLyricFontSize(option); void writeFloatingLyricFontSize(option); void getFloatingLyricModule().setFontSize(option).catch(() => {}) }}
                  testId={`floating-lyric-font-${option}`}
                />
              ))}
            </SettingsSection>
            <SettingsSection>
              <SwitchRow
                icon='music'
                title={t('settings.floatingLyricTwoLine')}
                subtitle={t('settings.floatingLyricTwoLineSubtitle')}
                checked={floatingLyricTwoLine}
                onChange={(next) => { setFloatingLyricTwoLine(next); void writeFloatingLyricTwoLine(next); void getFloatingLyricModule().setTwoLine(next).catch(() => {}) }}
                testId='settings-floating-lyric-two-line'
              />
            </SettingsSection>
            <SettingsSection>
              <SwitchRow
                icon='music'
                title={t('settings.floatingLyricLock')}
                checked={floatingLyricLocked}
                onChange={(next) => { setFloatingLyricLocked(next); void writeFloatingLyricLocked(next); void getFloatingLyricModule().setLocked(next).catch(() => {}) }}
                testId='settings-floating-lyric-lock'
              />
            </SettingsSection>
            <SettingsSection title={t('settings.floatingLyricOpacity')} icon='music'>
              {FLOATING_LYRIC_OPACITY_OPTIONS.map((option) => (
                <SettingsRow
                  key={option}
                  title={`${Math.round(option * 100)}%`}
                  selected={option === floatingLyricOpacity}
                  trailingIcon={option === floatingLyricOpacity ? 'check' : undefined}
                  onTap={() => { setFloatingLyricOpacity(option); void writeFloatingLyricOpacity(option); void getFloatingLyricModule().setOpacity(option).catch(() => {}) }}
                  testId={`floating-lyric-opacity-${String(option)}`}
                />
              ))}
            </SettingsSection>
          </>
        )
        : null}
    </SubPageShell>
  )
}

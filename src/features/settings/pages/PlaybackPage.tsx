import { useEffect, useState, useSyncExternalStore } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import { getFloatingLyricModule } from '../../../native/floating-lyric.js'
import { getPlatformCapabilities } from '../../../native/platform-capabilities.js'
import { setAudioQualityCache, setNormalizeEnabled } from '../../player/store/player-store.js'
import { useLyricStore } from '../../player/store/lyric-store.js'
import { webShortcuts } from '../../player/data/web-shortcuts.js'
import { hasPlaybackKeys } from '../../../native/web-playback-keys.js'
import { getSettingsApi } from '../api/index.js'
import {
  type AudioQuality,
  type FloatingLyricFontSize,
  type FloatingLyricOpacity,
  readAudioQuality,
  readAutoEnterLyrics,
  readAutoResume,
  readFloatingLyricEnabled,
  readFloatingLyricFontSize,
  readFloatingLyricLocked,
  readFloatingLyricOpacity,
  readFloatingLyricTwoLine,
  readNormalize,
  readNotificationLyricInTitle,
  writeAudioQuality,
  writeAutoEnterLyrics,
  writeAutoResume,
  writeFloatingLyricFontSize,
  writeFloatingLyricLocked,
  writeFloatingLyricOpacity,
  writeFloatingLyricTwoLine,
  writeNormalize,
  writeNotificationLyricInTitle,
} from '../data/settings-prefs.js'
import {
  disableFloatingLyricOverlay,
  enableFloatingLyricOverlay,
  syncFloatingLyricOverlay,
} from '../domain/floating-lyric-overlay.js'
import { SegmentedControl } from '../widgets/SegmentedControl.js'
import { SettingsRow } from '../widgets/SettingsRow.js'
import { SettingsSection } from '../widgets/SettingsSection.js'
import { SubPageShell } from '../widgets/SubPageShell.js'
import { SwitchRow } from '../widgets/SwitchRow.js'
import {
  changeSongTitleScrolling,
  getSongTitleScrolling,
  subscribeSongTitleScrolling,
} from '../../../shared/ui/scrolling-text-preference.js'

const AUDIO_QUALITY_OPTIONS: AudioQuality[] = ['original', '320', '192', '128']
const FLOATING_LYRIC_FONT_SIZE_OPTIONS: FloatingLyricFontSize[] = ['small', 'medium', 'large']
const FLOATING_LYRIC_OPACITY_OPTIONS: FloatingLyricOpacity[] = [0.2, 0.4, 0.6, 0.8]

/**
 * `/settings/playback` — streaming quality, resume-on-launch, loudness
 * normalization **and** lyrics display. Lyrics used to live on its own page
 * (`/settings/lyrics`); it merged in here because where the music plays and where
 * the lyrics show up are two halves of the same playback question, so reaching
 * one should not mean a trip back to the settings list to reach the other.
 *
 * The equalizer is deliberately **not** here and has no settings entry at all:
 * it lives at `/player/eq`, reached from the player's `⋯` menu.
 */
export function PlaybackPage() {
  const [shortcutsEnabled, setShortcutsEnabled] = useState(webShortcuts.getState().enabled)
  useEffect(() => {
    const stop = webShortcuts.subscribe(state => setShortcutsEnabled(state.enabled))
    setShortcutsEnabled(webShortcuts.getState().enabled)
    return stop
  }, [])
  const { t } = useTranslation()
  const songTitleScrolling = useSyncExternalStore(subscribeSongTitleScrolling, getSongTitleScrolling)

  // ── Playback state ───────────────────────────────────────────────────────
  const [audioQuality, setAudioQuality] = useState<AudioQuality>('original')
  const [autoResume, setAutoResume] = useState(false)
  const [normalize, setNormalize] = useState(false)

  // ── Lyrics state ─────────────────────────────────────────────────────────
  const [autoEnterLyrics, setAutoEnterLyrics] = useState(false)
  const [notificationLyricInTitle, setNotificationLyricInTitle] = useState(true)
  const [floatingLyricEnabled, setFloatingLyricEnabled] = useState(false)
  const [floatingLyricFontSize, setFloatingLyricFontSize] = useState<FloatingLyricFontSize>('medium')
  const [floatingLyricLocked, setFloatingLyricLocked] = useState(false)
  const [floatingLyricOpacity, setFloatingLyricOpacity] = useState<FloatingLyricOpacity>(0.4)
  const [floatingLyricTwoLine, setFloatingLyricTwoLine] = useState(true)

  useEffect(() => {
    let cancelled = false
    // Playback prefs.
    void readAudioQuality()
      .then((q) => { if (!cancelled) setAudioQuality(q) })
      .catch(() => {})
    void readAutoResume()
      .then((v) => { if (!cancelled) setAutoResume(v) })
      .catch(() => {})
    void readNormalize()
      .then((v) => { if (!cancelled) setNormalize(v) })
      .catch(() => {})
    // Lyrics prefs.
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

  const selectAudioQuality = (next: AudioQuality) => {
    setAudioQuality(next)
    // 'original' means "don't ask the backend to transcode", which the player
    // store expresses as a null override — not as the literal string.
    setAudioQualityCache(next === 'original' ? null : next)
    void writeAudioQuality(next)
  }

  return (
    <SubPageShell title={t('settings.categoryPlayback')} backTestId='playback-back' grouped>
      {/* ── Playback ────────────────────────────────────────────────────── */}
      <SettingsSection title={t('settings.audioQuality')}>
        <view className='settings-section__padded'>
          <SegmentedControl
            options={AUDIO_QUALITY_OPTIONS}
            selected={audioQuality}
            onSelect={selectAudioQuality}
            labelFor={(option) => t(`settings.quality_${option}`)}
            testId='audio-quality'
          />
        </view>
      </SettingsSection>

      <SettingsSection>
        <SwitchRow
          icon='music'
          title={t('settings.songTitleScrolling')}
          subtitle={t('settings.songTitleScrollingSubtitle')}
          checked={songTitleScrolling}
          onChange={(next) => { void changeSongTitleScrolling(next) }}
          testId='settings-song-title-scrolling'
        />
        <SwitchRow
          icon='music'
          title={t('settings.autoResume')}
          subtitle={t('settings.autoResumeSubtitle')}
          checked={autoResume}
          onChange={(next) => { setAutoResume(next); void writeAutoResume(next) }}
          testId='settings-auto-resume'
        />
        <SwitchRow
          icon='volume'
          title={t('settings.normalize')}
          subtitle={t('settings.normalizeSubtitle')}
          checked={normalize}
          onChange={(next) => {
            // Four writes, and dropping any one leaves the toggle half-working:
            // local state, the player store (so the *current* track picks it up),
            // the pref, and the backend (which does the actual loudness pass).
            setNormalize(next)
            setNormalizeEnabled(next)
            void writeNormalize(next)
            void getSettingsApi().updateVolumeNormalize(next).catch(() => {})
          }}
          testId='settings-normalize'
        />
      </SettingsSection>

      {hasPlaybackKeys() && <SettingsSection title={t('settings.keyboardShortcuts')}>
        <SwitchRow
          icon='music'
          title={t('settings.keyboardShortcuts')}
          subtitle={t('settings.keyboardShortcutsMap')}
          checked={shortcutsEnabled}
          onChange={next => webShortcuts.getState().setEnabled(next)}
          testId='settings-keyboard-shortcuts'
        />
      </SettingsSection>}

      {/* ── Lyrics ─────────────────────────────────────────────────────── */}
      <SettingsSection title={t('settings.lyricsSection')}>
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
          onChange={(next) => { setNotificationLyricInTitle(next); void writeNotificationLyricInTitle(next); useLyricStore.getState().setNotificationLyricInTitle(next) }}
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
            <SettingsSection title={t('settings.floatingLyricFontSize')}>
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
            <SettingsSection title={t('settings.floatingLyricOpacity')}>
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

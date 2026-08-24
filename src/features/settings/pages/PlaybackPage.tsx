import { useEffect, useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import { setAudioQualityCache, setNormalizeEnabled } from '../../player/store/player-store.js'
import { getSettingsApi } from '../api/index.js'
import {
  type AudioQuality,
  readAudioQuality,
  readAutoResume,
  readNormalize,
  writeAudioQuality,
  writeAutoResume,
  writeNormalize,
} from '../data/settings-prefs.js'
import { SettingsRow } from '../widgets/SettingsRow.js'
import { SettingsSection } from '../widgets/SettingsSection.js'
import { SubPageShell } from '../widgets/SubPageShell.js'
import { SwitchRow } from '../widgets/SwitchRow.js'

const AUDIO_QUALITY_OPTIONS: AudioQuality[] = ['original', '320', '192', '128']

/**
 * `/settings/playback` — streaming quality, resume-on-launch and loudness
 * normalization. The equalizer is deliberately **not** here and has no settings
 * entry at all: it lives at `/player/eq`, reached from the player's `⋯` menu.
 */
export function PlaybackPage() {
  const { t } = useTranslation()

  const [audioQuality, setAudioQuality] = useState<AudioQuality>('original')
  const [autoResume, setAutoResume] = useState(false)
  const [normalize, setNormalize] = useState(false)

  useEffect(() => {
    let cancelled = false
    void readAudioQuality()
      .then((q) => { if (!cancelled) setAudioQuality(q) })
      .catch(() => {})
    void readAutoResume()
      .then((v) => { if (!cancelled) setAutoResume(v) })
      .catch(() => {})
    void readNormalize()
      .then((v) => { if (!cancelled) setNormalize(v) })
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
    <SubPageShell title={t('settings.categoryPlayback')} backTestId='playback-back'>
      <SettingsSection title={t('settings.audioQuality')} icon='music'>
        {AUDIO_QUALITY_OPTIONS.map((option) => (
          <SettingsRow
            key={option}
            title={t(`settings.quality_${option}`)}
            selected={option === audioQuality}
            trailingIcon={option === audioQuality ? 'check' : undefined}
            onTap={() => selectAudioQuality(option)}
            testId={`audio-quality-${option}`}
          />
        ))}
      </SettingsSection>

      <SettingsSection>
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
    </SubPageShell>
  )
}

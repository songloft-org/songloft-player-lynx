import { useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import { SettingsRow } from '../../settings/widgets/SettingsRow.js'
import { SettingsSection } from '../../settings/widgets/SettingsSection.js'
import {
  useAutoCreatePlaylists,
  useAutoScan,
  useScanAutoFingerprint,
  useScanPlaylistMode,
  useScanTitleSource,
  useSetAutoCreatePlaylists,
  useSetAutoScan,
  useSetScanAutoFingerprint,
  useSetScanPlaylistMode,
  useSetScanTitleSource,
} from '../data/index.js'
import {
  AUTO_SCAN_INTERVALS,
  PLAYLIST_MODES,
  autoScanIntervalLabelKey,
  coerceIntervalSeconds,
  playlistModeDescKey,
  playlistModeLabelKey,
} from '../domain/scan-model.js'
import { SwitchRow } from '../../settings/widgets/SwitchRow.js'

export interface ScanSettingsSectionProps {
  onWriteError: () => void
}

/**
 * The five backend-owned scan preferences.
 *
 * Multi-choice settings (playlist mode, auto-scan interval) render as a
 * collapsible header row plus option rows with a `check` on the selection — Lynx
 * has no dropdown, and the header toggles a `chevron-up/down` so the options stay
 * folded until tapped. Both option lists are mounted only when relevant: the
 * interval list only while auto-scan is on, and the playlist-mode list only while
 * auto-create is on **and** the header is expanded, so neither costs vertical
 * space when it is not in use.
 */
export function ScanSettingsSection({ onWriteError }: ScanSettingsSectionProps) {
  const { t } = useTranslation()
  const [showIntervals, setShowIntervals] = useState(false)
  const [showPlaylistModes, setShowPlaylistModes] = useState(false)

  const autoCreate = useAutoCreatePlaylists()
  const setAutoCreate = useSetAutoCreatePlaylists()
  const playlistMode = useScanPlaylistMode()
  const setPlaylistMode = useSetScanPlaylistMode()
  const titleSource = useScanTitleSource()
  const setTitleSource = useSetScanTitleSource()
  const autoScan = useAutoScan()
  const setAutoScan = useSetAutoScan()
  const fingerprint = useScanAutoFingerprint()
  const setFingerprint = useSetScanAutoFingerprint()

  const fail = () => onWriteError()

  const autoCreateOn = autoCreate.data?.value ?? true
  const currentMode = playlistMode.data?.value ?? 'directory'
  const useFilename = (titleSource.data?.value ?? 'tag') === 'filename'
  const autoScanOn = autoScan.data?.value.enabled ?? false
  const interval = coerceIntervalSeconds(autoScan.data?.value.intervalSeconds)
  const fingerprintOn = fingerprint.data?.value ?? false

  /** Failed reads degrade to the default; say so instead of lying silently. */
  const hint = (readFailed: boolean | undefined, normal: string) =>
    readFailed ? t('libops.readConfigFailed') : normal

  return (
    <SettingsSection title={t('libops.switchesSection')}>
      <SwitchRow
        icon='plus'
        title={t('libops.autoCreatePlaylists')}
        subtitle={hint(autoCreate.data?.readFailed, t('libops.autoCreatePlaylistsDesc'))}
        checked={autoCreateOn}
        onChange={(next) => setAutoCreate.mutate(next, { onError: fail })}
        testId='switch-auto-create'
      />

      <SettingsRow
        icon='menu'
        title={t('libops.playlistModeTitle')}
        subtitle={autoCreateOn
          ? t(playlistModeDescKey(currentMode))
          : t('libops.playlistModeDisabled')}
        trailingText={t(playlistModeLabelKey(currentMode))}
        trailingIcon={showPlaylistModes ? 'chevron-up' : 'chevron-down'}
        onTap={() => setShowPlaylistModes(!showPlaylistModes)}
        disabled={!autoCreateOn}
        testId='row-playlist-mode'
      />
      {autoCreateOn && showPlaylistModes
        ? PLAYLIST_MODES.map((mode) => (
          <SettingsRow
            key={mode}
            title={t(playlistModeLabelKey(mode))}
            subtitle={t(playlistModeDescKey(mode))}
            selected={currentMode === mode}
            trailingIcon={currentMode === mode ? 'check' : undefined}
            onTap={() => setPlaylistMode.mutate(mode, { onError: fail })}
            testId={`playlist-mode-${mode}`}
          />
        ))
        : null}

      <SwitchRow
        icon='library'
        title={t('libops.titleSource')}
        subtitle={hint(
          titleSource.data?.readFailed,
          useFilename ? t('libops.titleSourceFilenameDesc') : t('libops.titleSourceTagDesc'),
        )}
        checked={useFilename}
        onChange={(next) =>
          setTitleSource.mutate(next ? 'filename' : 'tag', { onError: fail })}
        testId='switch-title-source'
      />

      <SwitchRow
        icon='refresh'
        title={t('libops.autoScan')}
        subtitle={hint(autoScan.data?.readFailed, t(autoScanIntervalLabelKey(interval)))}
        checked={autoScanOn}
        onChange={(next) =>
          setAutoScan.mutate({ enabled: next, intervalSeconds: interval }, { onError: fail })}
        testId='switch-auto-scan'
      />
      {autoScanOn
        ? (
          <>
            <SettingsRow
              icon='timer'
              title={t('libops.scanInterval')}
              trailingText={t(autoScanIntervalLabelKey(interval))}
              trailingIcon={showIntervals ? 'chevron-up' : 'chevron-down'}
              onTap={() => setShowIntervals(!showIntervals)}
              testId='row-scan-interval'
            />
            {showIntervals
              ? AUTO_SCAN_INTERVALS.map((seconds) => (
                <SettingsRow
                  key={seconds}
                  title={t(autoScanIntervalLabelKey(seconds))}
                  selected={interval === seconds}
                  trailingIcon={interval === seconds ? 'check' : undefined}
                  onTap={() =>
                    setAutoScan.mutate(
                      { enabled: true, intervalSeconds: seconds },
                      { onError: fail },
                    )}
                  testId={`interval-${seconds}`}
                />
              ))
              : null}
          </>
        )
        : null}

      <SwitchRow
        icon='fingerprint'
        title={t('libops.autoFingerprint')}
        subtitle={hint(fingerprint.data?.readFailed, t('libops.autoFingerprintDesc'))}
        checked={fingerprintOn}
        onChange={(next) => setFingerprint.mutate(next, { onError: fail })}
        testId='switch-fingerprint'
      />
    </SettingsSection>
  )
}

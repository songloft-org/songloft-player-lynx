import { useTranslation } from 'react-i18next'

import type { MetadataProgress } from '../../../models/library-ops.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { SettingsSection } from '../../settings/widgets/SettingsSection.js'
import { useRemoteTitleSource, useSetRemoteTitleSource } from '../data/index.js'
import { useTagSyncToFile, useSetTagSyncToFile } from '../../library/data/song-tags-query.js'
import {
  metadataBarValue,
  metadataResultStatusKey,
  metadataViewKind,
} from '../domain/scan-model.js'
import { ProgressBar } from './ProgressBar.js'
import { SwitchRow } from '../../settings/widgets/SwitchRow.js'

export interface MetadataSectionProps {
  progress: MetadataProgress | undefined
  starting: boolean
  cancelling: boolean
  onStart: () => void
  onCancel: () => void
  onWriteError: () => void
}

/**
 * Remote-song metadata refresh: the "override titles with tags" preference plus
 * a three-state action row (idle → running → result).
 *
 * `remote-title-source` defaults to **`filename`**, unlike the scan-side
 * `scan-title-source` which defaults to `tag` — the switch reads "use tags to
 * override", so on = `tag`.
 */
export function MetadataSection({
  progress,
  starting,
  cancelling,
  onStart,
  onCancel,
  onWriteError,
}: MetadataSectionProps) {
  const { t } = useTranslation()
  const remoteTitleSource = useRemoteTitleSource()
  const setRemoteTitleSource = useSetRemoteTitleSource()
  const tagSyncToFile = useTagSyncToFile()
  const setTagSyncToFile = useSetTagSyncToFile()

  const useTags = (remoteTitleSource.data?.value ?? 'filename') === 'tag'
  const kind = metadataViewKind(progress)

  return (
    <SettingsSection title={t('libops.metaSection')} icon='info'>
      <SwitchRow
        icon='library'
        title={t('libops.metaUseTagTitle')}
        subtitle={remoteTitleSource.data?.readFailed
          ? t('libops.readConfigFailed')
          : useTags
            ? t('libops.metaUseTagOn')
            : t('libops.metaUseTagOff')}
        checked={useTags}
        onChange={(next) =>
          setRemoteTitleSource.mutate(next ? 'tag' : 'filename', { onError: onWriteError })}
        testId='switch-remote-title-source'
      />
      <SwitchRow
        icon='label'
        title={t('songTag.syncToFile')}
        subtitle={t('songTag.syncToFileHint')}
        checked={tagSyncToFile.data?.value ?? false}
        onChange={(next) => setTagSyncToFile.mutate(next, { onError: onWriteError })}
        testId='switch-tag-sync-to-file'
      />

      {kind === 'running'
        ? (
          <view className='libops__state' data-testid='meta-phase-running'>
            <ProgressBar
              value={progress ? metadataBarValue(progress) : null}
              testId='meta-bar'
            />
            <text className='libops__state-line'>
              {progress && progress.total > 0
                ? `${t('libops.metaRefreshing')} ${progress.completedCount} / ${progress.total}`
                : t('libops.metaPreparing')}
            </text>
            <view className='libops__action-wrap'>
              <view
                className={cancelling
                  ? 'libops__action libops__action--ghost libops__action--disabled'
                  : 'libops__action libops__action--ghost'}
                bindtap={cancelling ? undefined : onCancel}
                data-testid='meta-cancel'
              >
                <Icon name='stop' size={18} color={ICON_COLORS.content} />
                <text className='libops__action-text libops__action-text--ghost'>
                  {t('libops.cancel')}
                </text>
              </view>
            </view>
          </view>
        )
        : kind === 'done' && progress
          ? (
            <view className='libops__state' data-testid='meta-phase-done'>
              <view className='libops__state-head'>
                <Icon
                  name={progress.status === 'done' ? 'check-circle' : 'info'}
                  size={20}
                  color={progress.status === 'failed' ? ICON_COLORS.danger : ICON_COLORS.primary}
                />
                <text className='libops__state-title'>
                  {t('libops.metaRefreshResult', {
                    status: t(metadataResultStatusKey(progress)),
                  })}
                </text>
              </view>
              <text className='libops__state-line'>
                {t('libops.metaSuccess', { count: progress.processed })}
                {progress.failed > 0
                  ? t('libops.metaFailedCount', { count: progress.failed })
                  : ''}
              </text>
              <view className='libops__action-wrap'>
                <view
                  className='libops__action libops__action--ghost'
                  bindtap={onStart}
                  data-testid='meta-again'
                >
                  <Icon name='refresh' size={18} color={ICON_COLORS.content} />
                  <text className='libops__action-text libops__action-text--ghost'>
                    {t('libops.metaRefreshAgain')}
                  </text>
                </view>
              </view>
            </view>
          )
          : (
            <view className='libops__state' data-testid='meta-phase-idle'>
              <view className='libops__state-head'>
                <Icon name='library' size={20} color={ICON_COLORS.content2} />
                <text className='libops__state-title'>{t('libops.metaRefreshTitle')}</text>
              </view>
              <text className='libops__state-line'>{t('libops.metaRefreshSubtitle')}</text>
              <view className='libops__action-wrap'>
                <view
                  className={starting
                    ? 'libops__action libops__action--disabled'
                    : 'libops__action'}
                  bindtap={starting ? undefined : onStart}
                  data-testid='meta-start'
                >
                  <text className='libops__action-text'>{t('libops.metaStart')}</text>
                </view>
              </view>
            </view>
          )}
    </SettingsSection>
  )
}

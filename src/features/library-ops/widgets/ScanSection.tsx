import { useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import type { ScanProgress } from '../../../models/library-ops.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { SettingsSection } from '../../settings/widgets/SettingsSection.js'
import { SettingsRow } from '../../settings/widgets/SettingsRow.js'
import type { DirectoryTreeActions } from '../data/use-directory-tree.js'
import type { DirectoryTreeState } from '../domain/directory-tree.js'
import {
  SCAN_MODES,
  deriveScanView,
  dirDisplayName,
  scanLines,
  scanModeDescKey,
  scanModeLabelKey,
  type ScanMode,
} from '../domain/scan-model.js'
import { DirectoryTree } from './DirectoryTree.js'
import { ProgressBar } from './ProgressBar.js'

export interface ScanSectionProps {
  progress: ScanProgress | undefined
  startError: boolean
  starting: boolean
  cancelling: boolean
  mode: ScanMode
  onModeChange: (mode: ScanMode) => void
  /** Local "I have read this result" flag — see {@link deriveScanView}. */
  dismissed: boolean
  selectedPaths: readonly string[]
  onTogglePath: (path: string) => void
  onClearPaths: () => void
  onStart: () => void
  onCancel: () => void
  onReset: () => void
  tree: DirectoryTreeState
  treeActions: DirectoryTreeActions
}

/**
 * The scan area: mode picker + optional directory picker + start button, or the
 * live progress / terminal summary, depending on `deriveScanView`.
 *
 * All branching goes through that single pure function so the five states stay
 * mutually exclusive and testable. Note that a failed *start* is passed in
 * separately from the server progress — see `deriveScanView`'s doc comment for
 * the Flutter bug that motivates the split.
 */
export function ScanSection(props: ScanSectionProps) {
  const { t } = useTranslation()
  const view = deriveScanView(props.progress, props.startError, props.dismissed)

  return (
    <SettingsSection title={t('libops.scanSection')}>
      {view.kind === 'idle'
        ? <IdleState {...props} />
        : view.kind === 'running'
          ? (
            <RunningState
              progress={props.progress}
              indeterminate={view.indeterminate}
              percent={view.percent}
              canCancel={view.canCancel && !props.cancelling}
              onCancel={props.onCancel}
            />
          )
          : <TerminalState kind={view.kind} progress={props.progress} onReset={props.onReset} />}
    </SettingsSection>
  )
}

function IdleState({
  mode,
  onModeChange,
  selectedPaths,
  onTogglePath,
  onClearPaths,
  onStart,
  starting,
  tree,
  treeActions,
}: ScanSectionProps) {
  const { t } = useTranslation()
  const [showDirs, setShowDirs] = useState(false)

  return (
    <>
      {SCAN_MODES.map((option) => (
        <SettingsRow
          key={option}
          icon={option === 'reimport' ? 'refresh' : 'check'}
          title={t(scanModeLabelKey(option))}
          subtitle={t(scanModeDescKey(option))}
          selected={mode === option}
          trailingIcon={mode === option ? 'check' : undefined}
          onTap={() => onModeChange(option)}
          testId={`scan-mode-${option}`}
        />
      ))}

      <SettingsRow
        icon='folder'
        title={t('libops.targetDirsTitle')}
        subtitle={selectedPaths.length > 0
          ? t('libops.targetDirsSelected', { count: selectedPaths.length })
          : t('libops.targetDirsSubtitle')}
        trailingIcon={showDirs ? 'chevron-up' : 'chevron-down'}
        onTap={() => setShowDirs(!showDirs)}
        testId='scan-target-dirs'
      />

      {showDirs
        ? (
          <view className='libops__dirs'>
            <DirectoryTree
              tree={tree}
              actions={treeActions}
              selectedPaths={selectedPaths}
              onTogglePath={onTogglePath}
            />
            {selectedPaths.length > 0
              ? (
                <view className='libops__chips'>
                  <view className='libops__chips-head'>
                    <text className='libops__chips-title'>{t('libops.dirsToScan')}</text>
                    <view
                      className='libops__chips-clear'
                      bindtap={onClearPaths}
                      data-testid='dirs-clear'
                    >
                      <text className='libops__chips-clear-text'>{t('libops.clear')}</text>
                    </view>
                  </view>
                  <view className='libops__chips-row'>
                    {selectedPaths.map((path) => (
                      <view className='libops__chip' key={path}>
                        <Icon name='folder' size={12} color={ICON_COLORS.primary} />
                        <text className='libops__chip-text'>{dirDisplayName(path)}</text>
                      </view>
                    ))}
                  </view>
                </view>
              )
              : null}
          </view>
        )
        : null}

      <view className='libops__action-wrap'>
        <view
          className={starting ? 'libops__action libops__action--disabled' : 'libops__action'}
          bindtap={starting ? undefined : onStart}
          data-testid='scan-start'
        >
          <Icon name='search' size={18} color={ICON_COLORS.primaryContent} />
          <text className='libops__action-text'>
            {starting
              ? t('libops.starting')
              : selectedPaths.length > 0
                ? t('libops.scanSelectedDirs', { count: selectedPaths.length })
                : t('libops.scanLocal')}
          </text>
        </view>
      </view>
    </>
  )
}

function RunningState({
  progress,
  indeterminate,
  percent,
  canCancel,
  onCancel,
}: {
  progress: ScanProgress | undefined
  indeterminate: boolean
  percent: number
  canCancel: boolean
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const lines = progress ? scanLines(progress) : []

  return (
    <view className='libops__state' data-testid='scan-phase-running'>
      <ProgressBar value={indeterminate ? null : percent} testId='scan-bar' />
      {lines.map((line) => (
        <text className='libops__state-line' key={line.key}>
          {t(line.key, line.params)}
        </text>
      ))}
      <view className='libops__action-wrap'>
        <view
          className={canCancel
            ? 'libops__action libops__action--ghost'
            : 'libops__action libops__action--ghost libops__action--disabled'}
          bindtap={canCancel ? onCancel : undefined}
          data-testid='scan-cancel'
        >
          <Icon name='stop' size={18} color={ICON_COLORS.content} />
          <text className='libops__action-text libops__action-text--ghost'>
            {t('libops.cancelScan')}
          </text>
        </view>
      </view>
    </view>
  )
}

function TerminalState({
  kind,
  progress,
  onReset,
}: {
  kind: 'completed' | 'cancelled' | 'failed'
  progress: ScanProgress | undefined
  onReset: () => void
}) {
  const { t } = useTranslation()

  const icon = kind === 'completed' ? 'check-circle' : kind === 'failed' ? 'warning' : 'info'
  const iconColor = kind === 'completed'
    ? ICON_COLORS.primary
    : kind === 'failed'
      ? ICON_COLORS.danger
      : ICON_COLORS.contentMuted

  return (
    <view className='libops__state' data-testid={`scan-phase-${kind}`}>
      <view className='libops__state-head'>
        <Icon name={icon} size={20} color={iconColor} />
        <text className='libops__state-title'>
          {kind === 'completed'
            // `local_song_count` is only meaningful when the backend reports it;
            // showing "0 songs in total" after a successful scan would read as a
            // failure, so fall back to the per-run stats line alone.
            ? (progress && progress.localSongCount > 0
              ? t('libops.completedSummary', { count: progress.localSongCount })
              : t('libops.completedStats', {
                imported: progress?.importedFiles ?? 0,
                skipped: progress?.skippedFiles ?? 0,
                failed: progress?.failedFiles ?? 0,
              }))
            : kind === 'cancelled'
              ? t('libops.cancelledSummary', { count: progress?.scannedFiles ?? 0 })
              // Prefer the backend's reason over the generic title — a bare
              // "Scan error" leaves the user with nothing to act on.
              : progress?.errorMessage
                ? t('libops.scanFailed', { error: progress.errorMessage })
                : t('libops.errorTitle')}
        </text>
      </view>

      {kind === 'completed' && progress && progress.localSongCount > 0
        ? (
          <text className='libops__state-line'>
            {t('libops.completedStats', {
              imported: progress.importedFiles,
              skipped: progress.skippedFiles,
              failed: progress.failedFiles,
            })}
          </text>
        )
        : null}

      <view className='libops__action-wrap'>
        <view
          className='libops__action libops__action--ghost'
          bindtap={onReset}
          data-testid='scan-reset'
        >
          <Icon name='refresh' size={18} color={ICON_COLORS.content} />
          <text className='libops__action-text libops__action-text--ghost'>
            {kind === 'failed' ? t('common.retry') : t('libops.rescan')}
          </text>
        </view>
      </view>
    </view>
  )
}

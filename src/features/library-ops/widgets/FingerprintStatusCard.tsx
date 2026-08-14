import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import type { FingerprintStatus } from '../../../models/fingerprint.js'

export interface FingerprintStatusCardProps {
  status: FingerprintStatus
  onStartCompute: () => void
  onRetryFailed: () => void
  onRecomputeAll: () => void
  onCheckDuplicates: () => void
  starting?: boolean
}

/**
 * Fingerprint stats card — the "status" phase of the duplicate check page.
 * Shows counts (total/computed/pending/failed) and action buttons.
 */
export function FingerprintStatusCard({
  status,
  onStartCompute,
  onRetryFailed,
  onRecomputeAll,
  onCheckDuplicates,
  starting = false,
}: FingerprintStatusCardProps) {
  const { t } = useTranslation()

  const needsCompute = status.missing > 0
  const canAct = status.chromaprintAvailable && !starting

  return (
    <view className='fp-status' data-testid='fp-status'>
      {/* Intro text */}
      <text className='fp-status__intro'>
        {t('libops.fpIntro')}
      </text>

      {/* Stats card */}
      <view className='fp-status__card' data-testid='fp-status-card'>
        <view className='fp-status__card-header'>
          <Icon name='fingerprint' size={18} color={ICON_COLORS.primary} />
          <text className='fp-status__card-title'>
            {t('libops.fpStatsTitle')}
          </text>
        </view>

        <view className='fp-status__row'>
          <text className='fp-status__label'>
            {t('libops.fpLocalSongs')}
          </text>
          <text className='fp-status__value'>{status.total}</text>
        </view>
        <view className='fp-status__row'>
          <text className='fp-status__label'>
            {t('libops.fpComputed')}
          </text>
          <text className='fp-status__value'>{status.computed}</text>
        </view>
        <view className='fp-status__row'>
          <text className='fp-status__label'>
            {t('libops.fpPending')}
          </text>
          <text className='fp-status__value'>{status.missing}</text>
        </view>
        {status.failed > 0
          ? (
            <view className='fp-status__row'>
              <text className='fp-status__label'>
                {t('libops.fpCannotCompute')}
              </text>
              <text className='fp-status__value fp-status__value--warn'>
                {status.failed}
              </text>
            </view>
          )
          : null}
      </view>

      {/* Failed hint */}
      {status.failed > 0
        ? (
          <text className='fp-status__hint' data-testid='fp-failed-hint'>
            {t('libops.fpFailedHint')}
          </text>
        )
        : null}

      {/* Chromaprint missing warning */}
      {!status.chromaprintAvailable
        ? (
          <view className='fp-status__warning' data-testid='fp-chromaprint-warning'>
            <Icon name='warning' size={18} color={ICON_COLORS.danger} />
            <text className='fp-status__warning-text'>
              {t('libops.fpChromaprintWarning')}
            </text>
          </view>
        )
        : null}

      {/* Primary action */}
      <view
        className={`fp-status__btn fp-status__btn--primary${!canAct ? ' fp-status__btn--disabled' : ''}`}
        bindtap={canAct ? (needsCompute ? onStartCompute : onCheckDuplicates) : undefined}
        data-testid='fp-primary-action'
      >
        <Icon name='fingerprint' size={18} color='#ffffff' />
        <text className='fp-status__btn-text fp-status__btn-text--primary'>
          {needsCompute
            ? t('libops.fpComputeAndDetect')
            : t('libops.fpDetectDuplicates')}
        </text>
      </view>

      {/* Secondary actions */}
      {status.chromaprintAvailable && status.failed > 0
        ? (
          <view
            className='fp-status__btn fp-status__btn--secondary'
            bindtap={canAct ? onRetryFailed : undefined}
            data-testid='fp-retry-failed'
          >
            <Icon name='refresh' size={16} color={ICON_COLORS.primary} />
            <text className='fp-status__btn-text fp-status__btn-text--secondary'>
              {t('libops.fpRetryFailed')}
            </text>
          </view>
        )
        : null}

      {status.chromaprintAvailable && (status.computed > 0 || status.failed > 0)
        ? (
          <view
            className='fp-status__btn fp-status__btn--secondary'
            bindtap={canAct ? onRecomputeAll : undefined}
            data-testid='fp-recompute-all'
          >
            <Icon name='refresh' size={16} color={ICON_COLORS.primary} />
            <text className='fp-status__btn-text fp-status__btn-text--secondary'>
              {t('libops.fpRecomputeAll')}
            </text>
          </view>
        )
        : null}
    </view>
  )
}

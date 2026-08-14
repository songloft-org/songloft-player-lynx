import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import type { FingerprintProgress } from '../../../models/fingerprint.js'
import { ProgressBar } from './ProgressBar.js'

export interface FingerprintComputingSectionProps {
  progress: FingerprintProgress | undefined
  totalFallback: number
  onCancel: () => void
  cancelling?: boolean
}

/**
 * Computing phase — shows progress bar + cancel button.
 * Ported from Flutter's `_buildComputingPhase`.
 */
export function FingerprintComputingSection({
  progress,
  totalFallback,
  onCancel,
  cancelling = false,
}: FingerprintComputingSectionProps) {
  const { t } = useTranslation()

  const total = progress?.total ?? totalFallback
  const computed = progress?.computed ?? 0
  const percent = total > 0 ? Math.min(100, Math.floor((computed * 100) / total)) : null

  return (
    <view className='fp-computing' data-testid='fp-computing'>
      <ProgressBar value={percent} testId='fp-computing-bar' />

      <text className='fp-computing__text'>
        {t('libops.fpComputingProgress', { computed, total })}
      </text>

      {progress && progress.failed > 0
        ? (
          <text className='fp-computing__failed'>
            {t('libops.fpComputingFailed', { count: progress.failed })}
          </text>
        )
        : null}

      <text className='fp-computing__hint'>
        {t('libops.fpComputingHint')}
      </text>

      <view
        className={`fp-computing__cancel${cancelling ? ' fp-computing__cancel--disabled' : ''}`}
        bindtap={cancelling ? undefined : onCancel}
        data-testid='fp-cancel'
      >
        <Icon name='stop' size={18} color={ICON_COLORS.content} />
        <text className='fp-computing__cancel-text'>
          {t('libops.fpStopComputing')}
        </text>
      </view>

      <text className='fp-computing__cancel-hint'>
        {t('libops.fpStopHint')}
      </text>
    </view>
  )
}

import { useCallback } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import type { FingerprintProgress } from '../../../models/fingerprint.js'
import { ProgressBar } from './ProgressBar.js'

function useLocalT() {
  const { i18n } = useTranslation()
  return useCallback(
    (en: string, zh: string): string => (i18n.language === 'zh' ? zh : en),
    [i18n.language],
  )
}

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
  const lt = useLocalT()

  const total = progress?.total ?? totalFallback
  const computed = progress?.computed ?? 0
  const percent = total > 0 ? Math.min(100, Math.floor((computed * 100) / total)) : null

  return (
    <view className='fp-computing' data-testid='fp-computing'>
      <ProgressBar value={percent} testId='fp-computing-bar' />

      <text className='fp-computing__text'>
        {lt(
          `Computing audio fingerprints... ${computed}/${total}`,
          `正在计算音频指纹... ${computed}/${total}`,
        )}
      </text>

      {progress && progress.failed > 0
        ? (
          <text className='fp-computing__failed'>
            {lt(`Failed: ${progress.failed}`, `失败: ${progress.failed}`)}
          </text>
        )
        : null}

      <text className='fp-computing__hint'>
        {lt(
          'Duplicates will be detected automatically once computation finishes',
          '计算完成后将自动检测重复歌曲',
        )}
      </text>

      <view
        className={`fp-computing__cancel${cancelling ? ' fp-computing__cancel--disabled' : ''}`}
        bindtap={cancelling ? undefined : onCancel}
        data-testid='fp-cancel'
      >
        <Icon name='stop' size={18} color={ICON_COLORS.content} />
        <text className='fp-computing__cancel-text'>
          {lt('Stop computing', '停止计算')}
        </text>
      </view>

      <text className='fp-computing__cancel-hint'>
        {lt(
          'Fingerprints already computed are kept; the remaining songs will be computed next time',
          '已算出的指纹会保留，未计算的歌曲下次再算',
        )}
      </text>
    </view>
  )
}

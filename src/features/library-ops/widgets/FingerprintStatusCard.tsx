import { useCallback } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import type { FingerprintStatus } from '../../../models/fingerprint.js'

/**
 * Inline i18n helper — returns zh when language is Chinese, en otherwise.
 */
function useLocalT() {
  const { i18n } = useTranslation()
  return useCallback(
    (en: string, zh: string): string => (i18n.language === 'zh' ? zh : en),
    [i18n.language],
  )
}

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
  const lt = useLocalT()

  const needsCompute = status.missing > 0
  const canAct = status.chromaprintAvailable && !starting

  return (
    <view className='fp-status' data-testid='fp-status'>
      {/* Intro text */}
      <text className='fp-status__intro'>
        {lt(
          'Identify duplicate files with identical content using audio fingerprints. The same song is recognized even across different file names and formats.',
          '通过音频指纹识别内容相同的重复文件。不同文件名、不同格式的同一首歌都能被识别。',
        )}
      </text>

      {/* Stats card */}
      <view className='fp-status__card' data-testid='fp-status-card'>
        <view className='fp-status__card-header'>
          <Icon name='fingerprint' size={18} color={ICON_COLORS.primary} />
          <text className='fp-status__card-title'>
            {lt('Fingerprint stats', '指纹统计')}
          </text>
        </view>

        <view className='fp-status__row'>
          <text className='fp-status__label'>
            {lt('Local songs', '本地歌曲')}
          </text>
          <text className='fp-status__value'>{status.total}</text>
        </view>
        <view className='fp-status__row'>
          <text className='fp-status__label'>
            {lt('Fingerprinted', '已有指纹')}
          </text>
          <text className='fp-status__value'>{status.computed}</text>
        </view>
        <view className='fp-status__row'>
          <text className='fp-status__label'>
            {lt('Pending', '待计算')}
          </text>
          <text className='fp-status__value'>{status.missing}</text>
        </view>
        {status.failed > 0
          ? (
            <view className='fp-status__row'>
              <text className='fp-status__label'>
                {lt('Cannot compute', '无法计算')}
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
            {lt(
              'These files have no audio track, are corrupted, timed out, or the server ffmpeg does not support their format. They will not be retried automatically.',
              '这些文件没有音频轨、已损坏、计算超时或服务端 ffmpeg 不支持其格式，不会被自动重试。',
            )}
          </text>
        )
        : null}

      {/* Chromaprint missing warning */}
      {!status.chromaprintAvailable
        ? (
          <view className='fp-status__warning' data-testid='fp-chromaprint-warning'>
            <Icon name='warning' size={18} color={ICON_COLORS.danger} />
            <text className='fp-status__warning-text'>
              {lt(
                'Audio fingerprint detection requires ffmpeg with chromaprint support. Docker users can simply upgrade to the latest image.',
                '需要安装 ffmpeg（含 chromaprint 支持）才能使用音频指纹检测。Docker 用户升级到最新镜像即可。',
              )}
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
            ? lt('Compute and detect', '开始计算并检测')
            : lt('Detect duplicates', '检测重复')}
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
              {lt('Retry failed only', '仅重试失败项')}
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
              {lt('Recompute all fingerprints', '重新计算全部指纹')}
            </text>
          </view>
        )
        : null}
    </view>
  )
}

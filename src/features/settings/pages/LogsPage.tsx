import { useEffect, useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { getSettingsApi } from '../api/index.js'
import './LogsPage.css'

type LoadState = 'loading' | 'loaded' | 'error'

/**
 * Diagnostics log-export sub-page (`/settings/logs`, inside the shell, batch
 * 15). Fetches the backend's already-sanitized log text (`GET
 * /api/v1/logs/export`, mirrors Flutter's `LogExportService.downloadBackendLogs`)
 * and renders it as a scrollable read-only block.
 *
 * Deliberately NOT ported from Flutter: zip-packaging with a native frontend
 * log file, and handing the archive to an OS share sheet — Lynx has no native
 * share module yet (same class of gap as native audio/storage), so this is a
 * text-only viewer. Offline/unreachable backend degrades to an inline error,
 * same as every other backend-dependent Settings sub-page.
 */
export function LogsPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [state, setState] = useState<LoadState>('loading')
  const [text, setText] = useState('')

  useEffect(() => {
    let cancelled = false
    setState('loading')
    void getSettingsApi()
      .exportLogs()
      .then((logs) => {
        if (cancelled) return
        setText(logs)
        setState('loaded')
      })
      .catch(() => {
        if (!cancelled) setState('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const goBack = () => {
    void navigate({ to: '/settings' })
  }

  return (
    <view className='logs-page'>
      <view className='logs-page__topbar'>
        <view className='logs-page__back' bindtap={goBack} data-testid='logs-back'>
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
        <text className='logs-page__title'>{t('settings.logsPageTitle')}</text>
      </view>

      <scroll-view className='logs-page__scroll' scroll-y>
        <view className='logs-page__content'>
          {state === 'loading'
            ? <text className='logs-page__state' data-testid='logs-loading'>{t('settings.logsLoading')}</text>
            : state === 'error'
              ? <text className='logs-page__state' data-testid='logs-error'>{t('settings.logsError')}</text>
              : text.trim().length === 0
                ? <text className='logs-page__state' data-testid='logs-empty'>{t('settings.logsEmpty')}</text>
                : <text className='logs-page__text' data-testid='logs-text'>{text}</text>}
        </view>
      </scroll-view>
    </view>
  )
}

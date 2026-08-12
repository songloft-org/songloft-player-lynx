import { useEffect, useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { apiPrefix, appConfig } from '../../../core/config/app-config.js'
import type { HttpClient } from '../../../core/network/http-client.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { getSettingsApi } from '../api/index.js'
import './UpgradePage.css'

interface CheckResult {
  hasUpdate: boolean
  currentVersion: string
  latestVersion: string
  changelog?: string
}

interface UpgradeProgress {
  status: 'idle' | 'downloading' | 'testing' | 'replacing' | 'restarting' | 'completed' | 'failed'
  progress: number
  currentStep: string
  error?: string
}

function getClient(): HttpClient {
  return (getSettingsApi() as unknown as { client: HttpClient }).client
}

async function checkForUpdate(): Promise<CheckResult> {
  const api = getSettingsApi()
  const res = await (api as unknown as { client: HttpClient }).client.get<Record<string, unknown>>(`${apiPrefix}/upgrade/check`)
  const data = res.data ?? {}
  return {
    hasUpdate: Boolean(data.has_update),
    currentVersion: String(data.current_version ?? ''),
    latestVersion: String(data.latest_version ?? ''),
    changelog: data.changelog ? String(data.changelog) : undefined,
  }
}

async function startUpgrade(): Promise<void> {
  await getClient().post(`${apiPrefix}/upgrade/start`, {})
}

async function getProgress(): Promise<UpgradeProgress> {
  const res = await getClient().get<Record<string, unknown>>(`${apiPrefix}/upgrade/progress`)
  const data = res.data ?? {}
  return {
    status: (data.status as UpgradeProgress['status']) ?? 'idle',
    progress: Number(data.progress ?? 0),
    currentStep: String(data.current_step ?? ''),
    error: data.error ? String(data.error) : undefined,
  }
}

export function UpgradePage() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [checking, setChecking] = useState(true)
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null)
  const [upgrading, setUpgrading] = useState(false)
  const [progress, setProgress] = useState<UpgradeProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void checkForUpdate()
      .then(setCheckResult)
      .catch(e => setError(String(e instanceof Error ? e.message : e)))
      .finally(() => setChecking(false))
  }, [])

  useEffect(() => {
    if (!upgrading) return
    const timer = setInterval(() => {
      void getProgress().then(p => {
        setProgress(p)
        if (p.status === 'completed' || p.status === 'failed') {
          setUpgrading(false)
        }
      })
    }, 2000)
    return () => clearInterval(timer)
  }, [upgrading])

  const onStartUpgrade = () => {
    setUpgrading(true)
    setProgress({ status: 'downloading', progress: 0, currentStep: '' })
    void startUpgrade().catch(e => {
      setError(String(e instanceof Error ? e.message : e))
      setUpgrading(false)
    })
  }

  const statusLabel = (status: string) => {
    const map: Record<string, string> = {
      idle: t('upgrade.idle'),
      downloading: t('upgrade.downloading'),
      testing: t('upgrade.testing'),
      replacing: t('upgrade.replacing'),
      restarting: t('upgrade.restarting'),
      completed: t('upgrade.completed'),
      failed: t('upgrade.failed'),
    }
    return map[status] ?? status
  }

  return (
    <view className='upgrade-page'>
      <view className='upgrade-page__topbar'>
        <view className='upgrade-page__back' bindtap={() => navigate({ to: '/settings' })}>
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
        <text className='upgrade-page__title'>{t('upgrade.title')}</text>
      </view>

      <scroll-view className='upgrade-page__content' scroll-y>
        {checking
          ? <text className='upgrade-page__state'>{t('upgrade.checking')}</text>
          : error && !checkResult
            ? <text className='upgrade-page__state upgrade-page__state--error'>{error}</text>
            : checkResult && !checkResult.hasUpdate && !upgrading
              ? (
                <view className='upgrade-page__section'>
                  <Icon name='check-circle' size={40} color={ICON_COLORS.primary} />
                  <text className='upgrade-page__up-to-date'>{t('upgrade.upToDate')}</text>
                  <text className='upgrade-page__version'>{checkResult.currentVersion}</text>
                </view>
              )
              : checkResult && checkResult.hasUpdate && !upgrading
                ? (
                  <view className='upgrade-page__section'>
                    <text className='upgrade-page__new-version'>
                      {t('upgrade.newVersion', { version: checkResult.latestVersion })}
                    </text>
                    <text className='upgrade-page__current'>
                      {t('upgrade.current', { version: checkResult.currentVersion })}
                    </text>
                    {checkResult.changelog
                      ? <text className='upgrade-page__changelog'>{checkResult.changelog}</text>
                      : null}
                    <view className='upgrade-page__btn' bindtap={onStartUpgrade}>
                      <text className='upgrade-page__btn-text'>{t('upgrade.start')}</text>
                    </view>
                  </view>
                )
                : null}

        {upgrading && progress
          ? (
            <view className='upgrade-page__progress'>
              <text className='upgrade-page__progress-status'>{statusLabel(progress.status)}</text>
              <view className='upgrade-page__progress-bar'>
                <view className='upgrade-page__progress-fill' style={`width: ${progress.progress}%`} />
              </view>
              <text className='upgrade-page__progress-step'>{progress.currentStep}</text>
              <text className='upgrade-page__progress-pct'>{progress.progress}%</text>
            </view>
          )
          : null}

        {progress?.status === 'completed'
          ? (
            <view className='upgrade-page__section'>
              <Icon name='check-circle' size={40} color={ICON_COLORS.primary} />
              <text className='upgrade-page__up-to-date'>{t('upgrade.completed')}</text>
            </view>
          )
          : null}

        {progress?.status === 'failed'
          ? (
            <view className='upgrade-page__section'>
              <Icon name='warning' size={40} color={ICON_COLORS.danger} />
              <text className='upgrade-page__state upgrade-page__state--error'>
                {progress.error || t('upgrade.failed')}
              </text>
            </view>
          )
          : null}
      </scroll-view>
    </view>
  )
}

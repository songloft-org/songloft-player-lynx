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

const POLL_INTERVAL_MS = 2000
/** ~30s of consecutive failures — long enough for a real backend restart. */
const MAX_POLL_FAILURES = 15

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

  /**
   * Poll the backend's own upgrade progress.
   *
   * The request is expected to fail for a while: `replacing`/`restarting` means
   * the server we are polling is being replaced under us. So failures cannot be
   * fatal — but they cannot be ignored either. Previously this was a bare
   * `void getProgress().then(…)`: on a backend that never came back, every tick
   * raised an unhandled rejection, `upgrading` stayed true forever, and the UI
   * sat on the last known percentage with no conclusion. Tolerate a restart-sized
   * outage, then give up with an actionable message.
   */
  useEffect(() => {
    if (!upgrading) return
    let failures = 0
    const timer = setInterval(() => {
      void getProgress()
        .then(p => {
          failures = 0
          setProgress(p)
          if (p.status === 'completed' || p.status === 'failed') {
            setUpgrading(false)
          }
        })
        .catch(() => {
          failures += 1
          if (failures >= MAX_POLL_FAILURES) {
            setUpgrading(false)
            setError(t('upgrade.progressLost'))
          }
        })
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [upgrading, t])

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
                    <view
                      className='upgrade-page__btn'
                      bindtap={onStartUpgrade}
                      data-testid='upgrade-start'
                    >
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

        {/*
          Errors raised *after* a successful version check need their own slot:
          the branch above only renders `error` when `!checkResult`, so both the
          "start upgrade failed" and "lost contact while polling" messages were
          set into state and then never shown to anyone.
        */}
        {error && checkResult
          ? <text className='upgrade-page__state upgrade-page__state--error'>{error}</text>
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

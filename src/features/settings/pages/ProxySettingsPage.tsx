import { useCallback, useEffect, useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Input } from '@lynx-js/lynx-ui-input'

import { apiPrefix, appConfig } from '../../../core/config/app-config.js'
import { getCachedAccessToken } from '../../../core/network/token-cache.js'
import { AppSwitch } from '../../../shared/ui/AppSwitch.js'
import { Icon } from '../../../shared/ui/Icon.js'
import { SettingsRow } from '../widgets/SettingsRow.js'
import { SettingsSection } from '../widgets/SettingsSection.js'
import './ProxySettingsPage.css'

interface ProxyState {
  httpProxy: string
  githubProxy: string
  hlsEnabled: boolean
  allowlist: string
}

export function ProxySettingsPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [state, setState] = useState<ProxyState>({
    httpProxy: '',
    githubProxy: '',
    hlsEnabled: false,
    allowlist: '',
  })
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const base = appConfig.resolvedBaseUrl
        const token = getCachedAccessToken()
        const headers: Record<string, string> = {}
        if (token) headers.Authorization = `Bearer ${token}`

        const [httpRes, githubRes, hlsRes, allowRes] = await Promise.all([
          fetch(`${base}${apiPrefix}/settings/http-proxy`, { headers }).then(r => r.json()).catch(() => ({})),
          fetch(`${base}${apiPrefix}/settings/github-proxy`, { headers }).then(r => r.json()).catch(() => ({})),
          fetch(`${base}${apiPrefix}/settings/hls-proxy`, { headers }).then(r => r.json()).catch(() => ({})),
          fetch(`${base}${apiPrefix}/settings/proxy-private-allowlist`, { headers }).then(r => r.json()).catch(() => ({})),
        ])

        if (!cancelled) {
          setState({
            httpProxy: (httpRes as { proxy?: string }).proxy ?? '',
            githubProxy: (githubRes as { proxy?: string }).proxy ?? '',
            hlsEnabled: (hlsRes as { enabled?: boolean }).enabled ?? false,
            allowlist: Array.isArray((allowRes as { allowlist?: string[] }).allowlist)
              ? (allowRes as { allowlist: string[] }).allowlist.join('\n')
              : '',
          })
          setLoading(false)
        }
      } catch {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const save = useCallback(async () => {
    try {
      const base = appConfig.resolvedBaseUrl
      const token = getCachedAccessToken()
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`

      await Promise.all([
        fetch(`${base}${apiPrefix}/settings/http-proxy`, {
          method: 'PUT', headers, body: JSON.stringify({ proxy: state.httpProxy }),
        }),
        fetch(`${base}${apiPrefix}/settings/github-proxy`, {
          method: 'PUT', headers, body: JSON.stringify({ proxy: state.githubProxy }),
        }),
        fetch(`${base}${apiPrefix}/settings/hls-proxy`, {
          method: 'PUT', headers, body: JSON.stringify({ enabled: state.hlsEnabled }),
        }),
        fetch(`${base}${apiPrefix}/settings/proxy-private-allowlist`, {
          method: 'PUT', headers,
          body: JSON.stringify({ allowlist: state.allowlist.split('\n').map(s => s.trim()).filter(Boolean) }),
        }),
      ])
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      // best-effort
    }
  }, [state])

  return (
    <view className='proxy-settings'>
      <view className='proxy-settings__topbar'>
        <view className='proxy-settings__back' bindtap={() => void navigate({ to: '/settings' })}>
          <Icon name='chevron-down' size={20} />
        </view>
        <text className='proxy-settings__title'>{t('proxy.title')}</text>
      </view>

      <scroll-view className='proxy-settings__scroll' scroll-y>
        {loading ? (
          <view className='proxy-settings__status'>
            <text className='proxy-settings__status-text'>{t('common.loading')}</text>
          </view>
        ) : (
          <view className='proxy-settings__content'>
            <SettingsSection title={t('proxy.httpSection')} icon='link'>
              <view className='proxy-settings__field'>
                <Input
                  className='proxy-settings__input'
                  value={state.httpProxy}
                  placeholder='http://proxy:8080'
                  onInput={(value: string) => setState(s => ({ ...s, httpProxy: value }))}
                />
              </view>
            </SettingsSection>

            <SettingsSection title={t('proxy.githubSection')} icon='link'>
              <view className='proxy-settings__field'>
                <Input
                  className='proxy-settings__input'
                  value={state.githubProxy}
                  placeholder='http://proxy:8080'
                  onInput={(value: string) => setState(s => ({ ...s, githubProxy: value }))}
                />
              </view>
            </SettingsSection>

            <SettingsSection title={t('proxy.hlsSection')} icon='link'>
              <view className='proxy-settings__switch-row'>
                <text className='proxy-settings__switch-label'>{t('proxy.hlsEnable')}</text>
                <AppSwitch
                  checked={state.hlsEnabled}
                  onChange={(checked) => setState(s => ({ ...s, hlsEnabled: checked }))}
                />
              </view>
            </SettingsSection>

            <SettingsSection title={t('proxy.allowlistSection')} icon='link'>
              <view className='proxy-settings__field'>
                <Input
                  className='proxy-settings__input proxy-settings__input--tall'
                  value={state.allowlist}
                  placeholder={t('proxy.allowlistPlaceholder')}
                  onInput={(value: string) => setState(s => ({ ...s, allowlist: value }))}
                />
              </view>
            </SettingsSection>

            <view className='proxy-settings__save-area'>
              <view className='proxy-settings__save-btn' bindtap={save}>
                <text className='proxy-settings__save-text'>
                  {saved ? t('proxy.saved') : t('proxy.save')}
                </text>
              </view>
            </view>
          </view>
        )}
      </scroll-view>
    </view>
  )
}

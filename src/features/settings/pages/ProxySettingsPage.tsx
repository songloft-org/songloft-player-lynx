import { useCallback, useEffect, useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Input, TextArea } from '@lynx-js/lynx-ui-input'

import { apiPrefix, appConfig } from '../../../core/config/app-config.js'
import { getCachedAccessToken } from '../../../core/network/token-cache.js'
import { copyToClipboard } from '../../../native/native-platform.js'
import { AppSwitch } from '../../../shared/ui/AppSwitch.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { SettingsRow } from '../widgets/SettingsRow.js'
import { SettingsSection } from '../widgets/SettingsSection.js'
import { SubPageShell } from '../widgets/SubPageShell.js'
import './ProxySettingsPage.css'

/**
 * The prompt handed to an AI to find working GitHub mirrors, ported verbatim from
 * the Flutter reference (`github_proxy_dialog.dart`).
 *
 * Deliberately **not** an i18n key: it is not UI copy, it is the text the user
 * pastes into a chat. Translating it would mean maintaining two prompts that must
 * stay semantically identical, and the reference keeps a single Chinese constant
 * for the same reason.
 *
 * Exported so its content can be asserted without rendering the page — this page
 * loads its four settings with raw `fetch` inside an effect (every other settings
 * page goes through the api + query layer), and that loading gate does not flush
 * in the ReactLynx test harness.
 */
export const AI_PROMPT = '请帮我找几个目前可用的 GitHub 文件加速/反代服务（GitHub proxy mirror），'
  + '要求：1) 免费、无需注册；2) 支持代理 github.com 和 raw.githubusercontent.com 的文件下载；'
  + '3) 用法是在原始 URL 前拼接代理前缀，如 https://代理地址/https://github.com/...。'
  + '请给出 3-5 个可用的代理地址（以 https:// 开头、/ 结尾），并注明各自的特点。'

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
  const [promptCopied, setPromptCopied] = useState(false)

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
    <SubPageShell
      title={t('proxy.title')}
      backTestId='proxy-back'
    >
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
              {/*
                Finding a working mirror is the hard part of this field — they
                come and go — so the reference offers the prompt rather than a
                preset list that would rot. Same affordance here.
              */}
              <view
                className='proxy-settings__prompt-btn'
                bindtap={() => {
                  copyToClipboard(AI_PROMPT)
                  setPromptCopied(true)
                  setTimeout(() => setPromptCopied(false), 2000)
                }}
                data-testid='github-copy-prompt'
              >
                <Icon name='info' size={14} color={ICON_COLORS.primary} />
                <text className='proxy-settings__prompt-text'>
                  {promptCopied ? t('proxy.githubPromptCopied') : t('proxy.githubCopyPrompt')}
                </text>
              </view>
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
              {/*
                A `TextArea`, not an `Input`: `save` splits this value on `\n`
                and the placeholder asks for one entry per line, but a
                single-line `<input>` cannot hold a newline — so only ever one
                entry could be entered. `maxLength` too, because the shared
                default of 140 caps the list at roughly eight CIDRs.
              */}
              <TextArea
                className='proxy-settings__input proxy-settings__input--tall'
                value={state.allowlist}
                placeholder={t('proxy.allowlistPlaceholder')}
                maxLength={2000}
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
    </SubPageShell>
  )
}

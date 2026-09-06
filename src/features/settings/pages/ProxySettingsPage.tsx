import { useCallback, useEffect, useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import { Input, TextArea } from '@lynx-js/lynx-ui-input'

import { copyToClipboard } from '../../../native/native-platform.js'
import { AppSwitch } from '../../../shared/ui/AppSwitch.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { useSaveProxySettingsMutation } from '../data/proxy-mutations.js'
import { useProxySettingsQuery } from '../data/proxy-query.js'
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
 * Exported so its content can be asserted without rendering the page.
 */
export const AI_PROMPT = '请帮我找几个目前可用的 GitHub 文件加速/反代服务（GitHub proxy mirror），'
  + '要求：1) 免费、无需注册；2) 支持代理 github.com 和 raw.githubusercontent.com 的文件下载；'
  + '3) 用法是在原始 URL 前拼接代理前缀，如 https://代理地址/https://github.com/...。'
  + '请给出 3-5 个可用的代理地址（以 https:// 开头、/ 结尾），并注明各自的特点。'

/**
 * Local edit state. Mirrors the API shape except `allowlist`, which the multi-line
 * field holds as newline-joined text (split/trimmed/filtered back on save).
 */
interface ProxyDraft {
  httpProxy: string
  githubProxy: string
  hlsEnabled: boolean
  allowlistText: string
}

export function ProxySettingsPage() {
  const { t } = useTranslation()
  const { data, isLoading } = useProxySettingsQuery()
  const saveMutation = useSaveProxySettingsMutation()

  const [draft, setDraft] = useState<ProxyDraft | null>(null)
  const [saved, setSaved] = useState(false)
  const [promptCopied, setPromptCopied] = useState(false)

  // Seed the draft once, when the settings first arrive. The `draft == null` guard
  // means a later refetch (e.g. the invalidate after save) does not clobber edits.
  useEffect(() => {
    if (data != null && draft == null) {
      setDraft({
        httpProxy: data.httpProxy,
        githubProxy: data.githubProxy,
        hlsEnabled: data.hlsEnabled,
        allowlistText: data.allowlist.join('\n'),
      })
    }
  }, [data, draft])

  const save = useCallback(() => {
    if (draft == null) return
    saveMutation.mutate(
      {
        httpProxy: draft.httpProxy,
        githubProxy: draft.githubProxy,
        hlsEnabled: draft.hlsEnabled,
        allowlist: draft.allowlistText.split('\n').map((s) => s.trim()).filter(Boolean),
      },
      {
        onSuccess: () => {
          setSaved(true)
          setTimeout(() => setSaved(false), 2000)
        },
      },
    )
  }, [draft, saveMutation])

  const patch = useCallback((partial: Partial<ProxyDraft>) => {
    setDraft((prev) => (prev == null ? prev : { ...prev, ...partial }))
  }, [])

  return (
    <SubPageShell
      grouped
      title={t('proxy.title')}
      backTestId='proxy-back'
    >
      {isLoading || draft == null
        ? (
          <view className='proxy-settings__status'>
            <text className='proxy-settings__status-text'>{t('common.loading')}</text>
          </view>
        )
        : (
          <view className='proxy-settings__content'>
            <SettingsSection title={t('proxy.httpSection')}>
              <view className='proxy-settings__field'>
                <Input
                  className='proxy-settings__input'
                  value={draft.httpProxy}
                  placeholder='http://proxy:8080'
                  onInput={(value: string) => patch({ httpProxy: value })}
                />
              </view>
            </SettingsSection>

            <SettingsSection title={t('proxy.githubSection')}>
              <view className='proxy-settings__field'>
                <Input
                  className='proxy-settings__input'
                  value={draft.githubProxy}
                  placeholder='http://proxy:8080'
                  onInput={(value: string) => patch({ githubProxy: value })}
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

            <SettingsSection title={t('proxy.hlsSection')}>
              <view className='proxy-settings__switch-row'>
                <text className='proxy-settings__switch-label'>{t('proxy.hlsEnable')}</text>
                <AppSwitch
                  checked={draft.hlsEnabled}
                  onChange={(checked) => patch({ hlsEnabled: checked })}
                />
              </view>
            </SettingsSection>

            <SettingsSection title={t('proxy.allowlistSection')}>
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
                  value={draft.allowlistText}
                  placeholder={t('proxy.allowlistPlaceholder')}
                  maxLength={2000}
                  onInput={(value: string) => patch({ allowlistText: value })}
                />
              </view>
            </SettingsSection>

            <view className='proxy-settings__save-area'>
              <view className='proxy-settings__save-btn' bindtap={save} data-testid='proxy-save'>
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

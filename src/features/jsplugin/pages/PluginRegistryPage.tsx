import { useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Input } from '@lynx-js/lynx-ui-input'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import type { RegistryPluginEntry } from '../../../models/jsplugin.js'
import { getJSPluginApi } from '../api/index.js'
import { useInstallFromRegistryMutation } from '../data/jsplugin-mutations.js'
import './PluginRegistryPage.css'

export function PluginRegistryPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const installMutation = useInstallFromRegistryMutation()

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [plugins, setPlugins] = useState<RegistryPluginEntry[]>([])
  const [total, setTotal] = useState(0)
  const pageSize = 20

  const doFetch = (p: number, keyword: string) => {
    setLoading(true)
    setError(null)
    void getJSPluginApi()
      .refreshRegistry({ allSources: true, page: p, pageSize, search: keyword || undefined })
      .then((res) => {
        setPlugins(res.plugins)
        setTotal(res.total)
        setPage(res.page)
      })
      .catch((e) => setError(String(e instanceof Error ? e.message : e)))
      .finally(() => setLoading(false))
  }

  const onSearch = () => {
    doFetch(1, search)
  }

  const onNextPage = () => {
    if (page * pageSize < total) doFetch(page + 1, search)
  }

  const onPrevPage = () => {
    if (page > 1) doFetch(page - 1, search)
  }

  const onInstall = (plugin: RegistryPluginEntry) => {
    installMutation.mutate(
      { downloadUrl: plugin.downloadUrl, sourceUrl: plugin.sourceUrl },
      { onSuccess: () => doFetch(page, search) },
    )
  }

  // Auto-fetch on first render
  const [didInit, setDidInit] = useState(false)
  if (!didInit) {
    setDidInit(true)
    doFetch(1, '')
  }

  const hasNext = page * pageSize < total
  const hasPrev = page > 1

  return (
    <view className='plugin-registry'>
      <view className='plugin-registry__topbar'>
        <view
          className='plugin-registry__back'
          bindtap={() => navigate({ to: '/settings/plugins' })}
          data-testid='registry-back'
        >
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
        <text className='plugin-registry__title'>{t('jsplugin.registryTitle')}</text>
      </view>

      <view className='plugin-registry__search'>
        <Input
          className='plugin-registry__search-input'
          value={search}
          placeholder={t('jsplugin.searchPlaceholder')}
          onInput={(value) => setSearch(value)}
          onConfirm={onSearch}
        />
        <view className='plugin-registry__search-btn' bindtap={onSearch} data-testid='registry-search-btn'>
          <Icon name='refresh' size={18} color={ICON_COLORS.content} />
        </view>
      </view>

      <scroll-view className='plugin-registry__scroll' scroll-y>
        {loading
          ? <RegistryState text={t('common.loading')} testId='registry-loading' />
          : error
            ? <RegistryState text={error} testId='registry-error' tone='error' />
            : plugins.length === 0
              ? <RegistryState text={t('jsplugin.noRegistryPlugins')} testId='registry-empty' />
              : (
                <view className='plugin-registry__list'>
                  {plugins.map((plugin) => (
                    <view key={plugin.entryPath + (plugin.identity ?? '')} className='plugin-registry__item'>
                      <view className='plugin-registry__item-info'>
                        <text className='plugin-registry__item-name'>{plugin.name}</text>
                        <text className='plugin-registry__item-meta'>
                          {[plugin.version, plugin.author].filter(Boolean).join(' · ')}
                        </text>
                        {plugin.description
                          ? <text className='plugin-registry__item-desc'>{plugin.description}</text>
                          : null}
                      </view>
                      <view className='plugin-registry__item-action'>
                        {plugin.installed
                          ? (
                            <view className='plugin-registry__installed'>
                              <text className='plugin-registry__installed-text'>
                                {plugin.hasUpdate ? t('jsplugin.hasUpdate') : t('jsplugin.installed')}
                              </text>
                            </view>
                          )
                          : (
                            <view
                              className='plugin-registry__install-btn'
                              bindtap={() => onInstall(plugin)}
                              data-testid={`registry-install-${plugin.entryPath}`}
                            >
                              <text className='plugin-registry__install-text'>{t('jsplugin.install')}</text>
                            </view>
                          )}
                      </view>
                    </view>
                  ))}
                </view>
              )}
      </scroll-view>

      {!loading && plugins.length > 0
        ? (
          <view className='plugin-registry__pager'>
            <view
              className={hasPrev ? 'plugin-registry__page-btn' : 'plugin-registry__page-btn plugin-registry__page-btn--disabled'}
              bindtap={onPrevPage}
              data-testid='registry-prev'
            >
              <Icon name='chevron-down' size={16} color={hasPrev ? ICON_COLORS.content : ICON_COLORS.contentMuted} />
            </view>
            <text className='plugin-registry__page-text'>
              {page} / {Math.ceil(total / pageSize) || 1}
            </text>
            <view
              className={hasNext ? 'plugin-registry__page-btn' : 'plugin-registry__page-btn plugin-registry__page-btn--disabled'}
              bindtap={onNextPage}
              data-testid='registry-next'
            >
              <Icon name='chevron-down' size={16} color={hasNext ? ICON_COLORS.content : ICON_COLORS.contentMuted} />
            </view>
          </view>
        )
        : null}
    </view>
  )
}

function RegistryState({ text, testId, tone }: { text: string; testId?: string; tone?: 'error' }) {
  return (
    <view className='plugin-registry__state' data-testid={testId}>
      <text
        className={tone === 'error'
          ? 'plugin-registry__state-text plugin-registry__state-text--error'
          : 'plugin-registry__state-text'}
      >
        {text}
      </text>
    </view>
  )
}

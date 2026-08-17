import { useEffect, useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import type { JSPlugin } from '../../../models/jsplugin.js'
import { getSettingsApi } from '../../settings/api/index.js'
import { SwitchRow } from '../../settings/widgets/SwitchRow.js'
import { getJSPluginApi } from '../api/index.js'
import type { PluginTabEntry, TabConfig } from '../data/tab-config.js'
import './TabConfigPage.css'

const MAX_TABS = 12

export function TabConfigPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  const [config, setConfig] = useState<TabConfig | null>(null)
  const [plugins, setPlugins] = useState<JSPlugin[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      try {
        const [tabCfg, pluginRes] = await Promise.all([
          getSettingsApi().getTabConfig(),
          getJSPluginApi().getPlugins(),
        ])
        setConfig(tabCfg)
        setPlugins(pluginRes.plugins.filter((p) => p.isActive && p.entryPath))
      } catch { /* degrade gracefully */ }
      setLoading(false)
    })()
  }, [])

  if (loading || !config) {
    return (
      <view className='tab-config'>
        <view className='tab-config__topbar'>
          <view className='tab-config__back' bindtap={() => navigate({ to: '/settings' })}>
            <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
          </view>
          <text className='tab-config__title'>{t('jsplugin.tabConfigTitle')}</text>
        </view>
        <view className='tab-config__state'>
          <text className='tab-config__state-text'>{t('common.loading')}</text>
        </view>
      </view>
    )
  }

  const totalCount = 2 + (config.showLibrary ? 1 : 0) + config.pluginTabs.length
  const atLimit = totalCount >= MAX_TABS

  const isPluginInTabs = (plugin: JSPlugin) =>
    config.pluginTabs.some((t) => t.entryPath === plugin.entryPath)

  const toggleLibrary = () => {
    const next: TabConfig = { ...config, showLibrary: !config.showLibrary }
    setConfig(next)
    void getSettingsApi().updateTabConfig(next)
      .then(() => queryClient.invalidateQueries({ queryKey: ['settings', 'tab-config'] }))
      .catch(() => {})
  }

  const togglePlugin = (plugin: JSPlugin) => {
    const inTabs = isPluginInTabs(plugin)
    let nextTabs: PluginTabEntry[]
    if (inTabs) {
      nextTabs = config.pluginTabs.filter((t) => t.entryPath !== plugin.entryPath)
    } else {
      if (atLimit) return
      nextTabs = [...config.pluginTabs, {
        pluginId: plugin.id,
        entryPath: plugin.entryPath!,
        name: plugin.displayName,
        icon: plugin.icon,
      }]
    }
    const next: TabConfig = { ...config, pluginTabs: nextTabs }
    setConfig(next)
    void getSettingsApi().updateTabConfig(next)
      .then(() => queryClient.invalidateQueries({ queryKey: ['settings', 'tab-config'] }))
      .catch(() => {})
  }

  return (
    <view className='tab-config'>
      <view className='tab-config__topbar'>
        <view className='tab-config__back' bindtap={() => navigate({ to: '/settings' })} data-testid='tab-config-back'>
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
        <text className='tab-config__title'>{t('jsplugin.tabConfigTitle')}</text>
        <text className='tab-config__count'>{totalCount}/{MAX_TABS}</text>
      </view>

      <scroll-view className='tab-config__scroll' scroll-y>
        <view className='tab-config__section'>
          <text className='tab-config__section-title'>{t('jsplugin.tabBuiltIn')}</text>
          <view className='tab-config__row'>
            <text className='tab-config__row-name'>{t('nav.home')}</text>
            <text className='tab-config__row-badge'>{t('jsplugin.tabFixed')}</text>
          </view>
          {/*
            Showing a tab is on/off, so it is a switch. These rows used to draw
            their own 22px box-and-tick — a different shape *and* a different
            convention from the switches everywhere else in settings.
          */}
          <SwitchRow
            title={t('nav.library')}
            checked={config.showLibrary}
            onChange={toggleLibrary}
            testId='tab-toggle-library'
          />
          <view className='tab-config__row'>
            <text className='tab-config__row-name'>{t('nav.settings')}</text>
            <text className='tab-config__row-badge'>{t('jsplugin.tabFixed')}</text>
          </view>
        </view>

        {plugins.length > 0
          ? (
            <view className='tab-config__section'>
              <text className='tab-config__section-title'>{t('jsplugin.tabPlugins')}</text>
              {plugins.map((plugin) => {
                const enabled = isPluginInTabs(plugin)
                const disabled = !enabled && atLimit
                return (
                  <SwitchRow
                    key={String(plugin.id)}
                    title={plugin.displayName}
                    checked={enabled}
                    disabled={disabled}
                    onChange={() => togglePlugin(plugin)}
                    testId={`tab-toggle-${plugin.id}`}
                  />
                )
              })}
              {atLimit
                ? <text className='tab-config__limit-hint'>{t('jsplugin.tabLimitReached', { max: MAX_TABS })}</text>
                : null}
            </view>
          )
          : null}
      </scroll-view>
    </view>
  )
}

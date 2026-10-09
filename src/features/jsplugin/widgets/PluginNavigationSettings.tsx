import { useTranslation } from 'react-i18next'
import { SortableRoot, SortableItem, SortableItemArea } from '@lynx-js/lynx-ui-sortable'

import type { JSPlugin } from '../../../models/jsplugin.js'
import type { PluginTabEntry, TabConfig } from '../data/tab-config.js'
import { filterActivePluginTabs } from '../data/tab-config.js'
import {
  MAX_NAVIGATION_TABS,
  navigationTabCount,
  reorderActivePluginTabs,
  type NavigationSettings,
} from '../data/navigation-settings.js'
import { SwitchRow } from '../../settings/widgets/SwitchRow.js'
import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { toast } from '../../../shared/ui/toast-store.js'
import '../pages/TabConfigPage.css'

export function saveNavigation(settings: NavigationSettings, next: TabConfig): void {
  void settings
    .save(next)
    .catch((error) => toast.error(error instanceof Error ? error.message : String(error)))
}

export function PluginNavigationToggle({
  plugin,
  settings,
  busy,
}: {
  plugin: JSPlugin
  settings: NavigationSettings
  busy: boolean
}) {
  const { t } = useTranslation()
  if (!plugin.entryPath) return null
  const { config } = settings
  const checked = config?.pluginTabs.some((tab) => tab.entryPath === plugin.entryPath) ?? false
  const atLimit = config
    ? navigationTabCount(config, settings.plugins) >= MAX_NAVIGATION_TABS
    : false
  const disabled = !settings.ready || busy || !plugin.isActive || (!checked && atLimit)
  return (
    <SwitchRow
      title={t('jsplugin.showInNavigation')}
      subtitle={t(
        !plugin.isActive ? 'jsplugin.navigationDisabledHint' : 'jsplugin.showInNavigationHint',
      )}
      checked={checked}
      disabled={disabled}
      testId={`plugin-navigation-${plugin.id}`}
      onChange={(enabled) => {
        if (disabled || !config) return
        const pluginTabs = enabled
          ? [
              ...config.pluginTabs,
              {
                pluginId: plugin.id,
                entryPath: plugin.entryPath!,
                name: plugin.displayName,
                icon: plugin.icon,
              },
            ]
          : config.pluginTabs.filter((tab) => tab.entryPath !== plugin.entryPath)
        saveNavigation(settings, { ...config, pluginTabs })
      }}
    />
  )
}

export function NavigationReadState({ settings }: { settings: NavigationSettings }) {
  const { t } = useTranslation()
  if (!settings.error && !settings.loading) return null
  return (
    <view className='tab-config__section' data-testid='navigation-read-state'>
      <text className='tab-config__state-text'>
        {t(settings.error ? 'jsplugin.navigationLoadError' : 'common.loading')}
      </text>
      {settings.error ? (
        <view
          bindtap={settings.retry}
          data-testid='navigation-retry'
          accessibility-element={true}
          accessibility-traits='button'
          accessibility-label={t('common.retry')}
        >
          <text className='tab-config__limit-hint'>{t('common.retry')}</text>
        </view>
      ) : null}
    </view>
  )
}

export function PluginNavigationOrder({
  settings,
  busy,
}: {
  settings: NavigationSettings
  busy: boolean
}) {
  const { t } = useTranslation()
  const { config } = settings
  const tabs = config ? filterActivePluginTabs(config.pluginTabs, settings.plugins) : []
  const disabled = !settings.ready || busy
  return (
    <>
      <NavigationReadState settings={settings} />
      {config ? (
        <view className='tab-config__section' data-testid='plugin-navigation-order'>
          <text className='tab-config__count'>{`${navigationTabCount(config, settings.plugins)}/${MAX_NAVIGATION_TABS}`}</text>
          <text className='tab-config__limit-hint'>{t('jsplugin.tabCollapseHint')}</text>
          {navigationTabCount(config, settings.plugins) >= MAX_NAVIGATION_TABS ? (
            <text className='tab-config__limit-hint'>
              {t('jsplugin.tabLimitReached', { max: MAX_NAVIGATION_TABS })}
            </text>
          ) : null}
          {tabs.length > 0 ? (
            <>
              <text className='tab-config__section-title'>{t('jsplugin.navigationOrder')}</text>
              <SortableRoot<PluginTabEntry>
                // Recreate MTS size caches when enabling a plugin changes the visible list.
                key={JSON.stringify(tabs.map((tab) => tab.entryPath))}
                data={tabs.map((tab) => ({ getSortingKey: () => tab.entryPath, dataItem: tab }))}
                enableSorting={!disabled}
                onSortEnd={(sorted) => {
                  if (!disabled)
                    saveNavigation(
                      settings,
                      reorderActivePluginTabs(
                        config,
                        settings.plugins,
                        sorted.map((item) => item.dataItem.entryPath),
                      ),
                    )
                }}
              >
                {(item) => (
                  <SortableItem
                    sortingKey={item.dataItem.entryPath}
                    as='DraggableRoot'
                    className='tab-config__order-row'
                    disabled={disabled}
                  >
                    <text className='tab-config__order-name'>
                      {settings.plugins.find(
                        (plugin) => plugin.entryPath === item.dataItem.entryPath,
                      )?.displayName ?? item.dataItem.name}
                    </text>
                    <SortableItemArea>
                      <view
                        className='tab-config__order-handle'
                        data-testid={`tab-order-handle-${item.dataItem.entryPath}`}
                      >
                        <Icon name='menu' size={18} color={ICON_COLORS.content2} />
                      </view>
                    </SortableItemArea>
                  </SortableItem>
                )}
              </SortableRoot>
            </>
          ) : null}
        </view>
      ) : null}
    </>
  )
}

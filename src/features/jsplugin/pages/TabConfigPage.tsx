import { useTranslation } from 'react-i18next'

import { SubPageShell } from '../../settings/widgets/SubPageShell.js'
import { SwitchRow } from '../../settings/widgets/SwitchRow.js'
import {
  MAX_NAVIGATION_TABS,
  navigationTabCount,
  useNavigationSettings,
} from '../data/navigation-settings.js'
import { NavigationReadState, saveNavigation } from '../widgets/PluginNavigationSettings.js'
import './TabConfigPage.css'

export function TabConfigPage() {
  const { t } = useTranslation()
  const settings = useNavigationSettings()
  const { config } = settings
  const count = config ? navigationTabCount(config, settings.plugins) : 0
  return (
    <SubPageShell
      title={t('jsplugin.tabConfigTitle')}
      backTestId='tab-config-back'
      actions={
        config ? (
          <text className='tab-config__count'>{`${count}/${MAX_NAVIGATION_TABS}`}</text>
        ) : undefined
      }
    >
      <NavigationReadState settings={settings} />
      {config ? (
        <view className='tab-config__section'>
          <text className='tab-config__section-title'>{t('jsplugin.tabBuiltIn')}</text>
          <view className='tab-config__row'>
            <text className='tab-config__row-name'>{t('nav.home')}</text>
            <text className='tab-config__row-badge'>{t('jsplugin.tabFixed')}</text>
          </view>
          <SwitchRow
            title={t('nav.library')}
            checked={config.showLibrary}
            disabled={!settings.ready || (!config.showLibrary && count >= MAX_NAVIGATION_TABS)}
            onChange={(showLibrary) => {
              if (settings.ready && (!showLibrary || count < MAX_NAVIGATION_TABS))
                saveNavigation(settings, { ...config, showLibrary })
            }}
            testId='tab-toggle-library'
          />
          <view className='tab-config__row'>
            <text className='tab-config__row-name'>{t('nav.settings')}</text>
            <text className='tab-config__row-badge'>{t('jsplugin.tabFixed')}</text>
          </view>
          <text className='tab-config__limit-hint'>{t('jsplugin.tabCollapseHint')}</text>
          <text className='tab-config__limit-hint'>{t('jsplugin.navigationManagedHint')}</text>
        </view>
      ) : null}
    </SubPageShell>
  )
}

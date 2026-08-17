import { useEffect, useState } from '@lynx-js/react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { getSettingsApi } from '../api/index.js'
import type { BrowseView } from '../api/settings-api.js'
import { SettingsSection } from '../widgets/SettingsSection.js'
import { SwitchRow } from '../widgets/SwitchRow.js'
import './BrowseViewsPage.css'

export function BrowseViewsPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [views, setViews] = useState<BrowseView[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void getSettingsApi().getLibraryBrowse().then((config) => {
      setViews(config.views.sort((a, b) => a.order - b.order))
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const toggleView = (id: string) => {
    const next = views.map((v) =>
      v.id === id ? { ...v, visible: !v.visible } : v,
    )
    setViews(next)
    void getSettingsApi().updateLibraryBrowse({ views: next }).catch(() => {})
  }

  return (
    <view className='browse-views'>
      <view className='browse-views__topbar'>
        <view className='browse-views__back' bindtap={() => navigate({ to: '/settings' })}>
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
        <text className='browse-views__title'>{t('library.browseViews')}</text>
      </view>

      <scroll-view className='browse-views__scroll' scroll-y>
        {loading
          ? <text className='browse-views__state'>{t('common.loading')}</text>
          : (
            // Each view's visibility is its own on/off, so each row is a switch.
            // These used to be hand-drawn 22px boxes with a literal `✓` text
            // character in them — a third convention on the settings surface, and
            // the only place in the app that drew a tick without the icon set.
            <SettingsSection title={t('library.browseViews')} icon='library'>
              {views.map((view) => (
                <SwitchRow
                  key={view.id}
                  title={t(view.labelKey)}
                  checked={view.visible}
                  onChange={() => toggleView(view.id)}
                  testId={`browse-view-${view.id}`}
                />
              ))}
            </SettingsSection>
          )}
      </scroll-view>
    </view>
  )
}
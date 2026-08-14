import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import './LicensesPage.css'

interface LicenseEntry {
  name: string
  license: string
  url: string
}

const LICENSES: LicenseEntry[] = [
  { name: '@lynx-js/react', license: 'Apache-2.0', url: 'https://github.com/nicklhw/nicklhw-lynx-js' },
  { name: '@tanstack/react-query', license: 'MIT', url: 'https://github.com/TanStack/query' },
  { name: '@tanstack/react-router', license: 'MIT', url: 'https://github.com/TanStack/router' },
  { name: 'i18next', license: 'MIT', url: 'https://github.com/i18next/i18next' },
  { name: 'react-i18next', license: 'MIT', url: 'https://github.com/i18next/react-i18next' },
  { name: 'zod', license: 'MIT', url: 'https://github.com/colinhacks/zod' },
  { name: 'zustand', license: 'MIT', url: 'https://github.com/pmndrs/zustand' },
  { name: '@lynx-js/lynx-ui', license: 'Apache-2.0', url: 'https://github.com/nicklhw/nicklhw-lynx-js' },
  { name: 'url-search-params-polyfill', license: 'MIT', url: 'https://github.com/nicklhw/nicklhw-url-search-params-polyfill' },
]

export function LicensesPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  return (
    <view className='licenses'>
      <view className='licenses__topbar'>
        <view className='licenses__back' bindtap={() => void navigate({ to: '/settings' })}>
          <Icon name='chevron-down' size={22} color={ICON_COLORS.content} />
        </view>
        <text className='licenses__title'>{t('settings.licenses')}</text>
      </view>
      <scroll-view className='licenses__scroll' scroll-y>
        <view className='licenses__content'>
          <text className='licenses__intro'>{t('settings.licensesIntro')}</text>
          {LICENSES.map((entry) => (
            <view key={entry.name} className='licenses__row'>
              <text className='licenses__name'>{entry.name}</text>
              <text className='licenses__license'>{entry.license}</text>
            </view>
          ))}
        </view>
      </scroll-view>
    </view>
  )
}

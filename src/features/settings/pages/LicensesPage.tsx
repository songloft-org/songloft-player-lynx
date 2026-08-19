import { useTranslation } from 'react-i18next'

import { SubPageShell } from '../widgets/SubPageShell.js'
import './LicensesPage.css'

interface LicenseEntry {
  name: string
  license: string
  url: string
}

/*
 * Attribution shown to users, so each `url` must be the dependency's real
 * upstream. Three of these used to point at `github.com/nicklhw/nicklhw-…`
 * repositories that have nothing to do with the packages (apparently a
 * find-replace accident); `licenses-accurate.test.ts` now checks every entry
 * against the installed package's own `repository` field.
 */
const LICENSES: LicenseEntry[] = [
  { name: '@lynx-js/react', license: 'Apache-2.0', url: 'https://github.com/lynx-family/lynx-stack' },
  { name: '@tanstack/react-query', license: 'MIT', url: 'https://github.com/TanStack/query' },
  { name: '@tanstack/react-router', license: 'MIT', url: 'https://github.com/TanStack/router' },
  { name: 'i18next', license: 'MIT', url: 'https://github.com/i18next/i18next' },
  { name: 'react-i18next', license: 'MIT', url: 'https://github.com/i18next/react-i18next' },
  { name: 'zod', license: 'MIT', url: 'https://github.com/colinhacks/zod' },
  { name: 'zustand', license: 'MIT', url: 'https://github.com/pmndrs/zustand' },
  // Consumed as individual component packages (button / dialog / popover / …),
  // not the aggregate `@lynx-js/lynx-ui` entry point — one line for the family.
  { name: '@lynx-js/lynx-ui-*', license: 'Apache-2.0', url: 'https://github.com/lynx-family/lynx-ui' },
  { name: 'url-search-params-polyfill', license: 'MIT', url: 'https://github.com/jerrybendy/url-search-params-polyfill' },
]

export interface LicensesPageProps {
  /**
   * Go back without a route navigation. The settings detail pane passes this so
   * Licenses → About is a swap *inside* the pane (53fb045).
   */
  onBack?: () => void
}

export function LicensesPage({ onBack }: LicensesPageProps = {}) {
  const { t } = useTranslation()

  return (
    <SubPageShell
      title={t('settings.licenses')}
      onBack={onBack}
      // Reached from the About page, not from the settings root. That is declared
      // in `shared/nav/route-back.ts` so the hardware back key agrees; there is no
      // per-page `backTo` any more.
      backTestId='licenses-back'
      contentClassName='licenses__content'
    >
      <text className='licenses__intro'>{t('settings.licensesIntro')}</text>
      {LICENSES.map((entry) => (
        <view key={entry.name} className='licenses__row'>
          <text className='licenses__name'>{entry.name}</text>
          <text className='licenses__license'>{entry.license}</text>
        </view>
      ))}
    </SubPageShell>
  )
}

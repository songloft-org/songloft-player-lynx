import { useEffect, useState } from '@lynx-js/react'
import { useTranslation } from 'react-i18next'

import { getThemePacksApi, type ThemeCatalogEntry, type ThemePacksApi } from '../api/index.js'
import { SubPageShell } from '../widgets/SubPageShell.js'
import { toast } from '../../../shared/ui/toast-store.js'
import './ThemeCatalogPage.css'

/**
 * `/settings/theme-catalog` — the online theme store, entered from the
 * theme-pack card on the appearance page.
 *
 * A page rather than a state of that card because browsing the catalog is a
 * different activity than picking the active pack: the card answers "what am I
 * wearing", this page answers "what else can I wear". The installed list lives
 * on the card and refetches on remount, so returning here→back is how the two
 * stay in agreement — no cross-page refresh channel.
 *
 * Catalog fetch is a tri-state: `loading` / `error` / `ready`. The old code
 * swallowed fetch failures into an empty list, which read as "no themes" —
 * with GitHub unreachable that made the store look empty instead of broken.
 */
export function ThemeCatalogPage({ onBack }: { onBack?: () => void }) {
  const { t } = useTranslation()

  const [catalog, setCatalog] = useState<ThemeCatalogEntry[]>([])
  const [catalogState, setCatalogState] = useState<'loading' | 'error' | 'ready'>('loading')
  const [catalogError, setCatalogError] = useState('')
  const [installingId, setInstallingId] = useState<string | null>(null)

  const api: ThemePacksApi = getThemePacksApi()

  const loadCatalog = () => {
    setCatalogState('loading')
    void api.refreshCatalog()
      .then(entries => {
        setCatalog(entries)
        setCatalogState('ready')
      })
      .catch((e: unknown) => {
        setCatalogError(messageOf(e))
        setCatalogState('error')
      })
  }

  useEffect(() => { loadCatalog() }, [])

  const onInstall = (entry: ThemeCatalogEntry) => {
    if (installingId !== null) return
    setInstallingId(entry.id)
    void api.installFromCatalog(entry)
      .then(async () => {
        // Re-pull the catalog so the row's install_state reflects reality
        // (the backend re-resolves it against the installed list).
        const entries = await api.refreshCatalog()
        setCatalog(entries)
      })
      .catch((e: unknown) => {
        toast.error(t('themePacks.installFailed', { error: messageOf(e) }))
      })
      .finally(() => setInstallingId(null))
  }

  return (
    <SubPageShell
      title={t('themePacks.catalogTitle')}
      backTestId='theme-catalog-back'
      onBack={onBack}
    >
      {catalogState === 'loading'
        ? <text className='theme-catalog__empty'>{t('common.loading')}</text>
        : catalogState === 'error'
          ? (
            <view className='theme-catalog__failed'>
              <text className='theme-catalog__empty'>
                {t('themePacks.catalogLoadFailed', { error: catalogError })}
              </text>
              <view className='theme-catalog__retry' bindtap={loadCatalog}>
                <text className='theme-catalog__retry-text'>{t('common.retry')}</text>
              </view>
            </view>
          )
          : catalog.length === 0
            ? <text className='theme-catalog__empty'>{t('themePacks.noCatalog')}</text>
            : catalog.map(p => (
              <view key={p.id} className='theme-catalog__item'>
                <view className='theme-catalog__item-info'>
                  <text className='theme-catalog__item-name'>{p.name}</text>
                  <text className='theme-catalog__item-meta'>
                    {[p.author, p.version].filter(Boolean).join(' · ')}
                  </text>
                </view>
                {p.installState === 'installed'
                  ? <text className='theme-catalog__installed-label'>{t('themePacks.installed')}</text>
                  : (
                    <view className='theme-catalog__item-btn' bindtap={() => onInstall(p)}>
                      <text className='theme-catalog__item-btn-text'>
                        {installingId === p.id
                          ? t('common.loading')
                          : p.installState === 'has_update'
                            ? t('themePacks.hasUpdate')
                            : t('themePacks.install')}
                      </text>
                    </view>
                  )}
              </view>
            ))}
    </SubPageShell>
  )
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

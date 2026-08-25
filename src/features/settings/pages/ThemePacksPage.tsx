import { useEffect, useState } from '@lynx-js/react'
import { useBackHandler } from '../../../shared/nav/use-back-handler.js'
import {
  activateThemePack,
  applyActiveThemePack,
  clearActiveThemePack,
  getActiveThemePack,
  subscribeActiveThemePack,
} from '../../../shared/theme/theme-pack-model.js'
import { toast } from '../../../shared/ui/toast-store.js'
import { useTranslation } from 'react-i18next'

import { Icon, ICON_COLORS } from '../../../shared/ui/Icon.js'
import { getThemePacksApi, type ThemeCatalogEntry, type ThemePacksApi } from '../api/index.js'
import type { ThemePackItem } from '../api/theme-packs-api.js'
import { SubPageShell } from '../widgets/SubPageShell.js'
import './ThemePacksPage.css'

export function ThemePacksPage() {
  const { t } = useTranslation()

  const [installed, setInstalled] = useState<ThemePackItem[]>([])
  const [activeId, setActiveId] = useState<string | null>(() => getActiveThemePack()?.themeId ?? null)
  const [loading, setLoading] = useState(true)
  const [showCatalog, setShowCatalog] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  // Catalog fetch is a tri-state: `loading` / `error` / `ready`. The old code
  // swallowed fetch failures into an empty list, which read as "no themes" —
  // with GitHub unreachable that made the store look empty instead of broken.
  const [catalog, setCatalog] = useState<ThemeCatalogEntry[]>([])
  const [catalogState, setCatalogState] = useState<'loading' | 'error' | 'ready'>('loading')
  const [catalogError, setCatalogError] = useState('')
  const [installingId, setInstallingId] = useState<string | null>(null)

  // The catalog replaces the page body; the armed delete is a per-row two-tap state.
  useBackHandler(showCatalog || confirmDeleteId !== null, () => {
    if (showCatalog) {
      setShowCatalog(false)
      return true
    }
    setConfirmDeleteId(null)
    return true
  })

  const api: ThemePacksApi = getThemePacksApi()

  // The active pack is app-global (activating it recolors the whole UI), so its
  // id is the model's, not page-local — the startup wiring in `index.tsx` and
  // taps here stay in agreement for free.
  useEffect(
    () => subscribeActiveThemePack(() => {
      setActiveId(getActiveThemePack()?.themeId ?? null)
    }),
    [],
  )

  const refresh = async () => {
    try {
      const [packs] = await Promise.all([
        api.list(),
        // Also re-sync the active pack: it may have been set from the Flutter
        // client (or the server) since this app last looked.
        applyActiveThemePack(),
      ])
      setInstalled(packs)
    } catch { /* keep whatever was there */ }
    setLoading(false)
  }

  useEffect(() => { void refresh() }, [])

  const onActivate = (themeId: string) => {
    void activateThemePack(themeId).catch((e: unknown) => {
      toast.error(t('themePacks.activateFailed', { error: messageOf(e) }))
    })
  }

  const onReset = () => {
    void clearActiveThemePack().catch((e: unknown) => {
      toast.error(t('themePacks.activateFailed', { error: messageOf(e) }))
    })
  }

  const onDelete = (themeId: string) => {
    if (confirmDeleteId !== themeId) {
      setConfirmDeleteId(themeId)
      return
    }
    void api.deletePack(themeId)
      .then(() => {
        setInstalled(prev => prev.filter(p => p.themeId !== themeId))
        if (activeId === themeId) setActiveId(null)
        setConfirmDeleteId(null)
        // Deleting the active pack leaves the server's "active" pointing at a
        // missing id; re-sync so the UI and the server agree on the fallback.
        return applyActiveThemePack()
      })
      .catch((e: unknown) => {
        toast.error(t('themePacks.deleteFailed', { error: messageOf(e) }))
      })
  }

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

  const onOpenCatalog = () => {
    setShowCatalog(true)
    loadCatalog()
  }

  const onInstall = (entry: ThemeCatalogEntry) => {
    if (installingId !== null) return
    setInstallingId(entry.id)
    void api.installFromCatalog(entry)
      .then(async () => {
        await refresh()
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
      title={t('themePacks.title')}
      backTestId='theme-packs-back'
      actions={(
        <view className='theme-packs__action' bindtap={onOpenCatalog}>
          <text className='theme-packs__action-text'>{t('themePacks.catalog')}</text>
        </view>
      )}
      // Both branches below are their own `scroll-view`, so the shell must not add
      // one around them.
      scrollable={false}
    >
      {showCatalog
        ? (
          <view className='theme-packs__catalog'>
            <view className='theme-packs__catalog-header'>
              <text className='theme-packs__catalog-title'>{t('themePacks.catalogTitle')}</text>
              <view className='theme-packs__catalog-close' bindtap={() => setShowCatalog(false)}>
                <Icon name='x' size={18} color={ICON_COLORS.content} />
              </view>
            </view>
            <scroll-view className='theme-packs__catalog-list' scroll-y>
              {catalogState === 'loading'
                ? <text className='theme-packs__empty'>{t('common.loading')}</text>
                : catalogState === 'error'
                  ? (
                    <view className='theme-packs__catalog-failed'>
                      <text className='theme-packs__empty'>
                        {t('themePacks.catalogLoadFailed', { error: catalogError })}
                      </text>
                      <view className='theme-packs__retry' bindtap={loadCatalog}>
                        <text className='theme-packs__retry-text'>{t('common.retry')}</text>
                      </view>
                    </view>
                  )
                  : catalog.length === 0
                    ? <text className='theme-packs__empty'>{t('themePacks.noCatalog')}</text>
                    : catalog.map(p => (
                      <view key={p.id} className='theme-packs__item'>
                        <view className='theme-packs__item-info'>
                          <text className='theme-packs__item-name'>{p.name}</text>
                          <text className='theme-packs__item-meta'>
                            {[p.author, p.version].filter(Boolean).join(' · ')}
                          </text>
                        </view>
                        {p.installState === 'installed'
                          ? <text className='theme-packs__installed-label'>{t('themePacks.installed')}</text>
                          : (
                            <view className='theme-packs__item-btn' bindtap={() => onInstall(p)}>
                              <text className='theme-packs__item-btn-text'>
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
            </scroll-view>
          </view>
        )
        : (
          <scroll-view className='theme-packs__list' scroll-y>
            {loading
              ? <text className='theme-packs__empty'>{t('common.loading')}</text>
              : installed.length === 0
                ? <text className='theme-packs__empty'>{t('themePacks.noThemes')}</text>
                : (
                  <view>
                    <view className='theme-packs__item' bindtap={onReset}>
                      <view className='theme-packs__item-info'>
                        <text className='theme-packs__item-name'>{t('themePacks.default')}</text>
                        <text className='theme-packs__item-meta'>{t('themePacks.builtIn')}</text>
                      </view>
                      {activeId === null
                        ? <Icon name='check' size={18} color={ICON_COLORS.primary} />
                        : null}
                    </view>
                    {installed.map(p => (
                      <view key={p.themeId} className='theme-packs__item'>
                        <view className='theme-packs__item-info' bindtap={() => onActivate(p.themeId)}>
                          <text className='theme-packs__item-name'>{p.name}</text>
                          <text className='theme-packs__item-meta'>
                            {[p.author, p.version].filter(Boolean).join(' · ')}
                          </text>
                        </view>
                        {activeId === p.themeId
                          ? <Icon name='check' size={18} color={ICON_COLORS.primary} />
                          : (
                            <view className='theme-packs__item-delete' bindtap={() => onDelete(p.themeId)}>
                              <text className='theme-packs__item-delete-text'>
                                {confirmDeleteId === p.themeId ? t('themePacks.confirmDelete') : t('themePacks.delete')}
                              </text>
                            </view>
                          )}
                      </view>
                    ))}
                  </view>
                )}
          </scroll-view>
        )}
    </SubPageShell>
  )
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
